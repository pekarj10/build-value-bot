import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// STEP 1: AI generates search terms based on clarification
const SEARCH_TERMS_PROMPT = `You are a construction cost expert. The user has provided a clarification for a cost item. Generate search terms to find matching benchmarks in a Swedish price database.

## CRITICAL: PERCENTAGE-BASED ITEMS

If the user specifies a TOTAL AREA (e.g., "total area is 2500 m2") and the item has an adjustment quantity:
1. Calculate the percentage: adjustment_quantity ÷ total_area = percentage
2. Include search terms with the calculated percentage (e.g., "10%", "10% av bruttoytan")
3. Include the Swedish term "bruttoytan" (gross area)

Example:
- Item: "Kullersten justering" with quantity 250 m²
- Clarification: "total area is 2500 m2"
- Calculation: 250 / 2500 = 10%
- Search terms should include: "kullersten justering 10%", "10% av bruttoytan", "kullersten", "justering"

Generate 5-10 search terms including:
- Swedish translations based on the clarification
- Technical terms related to the clarified scope
- Percentage terms if applicable
- Category terms

Return JSON: { "searchTerms": ["term1", "term2", ...], "calculatedPercentage": 10, "totalArea": 2500 }`;

// STEP 2: AI picks the best benchmark from candidates
const MATCH_PROMPT = `You are a senior quantity surveyor. Based on the user's clarification, pick the BEST matching benchmark.

CRITICAL RULES:
1. UNIT MUST MATCH exactly
2. Use the clarification to understand the true scope
3. Return the EXACT benchmark ID from the list - do NOT make up IDs
4. If no good match, return null

## CRITICAL: PERCENTAGE-BASED BENCHMARKS

Some benchmarks are priced per percentage of total area (e.g., "Kullersten justering 10% av bruttoytan").
When the user clarifies the TOTAL AREA (e.g., "total area is 2500 m2") and the item has a quantity to adjust:
1. Calculate: adjustment_quantity ÷ total_area = percentage
2. Pick the benchmark matching that percentage (5%, 10%, or 20% - choose closest)
3. The benchmark price applies to the TOTAL AREA, not the adjustment quantity

Example:
- Item quantity: 250 m² to adjust
- Clarification: "total area is 2500 m2"  
- Calculation: 250 ÷ 2500 = 10%
- Match: "Kullersten justering 10% av bruttoytan"

Return JSON:
{
  "matchedBenchmarkId": "exact-uuid-from-list-or-null",
  "confidence": 0-100,
  "reasoning": "Why this benchmark matches based on clarification",
  "calculatedPercentage": 10,
  "totalAreaForPricing": 2500
}`;

interface ClarificationRequest {
  item: {
    id: string;
    originalDescription: string;
    interpretedScope: string;
    quantity: number;
    unit: string;
    originalUnitPrice?: number;
    recommendedUnitPrice: number | null;
    trade?: string;
    sheetName?: string;
    aiComment: string;
  };
  clarification: string;
  project: {
    country: string;
    currency: string;
    projectType: string;
  };
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

// Map country names to database country format
function mapCountryToDb(country: string): string {
  const mapping: Record<string, string> = {
    'SE': 'SWEDEN',
    'Sweden': 'SWEDEN',
    'SWEDEN': 'SWEDEN',
    'CZ': 'CZECH_REPUBLIC',
    'Czech Republic': 'CZECH_REPUBLIC',
    'DE': 'GERMANY',
    'Germany': 'GERMANY',
  };
  return mapping[country] || country.toUpperCase().replace(/ /g, '_');
}

// Normalize unit for comparison
function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'square meter' || u === 'square meters') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'meters' || u === 'lm' || u === 'rm') return 'm';
  return u;
}

function unitsCompatible(itemUnit: string, benchmarkUnit: string): boolean {
  return normalizeUnit(itemUnit) === normalizeUnit(benchmarkUnit);
}

async function callAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<any> {
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
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    if (response.status === 402) {
      throw new Error("AI service credits exhausted. Please add credits.");
    }
    
    throw new Error(`AI service error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("Empty AI response");
  }

  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { item, clarification, project } = await req.json() as ClarificationRequest;

    if (!item || !clarification) {
      return new Response(
        JSON.stringify({ error: "Missing item or clarification" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing clarification for item "${item.originalDescription}"`);
    console.log(`User clarification: "${clarification}"`);

    const dbCountry = mapCountryToDb(project.country);

    // STEP 1: Generate search terms based on original + clarification
    const searchTermsResult = await callAI(
      LOVABLE_API_KEY,
      SEARCH_TERMS_PROMPT,
      `Original description: "${item.originalDescription}"
User clarification: "${clarification}"
Unit: ${item.unit}
Quantity: ${item.quantity}

Generate search terms that incorporate the user's clarification.`
    );
    
    const searchTerms = searchTermsResult.searchTerms || [];
    console.log(`Generated search terms: ${searchTerms.join(', ')}`);

    // STEP 2: Search database for candidates using ILIKE
    const candidateBenchmarks: BenchmarkPrice[] = [];
    const seenIds = new Set<string>();

    for (const term of searchTerms) {
      const { data: matches } = await supabase
        .from('benchmark_prices')
        .select('id, description, unit, min_price, avg_price, max_price, category, source')
        .eq('country', dbCountry)
        .eq('currency', project.currency)
        .ilike('description', `%${term}%`)
        .limit(20);

      if (matches) {
        for (const m of matches) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            candidateBenchmarks.push(m);
          }
        }
      }
    }

    console.log(`Found ${candidateBenchmarks.length} candidate benchmarks from DB`);

    // STEP 3: Filter by unit compatibility
    const unitCompatibleCandidates = candidateBenchmarks.filter(
      b => unitsCompatible(item.unit, b.unit)
    );
    console.log(`After unit filter (${item.unit}): ${unitCompatibleCandidates.length} candidates`);

    // If no unit-compatible candidates
    if (unitCompatibleCandidates.length === 0) {
      console.log(`No unit-compatible benchmarks found`);
      return new Response(
        JSON.stringify({
          interpretedScope: `${item.originalDescription} (clarified: ${clarification})`,
          recommendedUnitPrice: null,
          benchmarkMin: null,
          benchmarkTypical: null,
          benchmarkMax: null,
          matchedBenchmarkId: null,
          matchConfidence: 0,
          matchReasoning: `No benchmarks found with compatible unit (${item.unit}) even after clarification`,
          priceSource: null,
          status: "clarification",
          aiComment: `Even with your clarification "${clarification}", no matching benchmark with unit ${item.unit} was found. Manual pricing required.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STEP 4: AI picks the best match from candidates
    const candidateList = unitCompatibleCandidates.map(b => 
      `ID: ${b.id} | ${b.description} | Unit: ${b.unit} | Price: ${b.avg_price} ${project.currency} (${b.min_price || 'N/A'} - ${b.max_price || 'N/A'}) | Source: ${b.source || 'Unknown'}`
    ).join('\n');

    const matchResult = await callAI(
      LOVABLE_API_KEY,
      MATCH_PROMPT,
      `ORIGINAL ITEM:
Description: "${item.originalDescription}"
Quantity: ${item.quantity} ${item.unit}
${item.originalUnitPrice ? `Original Price: ${item.originalUnitPrice} ${project.currency}` : ''}

USER CLARIFICATION:
"${clarification}"

CANDIDATE BENCHMARKS (all have compatible units):
${candidateList}

Based on the clarification, pick the BEST matching benchmark. Return the EXACT ID from the list above.`
    );

    console.log(`AI match result:`, JSON.stringify(matchResult));

    // STEP 5: Validate the match
    const matchedId = matchResult.matchedBenchmarkId;
    const confidence = matchResult.confidence || 0;
    const reasoning = matchResult.reasoning || "";

    if (!matchedId || confidence < 70) {
      console.log(`Low confidence (${confidence}) or no match`);
      return new Response(
        JSON.stringify({
          interpretedScope: `${item.originalDescription} (clarified: ${clarification})`,
          recommendedUnitPrice: null,
          benchmarkMin: null,
          benchmarkTypical: null,
          benchmarkMax: null,
          matchedBenchmarkId: null,
          matchConfidence: confidence,
          matchReasoning: reasoning || "No confident benchmark match found",
          priceSource: null,
          status: "clarification",
          aiComment: `Thank you for the clarification. However, no confident benchmark match was found (${confidence}% confidence). ${reasoning}`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the benchmark ID exists AND is in our candidates
    const matchedBenchmark = unitCompatibleCandidates.find(b => b.id === matchedId);
    
    if (!matchedBenchmark) {
      console.warn(`AI returned invalid benchmark ID: ${matchedId}`);
      return new Response(
        JSON.stringify({
          interpretedScope: `${item.originalDescription} (clarified: ${clarification})`,
          recommendedUnitPrice: null,
          benchmarkMin: null,
          benchmarkTypical: null,
          benchmarkMax: null,
          matchedBenchmarkId: null,
          matchConfidence: 0,
          matchReasoning: "AI returned invalid benchmark reference",
          priceSource: null,
          status: "clarification",
          aiComment: "No valid benchmark match found. Manual pricing required."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SUCCESS: We have a valid DB match
    console.log(`✓ Matched to "${matchedBenchmark.description}" at ${matchedBenchmark.avg_price} ${project.currency}`);

    // Calculate status
    let status: string = 'ok';
    if (item.originalUnitPrice && matchedBenchmark.avg_price) {
      const variance = ((item.originalUnitPrice - matchedBenchmark.avg_price) / matchedBenchmark.avg_price) * 100;
      if (variance < -10) status = 'underpriced';
      else if (variance > 10) status = 'review';
      else status = 'ok';
    }

    const priceSource = `${matchedBenchmark.source || 'Benchmark'} - ${matchedBenchmark.description}`;

    return new Response(
      JSON.stringify({
        interpretedScope: `${matchedBenchmark.description} (from clarification: ${clarification})`,
        recommendedUnitPrice: matchedBenchmark.avg_price,
        benchmarkMin: matchedBenchmark.min_price || matchedBenchmark.avg_price * 0.85,
        benchmarkTypical: matchedBenchmark.avg_price,
        benchmarkMax: matchedBenchmark.max_price || matchedBenchmark.avg_price * 1.15,
        matchedBenchmarkId: matchedBenchmark.id,
        matchConfidence: confidence,
        matchReasoning: reasoning,
        priceSource: priceSource,
        status: status,
        aiComment: `Based on your clarification "${clarification}", matched to ${matchedBenchmark.description} with ${confidence}% confidence. ${reasoning}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("clarify-cost-item error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
