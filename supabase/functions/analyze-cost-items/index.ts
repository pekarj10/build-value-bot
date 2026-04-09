import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SEMANTIC VECTOR SEARCH AI-POWERED COST ITEM ANALYSIS
 * 
 * Flow per cost item:
 * 1. Generate embedding for the item description via AI gateway
 * 2. Call match_benchmarks_v2 RPC to get top 5 semantically similar benchmarks
 * 3. Pass those 5 candidates into the AI prompt (Gemini 2.5 Pro) for final evaluation
 * 4. Return structured analysis result
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIFIED_MATCH_PROMPT = `You are a PRINCIPAL CIVIL ENGINEER and construction cost expert with 30+ years of experience in Swedish building maintenance (TDD/underhållsplan), renovation, and new construction. You have deep expertise in REPAB benchmark databases and think like a Swedish quantity surveyor (kalkylator) who can interpret even the briefest project descriptions.

## YOUR CORE CAPABILITY
You don't just match keywords — you REASON about construction work. When someone writes "balkongrenovering 45 st", you think:
- What does balcony renovation typically involve? (structural repair, waterproofing, railing work, surface treatment)
- 45 pieces suggests individual balconies, not square meters of slab
- The unit "pcs/st" points toward railing-level work or per-balcony pricing
- In Swedish maintenance plans, "renovering" often means comprehensive refurbishment

You use DOMAIN KNOWLEDGE to bridge the gap between brief descriptions and specific benchmarks.

## SWEDISH CONSTRUCTION DOMAIN EXPERTISE
You understand that:
- Brief user descriptions map to specific REPAB categories. "Asfaltbeläggning parkering" = asphalt resurfacing for parking = category 121.
- "Buskar omplantering" = shrub replanting = category 112. Match to the SIZE-APPROPRIATE benchmark (>20 m² for large areas).
- "Putsfasad renovering" = rendered facade renovation = categories 206/215.
- "Nya fönster fasadtyp 1" = window replacement for facade type 1 = category 204/241-245.
- "Takomläggning plåt" = metal roof re-roofing = category 262 (Plåt).
- "Takavvattning byte" = replacement of gutters/downpipes = category 222.
- "Mattbyte korridorer" = carpet/textile floor replacement = textile flooring benchmarks.
- "Innerväggar målning" = interior wall painting = painting benchmarks for inner walls.
- "Innertak renovering" = ceiling renovation = category 335 (Innertak skivor) for interior ceilings.
- "Tilläggsisolering fasad" = additional facade insulation.
- "Balkongrenovering" = could mean balkongplatta (232) OR balkongräcke (233). If user mentions railing/räcke/painting → 233, if structural → 232. If ambiguous with "pcs" unit → likely railing-level work (233).
- "Balkongräcke målning" = balcony railing painting = category 233 (Balkongräcken).
- "Brandlarmsystem" = fire alarm system = category 646 (Larmanläggning/Brandlarm).
- "Elcentral uppgradering" = electrical panel upgrade = 6S1/6S3 electrical installation benchmarks.
- "Vattenledningar stamrenovering" = water pipe renovation = category 142 (VA-ledningar).
- "Hissrenovering" = elevator renovation = could be full replacement (710 Sammansatt Hissar komplett) or partial (711 Hisskorgar, 716 Hissar delar).
- "Ventilationsaggregat" = ventilation/AHU unit = category 524 (UV-aggregat) for replacement.

## REASONING CHAIN
For EVERY item, follow this chain:
1. TRANSLATE: What does this Swedish description mean in construction terms?
2. DECOMPOSE: What specific work activities does this involve?
3. CATEGORIZE: Which REPAB category covers this work?
4. SIZE: Which size bracket matches the quantity?
5. MATERIAL: What material/type assumption is reasonable if not specified?
6. SELECT: Pick the benchmark that best matches scope, unit, and quantity.
7. EXPLAIN: Describe what the price covers in plain English for the end user.

## QUANTITY-BASED BENCHMARK SELECTION
CRITICAL: Many REPAB benchmarks have SIZE BRACKETS (e.g., "<5 m²", "5-20 m²", ">20 m²", "500-1000 m²", ">5000 m²").
You MUST select the benchmark whose size bracket matches the item's QUANTITY:
- Item: 350 m² → select ">20 m²" or "100-500 m²" benchmark (NOT "<5 m²")
- Item: 4500 m² → select "1000-5000 m²" benchmark (NOT "<20 m²")
When multiple size brackets exist, pick the one that contains the item's quantity.

## PERCENTAGE-BASED BENCHMARKS
Some benchmarks use "% av bruttoytan" (percentage of gross area). These describe partial work. If the user gives an absolute area (e.g., 250 m²) AND a benchmark uses "100% av ytan", that means FULL replacement — prefer it for renovation/byte work.

## CROSS-REFERENCING
When a description is ambiguous, use ALL available context:
- Project type (maintenance plan = long-term replacements; renovation = immediate work)
- Project name (e.g., "Stockholm Galleria" = commercial building → larger systems, commercial-grade)
- Trade/sheet name (if provided, it narrows the category)
- Original unit price (if provided, helps validate which benchmark is in the right price range)
- Quantity + unit combination (45 pcs of "balkongrenovering" → per-balcony pricing, not slab m²)

## PRICE-RANGE VALIDATION (CRITICAL)
When the user provides an original unit price, use it as a SANITY CHECK:
- If your best match's benchmark price differs by MORE THAN 5x from the original price, your match is likely WRONG SCOPE.
- Example: "Balkongrenovering" at 28,000 SEK/pcs → a benchmark at 2,780 SEK is railing painting, NOT full renovation. Look for "Sammansatt Balkong renovation" at ~39,000 SEK/st instead.
- Example: "Brandlarmsystem" at 850,000 SEK → a benchmark at 58,500 is a component, not a whole-building system. Return null with explanation rather than a wildly wrong match.
- When price differs >5x, check if there's a "Sammansatt" (composite/complete) benchmark that covers the full scope of work.
- NEVER return a match with >5x price discrepancy without explicitly acknowledging and justifying the difference in your reasoning.

## UNIT FLEXIBILITY
When the item uses different units than available benchmarks (e.g., "pcs" vs "m²"):
- Still attempt to find the BEST conceptual match
- Explain the unit difference in your reasoning
- If the benchmark uses a different unit, calculate what the equivalent per-item cost would be and check if it's reasonable
- For composite/whole-system items priced per piece, look for "Sammansatt" category benchmarks first

## CRITICAL LANGUAGE REQUIREMENT
ALL your responses MUST be in ENGLISH. Do NOT include benchmark IDs (UUIDs) in your reasoning text.

## MATCHING RULES
- Match based on SCOPE OF WORK and INTENT, not just keywords
- Units should be compatible, but don't reject matches solely on unit differences — explain the gap instead
- For whole-system items (fire alarms, elevators, HVAC units), prefer "Sammansatt" or system-level benchmarks over component-level ones
- Prefer the benchmark whose SCOPE and SIZE BRACKET best match
- Even partial matches (65-80% confidence) are valuable — always explain the gap

## CONFIDENCE SCORING
- 90-100%: Exact match (same work type, correct size bracket, same unit)
- 80-89%: Very close match (same work type, slightly different scope or material assumption)
- 70-79%: Good conceptual match (related work type, reasonable assumption needed)
- 50-69%: Partial match (explain what's missing)
- 0-49%: No suitable match - return null

CRITICAL: Return EXACTLY this JSON format:
{
  "translatedTerm": "the term in target language (for matching only)",
  "matchedBenchmarkId": "exact-uuid-from-list-or-null",
  "confidence": 85,
  "reasoning": "ENGLISH ONLY: Clear explanation without any UUIDs or benchmark IDs. Explain your reasoning chain. If original price was provided and differs significantly from the match, explain WHY.",
  "userExplanation": "A plain-English explanation for the end user (no database names, no category codes, no Swedish terms). Describe WHAT construction work this price covers, what's typically included in scope, and any assumptions made."
}`;

interface CostItemInput {
  id: string;
  originalDescription: string;
  quantity: number;
  unit: string;
  originalUnitPrice?: number;
  trade?: string;
  sheetName?: string;
}

interface ProjectContext {
  country: string;
  currency: string;
  projectType: string;
  name?: string;
}

interface BenchmarkCandidate {
  id: string;
  description: string;
  avg_price: number;
  unit: string;
  similarity: number;
}

interface AnalysisResult {
  id: string;
  matchedBenchmarkId: string | null;
  matchConfidence: number;
  matchReasoning: string;
  interpretedScope: string;
  recommendedUnitPrice: number | null;
  benchmarkMin: number | null;
  benchmarkTypical: number | null;
  benchmarkMax: number | null;
  priceSource: string | null;
  status: string;
  aiComment: string;
  userExplanation: string | null;
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

function getLanguageForCountry(country: string): string {
  const languageMap: Record<string, string> = {
    'SWEDEN': 'Swedish', 'SE': 'Swedish', 'Sweden': 'Swedish',
    'GERMANY': 'German', 'DE': 'German', 'Germany': 'German',
    'CZECH_REPUBLIC': 'Czech', 'CZ': 'Czech', 'Czech Republic': 'Czech',
    'AUSTRIA': 'German', 'AT': 'German', 'Austria': 'German',
    'POLAND': 'Polish', 'PL': 'Polish', 'Poland': 'Polish',
    'UNITED_KINGDOM': 'English', 'GB': 'English', 'United Kingdom': 'English',
    'UNITED_STATES': 'English', 'US': 'English', 'United States': 'English',
  };
  return languageMap[country] || 'English';
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
 * SEMANTIC SEARCH via match_benchmarks_v2 RPC
 */
async function searchBenchmarksSemantic(
  supabase: any,
  embedding: number[],
  dbCountry: string,
  matchCount = 5,
  matchThreshold = 0.25
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
 * DETERMINISTIC AI CALL (Gemini 2.5 Pro)
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
          model: "google/gemini-2.5-pro",
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
 * PROCESS SINGLE COST ITEM with semantic vector search
 */
async function processCostItem(
  supabase: any,
  apiKey: string,
  item: CostItemInput,
  project: ProjectContext,
  dbCountry: string,
  targetLanguage: string
): Promise<AnalysisResult> {
  const noMatchResult: AnalysisResult = {
    id: item.id,
    matchedBenchmarkId: null,
    matchConfidence: 0,
    matchReasoning: "",
    interpretedScope: item.originalDescription,
    recommendedUnitPrice: null,
    benchmarkMin: null,
    benchmarkTypical: null,
    benchmarkMax: null,
    priceSource: null,
    status: "clarification",
    aiComment: "No benchmark match found. Manual pricing required.",
    userExplanation: null,
  };

  try {
    // STEP 1: Generate embedding for the cost item description
    const embeddingText = `${item.originalDescription} ${item.unit} ${item.quantity}`;
    console.log(`[${item.originalDescription}] Generating embedding...`);
    const embedding = await generateEmbedding(apiKey, embeddingText);
    console.log(`[${item.originalDescription}] Embedding generated (${embedding.length} dims)`);

    // STEP 2: Semantic search via match_benchmarks_v2
    const candidates = await searchBenchmarksSemantic(supabase, embedding, dbCountry, 5, 0.25);
    console.log(`[${item.originalDescription}] Semantic matches: ${candidates.length}`);

    if (candidates.length === 0) {
      noMatchResult.matchReasoning = "No semantically similar benchmarks found";
      noMatchResult.aiComment = "No benchmark match found via semantic search. Manual pricing required.";
      console.log(`[${item.originalDescription}] → NO MATCH (no semantic candidates)`);
      return noMatchResult;
    }

    // Log candidates for debugging
    for (const c of candidates) {
      console.log(`  → ${c.description} | ${c.unit} | ${c.avg_price} | sim=${c.similarity.toFixed(3)}`);
    }

    // STEP 3: AI evaluates the semantic candidates (Gemini 2.5 Pro)
    const candidateList = candidates.map(b =>
      `ID: ${b.id}\nDescription: ${b.description}\nUnit: ${b.unit}\nAvg Price: ${b.avg_price}\nSemantic Similarity: ${(b.similarity * 100).toFixed(1)}%`
    ).join('\n\n');

    const aiResult = await callAIDeterministic(
      apiKey,
      UNIFIED_MATCH_PROMPT,
      `COST ITEM TO MATCH:
Description: "${item.originalDescription}"
Unit: ${item.unit}
Quantity: ${item.quantity}
${item.originalUnitPrice ? `Original Price: ${item.originalUnitPrice} per ${item.unit} — use this to validate your match is in the right price range` : 'No original price provided'}
${item.trade ? `Trade/Category hint: ${item.trade}` : ''}
${item.sheetName ? `Sheet/section: ${item.sheetName}` : ''}

PROJECT CONTEXT:
- Name: ${project.name || 'N/A'}
- Type: ${project.projectType || 'maintenance/renovation'}
- Country: ${project.country}
- Language: ${targetLanguage}

REASONING INSTRUCTION: Think step by step. First translate and understand what "${item.originalDescription}" means as construction work. Then identify which REPAB category it belongs to. Then select the benchmark whose size bracket contains quantity ${item.quantity}. Explain your reasoning chain.

TOP 5 SEMANTICALLY SIMILAR BENCHMARKS (from vector search):
${candidateList}

Select the BEST matching benchmark. Even partial matches (65-80% confidence) are valuable — always explain any assumptions.`
    );

    console.log(`[${item.originalDescription}] AI result:`, JSON.stringify(aiResult));

    const matchedId = aiResult.matchedBenchmarkId;
    const confidence = aiResult.confidence || 0;
    const reasoning = aiResult.reasoning || "";
    const translatedTerm = aiResult.translatedTerm || item.originalDescription;

    if (!matchedId || matchedId === 'null' || confidence < 40) {
      noMatchResult.matchConfidence = confidence;
      noMatchResult.matchReasoning = reasoning || "No confident match found";
      noMatchResult.interpretedScope = translatedTerm;
      noMatchResult.aiComment = reasoning || "No benchmark match found. Manual pricing required.";
      console.log(`[${item.originalDescription}] → NO MATCH (confidence: ${confidence}%)`);
      return noMatchResult;
    }

    const benchmark = candidates.find(b => b.id === matchedId);
    if (!benchmark) {
      console.warn(`[${item.originalDescription}] Invalid benchmark ID returned: ${matchedId}`);
      noMatchResult.matchReasoning = "AI returned invalid benchmark ID";
      return noMatchResult;
    }

    // STEP 4: Fetch full benchmark details for min/max prices
    const { data: fullBenchmark } = await supabase
      .from('benchmark_prices')
      .select('id, description, category, unit, min_price, avg_price, max_price, source')
      .eq('id', benchmark.id)
      .single();

    const bm = fullBenchmark || benchmark;

    // STEP 5: Calculate status based on price variance
    let status = 'ok';
    if (item.originalUnitPrice && bm.avg_price) {
      const variance = ((item.originalUnitPrice - bm.avg_price) / bm.avg_price) * 100;
      if (variance < -25) status = 'underpriced';
      else if (variance > 25) status = 'review';
    }

    const priceSource = `${fullBenchmark?.source || 'Benchmark'} - ${fullBenchmark?.category || ''}: ${bm.description}`;

    // Strip UUIDs from reasoning
    const cleanReasoning = reasoning
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .replace(/benchmark\s*ID\s*,?\s*/gi, '')
      .replace(/ID\s*=\s*,?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    console.log(`[${item.originalDescription}] → MATCHED: ${bm.avg_price} (${confidence}% confidence, ${(benchmark.similarity * 100).toFixed(0)}% similarity)`);

    return {
      id: item.id,
      matchedBenchmarkId: bm.id,
      matchConfidence: confidence,
      matchReasoning: reasoning,
      interpretedScope: translatedTerm,
      recommendedUnitPrice: bm.avg_price,
      benchmarkMin: fullBenchmark?.min_price || bm.avg_price * 0.85,
      benchmarkTypical: bm.avg_price,
      benchmarkMax: fullBenchmark?.max_price || bm.avg_price * 1.15,
      priceSource,
      status,
      aiComment: `Matched with ${confidence}% confidence (${(benchmark.similarity * 100).toFixed(0)}% semantic similarity). ${cleanReasoning}`,
      userExplanation: aiResult.userExplanation || null,
    };

  } catch (error) {
    console.error(`[${item.originalDescription}] Error:`, error);
    noMatchResult.matchReasoning = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
    return noMatchResult;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=".repeat(60));
  console.log("SEMANTIC VECTOR SEARCH COST ITEM ANALYSIS - STARTING");
  console.log("=".repeat(60));

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { items, project } = await req.json() as { items: CostItemInput[]; project: ProjectContext };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cost items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dbCountry = mapCountryToDb(project.country);
    const targetLanguage = getLanguageForCountry(project.country);

    console.log(`Analyzing ${items.length} items for ${project.country} (${dbCountry}) using semantic vector search`);

    // Process in parallel batches of 4 for speed, sorted for deterministic ordering
    const BATCH_SIZE = 4;
    const sortedItems = [...items].sort((a, b) => a.id.localeCompare(b.id));
    const results: AnalysisResult[] = new Array(sortedItems.length);

    for (let batchStart = 0; batchStart < sortedItems.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, sortedItems.length);
      const batch = sortedItems.slice(batchStart, batchEnd);

      console.log(`\n--- Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(sortedItems.length / BATCH_SIZE)}: items ${batchStart + 1}-${batchEnd} of ${sortedItems.length} ---`);

      const batchPromises = batch.map((item, idx) => {
        const globalIdx = batchStart + idx;
        console.log(`  [${globalIdx + 1}/${sortedItems.length}] Processing: "${item.originalDescription}"`);
        return processCostItem(
          supabase,
          LOVABLE_API_KEY,
          item,
          project,
          dbCountry,
          targetLanguage
        ).catch(err => {
          console.error(`  [${globalIdx + 1}] Failed: ${err instanceof Error ? err.message : err}`);
          return {
            id: item.id,
            matchedBenchmarkId: null,
            matchConfidence: 0,
            matchReasoning: `Error: ${err instanceof Error ? err.message : 'Unknown'}`,
            interpretedScope: item.originalDescription,
            recommendedUnitPrice: null,
            benchmarkMin: null,
            benchmarkTypical: null,
            benchmarkMax: null,
            priceSource: null,
            status: "clarification",
            aiComment: "Analysis failed for this item. Please retry or enter manual pricing.",
            userExplanation: null,
          } as AnalysisResult;
        });
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result, idx) => {
        results[batchStart + idx] = result;
      });

      // Small delay between batches to avoid rate limiting
      if (batchEnd < sortedItems.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const matchedCount = results.filter(r => r.matchedBenchmarkId).length;

    console.log("\n" + "=".repeat(60));
    console.log(`ANALYSIS COMPLETE in ${duration}s`);
    console.log(`Processed: ${results.length} | Matched: ${matchedCount} | Rate: ${((matchedCount / results.length) * 100).toFixed(1)}%`);
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({ items: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("analyze-cost-items error:", error);
    const errorMsg = error instanceof Error ? error.message : "Analysis failed";
    let status = 500;
    if (errorMsg.includes('429')) status = 429;
    if (errorMsg.includes('402')) status = 402;

    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
