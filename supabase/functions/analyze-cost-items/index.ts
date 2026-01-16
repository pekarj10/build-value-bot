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
 * 5. Comprehensive error handling
 * 
 * CRITICAL: Running this multiple times on unchanged data MUST produce IDENTICAL results
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UNIFIED AI PROMPT - Single deterministic call for translation + matching
const UNIFIED_MATCH_PROMPT = `You are a senior construction cost expert matching cost items to a benchmark database.

YOUR TASK:
1. TRANSLATE the cost item to the target language construction terminology (for internal matching only)
2. IDENTIFY the best matching benchmark from the provided candidates
3. PROVIDE confidence score and reasoning IN ENGLISH

CRITICAL LANGUAGE RULES:
- ALL OUTPUT FIELDS MUST BE IN ENGLISH, except "translatedTerm" which is for internal matching
- The "reasoning" field MUST be written in clear English
- Never include Swedish, German, or other non-English text in the "reasoning" field
- The "translatedTerm" is only used internally for matching - it can be in the target language

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
- 0-49%: No suitable match - return null

CRITICAL: Return EXACTLY this JSON format:
{
  "translatedTerm": "the term in target language (for matching)",
  "matchedBenchmarkId": "exact-uuid-from-list-or-null",
  "confidence": 85,
  "reasoning": "ENGLISH explanation of why this benchmark was selected or why no match"
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

// Map country names to database country format
function mapCountryToDb(country: string): string {
  const mapping: Record<string, string> = {
    'SE': 'SWEDEN', 'Sweden': 'SWEDEN', 'SWEDEN': 'SWEDEN',
    'CZ': 'CZECH_REPUBLIC', 'Czech Republic': 'CZECH_REPUBLIC',
    'DE': 'GERMANY', 'Germany': 'GERMANY',
    'AT': 'AUSTRIA', 'Austria': 'AUSTRIA',
    'PL': 'POLAND', 'Poland': 'POLAND',
    'GB': 'UNITED_KINGDOM', 'United Kingdom': 'UNITED_KINGDOM',
    'US': 'UNITED_STATES', 'United States': 'UNITED_STATES',
  };
  return mapping[country] || country.toUpperCase().replace(/ /g, '_');
}

// Get language for country
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

// Normalize unit for comparison
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

// Check if units are compatible
function unitsCompatible(itemUnit: string, benchmarkUnit: string): boolean {
  return normalizeUnit(itemUnit) === normalizeUnit(benchmarkUnit);
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
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error("AI call failed after retries");
}

/**
 * FETCH ALL BENCHMARKS (no 1000-row cap)
 * Supabase has a default 1000 row limit per request, so we must paginate.
 * Ordering by id + deterministic pagination keeps results stable.
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
 * GENERATE SEARCH TERMS - Deterministic English-to-local translation
 * ENHANCED: Comprehensive mapping for common construction terms
 */
function generateSearchTerms(description: string): string[] {
  const terms: string[] = [description.toLowerCase()];
  const desc = description.toLowerCase();

  // COMPREHENSIVE English-Swedish mapping for construction industry
  // This ensures common terms always find relevant benchmarks
  const translations: Record<string, string[]> = {
    // === FLOORING ===
    'carpet': ['textilgolv', 'nålfilt', 'heltäckningsmatta', 'golvmatta', 'matta', 'textil'],
    'carpets': ['textilgolv', 'nålfilt', 'heltäckningsmatta', 'golvmatta', 'matta', 'textil'],
    'floor': ['golv', 'golvläggning', 'golvarbeten', 'golvbeläggning'],
    'flooring': ['golv', 'golvläggning', 'golvarbeten', 'golvbeläggning'],
    'tile': ['kakel', 'klinker', 'plattor', 'keramik'],
    'tiles': ['kakel', 'klinker', 'plattor', 'keramik'],
    'parquet': ['parkett', 'trägolv', 'laminat'],
    'vinyl': ['vinyl', 'plastmatta', 'plastgolv'],
    'laminate': ['laminat', 'laminatgolv'],

    // === EXTERIOR / LANDSCAPING ===
    'grass': ['gräs', 'gräsytor', 'gräsmatta', 'gräsyta', '111'],
    'lawn': ['gräs', 'gräsytor', 'gräsmatta', 'gräsyta', '111'],
    'turf': ['gräs', 'gräsytor', 'gräsmatta', 'rullgräs'],
    'garden': ['trädgård', 'utemiljö', 'gräsytor', 'plantering'],
    'landscaping': ['markarbeten', 'utemiljö', 'trädgård', 'gräsytor'],
    'whole garden': ['gräsytor', 'gräsmatta', 'omläggning', '111'],
    
    // === FACADE ===
    'facade': ['fasad', 'puts', 'fasadrenovering', 'fasadisolering', '203'],
    'external wall': ['fasad', 'yttervägg', 'puts'],
    'rendering': ['puts', 'putsning', 'fasadputs'],
    'cladding': ['fasadbeklädnad', 'fasadskivor', 'beklädnad'],
    
    // === INSULATION ===
    'insulation': ['isolering', 'tilläggsisolering', 'fasadisolering', 'isoler'],
    'polystyrene': ['polystyren', 'cellplast', 'EPS', 'frigolitt'],
    'eps': ['polystyren', 'cellplast', 'EPS'],
    'mineral wool': ['mineralull', 'stenull', 'glasull'],
    
    // === ROOFING ===
    'roof': ['tak', 'takläggning', 'taktäckning', 'takarbeten'],
    'roofing': ['tak', 'takläggning', 'taktäckning', 'takarbeten'],
    
    // === WINDOWS & DOORS ===
    'window': ['fönster', 'fönsterbyte', 'fönstermontering', '204', 'byte fönster'],
    'windows': ['fönster', 'fönsterbyte', 'fönstermontering', '204', 'byte fönster'],
    'glazed': ['glas', 'glasning', 'fönster'],
    'double glazed': ['2-glas', 'tvåglas', 'fönster'],
    'triple glazed': ['3-glas', 'treglas', 'treglasfönster'],
    'triple': ['3-glas', 'treglas'],
    'door': ['dörr', 'dörrmontering', 'dörrbyte', '204', 'byte dörr'],
    'doors': ['dörr', 'dörrmontering', 'dörrbyte', '204', 'byte dörr'],
    'entrance': ['entré', 'entrédörr', 'entréparti', 'ytterdörr', 'huvudentré'],
    'entrance door': ['entrédörr', 'ytterdörr', 'entré', 'dörr'],
    'entrance doors': ['entrédörr', 'ytterdörr', 'entré', 'dörr'],

    // === DEMOLITION ===
    'demolition': ['rivning', 'demontering', 'rivningsarbeten', 'riv'],
    'demolish': ['rivning', 'demontering', 'riv'],
    'remove': ['rivning', 'demontering', 'borttagning'],
    'removal': ['rivning', 'demontering', 'borttagning'],
    
    // === WALLS / PARTITIONS ===
    'partition': ['innervägg', 'mellanvägg', 'gipsväggar', 'rumsavskiljare', 'lätta väggar'],
    'partitions': ['innervägg', 'mellanvägg', 'gipsväggar', 'rumsavskiljare', 'lätta väggar'],
    'internal': ['inner', 'invändig', 'inre'],
    'wall': ['vägg', 'väggar'],
    'walls': ['vägg', 'väggar'],
    'drywall': ['gips', 'gipsskivor', 'gipsvägg'],
    'gypsum': ['gips', 'gipsskivor'],

    // === HVAC / SYSTEMS ===
    'heat pump': ['värmepump', 'luft-vatten', 'bergvärme', 'värmepumpar'],
    'heat': ['värme', 'uppvärmning'],
    'pump': ['pump', 'värmepump'],
    'air to water': ['luft-vatten', 'luft/vatten', 'luftvärmepump'],
    'air-to-water': ['luft-vatten', 'luft/vatten', 'luftvärmepump'],
    'heating': ['värme', 'uppvärmning', 'värmesystem', 'radiatorer'],
    'ventilation': ['ventilation', 'fläkt', 'ventilationsaggregat', 'luft'],
    'hvac': ['VVS', 'ventilation', 'värme', 'kyla'],
    'plumbing': ['VVS', 'rör', 'rörarbeten', 'rörmokare'],
    'electrical': ['el', 'elinstallation', 'elarbeten', 'elanläggning'],

    // === ACTIONS / VERBS ===
    'replacement': ['byte', 'utbyte', 'ersättning'],
    'replace': ['byte', 'utbyte', 'byta'],
    'replacing': ['byte', 'utbyte', 'byta'],
    'renovation': ['renovering', 'ombyggnad', 'upprustning'],
    'renovate': ['renovering', 'renovera'],
    'installation': ['installation', 'montering', 'montage'],
    'install': ['installation', 'montera', 'installera'],
    'installing': ['installation', 'montering'],
    'repair': ['reparation', 'lagning', 'åtgärd'],
    'new': ['ny', 'nytt', 'nyinstallation', 'nybyggnad'],
    'putting': ['läggning', 'montering', 'byte'],
    'old': ['gammal', 'befintlig', 'byte'],
  };

  // STEP 1: Check for multi-word phrases first (more specific matches)
  const multiWordPhrases = [
    'entrance door', 'entrance doors', 'heat pump', 'air to water', 'air-to-water',
    'double glazed', 'triple glazed', 'whole garden', 'external wall', 'mineral wool'
  ];
  for (const phrase of multiWordPhrases) {
    if (desc.includes(phrase) && translations[phrase]) {
      terms.push(...translations[phrase]);
    }
  }

  // STEP 2: Add translations for single-word matching terms
  for (const [eng, swe] of Object.entries(translations)) {
    // Skip multi-word phrases (already handled)
    if (eng.includes(' ') || eng.includes('-')) continue;
    
    // Check if this word appears in the description
    const wordPattern = new RegExp(`\\b${eng}\\b`, 'i');
    if (wordPattern.test(desc)) {
      terms.push(...swe);
    }
  }

  // STEP 3: Add Swedish category codes if detected in context
  // This helps when descriptions clearly map to specific REPAB categories
  if (desc.includes('grass') || desc.includes('lawn') || desc.includes('garden')) {
    terms.push('111', 'gräsytor');
  }
  if (desc.includes('window') || desc.includes('door')) {
    terms.push('204', 'fönster och dörrar');
  }
  if (desc.includes('facade') || desc.includes('render') || desc.includes('cladding')) {
    terms.push('203', 'fasad');
  }

  // STEP 4: Also add individual words from the original description
  const words = desc.split(/[\s,.\-\/]+/);
  for (const word of words) {
    if (word.length >= 3) {
      const cleanWord = word.toLowerCase();
      if (translations[cleanWord]) {
        terms.push(...translations[cleanWord]);
      }
    }
  }

  // Return unique terms, minimum 2 chars
  const unique = [...new Set(terms.filter(t => t && t.trim().length >= 2))];
  console.log(`Generated ${unique.length} search terms for: "${description}"`);
  return unique;
}

/**
 * FILTER BENCHMARKS IN MEMORY
 * Search both description AND category for any of the search terms
 */
function filterBenchmarkCandidates(
  allBenchmarks: BenchmarkPrice[],
  searchTerms: string[],
  itemUnit: string
): BenchmarkPrice[] {
  const candidates: BenchmarkPrice[] = [];
  const seenIds = new Set<string>();

  for (const benchmark of allBenchmarks) {
    // Skip if wrong unit
    if (!unitsCompatible(itemUnit, benchmark.unit)) continue;

    const descLower = (benchmark.description || '').toLowerCase();
    const catLower = (benchmark.category || '').toLowerCase();

    for (const term of searchTerms) {
      const t = term.toLowerCase();
      if (!t) continue;
      if (descLower.includes(t) || catLower.includes(t)) {
        if (!seenIds.has(benchmark.id)) {
          seenIds.add(benchmark.id);
          candidates.push(benchmark);
        }
        break;
      }
    }
  }

  // Stable baseline ordering (actual relevance ranking is applied later)
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

type ScoredBenchmark = BenchmarkPrice & { _score: number };

function scoreBenchmarkCandidate(
  benchmark: BenchmarkPrice,
  itemDescLower: string,
  searchTerms: string[]
): number {
  const desc = (benchmark.description || '').toLowerCase();
  const cat = (benchmark.category || '').toLowerCase();

  let score = 0;

  // Core scoring: reward term hits (codes/longer terms weigh more)
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

  // Behavior / scope hints
  const wantsReplacement = /(replacement|replace|replacing|byte|utbyte)/.test(itemDescLower);
  if (wantsReplacement && desc.includes('byte')) score += 8;

  // Penalize obvious non-replacement activities when user wants replacement
  if (wantsReplacement && (desc.includes('strykning') || desc.includes('målning') || desc.includes('lack'))) {
    score -= 12;
  }

  // Grass heuristics
  if (/(grass|lawn|gräs|gräsytor|gräsmatta)/.test(itemDescLower)) {
    if (desc.includes('gräsytor')) score += 8;
    if (desc.includes('omläggning')) score += 14;
    if (desc.includes('kompletteringsådd')) score -= 8;
  }

  // Windows heuristics
  if (/(window|windows|fönster|fönsterbyte)/.test(itemDescLower)) {
    if (desc.includes('fönster')) score += 8;
    const wantsTriple = /(triple|3-glas|treglas)/.test(itemDescLower);
    if (wantsTriple && (desc.includes('3-glas') || desc.includes('treglas'))) score += 10;
  }

  // Doors heuristics
  if (/(door|doors|dörr|entrance|entré|ytterdörr)/.test(itemDescLower)) {
    if (desc.includes('dörr')) score += 8;
    if (desc.includes('ytter')) score += 4;
    if (desc.includes('entré')) score += 4;
  }

  // Carpet / textile flooring heuristics
  if (/(carpet|carpets|textilgolv|nålfilt|matta)/.test(itemDescLower)) {
    if (cat.includes('textilgolv') || desc.includes('textilgolv') || desc.includes('nålfilt')) score += 16;
    if (desc.includes('byte')) score += 6;
  }

  // Facade insulation: prefer explicit "Tilläggsisolering fasad" rows
  if (/(facade|fasad)/.test(itemDescLower) && /(insulation|isolering|tilläggsisol)/.test(itemDescLower)) {
    if (desc.includes('tilläggsisolering fasad')) score += 40;
    if (desc.includes('tilläggsisol')) score += 12;
    if (desc.includes('renovering')) score -= 4;
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
    _score: scoreBenchmarkCandidate(b, itemDescLower, searchTerms),
  }));

  // Deterministic: score desc, then UUID asc
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
    // STEP 1: Generate search terms (deterministic)
    const searchTerms = generateSearchTerms(item.originalDescription);
    console.log(`[${item.originalDescription}] Search terms: ${searchTerms.slice(0, 10).join(', ')}`);

    // STEP 2: Filter benchmarks in memory (unit-compatible + term hits)
    const candidates = filterBenchmarkCandidates(allBenchmarks, searchTerms, item.unit);
    console.log(`[${item.originalDescription}] Candidates: ${candidates.length} (unit: ${item.unit})`);

    if (candidates.length === 0) {
      noMatchResult.matchReasoning = `No benchmarks found with compatible unit (${item.unit})`;
      console.log(`[${item.originalDescription}] → NO MATCH (no candidates)`);
      return noMatchResult;
    }

    // STEP 3: Rank candidates deterministically by relevance (fixes UUID-top-25 issue)
    const ranked = rankBenchmarkCandidates(candidates, item, searchTerms);
    const top = ranked.slice(0, 40); // keep prompt small but representative

    console.log(
      `[${item.originalDescription}] Top candidates: ` +
        top.slice(0, 5).map(c => `${c.category} | ${c.description} (score=${c._score})`).join(' || ')
    );

    // STEP 4: AI selects best match from TOP ranked candidates
    const candidateList = top.map(b =>
      `score=${b._score} | ID=${b.id} | ${b.category} | ${b.description} | unit=${b.unit} | avg=${b.avg_price}`
    ).join('\n');

    const aiResult = await callAIDeterministic(
      apiKey,
      UNIFIED_MATCH_PROMPT,
      `COST ITEM TO MATCH:\nDescription: "${item.originalDescription}"\nUnit: ${item.unit}\nQuantity: ${item.quantity}\n${item.originalUnitPrice ? `Original Price: ${item.originalUnitPrice}` : ''}\n\nTARGET LANGUAGE: ${targetLanguage}\nPROJECT TYPE: ${project.projectType || 'construction'}\n\nAVAILABLE BENCHMARKS (ranked by deterministic relevance; showing top ${top.length} of ${ranked.length}):\n${candidateList}\n\nSelect the BEST matching benchmark ID from the list above, or return null if none are suitable.`
    );

    console.log(`[${item.originalDescription}] AI result:`, JSON.stringify(aiResult));

    const matchedId = aiResult.matchedBenchmarkId;
    const confidence = aiResult.confidence || 0;
    const reasoning = aiResult.reasoning || "";
    const translatedTerm = aiResult.translatedTerm || item.originalDescription;

    // STEP 4: Validate match
    if (!matchedId || matchedId === 'null' || confidence < 50) {
      noMatchResult.matchConfidence = confidence;
      noMatchResult.matchReasoning = reasoning || "No confident match found";
      noMatchResult.interpretedScope = translatedTerm;
      console.log(`[${item.originalDescription}] → NO MATCH (confidence: ${confidence}%)`);
      return noMatchResult;
    }

    const benchmark = candidates.find(b => b.id === matchedId);
    if (!benchmark) {
      console.warn(`[${item.originalDescription}] Invalid benchmark ID: ${matchedId}`);
      noMatchResult.matchReasoning = "AI returned invalid benchmark ID";
      return noMatchResult;
    }

    // STEP 5: Calculate status based on price variance
    let status = 'ok';
    if (item.originalUnitPrice && benchmark.avg_price) {
      const variance = ((item.originalUnitPrice - benchmark.avg_price) / benchmark.avg_price) * 100;
      if (variance < -15) status = 'underpriced';
      else if (variance > 15) status = 'review';
    }

    const priceSource = `${benchmark.source || 'REPAB'} - ${benchmark.category}: ${benchmark.description}`;

    console.log(`[${item.originalDescription}] → MATCHED: ${benchmark.avg_price} (${confidence}% confidence)`);

    // Generate English description for the interpreted scope
    const englishScope = item.originalDescription;

    return {
      id: item.id,
      matchedBenchmarkId: benchmark.id,
      matchConfidence: confidence,
      matchReasoning: reasoning,
      interpretedScope: englishScope, // Keep original English description, not Swedish
      recommendedUnitPrice: benchmark.avg_price,
      benchmarkMin: benchmark.min_price || benchmark.avg_price * 0.85,
      benchmarkTypical: benchmark.avg_price,
      benchmarkMax: benchmark.max_price || benchmark.avg_price * 1.15,
      priceSource: priceSource,
      status: status,
      aiComment: `Matched with ${confidence}% confidence. ${reasoning}`, // English comment without Swedish terms
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

    const dbCountry = mapCountryToDb(project.country);
    const targetLanguage = getLanguageForCountry(project.country);

    console.log(`Analyzing ${items.length} items for ${project.country} (${dbCountry})`);
    console.log(`Target language: ${targetLanguage}`);

    // STEP 1: Fetch ALL benchmarks for this country/currency (no 1000-row cap)
    const allBenchmarks = await fetchAllBenchmarks(supabase, dbCountry, project.currency);

    console.log(`Fetched ${allBenchmarks.length} benchmarks from database`);

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

    // STEP 2: Sort items by ID for deterministic processing order
    const sortedItems = [...items].sort((a, b) => a.id.localeCompare(b.id));

    // STEP 3: Process each item SEQUENTIALLY (no parallelism = no race conditions)
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

      // Rate limiting between items (consistent timing)
      if (i < sortedItems.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const matchedCount = results.filter(r => r.matchedBenchmarkId).length;

    console.log("\n" + "=".repeat(60));
    console.log("ANALYSIS COMPLETE");
    console.log("=".repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Processed: ${results.length}`);
    console.log(`Matched: ${matchedCount}`);
    console.log(`Match Rate: ${((matchedCount / results.length) * 100).toFixed(1)}%`);

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
