import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AI picks the best benchmark from candidates based on clarification
const MATCH_PROMPT = `You are a senior quantity surveyor. Based on the user's clarification, pick the BEST matching benchmark.

## CRITICAL LANGUAGE REQUIREMENT
ALL your reasoning MUST be in ENGLISH. Even when referencing Swedish/German benchmarks.

CRITICAL RULES:
1. UNIT MUST MATCH exactly
2. Use the clarification to understand the true scope
3. Return the EXACT benchmark ID from the list - do NOT make up IDs
4. If no good match, return null

## PERCENTAGE-BASED BENCHMARKS

Some benchmarks are priced per percentage of total area (e.g., "Kullersten justering 10% av bruttoytan").
When the user clarifies the TOTAL AREA and the item has a quantity to adjust:
1. Calculate: adjustment_quantity ÷ total_area = percentage
2. Pick the benchmark matching that percentage (5%, 10%, or 20% - choose closest)
3. The benchmark price applies to the TOTAL AREA, not the adjustment quantity

Return JSON:
{
  "matchedBenchmarkId": "exact-uuid-from-list-or-null",
  "confidence": 0-100,
  "reasoning": "ENGLISH ONLY: Why this benchmark matches based on clarification",
  "calculatedPercentage": null,
  "totalAreaForPricing": null
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
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'square meter' || u === 'square meters') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'meters' || u === 'lm' || u === 'rm') return 'm';
  return u;
}

function unitsCompatible(itemUnit: string, benchmarkUnit: string): boolean {
  return normalizeUnit(itemUnit) === normalizeUnit(benchmarkUnit);
}

/**
 * Fetch ALL benchmarks for a country/currency with pagination (no 1000-row cap)
 */
async function fetchAllBenchmarks(
  supabase: any,
  dbCountry: string,
  currency: string
): Promise<BenchmarkPrice[]> {
  const pageSize = 1000;
  const all: BenchmarkPrice[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('benchmark_prices')
      .select('id, description, unit, min_price, avg_price, max_price, category, source')
      .eq('country', dbCountry)
      .eq('currency', currency)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * Generate search terms from description + clarification for in-memory filtering
 */
function generateSearchTerms(description: string, clarification: string): string[] {
  const terms: string[] = [];
  const combined = `${description} ${clarification}`.toLowerCase();
  
  // Split into meaningful words
  const words = combined.split(/[\s,.\-\/\(\)]+/).filter(w => w.length >= 3);
  terms.push(...words);
  terms.push(description.toLowerCase());
  
  // Extract percentage if mentioned
  const percentMatch = combined.match(/(\d+)\s*%/);
  if (percentMatch) {
    terms.push(`${percentMatch[1]}%`);
    terms.push('bruttoytan');
  }
  
  // Extract area numbers
  const areaMatch = combined.match(/(\d+)\s*m[²2]/);
  if (areaMatch) {
    terms.push('m²');
  }

  return [...new Set(terms)];
}

/**
 * Filter benchmarks in memory against search terms
 */
function filterBenchmarks(
  allBenchmarks: BenchmarkPrice[],
  searchTerms: string[],
  itemUnit: string
): BenchmarkPrice[] {
  return allBenchmarks.filter(b => {
    if (!unitsCompatible(itemUnit, b.unit)) return false;
    
    const descLower = (b.description || '').toLowerCase();
    const catLower = (b.category || '').toLowerCase();
    
    return searchTerms.some(term => {
      const t = term.toLowerCase();
      return descLower.includes(t) || catLower.includes(t);
    });
  });
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
      temperature: 0,
      seed: 42,
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

    // STEP 1: Fetch ALL benchmarks once (paginated, no 1000-row cap)
    const allBenchmarks = await fetchAllBenchmarks(supabase, dbCountry, project.currency);
    console.log(`Fetched ${allBenchmarks.length} benchmarks for ${dbCountry}/${project.currency}`);

    // STEP 2: Generate search terms from description + clarification
    const searchTerms = generateSearchTerms(item.originalDescription, clarification);
    console.log(`Generated ${searchTerms.length} search terms`);

    // STEP 3: Filter benchmarks in memory (unit-compatible + term hits)
    const unitCompatibleCandidates = filterBenchmarks(allBenchmarks, searchTerms, item.unit);
    console.log(`Found ${unitCompatibleCandidates.length} unit-compatible candidates`);

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
    const candidateList = unitCompatibleCandidates.slice(0, 30).map(b => 
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

CANDIDATE BENCHMARKS (all have compatible units, showing top ${Math.min(unitCompatibleCandidates.length, 30)}):
${candidateList}

Based on the clarification, pick the BEST matching benchmark. Return the EXACT ID from the list above.`
    );

    console.log(`AI match result:`, JSON.stringify(matchResult));

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

    // SUCCESS
    console.log(`Matched to "${matchedBenchmark.description}" at ${matchedBenchmark.avg_price} ${project.currency}`);

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
    const errorMsg = error instanceof Error ? error.message : "Processing failed";
    let status = 500;
    if (errorMsg.includes('429') || errorMsg.includes('Rate limit')) status = 429;
    if (errorMsg.includes('402') || errorMsg.includes('credits')) status = 402;
    
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
