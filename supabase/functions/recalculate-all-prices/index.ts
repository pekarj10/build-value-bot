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

const SEARCH_TERMS_PROMPT = `You are a construction cost expert. Generate search terms for a Swedish price database.
Generate 5-10 Swedish/English search terms.
Return JSON: { "searchTerms": ["term1", "term2", ...] }`;

const MATCH_PROMPT = `You are a senior quantity surveyor picking benchmarks for construction cost items.

Given a cost item and a list of benchmark candidates (already filtered by unit), select the BEST match.

INSTRUCTIONS:
1. All candidates have compatible units - pick the most semantically similar one
2. Match based on: scope of work, materials, activity type
3. Return the EXACT benchmark ID from the list (copy-paste the UUID)
4. Give confidence 70-100 for good matches, 50-69 for partial matches
5. If truly no match (completely different scope), return null with confidence 0

Return JSON: { "matchedBenchmarkId": "exact-uuid-from-list-or-null", "confidence": 0-100, "reasoning": "brief explanation" }`;


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
  source: string | null;
}

interface Project {
  id: string;
  country: string;
  currency: string;
  project_type: string;
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
  if (u === 'm2' || u === 'm²' || u === 'sqm') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'lm' || u === 'rm') return 'm';
  return u;
}

function unitsCompatible(a: string, b: string): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
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
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    console.log(`Admin ${user.id} initiating full price recalculation`);

    const body = await req.json().catch(() => ({}));
    const projectId = body.projectId;

    // Fetch projects
    let projectsQuery = supabase.from('projects').select('id, country, currency, project_type');
    if (projectId) {
      projectsQuery = projectsQuery.eq('id', projectId);
    }
    const { data: projects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      throw new Error(`Failed to fetch projects: ${projectsError.message}`);
    }

    console.log(`Processing ${projects?.length || 0} projects`);

    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
      changes: [] as Array<{
        itemId: string;
        description: string;
        oldPrice: number | null;
        newPrice: number | null;
        priceSource: string | null;
        confidence: number;
      }>,
    };

    for (const project of projects || []) {
      const dbCountry = mapCountryToDb(project.country);
      
      // Fetch cost items
      const { data: costItems, error: itemsError } = await supabase
        .from('cost_items')
        .select('id, original_description, quantity, unit, original_unit_price, recommended_unit_price, project_id')
        .eq('project_id', project.id);

      if (itemsError || !costItems?.length) {
        console.warn(`No items for project ${project.id}`);
        continue;
      }

      console.log(`Project ${project.id}: ${costItems.length} items`);

      for (const item of costItems) {
        results.processed++;
        
        try {
          // STEP 1: Generate search terms
          const searchResult = await callAI(
            LOVABLE_API_KEY,
            SEARCH_TERMS_PROMPT,
            `Cost item: "${item.original_description}"\nUnit: ${item.unit}`
          );
          
          let searchTerms: string[] = searchResult.searchTerms || [];
          
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
          
          const descLower = item.original_description.toLowerCase();
          for (const [english, swedish] of Object.entries(keywordMap)) {
            if (descLower.includes(english)) {
              searchTerms = [...searchTerms, ...swedish];
            }
          }
          
          // Remove duplicates
          searchTerms = [...new Set(searchTerms)];
          console.log(`[${item.original_description}] Search terms: ${searchTerms.join(', ')}`);

          // STEP 2: Search DB in BOTH description AND category
          const candidates: BenchmarkPrice[] = [];
          const seenIds = new Set<string>();

          for (const term of searchTerms) {
            // Search in description
            const { data: descMatches, error: descError } = await supabase
              .from('benchmark_prices')
              .select('id, description, unit, min_price, avg_price, max_price, category, source')
              .eq('country', dbCountry)
              .eq('currency', project.currency)
              .ilike('description', `%${term}%`)
              .limit(20);

            if (descError) {
              console.error(`Search error (description) for "${term}":`, descError);
            }
            if (descMatches && descMatches.length > 0) {
              console.log(`[${term}] Found ${descMatches.length} in DESCRIPTION: ${descMatches.map(m => m.description).join(', ')}`);
              for (const m of descMatches) {
                if (!seenIds.has(m.id)) {
                  seenIds.add(m.id);
                  candidates.push(m);
                }
              }
            }

            // ALSO search in category (e.g., "315 - Textilgolv")
            const { data: catMatches, error: catError } = await supabase
              .from('benchmark_prices')
              .select('id, description, unit, min_price, avg_price, max_price, category, source')
              .eq('country', dbCountry)
              .eq('currency', project.currency)
              .ilike('category', `%${term}%`)
              .limit(20);

            if (catError) {
              console.error(`Search error (category) for "${term}":`, catError);
            }
            if (catMatches && catMatches.length > 0) {
              console.log(`[${term}] Found ${catMatches.length} in CATEGORY: ${catMatches.map(m => `${m.category}:${m.description}`).join(', ')}`);
              for (const m of catMatches) {
                if (!seenIds.has(m.id)) {
                  seenIds.add(m.id);
                  candidates.push(m);
                }
              }
            }
          }

          console.log(`[${item.original_description}] Total candidates found: ${candidates.length}`);

          // STEP 3: Filter by unit
          const unitCompatible = candidates.filter(b => unitsCompatible(item.unit, b.unit));
          console.log(`[${item.original_description}] Unit-compatible: ${unitCompatible.length} of ${candidates.length} (item unit: ${item.unit})`);

          if (unitCompatible.length === 0) {
            // List first few candidate units for debugging
            const sampleUnits = [...new Set(candidates.slice(0, 10).map(c => c.unit))].join(', ');
            console.log(`[${item.original_description}] No unit match. Sample benchmark units: ${sampleUnits}`);
            
            // No match - update to clarification
            if (item.recommended_unit_price !== null) {
              await supabase
                .from('cost_items')
                .update({
                  matched_benchmark_id: null,
                  match_confidence: 0,
                  match_reasoning: `No benchmarks with unit ${item.unit}. Available units: ${sampleUnits}`,
                  recommended_unit_price: null,
                  benchmark_min: null,
                  benchmark_typical: null,
                  benchmark_max: null,
                  price_source: null,
                  status: 'clarification',
                  ai_comment: 'No benchmark match found. Manual pricing required.',
                })
                .eq('id', item.id);

              results.updated++;
              results.changes.push({
                itemId: item.id,
                description: item.original_description,
                oldPrice: item.recommended_unit_price,
                newPrice: null,
                priceSource: null,
                confidence: 0,
              });
              console.log(`"${item.original_description}": ${item.recommended_unit_price} → NULL (no match)`);
            }
            continue;
          }

          // STEP 4: AI picks best match
          const candidateList = unitCompatible.map(b => 
            `ID: ${b.id} | ${b.description} | ${b.unit} | ${b.avg_price}`
          ).join('\n');

          const matchResult = await callAI(
            LOVABLE_API_KEY,
            MATCH_PROMPT,
            `Item: "${item.original_description}" (${item.unit})\n\nBenchmarks:\n${candidateList}`
          );

          const matchedId = matchResult.matchedBenchmarkId;
          const confidence = matchResult.confidence || 0;
          const reasoning = matchResult.reasoning || "";
          console.log(`[${item.original_description}] AI response: matchedId=${matchedId}, confidence=${confidence}, reasoning="${reasoning}"`);

          if (!matchedId || confidence < 70) {
            // Low confidence
            if (item.recommended_unit_price !== null) {
              await supabase
                .from('cost_items')
                .update({
                  matched_benchmark_id: null,
                  match_confidence: confidence,
                  match_reasoning: reasoning || "Low confidence match",
                  recommended_unit_price: null,
                  benchmark_min: null,
                  benchmark_typical: null,
                  benchmark_max: null,
                  price_source: null,
                  status: 'clarification',
                  ai_comment: 'No confident benchmark match. Manual pricing required.',
                })
                .eq('id', item.id);

              results.updated++;
              results.changes.push({
                itemId: item.id,
                description: item.original_description,
                oldPrice: item.recommended_unit_price,
                newPrice: null,
                priceSource: null,
                confidence,
              });
              console.log(`"${item.original_description}": ${item.recommended_unit_price} → NULL (low confidence ${confidence}%)`);
            }
            continue;
          }

          // Validate match
          const benchmark = unitCompatible.find(b => b.id === matchedId);
          if (!benchmark) {
            console.warn(`Invalid benchmark ID: ${matchedId}`);
            results.errors++;
            continue;
          }

          // Calculate status
          let status = 'ok';
          if (item.original_unit_price && benchmark.avg_price) {
            const variance = ((item.original_unit_price - benchmark.avg_price) / benchmark.avg_price) * 100;
            if (variance < -10) status = 'underpriced';
            else if (variance > 10) status = 'review';
          }

          const priceSource = `${benchmark.source || 'Benchmark'} - ${benchmark.description}`;

          // Update
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
            console.error(`Update error:`, updateError);
            results.errors++;
          } else {
            if (item.recommended_unit_price !== benchmark.avg_price) {
              results.updated++;
              results.changes.push({
                itemId: item.id,
                description: item.original_description,
                oldPrice: item.recommended_unit_price,
                newPrice: benchmark.avg_price,
                priceSource,
                confidence,
              });
              console.log(`"${item.original_description}": ${item.recommended_unit_price} → ${benchmark.avg_price} (${priceSource})`);
            }
          }

          // Rate limit delay
          await new Promise(r => setTimeout(r, 200));

        } catch (itemError) {
          console.error(`Error processing item ${item.id}:`, itemError);
          results.errors++;
        }
      }
    }

    console.log(`\nRecalculation complete: ${results.processed} processed, ${results.updated} updated, ${results.errors} errors`);

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
