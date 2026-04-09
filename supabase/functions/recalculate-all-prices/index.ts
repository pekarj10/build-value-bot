import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SEMANTIC VECTOR SEARCH + AI-POWERED PRICE RECALCULATION
 * 
 * Flow per cost item:
 * 1. Generate embedding for the item description via AI gateway
 * 2. Call match_benchmarks_v2 RPC to get top 5 semantically similar benchmarks
 * 3. Pass those 5 candidates into the AI prompt for final evaluation
 * 4. Update cost item with the best match
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIFIED_MATCH_PROMPT = `You are a senior construction cost expert matching cost items to a benchmark database.

YOUR TASK:
1. Evaluate the semantically matched benchmark candidates provided
2. Select the BEST match based on scope of work, materials, and unit compatibility
3. Provide confidence score and reasoning

MATCHING RULES:
- Match based on scope of work, materials, and activity type
- Units must be compatible (m² matches m², st matches st, etc.)
- Prefer exact semantic matches over partial matches
- If multiple benchmarks could work, pick the most specific one
- Consider quantity and size brackets when available

CONFIDENCE SCORING:
- 90-100%: Exact match (same work type, same materials, same unit)
- 80-89%: Very close match (same work type, similar scope)
- 70-79%: Good match (related work, compatible scope)
- 50-69%: Partial match (only use if nothing better)
- 0-49%: No suitable match — return null

PRICE-RANGE VALIDATION:
If the user provides an original unit price, use it as a sanity check.
If your best match differs by >5x from the original price, explain the discrepancy.

CRITICAL: ALL responses must be in ENGLISH. Return EXACTLY this JSON format:
{
  "matchedBenchmarkId": "exact-uuid-or-null",
  "confidence": 85,
  "reasoning": "Why this benchmark was selected or why no match was found"
}`;

interface CostItem {
  id: string;
  original_description: string;
  quantity: number;
  unit: string;
  original_unit_price: number | null;
  recommended_unit_price: number | null;
  project_id: string;
}

interface BenchmarkCandidate {
  id: string;
  description: string;
  avg_price: number;
  unit: string;
  similarity: number;
}

interface Project {
  id: string;
  country: string;
  currency: string;
  project_type: string;
  name: string;
}

interface ProcessingResult {
  itemId: string;
  description: string;
  oldPrice: number | null;
  newPrice: number | null;
  priceSource: string | null;
  confidence: number;
  status: 'matched' | 'no_match' | 'error';
  reasoning?: string;
}

function mapCountryToDb(country: string): string {
  const mapping: Record<string, string> = {
    'SE': 'SE', 'Sweden': 'SE', 'SWEDEN': 'SE',
    'CZ': 'CZ', 'Czech Republic': 'CZ', 'CZECH_REPUBLIC': 'CZ',
    'DE': 'DE', 'Germany': 'DE', 'GERMANY': 'DE',
    'AT': 'AT', 'Austria': 'AT', 'AUSTRIA': 'AT',
    'PL': 'PL', 'Poland': 'PL', 'POLAND': 'PL',
    'GB': 'GB', 'United Kingdom': 'GB', 'UNITED_KINGDOM': 'GB',
    'US': 'US', 'United States': 'US', 'UNITED_STATES': 'US',
  };
  return mapping[country] || country.toUpperCase().slice(0, 2);
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'kvm') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'styck' || u === 'stk') return 'st';
  if (u === 'm' || u === 'meter' || u === 'lm' || u === 'rm') return 'm';
  return u;
}

function unitsCompatible(a: string, b: string): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

/**
 * GENERATE EMBEDDING via OpenAI directly
 */
async function generateEmbedding(_apiKey: string, text: string, maxRetries = 2): Promise<number[]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error("Invalid embedding response format");
      }
      return embedding;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Embedding attempt ${attempt + 1} failed:`, lastError.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error("Embedding generation failed after retries");
}

/**
 * DETERMINISTIC AI CALL for final match evaluation
 */
async function callAIDeterministic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxRetries = 2
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          seed: 42,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty AI response");
      return JSON.parse(content);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`AI call attempt ${attempt + 1} failed:`, lastError.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error("AI call failed after retries");
}

/**
 * SEMANTIC SEARCH via match_benchmarks_v2 RPC
 */
async function searchBenchmarksSemantic(
  supabase: any,
  embedding: number[],
  dbCountry: string,
  matchCount = 5,
  matchThreshold = 0.3
): Promise<BenchmarkCandidate[]> {
  const { data, error } = await supabase.rpc('match_benchmarks_v2', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: matchThreshold,
    match_count: matchCount,
    p_country: dbCountry,
  });

  if (error) {
    console.error('match_benchmarks_v2 error:', error);
    return [];
  }

  return (data || []) as BenchmarkCandidate[];
}

/**
 * PROCESS SINGLE COST ITEM with semantic vector search
 */
async function processCostItem(
  supabase: any,
  apiKey: string,
  item: CostItem,
  project: Project,
  dbCountry: string
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    itemId: item.id,
    description: item.original_description,
    oldPrice: item.recommended_unit_price,
    newPrice: null,
    priceSource: null,
    confidence: 0,
    status: 'no_match',
  };

  try {
    // STEP 1: Generate embedding for the cost item description
    const embeddingText = `${item.original_description} ${item.unit} ${item.quantity}`;
    console.log(`[${item.original_description}] Generating embedding...`);
    const embedding = await generateEmbedding(apiKey, embeddingText);
    console.log(`[${item.original_description}] Embedding generated (${embedding.length} dims)`);

    // STEP 2: Semantic search via match_benchmarks_v2
    const candidates = await searchBenchmarksSemantic(supabase, embedding, dbCountry, 5, 0.25);
    console.log(`[${item.original_description}] Semantic matches: ${candidates.length}`);

    if (candidates.length === 0) {
      await updateCostItemNoMatch(supabase, item, "No semantically similar benchmarks found");
      result.status = 'no_match';
      result.reasoning = "No semantic matches above threshold";
      console.log(`[${item.original_description}] → NO MATCH (no semantic candidates)`);
      return result;
    }

    // Log candidates for debugging
    for (const c of candidates) {
      console.log(`  → ${c.description} | ${c.unit} | ${c.avg_price} | sim=${c.similarity.toFixed(3)}`);
    }

    // STEP 3: AI evaluates the semantic candidates
    const candidateList = candidates.map(b =>
      `ID: ${b.id}\nDescription: ${b.description}\nUnit: ${b.unit}\nAvg Price: ${b.avg_price}\nSemantic Similarity: ${(b.similarity * 100).toFixed(1)}%`
    ).join('\n\n');

    const aiResult = await callAIDeterministic(
      apiKey,
      UNIFIED_MATCH_PROMPT,
      `COST ITEM TO MATCH:
Description: "${item.original_description}"
Unit: ${item.unit}
Quantity: ${item.quantity}
${item.original_unit_price ? `Original Unit Price: ${item.original_unit_price}` : ''}
Project Country: ${project.country}
Project Type: ${project.project_type || 'renovation'}

TOP 5 SEMANTICALLY SIMILAR BENCHMARKS (from vector search):
${candidateList}

Select the BEST matching benchmark or return null if none are suitable.`
    );

    console.log(`[${item.original_description}] AI Result:`, JSON.stringify(aiResult));

    const matchedId = aiResult.matchedBenchmarkId;
    const confidence = aiResult.confidence || 0;
    const reasoning = aiResult.reasoning || "";

    // STEP 4: Validate and apply match
    if (!matchedId || matchedId === 'null' || confidence < 50) {
      await updateCostItemNoMatch(supabase, item, reasoning || "No confident match found");
      result.status = 'no_match';
      result.confidence = confidence;
      result.reasoning = reasoning;
      console.log(`[${item.original_description}] → NO MATCH (confidence: ${confidence}%)`);
      return result;
    }

    const benchmark = candidates.find(b => b.id === matchedId);
    if (!benchmark) {
      console.warn(`[${item.original_description}] Invalid benchmark ID returned: ${matchedId}`);
      await updateCostItemNoMatch(supabase, item, "AI returned invalid benchmark ID");
      result.status = 'error';
      return result;
    }

    // STEP 5: Fetch full benchmark details for min/max prices
    const { data: fullBenchmark } = await supabase
      .from('benchmark_prices')
      .select('id, description, category, unit, min_price, avg_price, max_price, source')
      .eq('id', benchmark.id)
      .single();

    const bm = fullBenchmark || benchmark;

    // STEP 6: Calculate status based on price variance
    let status = 'ok';
    if (item.original_unit_price && bm.avg_price) {
      const variance = ((item.original_unit_price - bm.avg_price) / bm.avg_price) * 100;
      if (variance < -15) status = 'underpriced';
      else if (variance > 15) status = 'review';
    }

    const priceSource = `${fullBenchmark?.source || 'Benchmark'} - ${fullBenchmark?.category || ''}: ${bm.description}`;

    // STEP 7: Update cost item
    const { error: updateError } = await supabase
      .from('cost_items')
      .update({
        matched_benchmark_id: bm.id,
        match_confidence: confidence,
        match_reasoning: reasoning,
        recommended_unit_price: bm.avg_price,
        benchmark_min: fullBenchmark?.min_price || bm.avg_price * 0.85,
        benchmark_typical: bm.avg_price,
        benchmark_max: fullBenchmark?.max_price || bm.avg_price * 1.15,
        price_source: priceSource,
        status,
        ai_comment: `Matched to ${bm.description} (${confidence}% confidence, ${(benchmark.similarity * 100).toFixed(0)}% semantic similarity). ${reasoning}`,
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(`[${item.original_description}] Update error:`, updateError);
      result.status = 'error';
      return result;
    }

    result.newPrice = bm.avg_price;
    result.priceSource = priceSource;
    result.confidence = confidence;
    result.status = 'matched';
    result.reasoning = reasoning;

    console.log(`[${item.original_description}] → MATCHED: ${bm.avg_price} (${confidence}% confidence, ${(benchmark.similarity * 100).toFixed(0)}% similarity)`);
    return result;

  } catch (error) {
    console.error(`[${item.original_description}] Processing error:`, error);
    result.status = 'error';
    result.reasoning = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

/**
 * UPDATE COST ITEM - NO MATCH
 */
async function updateCostItemNoMatch(
  supabase: any,
  item: CostItem,
  reason: string
): Promise<void> {
  await supabase
    .from('cost_items')
    .update({
      matched_benchmark_id: null,
      match_confidence: 0,
      match_reasoning: reason,
      recommended_unit_price: null,
      benchmark_min: null,
      benchmark_typical: null,
      benchmark_max: null,
      price_source: null,
      status: 'clarification',
      ai_comment: `No benchmark match: ${reason}. Manual pricing required.`,
    })
    .eq('id', item.id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=".repeat(60));
  console.log("SEMANTIC VECTOR SEARCH PRICE RECALCULATION - STARTING");
  console.log("=".repeat(60));

  try {
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

    // Check admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${user.id} initiating semantic price recalculation`);

    const body = await req.json().catch(() => ({}));
    const projectId = body.projectId;

    // Fetch projects
    let projectsQuery = supabase.from('projects').select('id, country, currency, project_type, name');
    if (projectId) {
      projectsQuery = projectsQuery.eq('id', projectId);
    }
    const { data: projects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      throw new Error(`Failed to fetch projects: ${projectsError.message}`);
    }

    console.log(`Processing ${projects?.length || 0} project(s)`);

    const results = {
      processed: 0,
      matched: 0,
      noMatch: 0,
      errors: 0,
      changes: [] as ProcessingResult[],
      projectsSummary: [] as { projectId: string; projectName: string; itemsProcessed: number; itemsMatched: number }[],
    };

    // PROCESS EACH PROJECT SEQUENTIALLY
    for (const project of (projects || []).sort((a: Project, b: Project) => a.id.localeCompare(b.id))) {
      const dbCountry = mapCountryToDb(project.country);
      console.log(`\n${"=".repeat(40)}`);
      console.log(`PROJECT: ${project.name} (${project.id})`);
      console.log(`Country: ${project.country} → ${dbCountry}`);
      console.log(`${"=".repeat(40)}`);

      // Fetch cost items
      const { data: costItems, error: itemsError } = await supabase
        .from('cost_items')
        .select('id, original_description, quantity, unit, original_unit_price, recommended_unit_price, project_id')
        .eq('project_id', project.id)
        .order('id', { ascending: true });

      if (itemsError || !costItems?.length) {
        console.log(`No items for project ${project.id}`);
        continue;
      }

      console.log(`Processing ${costItems.length} items SEQUENTIALLY`);

      let projectMatched = 0;

      for (let i = 0; i < costItems.length; i++) {
        const item = costItems[i];
        console.log(`\n[${i + 1}/${costItems.length}] Processing: "${item.original_description}"`);

        const itemResult = await processCostItem(supabase, LOVABLE_API_KEY, item, project, dbCountry);

        results.processed++;
        results.changes.push(itemResult);

        if (itemResult.status === 'matched') {
          results.matched++;
          projectMatched++;
        } else if (itemResult.status === 'error') {
          results.errors++;
        } else {
          results.noMatch++;
        }

        // Rate limiting between items
        await new Promise(r => setTimeout(r, 300));
      }

      results.projectsSummary.push({
        projectId: project.id,
        projectName: project.name,
        itemsProcessed: costItems.length,
        itemsMatched: projectMatched,
      });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log("RECALCULATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Matched: ${results.matched}`);
    console.log(`No Match: ${results.noMatch}`);
    console.log(`Errors: ${results.errors}`);
    console.log(`Match Rate: ${results.processed > 0 ? ((results.matched / results.processed) * 100).toFixed(1) : 0}%`);

    return new Response(
      JSON.stringify({
        ...results,
        duration: `${duration}s`,
        matchRate: results.processed > 0 ? ((results.matched / results.processed) * 100).toFixed(1) + '%' : '0%',
      }),
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
