import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// STEP 1: AI generates search terms for the cost item
const SEARCH_TERMS_PROMPT = `You are a construction cost expert. Given a cost item description, generate search terms to find matching benchmarks in a Swedish price database.

Generate 5-10 search terms including:
- Swedish translations (e.g., "carpet" -> "textilgolv", "matta")
- Technical terms (e.g., "flooring" -> "golv")
- Related scope terms (e.g., "demolition" -> "rivning", "byte")
- Category terms (e.g., "painting" -> "målning")

Return JSON: { "searchTerms": ["term1", "term2", ...] }`;

// STEP 2: AI picks the best benchmark from candidates
const MATCH_PROMPT = `You are a senior quantity surveyor. Pick the BEST matching benchmark for the cost item.

CRITICAL RULES:
1. UNIT MUST MATCH: If cost item is m², only match m² benchmarks. If pcs/st, only match pcs/st.
2. SCOPE MUST MATCH: "carpet replacement" matches "textilgolv byte", not just any flooring
3. Return the EXACT benchmark ID from the list - do NOT make up IDs
4. If no good match (wrong unit, wrong scope), return null

Return JSON:
{
  "matchedBenchmarkId": "exact-uuid-from-list-or-null",
  "confidence": 0-100,
  "reasoning": "Why this benchmark matches (or why no match)"
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
    'AT': 'AUSTRIA',
    'Austria': 'AUSTRIA',
    'PL': 'POLAND',
    'Poland': 'POLAND',
    'GB': 'UNITED_KINGDOM',
    'United Kingdom': 'UNITED_KINGDOM',
    'US': 'UNITED_STATES',
    'United States': 'UNITED_STATES',
  };
  return mapping[country] || country.toUpperCase().replace(/ /g, '_');
}

// Normalize unit for comparison
function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  // Map common unit variations
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'square meter' || u === 'square meters') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'meters' || u === 'lm' || u === 'rm') return 'm';
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'kg';
  if (u === 'l' || u === 'liter' || u === 'liters' || u === 'litre') return 'l';
  if (u === 'h' || u === 'hr' || u === 'hour' || u === 'hours' || u === 'tim' || u === 'timmar') return 'h';
  return u;
}

// Check if units are compatible
function unitsCompatible(itemUnit: string, benchmarkUnit: string): boolean {
  const normItem = normalizeUnit(itemUnit);
  const normBench = normalizeUnit(benchmarkUnit);
  return normItem === normBench;
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

    const { items, project } = await req.json() as AnalysisRequest;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cost items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing ${items.length} cost items for project in ${project.country}`);

    const dbCountry = mapCountryToDb(project.country);
    console.log(`Fetching benchmarks for country: ${dbCountry}, currency: ${project.currency}`);

    // Fetch ALL benchmarks for this country/currency
    const { data: allBenchmarks, error: benchmarkError } = await supabase
      .from('benchmark_prices')
      .select('id, description, unit, min_price, avg_price, max_price, category, source, country, currency')
      .eq('country', dbCountry)
      .eq('currency', project.currency);

    if (benchmarkError) {
      console.error("Error fetching benchmarks:", benchmarkError);
      throw new Error("Failed to fetch benchmark data");
    }

    console.log(`Fetched ${allBenchmarks?.length || 0} benchmarks from database`);

    // If no benchmarks, return all items as clarification
    if (!allBenchmarks || allBenchmarks.length === 0) {
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

    // Create benchmark ID lookup for validation
    const benchmarkLookup = new Map<string, BenchmarkPrice>();
    allBenchmarks.forEach((b: BenchmarkPrice) => benchmarkLookup.set(b.id, b));

    const results = [];

    // Process each item
    for (const item of items) {
      console.log(`\n--- Processing item: "${item.originalDescription}" (${item.quantity} ${item.unit}) ---`);
      
      try {
        // STEP 1: Generate search terms
        const searchTermsResult = await callAI(
          LOVABLE_API_KEY,
          SEARCH_TERMS_PROMPT,
          `Cost item: "${item.originalDescription}"\nUnit: ${item.unit}\nQuantity: ${item.quantity}`
        );
        
        let searchTerms: string[] = searchTermsResult.searchTerms || [];
        
        // COMPREHENSIVE EN->SV KEYWORD EXPANSION for Swedish construction database
        const keywordMap: Record<string, string[]> = {
          // Flooring
          'carpet': ['textilgolv', 'matta', 'heltäckningsmatta', 'nålfilt', 'golvmatta'],
          'flooring': ['golv', 'golvbeläggning', 'golvmaterial'],
          'floor': ['golv', 'golvläggning', 'bjälklag'],
          'tile': ['kakel', 'plattor', 'klinker', 'golvplattor'],
          'tiles': ['kakel', 'plattor', 'klinker', 'golvplattor'],
          'parquet': ['parkett', 'trägolv', 'parkettgolv'],
          'laminate': ['laminat', 'laminatgolv'],
          'vinyl': ['vinyl', 'vinylgolv', 'plastmatta'],
          
          // Exterior & Landscaping
          'grass': ['gräs', 'gräsyta', 'gräsmatta', 'gräsytor', 'lawn'],
          'lawn': ['gräsyta', 'gräs', 'gräsmatta', 'gräsytor'],
          'garden': ['trädgård', 'gräsyta', 'utemiljö', 'markarbete'],
          'landscaping': ['markarbete', 'trädgård', 'utemiljö'],
          'paving': ['plattsättning', 'marksten', 'stenläggning'],
          'asphalt': ['asfalt', 'asfaltbeläggning'],
          'fence': ['staket', 'stängsel', 'inhägnad'],
          'terrace': ['terrass', 'altan', 'uteplats'],
          'balcony': ['balkong', 'balkongrenovering'],
          
          // Building Envelope
          'facade': ['fasad', 'puts', 'fasadrenovering', 'fasadmaterial'],
          'roof': ['tak', 'takläggning', 'takrenovering', 'takarbete'],
          'roofing': ['tak', 'takbeläggning', 'taktäckning'],
          'wall': ['vägg', 'väggar', 'innervägg'],
          'walls': ['vägg', 'väggar', 'innerväggar'],
          'ceiling': ['tak', 'innertak', 'undertak'],
          'insulation': ['isolering', 'värmeisolering', 'mineralull'],
          
          // Windows & Doors
          'window': ['fönster', 'fönsterbyte', 'fönstermontering'],
          'windows': ['fönster', 'fönsterbyte', 'fönstermontering'],
          'door': ['dörr', 'dörrbyte', 'dörrmontering', 'entrédörr'],
          'doors': ['dörr', 'dörrbyte', 'dörrmontering'],
          'entrance': ['entré', 'ingång', 'entrédörr', 'entréparti'],
          'gate': ['grind', 'port', 'garageport'],
          
          // Actions/Work Types
          'demolition': ['rivning', 'demontering', 'rivningsarbete'],
          'replacement': ['byte', 'utbyte', 'ersättning'],
          'renovation': ['renovering', 'ombyggnad', 'upprustning'],
          'installation': ['installation', 'montering', 'uppsättning'],
          'repair': ['reparation', 'lagning', 'underhåll'],
          'maintenance': ['underhåll', 'service', 'skötsel'],
          'removal': ['borttagning', 'rivning', 'demontering'],
          'construction': ['byggnation', 'byggarbete', 'nybyggnad'],
          
          // Rooms
          'bathroom': ['badrum', 'våtrum', 'duschrum', 'wc'],
          'kitchen': ['kök', 'köksrenovering', 'köksinstallation'],
          'bedroom': ['sovrum'],
          'living room': ['vardagsrum'],
          'basement': ['källare', 'källarplan'],
          'attic': ['vind', 'vindsutrymme'],
          
          // Systems
          'heating': ['värme', 'uppvärmning', 'värmesystem'],
          'ventilation': ['ventilation', 'fläkt', 'luftbehandling'],
          'plumbing': ['vvs', 'rörläggning', 'rörmokare', 'rörinstallation'],
          'electrical': ['el', 'elinstallation', 'elektriker', 'elanläggning'],
          'drainage': ['dränering', 'avlopp', 'avloppssystem'],
          'hvac': ['vvs', 'klimat', 'kyla'],
          
          // Materials
          'concrete': ['betong', 'gjutning', 'betongarbete'],
          'steel': ['stål', 'stålkonstruktion'],
          'wood': ['trä', 'träarbete', 'virke'],
          'brick': ['tegel', 'murning', 'murverk'],
          'glass': ['glas', 'glasning', 'glaspartier'],
          'paint': ['målning', 'färg', 'lackering'],
          'painting': ['målning', 'måla', 'målningsarbete'],
          'plaster': ['puts', 'putsning', 'gipsning'],
          'drywall': ['gips', 'gipsskiva', 'gipsvägg'],
        };
        
        const descLower = item.originalDescription.toLowerCase();
        for (const [english, swedish] of Object.entries(keywordMap)) {
          if (descLower.includes(english)) {
            searchTerms = [...searchTerms, ...swedish];
          }
        }
        
        // Remove duplicates
        searchTerms = [...new Set(searchTerms)];
        console.log(`Generated search terms: ${searchTerms.join(', ')}`);

        // STEP 2: Search database for candidates using ILIKE
        const candidateBenchmarks: BenchmarkPrice[] = [];
        const seenIds = new Set<string>();

        for (const term of searchTerms) {
          // Search in description
          const { data: descMatches } = await supabase
            .from('benchmark_prices')
            .select('id, description, unit, min_price, avg_price, max_price, category, source, country, currency')
            .eq('country', dbCountry)
            .eq('currency', project.currency)
            .ilike('description', `%${term}%`)
            .limit(20);

          if (descMatches) {
            for (const m of descMatches) {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                candidateBenchmarks.push(m);
              }
            }
          }

          // Also search in category (e.g., "315 - Textilgolv")
          const { data: catMatches } = await supabase
            .from('benchmark_prices')
            .select('id, description, unit, min_price, avg_price, max_price, category, source, country, currency')
            .eq('country', dbCountry)
            .eq('currency', project.currency)
            .ilike('category', `%${term}%`)
            .limit(20);

          if (catMatches) {
            for (const m of catMatches) {
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

        // If no unit-compatible candidates, set to clarification
        if (unitCompatibleCandidates.length === 0) {
          console.log(`No unit-compatible benchmarks found for "${item.originalDescription}"`);
          results.push({
            id: item.id,
            matchedBenchmarkId: null,
            matchConfidence: 0,
            matchReasoning: `No benchmarks found with compatible unit (${item.unit})`,
            interpretedScope: item.originalDescription,
            recommendedUnitPrice: null,
            benchmarkMin: null,
            benchmarkTypical: null,
            benchmarkMax: null,
            priceSource: null,
            status: "clarification",
            aiComment: `No benchmark found with unit ${item.unit}. Manual pricing required.`
          });
          continue;
        }

        // STEP 4: AI picks the best match from candidates
        const candidateList = unitCompatibleCandidates.map(b => 
          `ID: ${b.id} | ${b.description} | Unit: ${b.unit} | Price: ${b.avg_price} ${project.currency} (${b.min_price || 'N/A'} - ${b.max_price || 'N/A'}) | Source: ${b.source || 'Unknown'}`
        ).join('\n');

        const matchResult = await callAI(
          LOVABLE_API_KEY,
          MATCH_PROMPT,
          `COST ITEM:
Description: "${item.originalDescription}"
Quantity: ${item.quantity} ${item.unit}
${item.originalUnitPrice ? `Original Price: ${item.originalUnitPrice} ${project.currency}` : 'Original Price: Not provided'}
${item.trade ? `Trade: ${item.trade}` : ''}

CANDIDATE BENCHMARKS (all have compatible units):
${candidateList}

Pick the BEST matching benchmark. Return the EXACT ID from the list above, or null if none match well.`
        );

        console.log(`AI match result:`, JSON.stringify(matchResult));

        // STEP 5: Validate the match - CRITICAL: verify ID exists in our lookup
        const matchedId = matchResult.matchedBenchmarkId;
        const confidence = matchResult.confidence || 0;
        const reasoning = matchResult.reasoning || "";

        if (!matchedId || confidence < 70) {
          console.log(`Low confidence (${confidence}) or no match for "${item.originalDescription}"`);
          results.push({
            id: item.id,
            matchedBenchmarkId: null,
            matchConfidence: confidence,
            matchReasoning: reasoning || "No confident benchmark match found",
            interpretedScope: item.originalDescription,
            recommendedUnitPrice: null,
            benchmarkMin: null,
            benchmarkTypical: null,
            benchmarkMax: null,
            priceSource: null,
            status: "clarification",
            aiComment: "No confident benchmark match found. Manual pricing required."
          });
          continue;
        }

        // Verify the benchmark ID exists AND is in our candidates
        const matchedBenchmark = unitCompatibleCandidates.find(b => b.id === matchedId);
        
        if (!matchedBenchmark) {
          // AI hallucinated an ID - reject it
          console.warn(`AI returned invalid benchmark ID: ${matchedId}`);
          results.push({
            id: item.id,
            matchedBenchmarkId: null,
            matchConfidence: 0,
            matchReasoning: "AI returned invalid benchmark reference",
            interpretedScope: item.originalDescription,
            recommendedUnitPrice: null,
            benchmarkMin: null,
            benchmarkTypical: null,
            benchmarkMax: null,
            priceSource: null,
            status: "clarification",
            aiComment: "No valid benchmark match found. Manual pricing required."
          });
          continue;
        }

        // SUCCESS: We have a valid DB match
        console.log(`✓ Matched to "${matchedBenchmark.description}" at ${matchedBenchmark.avg_price} ${project.currency}`);

        // Calculate status based on original price vs benchmark
        let status = 'ok';
        if (item.originalUnitPrice && matchedBenchmark.avg_price) {
          const variance = ((item.originalUnitPrice - matchedBenchmark.avg_price) / matchedBenchmark.avg_price) * 100;
          if (variance < -10) status = 'underpriced';
          else if (variance > 10) status = 'review';
          else status = 'ok';
        } else {
          status = 'ok'; // No original price to compare
        }

        const priceSource = `${matchedBenchmark.source || 'Benchmark'} - ${matchedBenchmark.description}`;

        results.push({
          id: item.id,
          matchedBenchmarkId: matchedBenchmark.id,
          matchConfidence: confidence,
          matchReasoning: reasoning,
          interpretedScope: `${matchedBenchmark.description} (matched from: ${item.originalDescription})`,
          recommendedUnitPrice: matchedBenchmark.avg_price,
          benchmarkMin: matchedBenchmark.min_price || matchedBenchmark.avg_price * 0.85,
          benchmarkTypical: matchedBenchmark.avg_price,
          benchmarkMax: matchedBenchmark.max_price || matchedBenchmark.avg_price * 1.15,
          priceSource: priceSource,
          status: status,
          aiComment: `Matched to ${matchedBenchmark.description} with ${confidence}% confidence. ${reasoning}`
        });

      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError);
        results.push({
          id: item.id,
          matchedBenchmarkId: null,
          matchConfidence: 0,
          matchReasoning: `Processing error: ${itemError instanceof Error ? itemError.message : 'Unknown error'}`,
          interpretedScope: item.originalDescription,
          recommendedUnitPrice: null,
          benchmarkMin: null,
          benchmarkTypical: null,
          benchmarkMax: null,
          priceSource: null,
          status: "clarification",
          aiComment: "Error during analysis. Manual pricing required."
        });
      }
    }

    console.log(`\nAnalysis complete: ${results.length} items processed`);
    
    return new Response(
      JSON.stringify({ items: results }),
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
