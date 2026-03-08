import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * DETERMINISTIC AI-POWERED COST ITEM ANALYSIS
 * 
 * Key reliability features:
 * 1. Temperature=0 for all AI calls (deterministic outputs)
 * 2. Fixed seed=42 for reproducibility
 * 3. Pre-fetch ALL benchmarks once, filter in-memory (no per-term DB queries)
 * 4. Sequential processing with stable ordering
 * 5. Swedish compound word decomposition for robust matching
 * 6. Bidirectional prefix matching (handles "asfaltbeläggning" ↔ "asfalt")
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIFIED_MATCH_PROMPT = `You are a SENIOR CIVIL ENGINEER and construction cost expert with 25+ years of experience in Swedish building maintenance (TDD/underhållsplan), renovation, and new construction. You think like a Swedish quantity surveyor (kalkylator) who deeply understands REPAB benchmark categories.

## YOUR EXPERTISE
You understand that:
- Brief user descriptions map to specific REPAB categories. "Asfaltbeläggning parkering" = asphalt resurfacing for parking = category 121.
- "Buskar omplantering" = shrub replanting = category 112. Match to the SIZE-APPROPRIATE benchmark (>20 m² for large areas).
- "Putsfasad renovering" = rendered facade renovation. This is facade repainting/re-rendering work = categories 206/215.
- "Nya fönster fasadtyp 1" = window replacement for facade type 1 = category 204/241-245.
- "Takomläggning plåt" = metal roof re-roofing = category 262 (Plåt).
- "Takavvattning byte" = replacement of gutters/downpipes = category 222.
- "Mattbyte korridorer" = carpet/textile floor replacement = textile flooring benchmarks.
- "Innerväggar målning" = interior wall painting = painting benchmarks for inner walls.
- "Innertak renovering" = ceiling renovation = category 335 (Innertak skivor) for interior ceilings, or 229/337 for exterior soffits/undertaks.
- "Tilläggsisolering fasad" = additional facade insulation.
- "Balkongrenovering" = could mean balkongplatta (232) OR balkongräcke (233). If user mentions railing/räcke/painting → 233, if structural → 232.
- "Balkongräcke målning" = balcony railing painting = category 233 (Balkongräcken). Match material (trä/plåt/aluminium) and work type (målning/byte).
- "Brandlarmsystem" = fire alarm system = category 646 (Larmanläggning/Brandlarm). Match scale by sections (sektioner).
- "Elcentral uppgradering" = electrical panel upgrade = 6S1/6S3 electrical installation benchmarks.
- "Vattenledningar stamrenovering" = water pipe renovation = category 142 (VA-ledningar).
- Users write SHORT descriptions. Your job is to understand WHAT CONSTRUCTION WORK is involved and find the BEST REPAB benchmark.

## SEMANTIC UNDERSTANDING
CRITICAL: You must think like a civil engineer, not a text matcher:
- "Balkongrenovering" with context about "wooden railing repainting" → category 233 Balkongräcken trä målning
- "Brandlarmsystem" for a building → category 646, pick the appropriate section count based on building size
- "Elcentral uppgradering" → electrical installation replacement, use 6S1 room-based electrical benchmarks
- "Vattenledningar stamrenovering" → pipe replacement, category 142 VA-ledningar, match depth bracket
- "Innertak renovering" → interior ceiling replacement, category 335 Innertak skivor (NOT exterior roof)

## QUANTITY-BASED BENCHMARK SELECTION
CRITICAL: Many REPAB benchmarks have SIZE BRACKETS (e.g., "<5 m²", "5-20 m²", ">20 m²", "500-1000 m²", ">5000 m²").
You MUST select the benchmark whose size bracket matches the item's QUANTITY:
- Item: 350 m² → select ">20 m²" or "20-100 m²" benchmark (NOT "<5 m²")
- Item: 4500 m² → select "1000-5000 m²" benchmark (NOT "<20 m²")
- Item: 2200 m² → select ">100 m²" or "1000-5000 m²" benchmark
When multiple size brackets exist, pick the one that contains the item's quantity.

## PERCENTAGE-BASED BENCHMARKS
Some benchmarks use "% av bruttoytan" (percentage of gross area) or "% av ytan" (percentage of area). These describe partial work. If the user gives an absolute area (e.g., 250 m²) AND a benchmark uses "100% av ytan", that means FULL replacement — prefer it for renovation/byte work. If the user gives a small percentage, match accordingly.

## CRITICAL LANGUAGE REQUIREMENT
ALL your responses MUST be in ENGLISH. Do NOT include benchmark IDs (UUIDs) in your reasoning text.

## MATCHING RULES
- Match based on SCOPE OF WORK and INTENT, not just keywords
- Units must be compatible (m² matches m², st matches st, etc.)
- If the user says "pcs" but benchmarks use "m²" for that work type, flag the unit mismatch
- Prefer the benchmark whose SCOPE and SIZE BRACKET best match
- Even partial matches (65-80% confidence) are valuable — always explain the gap
- For balcony work: distinguish between platta (structural slab) and räcke (railing)
- For fire alarms: match scale (2, 2-8, 8-16 sections) to building size

## CONFIDENCE SCORING
- 90-100%: Exact match (same work type, correct size bracket, same unit)
- 80-89%: Very close match (same work type, slightly different scope)
- 70-79%: Good conceptual match (related work type)
- 50-69%: Partial match (explain why)
- 0-49%: No suitable match - return null

CRITICAL: Return EXACTLY this JSON format:
{
  "translatedTerm": "the term in target language (for matching only)",
  "matchedBenchmarkId": "exact-uuid-from-list-or-null",
  "confidence": 85,
  "reasoning": "ENGLISH ONLY: Clear explanation without any UUIDs or benchmark IDs"
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

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'kvm') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces' || u === 'styck' || u === 'stk') return 'st';
  if (u === 'm' || u === 'meter' || u === 'meters' || u === 'lm' || u === 'rm') return 'm';
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'kg';
  if (u === 'l' || u === 'liter' || u === 'liters' || u === 'litre') return 'l';
  if (u === 'h' || u === 'hr' || u === 'hour' || u === 'hours' || u === 'tim' || u === 'timmar') return 'h';
  return u;
}

function unitsCompatible(itemUnit: string, benchmarkUnit: string): boolean {
  return normalizeUnit(itemUnit) === normalizeUnit(benchmarkUnit);
}

/**
 * SWEDISH COMPOUND WORD DECOMPOSITION
 * Swedish concatenates words: "asfaltbeläggning" = "asfalt" + "beläggning"
 * This function extracts root words from compounds.
 */
function decompoundSwedish(word: string): string[] {
  const w = word.toLowerCase();
  if (w.length < 6) return [w]; // Too short to be compound

  const results: string[] = [w];
  
  // Known Swedish construction root words (ordered by length desc for greedy matching)
  const roots = [
    // Building parts
    'tilläggsisolering', 'ventilationsaggregat', 'betongkantstöd',
    'fasadrenovering', 'takomläggning', 'takavvattning', 'golvbeläggning',
    'asfaltbeläggning', 'stenmjölsytor', 'hissrenovering', 'stamrenovering',
    'balkongrenovering', 'avloppsrelining',
    // Medium roots  
    'beläggning', 'omläggning', 'omplantering', 'renovering', 'uppgradering',
    'isolering', 'installat', 'montering', 'beklädnad',
    'stuprör', 'hängrännor', 'kantstöd', 'kantsten', 'kantstöd',
    // Core construction terms
    'asfalt', 'betong', 'plåt', 'tegel', 'trä', 'puts', 'gips', 'skivor',
    'fasad', 'golv', 'tak', 'vägg', 'dörr', 'fönster', 'entré', 'balkong',
    'gräs', 'buskar', 'stenmjöl', 'kullersten', 'gatsten',
    'matta', 'textil', 'parkett', 'vinyl', 'klinker', 'kakel',
    'inner', 'ytter', 'under',
    'vatten', 'avlopp', 'rör', 'ledning',
    'värme', 'ventilation', 'kyla', 'el', 'brand', 'hiss',
    'målning', 'strykning', 'lagning', 'byte', 'justering',
    'membran', 'tätskikt', 'relining',
    'radiator', 'belysning', 'armatur', 'larm',
    'sockel', 'språng', 'lucka', 'räcke', 'trappa',
    'parkering', 'korridor', 'garage',
  ];

  // Try to find root words that appear as substrings
  for (const root of roots) {
    if (w.length > root.length && w.includes(root)) {
      results.push(root);
      // Also add the remaining part if meaningful
      const idx = w.indexOf(root);
      const before = w.substring(0, idx);
      const after = w.substring(idx + root.length);
      if (before.length >= 3) results.push(before);
      if (after.length >= 3) results.push(after);
    }
  }

  // Also try splitting at common Swedish compound boundaries
  // Many compounds join at 's' (bindefogen): "underhållsplan" = "underhåll" + "plan"
  const sJoinPattern = /^(.{3,})s(.{3,})$/;
  const sMatch = w.match(sJoinPattern);
  if (sMatch) {
    results.push(sMatch[1]);
    results.push(sMatch[2]);
  }

  return [...new Set(results)];
}

/**
 * DETERMINISTIC AI CALL
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
 * FETCH ALL BENCHMARKS (no 1000-row cap)
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
      .select('id, description, unit, min_price, avg_price, max_price, category, source, country, currency')
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

  return all.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * GENERATE SEARCH TERMS - Enhanced with compound word decomposition
 */
function generateSearchTerms(description: string): string[] {
  const terms: string[] = [description.toLowerCase()];
  const desc = description.toLowerCase();

  // Comprehensive bidirectional English ↔ Swedish construction dictionary
  const translations: Record<string, string[]> = {
    // === EXTERIOR / LANDSCAPING ===
    'asfalt': ['asfalt', 'beläggning', 'omläggning', '121', 'körbar', 'gångbar'],
    'asfaltbeläggning': ['asfalt', 'beläggning', 'omläggning', '121', 'körbar', 'gångbar'],
    'asphalt': ['asfalt', 'beläggning', 'omläggning', '121'],
    'parkering': ['parkering', 'körbar', 'asfalt', '121', 'garage', 'p-plats'],
    'grass': ['gräs', 'gräsytor', 'gräsmatta', '111', 'kompletteringsådd', 'omläggning'],
    'lawn': ['gräs', 'gräsytor', 'gräsmatta', '111'],
    'gräsyta': ['gräs', 'gräsytor', 'gräsmatta', '111', 'omläggning', 'kompletteringsådd'],
    'gräsytor': ['gräs', 'gräsytor', '111', 'omläggning', 'kompletteringsådd'],
    'gräs': ['gräs', 'gräsytor', 'gräsmatta', '111', 'omläggning'],
    'shrubs': ['buskar', 'plantering', 'omplantering', '112'],
    'bushes': ['buskar', 'plantering', 'omplantering', '112'],
    'buskar': ['buskar', 'plantering', 'omplantering', '112', 'planteringsytor'],
    'omplantering': ['omplantering', 'buskar', 'plantering', '112'],
    'gravel': ['grus', 'stenmjöl', 'stenmjölsytor', '122'],
    'stenmjöl': ['stenmjöl', 'stenmjölsytor', 'grus', '122'],
    'stenmjölsytor': ['stenmjöl', 'stenmjölsytor', '122', 'omläggning'],
    'cobblestone': ['kullersten', 'gatsten', 'stenläggning', '123'],
    'kullersten': ['kullersten', 'gatsten', 'sten', 'plattor', '123', 'justering'],
    'gatsten': ['kullersten', 'gatsten', '123'],
    'plattor': ['plattor', 'sten', 'betongplattor', '123'],
    'curb': ['kantsten', 'kantstöd', 'betongkantstöd', '124'],
    'betongkantstöd': ['betongkantstöd', 'kantsten', 'kantstöd', '124', 'justering', 'byte'],
    'kantstöd': ['kantstöd', 'kantsten', 'betongkantstöd', '124'],
    'kantsten': ['kantsten', 'kantstöd', 'betongkantstöd', '124'],
    'lekutrustning': ['lekutrustning', 'lekplats', '131'],
    'sand': ['sand', 'sandlåda', '132'],
    'stängsel': ['stängsel', 'staket', '161'],
    'staket': ['staket', 'stängsel', 'räcke', '162'],

    // === FACADE ===
    'facade': ['fasad', 'puts', 'fasadrenovering', '206', '207', '208'],
    'fasad': ['fasad', 'puts', 'fasadrenovering', '206', '207', '208', '209'],
    'fasadrenovering': ['fasad', 'puts', 'renovering', '206', '215'],
    'rendering': ['puts', 'putsning', 'fasadputs', '215'],
    'putsfasad': ['puts', 'fasad', 'putsfasad', '206', '215', 'målning', 'renovering'],
    'puts': ['puts', 'putsning', 'putsfasad', '206', '215'],
    'tegelfasad': ['tegel', 'fasad', 'tegelfasad', '208'],
    'tegel': ['tegel', 'tegelfasad', '208', '213'],
    'plåtfasad': ['plåt', 'fasad', 'plåtfasad', '207'],
    'trähus': ['trä', 'fasad', 'träfasad', '205'],
    'träfasad': ['trä', 'fasad', 'träfasad', '205'],

    // === INSULATION ===
    'insulation': ['isolering', 'tilläggsisolering', 'fasadisolering'],
    'isolering': ['isolering', 'tilläggsisolering', 'fasadisolering'],
    'tilläggsisolering': ['tilläggsisolering', 'isolering', 'fasadisolering', 'fasad'],

    // === ROOFING ===
    'roof': ['tak', 'takläggning', 'taktäckning', 'takomläggning'],
    'roofing': ['tak', 'takläggning', 'taktäckning', 'takomläggning'],
    'tak': ['tak', 'takläggning', 'taktäckning', 'takomläggning', '261', '262', '263'],
    'takomläggning': ['tak', 'takläggning', 'taktäckning', 'takomläggning', 'plåt', '262', '263'],
    'plåt': ['plåt', 'plåttak', 'takplåt', '262', '207'],
    'takpannor': ['takpannor', 'pannor', '261'],
    'papp': ['papp', 'taktäckning', '263'],
    'tätskikt': ['tätskikt', 'membran', '264'],
    'takavvattning': ['takavvattning', 'stuprör', 'hängrännor', 'dagvatten', '222'],
    'stuprör': ['stuprör', 'hängrännor', 'takavvattning', '222'],
    'hängrännor': ['hängrännor', 'stuprör', 'takavvattning', '222'],

    // === WINDOWS ===
    'window': ['fönster', 'fönsterbyte', '204', '241', '242', '243'],
    'windows': ['fönster', 'fönsterbyte', '204', '241', '242', '243'],
    'fönster': ['fönster', 'fönsterbyte', '204', '241', '242', '243', '244', 'byte'],
    'fönsterbyte': ['fönster', 'byte', '204', '241', '242', '243'],
    'träfönster': ['träfönster', 'fönster', '241', '242'],
    'aluminiumfönster': ['aluminiumfönster', 'aluminium', 'fönster', '243'],
    'glasning': ['glas', 'glasning', 'fönster', 'isolerglas', '249'],

    // === DOORS ===
    'door': ['dörr', 'dörrmontering', 'dörrbyte', '251', '252', '253', '254'],
    'doors': ['dörr', 'dörrmontering', 'dörrbyte', '251', '252', '253'],
    'dörr': ['dörr', 'dörrmontering', 'dörrbyte', '251', '252', '253', '254'],
    'dörrar': ['dörr', 'dörrmontering', 'dörrbyte', '251', '252', '253'],
    'entrance': ['entré', 'entrédörr', 'entréparti', '257'],
    'entrédörr': ['entrédörr', 'entré', 'dörr', '257'],
    'entré': ['entré', 'entrédörr', 'entréparti', 'dörr', '257'],
    'port': ['port', 'slagport', 'rullport', '255', '256'],
    'portar': ['port', 'portar', '255', '256'],

    // === BALCONY ===
    'balkong': ['balkong', 'balkongrenovering', 'balkongplatta', 'balkongräcke', '232', '233', 'räcke'],
    'balkongrenovering': ['balkong', 'balkongplatta', 'balkongräcke', '232', '233', 'räcke', 'trä', 'plåt', 'aluminium', 'målning', 'byte'],
    'balkongplatta': ['balkongplatta', 'balkong', '232', 'betong', 'lagning'],
    'balkongräcke': ['balkongräcke', 'balkong', 'räcke', '233', 'trä', 'plåt', 'aluminium', 'målning', 'byte'],
    'balcony': ['balkong', 'balkongräcke', 'balkongplatta', '232', '233'],
    'railing': ['räcke', 'balkongräcke', 'träräcke', 'smidesräcke', '233', '225', '162'],
    'räcke': ['räcke', 'balkongräcke', 'träräcke', 'smidesräcke', '233', '225', '162'],
    'räcken': ['räcke', 'räcken', 'balkongräcke', '225', '233', '162'],

    // === SOCKEL / DETAILS ===
    'sockel': ['sockel', '221'],
    'taksprång': ['taksprång', '224'],
    'solavskärmning': ['solavskärmning', 'markis', '227'],
    'skorsten': ['skorsten', 'huv', '271'],
    'takfönster': ['takfönster', '273'],
    'takbrunnar': ['takbrunnar', 'brunn', '274'],
    'beslag': ['beslag', '275'],
    'ställning': ['ställning', 'byggnadsställning', '291'],

    // === FLOORING ===
    'carpet': ['textilgolv', 'nålfilt', 'heltäckningsmatta', 'golvmatta', 'matta'],
    'floor': ['golv', 'golvläggning', 'golvbeläggning'],
    'flooring': ['golv', 'golvläggning', 'golvbeläggning'],
    'tile': ['kakel', 'klinker', 'plattor', 'keramik'],
    'parquet': ['parkett', 'trägolv', 'laminat'],
    'vinyl': ['vinyl', 'plastmatta', 'plastgolv'],
    'laminate': ['laminat', 'laminatgolv'],
    'matta': ['matta', 'textilgolv', 'nålfilt', 'golvmatta', 'textil', 'heltäckningsmatta'],
    'mattbyte': ['matta', 'textilgolv', 'nålfilt', 'golvmatta', 'byte'],
    'textilgolv': ['textilgolv', 'nålfilt', 'matta', 'golvmatta'],
    'golv': ['golv', 'golvläggning', 'golvbeläggning'],
    'golvbyte': ['golv', 'byte', 'golvbeläggning'],

    // === INTERIOR CEILINGS ===
    'innertak': ['innertak', 'tak', 'undertak', 'takskivor', '335', '337', 'skivor', 'gipsskiva', 'spånskiva'],
    'undertak': ['undertak', 'innertak', '229', '337', 'akustikplattor', 'plåt', 'träpanel', 'träskivor'],
    'ceiling': ['innertak', 'undertak', 'tak', '335', '337'],
    'takskivor': ['takskivor', 'innertak', '335'],

    // === WALLS / PAINTING ===
    'wall': ['vägg', 'väggar'],
    'walls': ['vägg', 'väggar'],
    'partition': ['innervägg', 'mellanvägg', 'gipsväggar'],
    'drywall': ['gips', 'gipsskivor', 'gipsvägg'],
    'innervägg': ['innervägg', 'innerväggar', 'vägg', 'gips'],
    'innerväggar': ['innervägg', 'innerväggar', 'vägg', 'gips', 'målning'],
    'vägg': ['vägg', 'väggar', 'innervägg'],
    'painting': ['målning', 'ommålning', 'strykning', 'färg'],
    'målning': ['målning', 'ommålning', 'strykning', 'färg', 'måla'],
    'ommålning': ['ommålning', 'målning', 'strykning'],

    // === HVAC / MEP ===
    'heat pump': ['värmepump', 'luft-vatten', 'bergvärme'],
    'heating': ['värme', 'uppvärmning', 'värmesystem', 'radiatorer'],
    'ventilation': ['ventilation', 'fläkt', 'ventilationsaggregat', 'luft'],
    'ventilationsaggregat': ['ventilation', 'ventilationsaggregat', 'fläkt', 'byte'],
    'radiator': ['radiator', 'radiatorer', 'element', 'värme'],
    'radiatorer': ['radiator', 'radiatorer', 'element', 'värme', 'byte'],
    'hvac': ['VVS', 'ventilation', 'värme', 'kyla'],
    'plumbing': ['VVS', 'rör', 'rörarbeten'],
    'electrical': ['el', 'elinstallation', 'elarbeten', 'elanläggning'],
    'belysning': ['belysning', 'ljus', 'lampor', 'LED', 'armaturer', 'el'],
    'elcentral': ['elcentral', 'elskåp', 'elanläggning', 'elinstallation', 'elinstallationer', '6S1', '6S3', 'byte'],
    'elanläggning': ['elanläggning', 'elinstallation', 'elinstallationer', 'elcentral', '6S1', '6S3'],
    'elinstallation': ['elinstallation', 'elinstallationer', 'elanläggning', '6S1', '6S3', 'byte', 'led', 'lysrör'],
    'brandlarm': ['brandlarm', 'brandlarmsystem', 'brandsäkerhet', 'larm', 'larmanläggning', '646', 'rökdetektor', 'centralutrustning'],
    'brandlarmsystem': ['brandlarm', 'larmanläggning', '646', 'rökdetektor', 'centralutrustning', 'dörrhålare', 'sektioner'],
    'larmanläggning': ['larmanläggning', 'brandlarm', '646', 'larm'],
    'fire alarm': ['brandlarm', 'larmanläggning', '646', 'rökdetektor'],
    'hiss': ['hiss', 'hissrenovering', 'elevator', 'hissar'],
    'hissrenovering': ['hiss', 'hissrenovering', 'elevator', 'hissar', 'byte'],
    'avlopp': ['avlopp', 'avloppsrör', 'relining', 'stamrenovering', 'rör', '142', 'avloppsledningar'],
    'relining': ['relining', 'avlopp', 'stamrenovering', 'rörinfodring'],
    'avloppsrelining': ['relining', 'avlopp', 'stamrenovering', 'rörinfodring'],
    'stamrenovering': ['stamrenovering', 'relining', 'rör', 'avlopp', 'vatten', '142', 'vattenledningar', 'avloppsledningar'],
    'stambyte': ['stambyte', 'stamrenovering', 'vattenledningar', 'avloppsledningar', '142', 'rör'],
    'vattenledning': ['vattenledning', 'vattenledningar', 'rör', 'ledningar', '142', 'stambyte'],
    'vattenledningar': ['vattenledning', 'vattenledningar', 'rör', '142', 'stambyte', 'byte', 'avloppsledningar'],
    'membran': ['membran', 'tätskikt', 'vattentätning'],
    'värme': ['värme', 'uppvärmning', 'värmesystem'],
    'el': ['el', 'elanläggning', 'elinstallation', 'elinstallationer'],
    'vatten': ['vatten', 'vattenledning', 'VA', '142', 'vattenledningar'],
    'rör': ['rör', 'rörarbeten', 'ledningar'],

    // === ACTIONS / VERBS ===
    'replacement': ['byte', 'utbyte', 'ersättning'],
    'replace': ['byte', 'utbyte', 'byta'],
    'byte': ['byte', 'utbyte', 'ersättning', 'byta'],
    'renovation': ['renovering', 'ombyggnad', 'upprustning'],
    'renovering': ['renovering', 'ombyggnad', 'upprustning'],
    'installation': ['installation', 'montering', 'montage'],
    'repair': ['reparation', 'lagning', 'åtgärd'],
    'adjustment': ['justering', 'justeras', 'åtgärd'],
    'justering': ['justering', 'justeras', 'åtgärd'],
    'omläggning': ['omläggning', 'läggning', 'byte', 'renovering'],
    'nya': ['ny', 'nytt', 'byte', 'nyinstallation'],
    'new': ['ny', 'nytt', 'byte'],
    'utbyte': ['utbyte', 'byte', 'byta'],
    'uppgradering': ['uppgradering', 'byte', 'modernisering'],
    'beläggning': ['beläggning', 'omläggning', 'läggning', 'golv', 'asfalt'],
  };

  // STEP 1: Multi-word phrases
  const multiWordPhrases = [
    'heat pump', 'entrance door', 'entrance doors', 'air to water',
    'double glazed', 'triple glazed', 'external wall', 'mineral wool',
    'water pipe', 'concrete curb', 'crushed stone',
  ];
  for (const phrase of multiWordPhrases) {
    if (desc.includes(phrase) && translations[phrase]) {
      terms.push(...translations[phrase]);
    }
  }

  // STEP 2: Split description into words and process each
  const words = desc.split(/[\s,.\-\/\(\)]+/).filter(w => w.length >= 2);

  for (const word of words) {
    const cleanWord = word.toLowerCase();
    
    // 2a: Direct translation lookup
    if (translations[cleanWord]) {
      terms.push(...translations[cleanWord]);
    }
    
    // 2b: Compound word decomposition
    const decomposed = decompoundSwedish(cleanWord);
    for (const part of decomposed) {
      terms.push(part);
      // Also look up translations for decomposed parts
      if (translations[part]) {
        terms.push(...translations[part]);
      }
    }
    
    // 2c: Add word itself if it contains Swedish chars (likely a valid term)
    if (/[åäö]/.test(cleanWord)) {
      terms.push(cleanWord);
    }
  }

  // STEP 3: Context-based category boosting
  if (desc.includes('asfalt') || desc.includes('asphalt') || desc.includes('beläggning')) {
    terms.push('121', 'asfalt', 'omläggning', 'körbar', 'gångbar', 'beläggning');
  }
  if (desc.includes('gräs') || desc.includes('grass') || desc.includes('lawn')) {
    terms.push('111', 'gräsytor', 'omläggning', 'kompletteringsådd');
  }
  if (desc.includes('busk') || desc.includes('shrub')) {
    terms.push('112', 'planteringsytor', 'buskar', 'omplantering');
  }
  if (desc.includes('kullersten') || desc.includes('gatsten') || desc.includes('plattor')) {
    terms.push('123', 'sten', 'plattor');
  }
  if (desc.includes('kantst') || desc.includes('curb')) {
    terms.push('124', 'kantstöd', 'kantsten');
  }
  if (desc.includes('fönster') || desc.includes('window')) {
    terms.push('204', '241', '242', '243', 'fönster', 'byte');
  }
  if (desc.includes('dörr') || desc.includes('door')) {
    terms.push('204', '251', '252', '253', 'dörr', 'byte');
  }
  if (desc.includes('entré') || desc.includes('entre') || desc.includes('entrance')) {
    terms.push('257', 'entréparti', 'entrédörr');
  }
  if (desc.includes('fasad') || desc.includes('facade')) {
    terms.push('206', '207', '208', '209', 'fasad', 'puts');
  }
  if (desc.includes('puts') || desc.includes('render')) {
    terms.push('215', '206', 'puts', 'putsning', 'putsfasad', 'målning');
  }
  if (desc.includes('tak') || desc.includes('roof')) {
    terms.push('261', '262', '263', 'tak', 'takläggning', 'taktäckning', 'plåt', 'papp');
  }
  if (desc.includes('plåt') && desc.includes('tak')) {
    terms.push('262', 'plåt', 'takplåt');
  }
  if (desc.includes('avvattning') || desc.includes('stuprör') || desc.includes('hängrän') || desc.includes('gutter')) {
    terms.push('222', 'stuprör', 'hängrännor', 'takavvattning');
  }
  if (desc.includes('målning') || desc.includes('painting') || desc.includes('måla')) {
    terms.push('målning', 'strykning', 'ommålning');
  }
  if (desc.includes('matta') || desc.includes('matt') || desc.includes('carpet')) {
    terms.push('textilgolv', 'nålfilt', 'golvmatta', 'matta', 'heltäckningsmatta');
  }
  if (desc.includes('innertak') || desc.includes('ceiling') || desc.includes('undertak')) {
    terms.push('innertak', 'undertak', 'takskivor', '335', '337', '229', 'skivor', 'gipsskiva', 'spånskiva', 'akustikplattor', 'träpanel');
  }
  if (desc.includes('isolering') || desc.includes('insulation')) {
    terms.push('isolering', 'tilläggsisolering', 'fasadisolering');
  }
  if (desc.includes('hiss') || desc.includes('elevator')) {
    terms.push('hiss', 'hissar', 'elevator');
  }
  if (desc.includes('ventilation') || desc.includes('aggregat') || desc.includes('fläkt')) {
    terms.push('ventilation', 'ventilationsaggregat', 'fläkt');
  }
  if (desc.includes('radiator') || desc.includes('element') || desc.includes('värme')) {
    terms.push('radiator', 'radiatorer', 'element', 'värme');
  }
  if (desc.includes('belysning') || desc.includes('led') || desc.includes('lampor') || desc.includes('armatur')) {
    terms.push('belysning', 'ljus', 'armaturer', 'LED');
  }
  if (desc.includes('balkong') || desc.includes('balcony') || desc.includes('räcke') || desc.includes('railing')) {
    terms.push('232', '233', 'balkong', 'balkongplatta', 'balkongräcke', 'räcke', 'trä', 'plåt', 'aluminium', 'målning', 'byte', 'lagning');
  }
  if (desc.includes('relining') || desc.includes('avlopp') || desc.includes('stam')) {
    terms.push('relining', 'avlopp', 'stamrenovering', 'rör', '142', 'avloppsledningar', 'vattenledningar');
  }
  if (desc.includes('vattenledn') || desc.includes('water pipe')) {
    terms.push('142', 'vattenledningar', 'byte', 'avloppsledningar', 'rensning', 'stambyte');
  }
  if (desc.includes('membran') || desc.includes('tätskikt')) {
    terms.push('membran', 'tätskikt', 'vattentätning', '264');
  }
  if (desc.includes('sockel')) {
    terms.push('221', 'sockel');
  }
  if (desc.includes('trappa') || desc.includes('stair')) {
    terms.push('151', '228', 'trappa', 'trappor');
  }
  if (desc.includes('brand') || desc.includes('fire') || desc.includes('larm')) {
    terms.push('brandlarm', 'brandsäkerhet', 'larm', 'larmanläggning', '646', 'rökdetektor', 'centralutrustning');
  }
  if (desc.includes('elcentral') || desc.includes('elanlägg') || desc.includes('elinstall') || desc.includes('electrical panel')) {
    terms.push('elinstallation', 'elinstallationer', 'elanläggning', '6S1', '6S3', 'byte', 'led', 'lysrör');
  }
  if (desc.includes('port') || desc.includes('gate') || desc.includes('garage')) {
    terms.push('255', '256', 'port', 'portar', 'garageport');
  }
  if (desc.includes('lekplats') || desc.includes('playground')) {
    terms.push('131', 'lekutrustning');
  }

  // Return unique terms
  const unique = [...new Set(terms.filter(t => t && t.trim().length >= 2))];
  console.log(`Generated ${unique.length} search terms for: "${description}" → [${unique.slice(0, 15).join(', ')}...]`);
  return unique;
}

/**
 * FILTER BENCHMARKS IN MEMORY - Enhanced with bidirectional prefix matching
 * 
 * This handles Swedish compound words by checking both directions:
 * 1. benchmarkDesc contains searchTerm (original)
 * 2. searchTerm shares a 4+ char prefix with any benchmark word (NEW)
 */
function filterBenchmarkCandidates(
  allBenchmarks: BenchmarkPrice[],
  searchTerms: string[],
  itemUnit: string | null
): BenchmarkPrice[] {
  const candidates: BenchmarkPrice[] = [];
  const seenIds = new Set<string>();
  
  // Pre-process search terms
  const processedTerms = searchTerms.map(t => t.toLowerCase()).filter(t => t.length >= 2);

  for (const benchmark of allBenchmarks) {
    if (itemUnit !== null && !unitsCompatible(itemUnit, benchmark.unit)) continue;

    const descLower = (benchmark.description || '').toLowerCase();
    const catLower = (benchmark.category || '').toLowerCase();
    const combined = descLower + ' ' + catLower;
    
    // Pre-tokenize benchmark text for prefix matching
    const benchWords = combined.split(/[\s\-\/\(\),]+/).filter(w => w.length >= 3);
    
    let matched = false;

    for (const term of processedTerms) {
      if (!term || term.length < 2) continue;

      // Method 1: Direct substring match (original logic)
      if (combined.includes(term)) {
        matched = true;
        break;
      }

      // Method 2: Prefix matching for compound words
      // "asfaltbeläggning" as search term matches benchmark word "asfalt" (4+ char prefix)
      // "putsfasad" as search term matches benchmark word "puts" (4+ char prefix)
      if (term.length >= 4) {
        for (const bw of benchWords) {
          if (bw.length < 4) continue;
          const minLen = Math.min(bw.length, term.length);
          if (minLen >= 4) {
            // Check if one starts with the other
            if (term.startsWith(bw) || bw.startsWith(term)) {
              matched = true;
              break;
            }
          }
        }
        if (matched) break;
      }
    }

    if (matched && !seenIds.has(benchmark.id)) {
      seenIds.add(benchmark.id);
      candidates.push(benchmark);
    }
  }

  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build specific clarification message for percentage-based benchmarks
 */
function buildPercentageClarification(description: string, benchmarks: BenchmarkPrice[]): string {
  const percentages = benchmarks
    .map(b => {
      const match = b.description.match(/(\d+)%/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  
  const uniquePercentages = [...new Set(percentages)].sort((a, b) => Number(a) - Number(b));
  const descLower = description.toLowerCase();
  
  if (descLower.includes('kantstöd') || descLower.includes('kantsten') || descLower.includes('curb')) {
    return `Percentage required: Available benchmarks use percentage of total length (${uniquePercentages.join('%, ')}%). Please specify either the total length so we can calculate the percentage, or convert your quantity to a percentage.`;
  }
  
  return `Percentage required: Available benchmarks use percentage of gross area (bruttoytan): ${uniquePercentages.join('%, ')}%. Please specify either the total gross area, or convert your quantity to a percentage.`;
}

function detectPercentageBasedBenchmarks(benchmarks: BenchmarkPrice[]): BenchmarkPrice[] {
  return benchmarks.filter(b => 
    b.description.includes('% av bruttoytan') || 
    b.description.includes('% av total') ||
    /\d+%/.test(b.description)
  );
}

function buildClarificationFromReasoning(
  aiReasoning: string, 
  item: CostItemInput,
  candidates: ScoredBenchmark[]
): string {
  const reasoningLower = aiReasoning.toLowerCase();
  const descLower = item.originalDescription.toLowerCase();
  
  // Unit mismatch
  if (reasoningLower.includes('unit') || reasoningLower.includes('units')) {
    const candidateUnits = [...new Set(candidates.map(c => c.unit))];
    if (candidateUnits.length > 0 && !candidateUnits.some(u => unitsCompatible(item.unit, u))) {
      return `Unit mismatch: Your item uses "${item.unit}" but matching benchmarks use "${candidateUnits.slice(0, 3).join('", "')}". Please convert your quantity to the correct unit.`;
    }
  }
  
  // Windows/doors new vs replacement
  if ((descLower.includes('nya') || descLower.includes('new')) &&
      (descLower.includes('fönster') || descLower.includes('dörr'))) {
    const hasReplacementBenchmark = candidates.some(c => 
      c.description.toLowerCase().includes('byte')
    );
    if (hasReplacementBenchmark) {
      const candidateUnits = [...new Set(candidates.map(c => c.unit))];
      const unitMsg = candidateUnits.length > 0 && !unitsCompatible(item.unit, candidateUnits[0])
        ? ` Note: Benchmarks use "${candidateUnits[0]}" — please provide area in ${candidateUnits[0]} instead of "${item.unit}".`
        : '';
      return `No "new installation" benchmark found. Available benchmarks are for "replacement/byte" of windows and doors.${unitMsg} Please clarify if this is replacement work, or provide a manual price for new installation.`;
    }
  }
  
  // Suggest closest candidate
  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    if (!unitsCompatible(item.unit, topCandidate.unit)) {
      return `Closest benchmark found uses "${topCandidate.unit}" instead of "${item.unit}". Please convert your quantity to ${topCandidate.unit} for accurate pricing. Benchmark: "${topCandidate.description}"`;
    }
    return `No exact match found. Closest benchmark: "${topCandidate.description}" (${topCandidate.avg_price} ${topCandidate.unit}). Please verify if this work type matches your scope, or provide manual pricing.`;
  }
  
  return aiReasoning || "No benchmark match found. Manual pricing required.";
}

type ScoredBenchmark = BenchmarkPrice & { _score: number };

function scoreBenchmarkCandidate(
  benchmark: BenchmarkPrice,
  itemDescLower: string,
  searchTerms: string[],
  itemQuantity: number
): number {
  const desc = (benchmark.description || '').toLowerCase();
  const cat = (benchmark.category || '').toLowerCase();

  let score = 0;

  // Core scoring: reward term hits
  for (const term of searchTerms) {
    const t = term.toLowerCase();
    if (!t) continue;

    const inDesc = desc.includes(t);
    const inCat = cat.includes(t);
    if (!inDesc && !inCat) continue;

    const isCode = /^[0-9]{2,4}$/.test(t);
    const base = isCode ? 20 : t.length >= 10 ? 10 : t.length >= 6 ? 6 : 3;
    score += base;
    if (inCat) score += 2;
    if (inDesc && inCat) score += 3;
  }

  // SIZE BRACKET MATCHING - hugely important for REPAB
  // Match quantity to the correct size bracket
  const sizePatterns = [
    { pattern: />(\d+)\s*m/, getMin: (m: RegExpMatchArray) => Number(m[1]) },
    { pattern: /(\d+)-(\d+)\s*m/, getMin: (m: RegExpMatchArray) => Number(m[1]), getMax: (m: RegExpMatchArray) => Number(m[2]) },
    { pattern: /<(\d+)\s*m/, getMax: (m: RegExpMatchArray) => Number(m[1]) },
  ];
  
  for (const sp of sizePatterns) {
    const m = desc.match(sp.pattern);
    if (m) {
      const min = sp.getMin ? sp.getMin(m) : 0;
      const max = sp.getMax ? sp.getMax(m) : Infinity;
      if (itemQuantity >= min && itemQuantity <= max) {
        score += 25; // Strong bonus for correct size bracket
      } else if (itemQuantity > max) {
        score -= 5; // Small penalty for wrong bracket
      } else {
        score -= 10; // Larger penalty for much smaller quantity than bracket
      }
    }
  }

  // Penalize percentage-based benchmarks when user gives absolute quantity > 50
  if (/\d+%\s*av\s*(bruttoytan|total)/.test(desc) && itemQuantity > 50) {
    score -= 15;
  }

  // Behavior / scope hints
  const wantsReplacement = /(replacement|replace|byte|utbyte|nya|new)/.test(itemDescLower);
  if (wantsReplacement && desc.includes('byte')) score += 8;
  if (wantsReplacement && (desc.includes('strykning') || desc.includes('målningsbättring'))) {
    score -= 12;
  }

  // Grass heuristics
  if (/(gräs|gräsyta|gräsytor|grass|lawn)/.test(itemDescLower)) {
    if (desc.includes('gräsytor')) score += 8;
    if (desc.includes('omläggning')) score += 14;
    // Renovering = omläggning (full replacement) not just seeding
    if (itemDescLower.includes('renovering') && desc.includes('omläggning')) score += 10;
    if (desc.includes('kompletteringsådd')) score -= 8;
  }

  // Asphalt heuristics
  if (/(asfalt|asphalt|beläggning|parkering)/.test(itemDescLower)) {
    if (desc.includes('asfalt')) score += 10;
    // Parking = drivable surface
    if (itemDescLower.includes('parkering') && desc.includes('körbar')) score += 15;
    if (!itemDescLower.includes('parkering') && desc.includes('gångbar')) score += 5;
  }

  // Facade heuristics
  if (/(fasad|puts|putsfasad|facade)/.test(itemDescLower)) {
    if (desc.includes('putsfasad') || desc.includes('puts/betong')) score += 10;
    if (desc.includes('fasad')) score += 5;
    if (itemDescLower.includes('renovering') && (desc.includes('renovering') || desc.includes('målning'))) score += 8;
  }

  // Windows heuristics
  if (/(fönster|window)/.test(itemDescLower)) {
    if (desc.includes('fönster')) score += 8;
    if (itemDescLower.includes('fasadtyp 1') && desc.includes('fasadtyp 1')) score += 20;
    if (itemDescLower.includes('fasadtyp 2') && desc.includes('fasadtyp 2')) score += 20;
    // "nya fönster" = byte fönster in renovation context
    if (itemDescLower.includes('nya') && desc.includes('byte fönster')) score += 10;
  }

  // Roof heuristics
  if (/(tak|takomläggning|roof)/.test(itemDescLower)) {
    if (desc.includes('tak')) score += 5;
    if (itemDescLower.includes('plåt') && desc.includes('plåt')) score += 15;
    if (itemDescLower.includes('omläggning') && desc.includes('omläggning')) score += 10;
  }

  // Carpet / textile flooring
  if (/(carpet|matta|mattbyte|textilgolv|nålfilt)/.test(itemDescLower)) {
    if (cat.includes('textilgolv') || desc.includes('textilgolv') || desc.includes('nålfilt')) score += 16;
    if (desc.includes('byte')) score += 6;
  }

  // Facade insulation
  if (/(fasad|facade)/.test(itemDescLower) && /(isolering|tilläggsisol|insulation)/.test(itemDescLower)) {
    if (desc.includes('tilläggsisolering fasad') || desc.includes('tilläggsisol')) score += 40;
    if (desc.includes('renovering')) score -= 4;
  }

  // Interior painting
  if (/(innervägg|innerväggar|inner)/.test(itemDescLower) && /(målning|painting)/.test(itemDescLower)) {
    if (desc.includes('målning') && (desc.includes('inner') || desc.includes('vägg'))) score += 15;
  }

  // Gutter/drainage
  if (/(takavvattning|stuprör|hängrän|gutter)/.test(itemDescLower)) {
    if (desc.includes('stuprör') || desc.includes('hängrännor')) score += 12;
    if (desc.includes('byte')) score += 6;
  }

  // Balcony heuristics - distinguish platta vs räcke
  if (/(balkong|balcony|räcke|railing)/.test(itemDescLower)) {
    const wantsRailing = /(räcke|railing|målning|painting|trä|wood)/.test(itemDescLower);
    const wantsStructural = /(platta|betong|concrete|structural|rost|rust)/.test(itemDescLower);
    
    if (wantsRailing) {
      if (cat.includes('233') || desc.includes('balkongräcke')) score += 25;
      if (cat.includes('225') || desc.includes('räcken')) score += 15;
      if (desc.includes('trä') && itemDescLower.includes('trä')) score += 15;
      if (desc.includes('målning')) score += 10;
      if (cat.includes('232') || desc.includes('balkongplatta')) score -= 15;
    } else if (wantsStructural) {
      if (cat.includes('232') || desc.includes('balkongplatta')) score += 20;
      if (cat.includes('233') || desc.includes('balkongräcke')) score -= 10;
    } else {
      if (cat.includes('233') || desc.includes('balkongräcke')) score += 8;
      if (cat.includes('232') || desc.includes('balkongplatta')) score += 5;
    }
  }

  // Interior ceiling heuristics
  if (/(innertak|ceiling|undertak)/.test(itemDescLower)) {
    if (cat.includes('335') || desc.includes('innertak skivor')) score += 20;
    if (cat.includes('337') || desc.includes('undertak')) score += 10;
    if (itemDescLower.includes('renovering') && desc.includes('byte')) score += 10;
    if (cat.includes('262') || desc.includes('takplåt')) score -= 30;
    if (cat.includes('261') || desc.includes('takpannor')) score -= 30;
  }

  // Fire alarm heuristics
  if (/(brandlarm|fire|larmanläggning|larm)/.test(itemDescLower)) {
    if (cat.includes('646') || desc.includes('larmanläggning') || desc.includes('brandlarm')) score += 25;
    if (desc.includes('centralutrustning')) score += 10;
    if (desc.includes('rökdetektor')) score += 8;
  }

  // Electrical installation heuristics
  if (/(elcentral|elanlägg|elinstall|electrical)/.test(itemDescLower)) {
    if (cat.includes('6S1') || cat.includes('6S3')) score += 20;
    if (desc.includes('elinstallation') || desc.includes('elinstallationer')) score += 15;
    if (desc.includes('byte')) score += 8;
    if (itemDescLower.includes('uppgradering') && desc.includes('led')) score += 8;
  }

  // Water/pipe renovation heuristics
  if (/(vattenledn|stamrenovering|stambyte|water pipe)/.test(itemDescLower)) {
    if (cat.includes('142') || desc.includes('va-ledningar') || desc.includes('vattenledningar')) score += 25;
    if (desc.includes('byte')) score += 10;
  }

  return score;
}

function rankBenchmarkCandidates(
  candidates: BenchmarkPrice[],
  item: CostItemInput,
  searchTerms: string[]
): ScoredBenchmark[] {
  const itemDescLower = (item.originalDescription || '').toLowerCase();

  const scored: ScoredBenchmark[] = candidates.map((b) => ({
    ...b,
    _score: scoreBenchmarkCandidate(b, itemDescLower, searchTerms, item.quantity),
  }));

  scored.sort((a, b) => (b._score - a._score) || a.id.localeCompare(b.id));
  return scored;
}

/**
 * PROCESS SINGLE COST ITEM - Deterministic matching
 */
async function processCostItem(
  apiKey: string,
  item: CostItemInput,
  allBenchmarks: BenchmarkPrice[],
  project: ProjectContext,
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
  };

  try {
    // STEP 1: Generate search terms
    const searchTerms = generateSearchTerms(item.originalDescription);
    console.log(`[${item.originalDescription}] Search terms (${searchTerms.length}): ${searchTerms.slice(0, 15).join(', ')}`);

    // STEP 2: Filter benchmarks (unit-compatible + term/prefix hits)
    const candidates = filterBenchmarkCandidates(allBenchmarks, searchTerms, item.unit);
    console.log(`[${item.originalDescription}] Candidates: ${candidates.length} (unit: ${item.unit})`);

    if (candidates.length === 0) {
      // Check unit mismatch
      const candidatesNoUnit = filterBenchmarkCandidates(allBenchmarks, searchTerms, null);
      
      if (candidatesNoUnit.length > 0) {
        const expectedUnits = [...new Set(candidatesNoUnit.map(c => c.unit))];
        noMatchResult.matchReasoning = `Unit mismatch detected`;
        noMatchResult.aiComment = `Unit mismatch: Your item uses "${item.unit}" but matching benchmarks use "${expectedUnits.join('", "')}". Please convert your quantity to the correct unit (${expectedUnits[0]}).`;
        console.log(`[${item.originalDescription}] → NO MATCH (unit mismatch: ${item.unit} vs ${expectedUnits.join(', ')})`);
        return noMatchResult;
      }
      
      noMatchResult.matchReasoning = `No benchmarks found matching description or compatible unit (${item.unit})`;
      console.log(`[${item.originalDescription}] → NO MATCH (no candidates found)`);
      return noMatchResult;
    }

    // Check percentage-only benchmarks
    const percentageBenchmarks = detectPercentageBasedBenchmarks(candidates);
    const nonPercentageCandidates = candidates.filter(c => !percentageBenchmarks.includes(c));
    
    if (percentageBenchmarks.length > 0 && nonPercentageCandidates.length === 0) {
      const clarificationMsg = buildPercentageClarification(item.originalDescription, percentageBenchmarks);
      noMatchResult.matchReasoning = `Available benchmarks require percentage specification`;
      noMatchResult.aiComment = clarificationMsg;
      console.log(`[${item.originalDescription}] → CLARIFICATION (percentage-based only)`);
      return noMatchResult;
    }

    // STEP 3: Rank candidates
    const ranked = rankBenchmarkCandidates(candidates, item, searchTerms);
    const top = ranked.slice(0, 40);

    console.log(
      `[${item.originalDescription}] Top 5: ` +
        top.slice(0, 5).map(c => `${c.category} | ${c.description.substring(0, 60)} (score=${c._score})`).join(' || ')
    );

    // STEP 4: AI selects best match
    const candidateList = top.map(b =>
      `score=${b._score} | ID=${b.id} | ${b.category} | ${b.description} | unit=${b.unit} | avg=${b.avg_price}${b.min_price ? ` | min=${b.min_price}` : ''}${b.max_price ? ` | max=${b.max_price}` : ''}`
    ).join('\n');

    const aiResult = await callAIDeterministic(
      apiKey,
      UNIFIED_MATCH_PROMPT,
      `COST ITEM TO MATCH:
Description: "${item.originalDescription}"
Unit: ${item.unit}
Quantity: ${item.quantity}
${item.originalUnitPrice ? `Original Price: ${item.originalUnitPrice} per ${item.unit}` : ''}
${item.trade ? `Trade/Category: ${item.trade}` : ''}

TARGET LANGUAGE: ${targetLanguage}
PROJECT TYPE: ${project.projectType || 'maintenance/renovation'}
PROJECT: ${project.name || 'N/A'}

IMPORTANT: Select the benchmark whose SIZE BRACKET contains quantity ${item.quantity}. For example, if quantity is ${item.quantity}, pick the ">100 m²" or "1000-5000 m²" benchmark that covers this range — NOT a small-area benchmark.

AVAILABLE BENCHMARKS (ranked by relevance; top ${top.length} of ${ranked.length} candidates):
${candidateList}

Select the BEST matching benchmark. Even partial matches (65-80% confidence) are valuable.`
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
      noMatchResult.aiComment = buildClarificationFromReasoning(reasoning, item, top);
      console.log(`[${item.originalDescription}] → NO MATCH (confidence: ${confidence}%)`);
      return noMatchResult;
    }

    const benchmark = candidates.find(b => b.id === matchedId);
    if (!benchmark) {
      console.warn(`[${item.originalDescription}] Invalid benchmark ID: ${matchedId}`);
      noMatchResult.matchReasoning = "AI returned invalid benchmark ID";
      return noMatchResult;
    }

    // STEP 5: Calculate status
    let status = 'ok';
    if (item.originalUnitPrice && benchmark.avg_price) {
      const variance = ((item.originalUnitPrice - benchmark.avg_price) / benchmark.avg_price) * 100;
      if (variance < -15) status = 'underpriced';
      else if (variance > 15) status = 'review';
    }

    const priceSource = `${benchmark.source || 'Benchmark'} - ${benchmark.category}: ${benchmark.description}`;

    console.log(`[${item.originalDescription}] → MATCHED: ${benchmark.avg_price} SEK/${benchmark.unit} (${confidence}% confidence)`);

    // Strip UUIDs from reasoning before including in aiComment
    const cleanReasoning = reasoning
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
      .replace(/benchmark\s*ID\s*,?\s*/gi, '')
      .replace(/ID\s*=\s*,?\s*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return {
      id: item.id,
      matchedBenchmarkId: benchmark.id,
      matchConfidence: confidence,
      matchReasoning: reasoning,
      interpretedScope: item.originalDescription,
      recommendedUnitPrice: benchmark.avg_price,
      benchmarkMin: benchmark.min_price || benchmark.avg_price * 0.85,
      benchmarkTypical: benchmark.avg_price,
      benchmarkMax: benchmark.max_price || benchmark.avg_price * 1.15,
      priceSource: priceSource,
      status: status,
      aiComment: `Matched with ${confidence}% confidence. ${cleanReasoning}`,
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
  console.log("DETERMINISTIC COST ITEM ANALYSIS - STARTING");
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

    console.log(`Analyzing ${items.length} items for ${project.country} (${dbCountry})`);

    // Fetch ALL benchmarks
    const allBenchmarks = await fetchAllBenchmarks(supabase, dbCountry, project.currency);
    console.log(`Fetched ${allBenchmarks.length} benchmarks from database`);

    if (!allBenchmarks || allBenchmarks.length === 0) {
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

    // Process sequentially for determinism
    const sortedItems = [...items].sort((a, b) => a.id.localeCompare(b.id));
    const results: AnalysisResult[] = [];

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      console.log(`\n[${i + 1}/${sortedItems.length}] Processing: "${item.originalDescription}"`);

      const result = await processCostItem(
        LOVABLE_API_KEY,
        item,
        allBenchmarks,
        project,
        targetLanguage
      );

      results.push(result);

      if (i < sortedItems.length - 1) {
        await new Promise(r => setTimeout(r, 200));
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
