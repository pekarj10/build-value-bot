import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * DETERMINISTIC AI-POWERED PRICE RECALCULATION
 * 
 * Key reliability features:
 * 1. Temperature=0 for all AI calls (deterministic outputs)
 * 2. Sequential processing (no race conditions)
 * 3. Fixed seed for reproducibility
 * 4. Comprehensive error handling with retries
 * 5. All items processed in a single pass
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UNIFIED AI PROMPT - Single AI call for translation + search terms + matching
const UNIFIED_MATCH_PROMPT = `You are a senior construction cost expert matching cost items to a Swedish REPAB-style benchmark database.

YOUR TASK:
1. TRANSLATE the cost item to Swedish construction terminology
2. IDENTIFY the best matching benchmark from the candidates
3. PROVIDE confidence score and reasoning

SWEDISH CONSTRUCTION TERMINOLOGY (use these exact terms):
- Carpets/flooring: textilgolv, nålfilt, heltäckningsmatta, golvmatta
- Grass/landscaping: gräsytor, gräsmatta, omläggning gräsytor
- Windows: fönster, fönsterbyte, 3-glas, treglasfönster
- Doors: entrédörr, entréparti, ytterdörr, dörrbyte
- Demolition: rivning, demontering
- Insulation: isolering, tilläggsisolering, fasadisolering
- Heat pump: värmepump, luft-vatten värmepump
- Partitions: innervägg, mellanvägg, gipsväggar

MATCHING RULES:
- Match based on scope of work, materials, and activity type
- Units must be compatible (m² matches m², st matches st, etc.)
- Prefer exact semantic matches over partial matches
- If multiple benchmarks could work, pick the most specific one

CONFIDENCE SCORING:
- 90-100%: Exact match (same work type, same materials)
- 80-89%: Very close match (same work type, similar scope)
- 70-79%: Good match (related work, compatible scope)
- 50-69%: Partial match (only use if nothing better)
- 0-49%: No suitable match

CRITICAL: Return EXACTLY this JSON format:
{
  "swedishTranslation": "the Swedish term for this work",
  "searchTerms": ["term1", "term2", "term3"],
  "matchedBenchmarkId": "exact-uuid-or-null",
  "confidence": 85,
  "reasoning": "Why this benchmark was selected"
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

interface BenchmarkPrice {
  id: string;
  description: string;
  category: string;
  unit: string;
  min_price: number | null;
  avg_price: number;
  max_price: number | null;
  source: string | null;
}

interface Project {
  id: string;
  country: string;
  currency: string;
  project_type: string;
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
    'SE': 'SWEDEN', 'Sweden': 'SWEDEN', 'SWEDEN': 'SWEDEN',
    'CZ': 'CZECH_REPUBLIC', 'Czech Republic': 'CZECH_REPUBLIC',
    'DE': 'GERMANY', 'Germany': 'GERMANY',
  };
  return mapping[country] || country.toUpperCase().replace(/ /g, '_');
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
 * DETERMINISTIC AI CALL
 * - Temperature = 0 for consistent outputs
 * - Seed = 42 for reproducibility
 * - JSON mode for structured responses
 * - Retry logic for reliability
 */
async function callAIDeterministic(
  apiKey: string, 
  systemPrompt: string, 
  userPrompt: string,
  maxRetries: number = 2
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
          temperature: 0, // CRITICAL: Deterministic output
          seed: 42, // CRITICAL: Reproducible results
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
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error("AI call failed after retries");
}

/**
 * COMPREHENSIVE BENCHMARK SEARCH
 * Searches both description and category columns with multiple terms
 */
async function searchBenchmarks(
  supabase: any,
  searchTerms: string[],
  dbCountry: string,
  currency: string
): Promise<BenchmarkPrice[]> {
  const candidates: BenchmarkPrice[] = [];
  const seenIds = new Set<string>();

  for (const term of searchTerms) {
    if (!term || term.trim().length < 2) continue;
    
    const searchPattern = `%${term.trim()}%`;
    
    // Search in description
    const { data: descMatches } = await supabase
      .from('benchmark_prices')
      .select('id, description, category, unit, min_price, avg_price, max_price, source')
      .eq('country', dbCountry)
      .eq('currency', currency)
      .ilike('description', searchPattern)
      .limit(30);

    // Search in category
    const { data: catMatches } = await supabase
      .from('benchmark_prices')
      .select('id, description, category, unit, min_price, avg_price, max_price, source')
      .eq('country', dbCountry)
      .eq('currency', currency)
      .ilike('category', searchPattern)
      .limit(30);

    // Deduplicate and add to candidates
    for (const match of [...(descMatches || []), ...(catMatches || [])]) {
      if (!seenIds.has(match.id)) {
        seenIds.add(match.id);
        candidates.push(match);
      }
    }
  }

  return candidates;
}

/**
 * PROCESS SINGLE COST ITEM
 * Single AI call for translation + matching (reduces variability)
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
    // STEP 1: Get initial Swedish search terms (deterministic)
    const initialTerms = generateInitialSearchTerms(item.original_description);
    console.log(`[${item.original_description}] Initial search terms: ${initialTerms.join(', ')}`);

    // STEP 2: Search benchmarks with initial terms
    let candidates = await searchBenchmarks(supabase, initialTerms, dbCountry, project.currency);
    console.log(`[${item.original_description}] Found ${candidates.length} initial candidates`);

    // STEP 3: Filter by compatible units
    const unitCompatible = candidates.filter(b => unitsCompatible(item.unit, b.unit));
    console.log(`[${item.original_description}] Unit-compatible: ${unitCompatible.length} (item unit: ${item.unit})`);

    if (unitCompatible.length === 0) {
      // No unit-compatible matches - set to clarification
      await updateCostItemNoMatch(supabase, item, `No benchmarks with compatible unit (${item.unit})`);
      result.status = 'no_match';
      result.reasoning = `No benchmarks with unit ${item.unit}`;
      console.log(`[${item.original_description}] → NO MATCH (no compatible units)`);
      return result;
    }

    // STEP 4: AI selects best match (single deterministic call)
    const candidateList = unitCompatible.slice(0, 20).map(b => 
      `ID: ${b.id}\nCategory: ${b.category}\nDescription: ${b.description}\nUnit: ${b.unit}\nPrice: ${b.avg_price}`
    ).join('\n\n');

    const aiResult = await callAIDeterministic(
      apiKey,
      UNIFIED_MATCH_PROMPT,
      `COST ITEM TO MATCH:
Description: "${item.original_description}"
Unit: ${item.unit}
Quantity: ${item.quantity}
Project Country: ${project.country}
Project Type: ${project.project_type || 'renovation'}

AVAILABLE BENCHMARKS (already filtered to ${project.country}):
${candidateList}

Select the BEST matching benchmark or return null if none are suitable.`
    );

    console.log(`[${item.original_description}] AI Result:`, JSON.stringify(aiResult));

    const matchedId = aiResult.matchedBenchmarkId;
    const confidence = aiResult.confidence || 0;
    const reasoning = aiResult.reasoning || "";

    // STEP 5: Validate and apply match
    if (!matchedId || matchedId === 'null' || confidence < 50) {
      await updateCostItemNoMatch(supabase, item, reasoning || "No confident match found");
      result.status = 'no_match';
      result.confidence = confidence;
      result.reasoning = reasoning;
      console.log(`[${item.original_description}] → NO MATCH (confidence: ${confidence}%)`);
      return result;
    }

    const benchmark = unitCompatible.find(b => b.id === matchedId);
    if (!benchmark) {
      console.warn(`[${item.original_description}] Invalid benchmark ID returned: ${matchedId}`);
      await updateCostItemNoMatch(supabase, item, "AI returned invalid benchmark ID");
      result.status = 'error';
      return result;
    }

    // STEP 6: Calculate status based on price variance
    let status = 'ok';
    if (item.original_unit_price && benchmark.avg_price) {
      const variance = ((item.original_unit_price - benchmark.avg_price) / benchmark.avg_price) * 100;
      if (variance < -15) status = 'underpriced';
      else if (variance > 15) status = 'review';
    }

    const priceSource = `${benchmark.source || 'REPAB'} - ${benchmark.category}: ${benchmark.description}`;

    // STEP 7: Update cost item with match
    const { error: updateError } = await supabase
      .from('cost_items')
      .update({
        matched_benchmark_id: benchmark.id,
        match_confidence: confidence,
        match_reasoning: reasoning,
        recommended_unit_price: benchmark.avg_price,
        benchmark_min: benchmark.min_price || benchmark.avg_price * 0.85,
        benchmark_typical: benchmark.avg_price,
        benchmark_max: benchmark.max_price || benchmark.avg_price * 1.15,
        price_source: priceSource,
        status: status,
        ai_comment: `Matched to ${benchmark.description} (${confidence}% confidence). ${reasoning}`,
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(`[${item.original_description}] Update error:`, updateError);
      result.status = 'error';
      return result;
    }

    result.newPrice = benchmark.avg_price;
    result.priceSource = priceSource;
    result.confidence = confidence;
    result.status = 'matched';
    result.reasoning = reasoning;

    console.log(`[${item.original_description}] → MATCHED: ${benchmark.avg_price} SEK (${confidence}% confidence)`);
    return result;

  } catch (error) {
    console.error(`[${item.original_description}] Processing error:`, error);
    result.status = 'error';
    result.reasoning = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

/**
 * GENERATE INITIAL SEARCH TERMS
 * Deterministic English-to-Swedish translation for common construction terms
 */
function generateInitialSearchTerms(description: string): string[] {
  const terms: string[] = [description.toLowerCase()];
  const desc = description.toLowerCase();

  // Comprehensive English-Swedish mapping
  const translations: Record<string, string[]> = {
    // Flooring
    'carpet': ['textilgolv', 'nålfilt', 'heltäckningsmatta', 'golvmatta', 'matta'],
    'floor': ['golv', 'golvläggning', 'golvarbeten'],
    'tile': ['kakel', 'klinker', 'plattor'],
    'parquet': ['parkett', 'trägolv'],
    'vinyl': ['vinyl', 'plastmatta'],
    
    // Exterior
    'grass': ['gräsytor', 'gräsmatta', 'gräs', 'omläggning gräsytor'],
    'lawn': ['gräsytor', 'gräsmatta'],
    'garden': ['trädgård', 'utemiljö'],
    'facade': ['fasad', 'puts', 'fasadrenovering'],
    'roof': ['tak', 'takläggning', 'taktäckning'],
    'insulation': ['isolering', 'tilläggsisolering', 'fasadisolering'],
    'polystyrene': ['polystyren', 'cellplast', 'EPS'],
    
    // Windows & Doors
    'window': ['fönster', 'fönsterbyte', 'fönstermontering'],
    'double glazed': ['2-glas', 'tvåglas'],
    'triple glazed': ['3-glas', 'treglas', 'treglasfönster'],
    'triple': ['3-glas', 'treglas'],
    'door': ['dörr', 'dörrmontering'],
    'entrance': ['entré', 'entrédörr', 'entréparti', 'ytterdörr'],
    
    // Demolition & Construction
    'demolition': ['rivning', 'demontering', 'rivningsarbeten'],
    'partition': ['innervägg', 'mellanvägg', 'gipsväggar', 'rumsavskiljare'],
    'internal': ['inner', 'invändig'],
    'wall': ['vägg', 'väggar'],
    
    // Systems
    'heat pump': ['värmepump', 'luft-vatten', 'bergvärme'],
    'air to water': ['luft-vatten', 'luft/vatten'],
    'heating': ['värme', 'uppvärmning', 'värmesystem'],
    'ventilation': ['ventilation', 'fläkt', 'ventilationsaggregat'],
    'plumbing': ['VVS', 'rör', 'rörarbeten'],
    'electrical': ['el', 'elinstallation', 'elarbeten'],
    
    // Actions
    'replacement': ['byte', 'utbyte'],
    'renovation': ['renovering', 'ombyggnad'],
    'installation': ['installation', 'montering'],
    'repair': ['reparation', 'lagning'],
    'new': ['ny', 'nytt', 'nyinstallation'],
  };

  // Add Swedish translations for matching English terms
  for (const [eng, swe] of Object.entries(translations)) {
    if (desc.includes(eng)) {
      terms.push(...swe);
    }
  }

  // Extract individual words and translate them too
  const words = desc.split(/\s+/);
  for (const word of words) {
    if (translations[word]) {
      terms.push(...translations[word]);
    }
  }

  // Remove duplicates and empty strings
  return [...new Set(terms.filter(t => t && t.trim().length >= 2))];
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
  console.log("DETERMINISTIC PRICE RECALCULATION - STARTING");
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

    console.log(`Admin ${user.id} initiating deterministic price recalculation`);

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

    // PROCESS EACH PROJECT SEQUENTIALLY (deterministic order)
    for (const project of (projects || []).sort((a, b) => a.id.localeCompare(b.id))) {
      const dbCountry = mapCountryToDb(project.country);
      console.log(`\n${"=".repeat(40)}`);
      console.log(`PROJECT: ${project.name} (${project.id})`);
      console.log(`Country: ${project.country} → ${dbCountry}`);
      console.log(`${"=".repeat(40)}`);
      
      // Fetch cost items (ordered by ID for determinism)
      const { data: costItems, error: itemsError } = await supabase
        .from('cost_items')
        .select('id, original_description, quantity, unit, original_unit_price, recommended_unit_price, project_id')
        .eq('project_id', project.id)
        .order('id', { ascending: true }); // CRITICAL: Deterministic ordering

      if (itemsError || !costItems?.length) {
        console.log(`No items for project ${project.id}`);
        continue;
      }

      console.log(`Processing ${costItems.length} items SEQUENTIALLY`);

      let projectMatched = 0;

      // PROCESS EACH ITEM SEQUENTIALLY (no parallelism = no race conditions)
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

        // Rate limiting between items (consistent timing)
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
