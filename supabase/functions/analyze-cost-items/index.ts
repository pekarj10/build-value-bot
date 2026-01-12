import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI Cost Intelligence Engine acting as a senior quantity surveyor with expertise in SEMANTIC MATCHING between construction cost items and benchmark price databases.

## CRITICAL: DATABASE IS SOURCE OF TRUTH

You will be given:
1. A cost item description from a project budget
2. A list of benchmark prices from a professional price database (e.g., REPAB 2025)

Your PRIMARY task is to find the BEST SEMANTIC MATCH between the cost item and the benchmark database.

## SEMANTIC MATCHING RULES

1. **Language Translation**: Understand that descriptions may be in different languages
   - "carpets" = "textilgolv" = "matta" (Swedish)
   - "demolition" = "rivning" (Swedish)
   - "replacement" = "byte" (Swedish)
   - "windows" = "fönster" (Swedish)
   - "painting" = "målning" (Swedish)
   - "flooring" = "golv" (Swedish)

2. **Unit Compatibility**: ONLY match items with compatible units
   - m² items must match m² benchmarks
   - st (piece) items must match st benchmarks
   - Never mix units (e.g., don't match m² item to "st" benchmark)

3. **Scope Understanding**: Match based on what the work actually entails
   - "Demolition of old carpets and putting new ones" = carpet replacement work
   - Match to benchmarks describing similar scope (byte = replacement)

4. **Quantity Context**: Consider quantity ranges in benchmark descriptions
   - "<5 m²", "5-20 m²", ">20 m²" indicate different price tiers
   - Match to the appropriate quantity range

## CONFIDENCE SCORING

Rate your match confidence from 0-100:
- **90-100**: Perfect semantic match, same scope, same unit
- **70-89**: Good match, similar scope, compatible unit
- **50-69**: Partial match, some aspects align
- **Below 50**: Poor or no match - DO NOT USE THIS BENCHMARK

## OUTPUT REQUIREMENTS

For each cost item, you MUST return:

{
  "items": [
    {
      "id": "item_id",
      "matchedBenchmarkId": "uuid of best matching benchmark or null if no good match",
      "matchConfidence": 85,
      "matchReasoning": "Matched 'Demolition of old carpets' to 'Textilgolv byte 200-2000 m²' - both describe carpet replacement work, units compatible (m²)",
      "interpretedScope": "Textile floor covering replacement including removal of existing and installation of new",
      "recommendedUnitPrice": 900,
      "benchmarkMin": 740,
      "benchmarkTypical": 900,
      "benchmarkMax": 1060,
      "priceSource": "REPAB 2025 - Textilgolv byte 200-2000 m²",
      "status": "ok|review|clarification|underpriced",
      "aiComment": "Price based on REPAB 2025 benchmark for textile flooring replacement. Your original price of 280 SEK/m² is significantly below market rate."
    }
  ]
}

## STATUS RULES (only if benchmark found)

- **ok**: Original price within ±10% of benchmark typical
- **review**: Original price >10% ABOVE benchmark (overpaying)
- **underpriced**: Original price >10% BELOW benchmark (risk of quality issues)
- **clarification**: No suitable benchmark found OR confidence < 70%

## IF NO BENCHMARK MATCH (confidence < 70%)

Set these values:
- matchedBenchmarkId: null
- recommendedUnitPrice: null
- benchmarkMin/Typical/Max: null
- status: "clarification"
- priceSource: null
- aiComment: "No suitable benchmark found. Manual review required."

NEVER INVENT PRICES. If no benchmark matches, say so clearly.`;

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

interface BenchmarkPrice {
  id: string;
  description: string;
  unit: string;
  min_price: number | null;
  avg_price: number;
  max_price: number | null;
  category: string;
  source: string | null;
  country: string;
  currency: string;
}

interface AnalysisRequest {
  items: CostItemInput[];
  project: ProjectContext;
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
    // Add more mappings as needed
  };
  return mapping[country] || country.toUpperCase();
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

    const { items, project } = await req.json() as AnalysisRequest;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cost items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing ${items.length} cost items for project in ${project.country}`);

    // Fetch relevant benchmarks from database
    const dbCountry = mapCountryToDb(project.country);
    console.log(`Fetching benchmarks for country: ${dbCountry}, currency: ${project.currency}`);

    const { data: benchmarks, error: benchmarkError } = await supabase
      .from('benchmark_prices')
      .select('id, description, unit, min_price, avg_price, max_price, category, source, country, currency')
      .eq('country', dbCountry)
      .eq('currency', project.currency);

    if (benchmarkError) {
      console.error("Error fetching benchmarks:", benchmarkError);
      throw new Error("Failed to fetch benchmark data");
    }

    console.log(`Fetched ${benchmarks?.length || 0} benchmarks from database`);

    // If no benchmarks, still analyze but set all to clarification
    if (!benchmarks || benchmarks.length === 0) {
      console.warn(`No benchmarks found for ${dbCountry}/${project.currency}`);
      const fallbackItems = items.map(item => ({
        id: item.id,
        matchedBenchmarkId: null,
        matchConfidence: 0,
        matchReasoning: `No benchmarks available for ${dbCountry}/${project.currency}`,
        interpretedScope: item.originalDescription,
        recommendedUnitPrice: null,
        benchmarkMin: null,
        benchmarkTypical: null,
        benchmarkMax: null,
        priceSource: null,
        status: "clarification",
        aiComment: `No benchmark database available for ${project.country}. Manual pricing required.`
      }));
      
      return new Response(
        JSON.stringify({ items: fallbackItems }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the user prompt with project context, items, AND benchmark data
    const benchmarkSummary = benchmarks.slice(0, 500).map((b: BenchmarkPrice) => 
      `ID: ${b.id} | ${b.description} | ${b.unit} | ${b.avg_price} ${project.currency} (min: ${b.min_price || 'N/A'}, max: ${b.max_price || 'N/A'}) | Category: ${b.category} | Source: ${b.source || 'Unknown'}`
    ).join('\n');

    const userPrompt = `## PROJECT CONTEXT

- Country: ${project.country}
- Currency: ${project.currency}
- Project Type: ${project.projectType}
${project.name ? `- Project Name: ${project.name}` : ''}

## BENCHMARK DATABASE (${benchmarks.length} entries available)

${benchmarkSummary}

${benchmarks.length > 500 ? `\n... and ${benchmarks.length - 500} more benchmarks available` : ''}

## COST ITEMS TO ANALYZE

${items.map((item, idx) => `
### Item ${idx + 1} (ID: ${item.id})
- Description: ${item.originalDescription}
- Quantity: ${item.quantity} ${item.unit}
${item.originalUnitPrice ? `- Original Unit Price: ${item.originalUnitPrice} ${project.currency}` : '- Original Unit Price: Not provided'}
${item.trade ? `- Trade: ${item.trade}` : ''}
${item.sheetName ? `- Sheet/Section: ${item.sheetName}` : ''}
`).join('\n')}

IMPORTANT: For each item, find the BEST matching benchmark from the database above. Use the benchmark ID, description, and prices EXACTLY as provided. Do NOT invent prices.`;

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
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response:", data);
      throw new Error("Empty AI response");
    }

    console.log("AI analysis complete");

    // Parse the JSON response
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", content);
      throw new Error("Invalid AI response format");
    }

    // Validate and enrich results with benchmark data
    const enrichedItems = analysisResult.items?.map((result: any) => {
      // If AI provided a benchmark ID, verify it exists and use exact values
      if (result.matchedBenchmarkId) {
        const matchedBenchmark = benchmarks.find((b: BenchmarkPrice) => b.id === result.matchedBenchmarkId);
        if (matchedBenchmark) {
          console.log(`Item ${result.id}: Matched to benchmark "${matchedBenchmark.description}" with confidence ${result.matchConfidence}`);
          return {
            ...result,
            recommendedUnitPrice: matchedBenchmark.avg_price,
            benchmarkMin: matchedBenchmark.min_price || matchedBenchmark.avg_price * 0.85,
            benchmarkTypical: matchedBenchmark.avg_price,
            benchmarkMax: matchedBenchmark.max_price || matchedBenchmark.avg_price * 1.15,
            priceSource: `${matchedBenchmark.source || 'Benchmark'} - ${matchedBenchmark.description}`,
          };
        } else {
          console.warn(`Item ${result.id}: AI returned invalid benchmark ID ${result.matchedBenchmarkId}`);
          // AI hallucinated a benchmark ID - reject and set to clarification
          return {
            ...result,
            matchedBenchmarkId: null,
            matchConfidence: 0,
            recommendedUnitPrice: null,
            benchmarkMin: null,
            benchmarkTypical: null,
            benchmarkMax: null,
            priceSource: null,
            status: "clarification",
            aiComment: "No valid benchmark match found. Manual review required.",
          };
        }
      }
      
      // No benchmark match
      console.log(`Item ${result.id}: No benchmark match (confidence: ${result.matchConfidence || 0})`);
      return {
        ...result,
        recommendedUnitPrice: null,
        benchmarkMin: null,
        benchmarkTypical: null,
        benchmarkMax: null,
        priceSource: null,
        status: "clarification",
      };
    }) || [];

    return new Response(
      JSON.stringify({ items: enrichedItems }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-cost-items error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});