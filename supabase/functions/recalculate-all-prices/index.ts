import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// PHASE 2: When project marked as "Closed/Approved",
// automatically update benchmark_prices:
// - Match approved items to existing benchmarks (AI semantic match)
// - Update min/avg/max values with new data points
// - Create new benchmark entries for novel items
// - Build ultimate self-learning price database
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI Cost Intelligence Engine. Your ONLY job is to find the BEST SEMANTIC MATCH between a cost item description and benchmark database entries.

## MATCHING RULES

1. **Language Understanding**:
   - "carpets" = "textilgolv" = "matta" (Swedish)
   - "demolition" = "rivning", "replacement" = "byte"
   - Understand semantic equivalents across languages

2. **Unit Compatibility**: CRITICAL - only match items with SAME units
   - m² must match m² benchmarks
   - st (piece) must match st benchmarks

3. **Confidence Scoring** (0-100):
   - 90-100: Perfect match
   - 70-89: Good match
   - Below 70: No valid match - return null

## OUTPUT FORMAT

Return JSON array with one entry per item:
{
  "matches": [
    {
      "itemId": "item-uuid",
      "benchmarkId": "benchmark-uuid or null",
      "confidence": 85,
      "reasoning": "Short explanation"
    }
  ]
}

NEVER return a benchmarkId if confidence < 70.`;

interface CostItem {
  id: string;
  original_description: string;
  quantity: number;
  unit: string;
  original_unit_price: number | null;
  recommended_unit_price: number | null;
  project_id: string;
}

interface BenchmarkPrice {
  id: string;
  description: string;
  unit: string;
  min_price: number | null;
  avg_price: number;
  max_price: number | null;
  category: string;
  source: string | null;
}

interface Project {
  id: string;
  country: string;
  currency: string;
  project_type: string;
}

// Process items in batches to avoid token limits
const BATCH_SIZE = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${user.id} initiating recalculation of all prices`);

    // Get request body for optional filtering
    const body = await req.json().catch(() => ({}));
    const projectId = body.projectId; // Optional: recalculate only one project

    // Fetch all projects (or specific project)
    let projectsQuery = supabase.from('projects').select('id, country, currency, project_type');
    if (projectId) {
      projectsQuery = projectsQuery.eq('id', projectId);
    }
    const { data: projects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      throw new Error(`Failed to fetch projects: ${projectsError.message}`);
    }

    console.log(`Processing ${projects?.length || 0} projects`);

    const results: {
      processed: number;
      updated: number;
      errors: number;
      changes: Array<{
        itemId: string;
        description: string;
        oldPrice: number | null;
        newPrice: number | null;
        priceSource: string | null;
        confidence: number;
      }>;
    } = {
      processed: 0,
      updated: 0,
      errors: 0,
      changes: [],
    };

    // Map country codes to database format
    const countryMapping: Record<string, string> = {
      'SE': 'SWEDEN',
      'Sweden': 'SWEDEN',
      'CZ': 'CZECH_REPUBLIC',
      'Czech Republic': 'CZECH_REPUBLIC',
      'DE': 'GERMANY',
      'Germany': 'GERMANY',
    };

    for (const project of projects || []) {
      const dbCountry = countryMapping[project.country] || project.country.toUpperCase();
      
      // Fetch benchmarks for this project's country/currency
      const { data: benchmarks, error: benchmarkError } = await supabase
        .from('benchmark_prices')
        .select('id, description, unit, min_price, avg_price, max_price, category, source')
        .eq('country', dbCountry)
        .eq('currency', project.currency);

      if (benchmarkError || !benchmarks?.length) {
        console.warn(`No benchmarks for project ${project.id} (${dbCountry}/${project.currency})`);
        continue;
      }

      // Fetch cost items for this project
      const { data: costItems, error: itemsError } = await supabase
        .from('cost_items')
        .select('id, original_description, quantity, unit, original_unit_price, recommended_unit_price, project_id')
        .eq('project_id', project.id);

      if (itemsError || !costItems?.length) {
        console.warn(`No items for project ${project.id}`);
        continue;
      }

      console.log(`Project ${project.id}: ${costItems.length} items, ${benchmarks.length} benchmarks`);

      // Process items in batches
      for (let i = 0; i < costItems.length; i += BATCH_SIZE) {
        const batch = costItems.slice(i, i + BATCH_SIZE);
        
        // Build prompt for this batch
        const benchmarkSummary = benchmarks.slice(0, 300).map((b: BenchmarkPrice) =>
          `ID: ${b.id} | ${b.description} | ${b.unit} | ${b.avg_price} ${project.currency}`
        ).join('\n');

        const itemsPrompt = batch.map((item: CostItem) =>
          `ID: ${item.id} | "${item.original_description}" | ${item.quantity} ${item.unit}`
        ).join('\n');

        const userPrompt = `## BENCHMARKS (${benchmarks.length} total)\n${benchmarkSummary}\n\n## ITEMS TO MATCH\n${itemsPrompt}\n\nFind the best matching benchmark for each item. Return JSON with "matches" array.`;

        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (!response.ok) {
            console.error(`AI error for batch ${i}: ${response.status}`);
            results.errors += batch.length;
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          
          if (!content) {
            results.errors += batch.length;
            continue;
          }

          const parsed = JSON.parse(content);
          const matches = parsed.matches || [];

          // Update each matched item
          for (const match of matches) {
            results.processed++;
            
            if (!match.benchmarkId || match.confidence < 70) {
              // No valid match - set to clarification
              const originalItem = batch.find((item: CostItem) => item.id === match.itemId);
              if (originalItem && originalItem.recommended_unit_price !== null) {
                // Only update if it had a price before (wrong AI-generated price)
                await supabase
                  .from('cost_items')
                  .update({
                    matched_benchmark_id: null,
                    match_confidence: match.confidence || 0,
                    match_reasoning: match.reasoning || "No valid benchmark match",
                    recommended_unit_price: null,
                    benchmark_min: null,
                    benchmark_typical: null,
                    benchmark_max: null,
                    price_source: null,
                    status: 'clarification',
                    ai_comment: 'No valid benchmark match found. Manual review required.',
                  })
                  .eq('id', match.itemId);

                results.updated++;
                results.changes.push({
                  itemId: match.itemId,
                  description: originalItem.original_description,
                  oldPrice: originalItem.recommended_unit_price,
                  newPrice: null,
                  priceSource: null,
                  confidence: match.confidence || 0,
                });
              }
              continue;
            }

            // Find the matched benchmark
            const benchmark = benchmarks.find((b: BenchmarkPrice) => b.id === match.benchmarkId);
            if (!benchmark) {
              console.warn(`Invalid benchmark ID ${match.benchmarkId}`);
              results.errors++;
              continue;
            }

            const originalItem = batch.find((item: CostItem) => item.id === match.itemId);
            if (!originalItem) continue;

            // Calculate status based on original price vs benchmark
            let status = 'clarification';
            if (originalItem.original_unit_price && benchmark.avg_price) {
              const variance = ((originalItem.original_unit_price - benchmark.avg_price) / benchmark.avg_price) * 100;
              if (variance < -10) status = 'underpriced';
              else if (variance > 10) status = 'review';
              else status = 'ok';
            }

            const priceSource = `${benchmark.source || 'Benchmark'} - ${benchmark.description}`;

            // Update the cost item
            const { error: updateError } = await supabase
              .from('cost_items')
              .update({
                matched_benchmark_id: benchmark.id,
                match_confidence: match.confidence,
                match_reasoning: match.reasoning,
                recommended_unit_price: benchmark.avg_price,
                benchmark_min: benchmark.min_price || benchmark.avg_price * 0.85,
                benchmark_typical: benchmark.avg_price,
                benchmark_max: benchmark.max_price || benchmark.avg_price * 1.15,
                price_source: priceSource,
                status: status,
                ai_comment: `Matched to ${benchmark.description} with ${match.confidence}% confidence. ${match.reasoning}`,
              })
              .eq('id', match.itemId);

            if (updateError) {
              console.error(`Update error for item ${match.itemId}:`, updateError);
              results.errors++;
            } else {
              results.updated++;
              
              // Log the change
              if (originalItem.recommended_unit_price !== benchmark.avg_price) {
                results.changes.push({
                  itemId: match.itemId,
                  description: originalItem.original_description,
                  oldPrice: originalItem.recommended_unit_price,
                  newPrice: benchmark.avg_price,
                  priceSource: priceSource,
                  confidence: match.confidence,
                });
                console.log(`Item "${originalItem.original_description}": ${originalItem.recommended_unit_price} → ${benchmark.avg_price} (${priceSource})`);
              }
            }
          }

          // Small delay between batches to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (batchError) {
          console.error(`Batch error:`, batchError);
          results.errors += batch.length;
        }
      }
    }

    console.log(`Recalculation complete: ${results.processed} processed, ${results.updated} updated, ${results.errors} errors`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("recalculate-all-prices error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Recalculation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});