import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * TRUST SCORE CALCULATION
 * 
 * Calculates trust scores for cost item estimates based on:
 * 1. Plausibility Score (50%): Is the price within realistic ranges?
 * 2. Similarity Score (50%): How closely does the item match benchmark data?
 * 
 * Trust Score = (Plausibility × 0.5) + (Similarity × 0.5)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrustScoreRequest {
  costItemId: string;
  countryCode: string;
}

interface TrustScoreResult {
  costItemId: string;
  overallTrustScore: number;
  plausibilityScore: number;
  similarityScore: number;
  referenceCount: number;
  explanation: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { costItemId, countryCode } = await req.json() as TrustScoreRequest;

    if (!costItemId) {
      return new Response(
        JSON.stringify({ error: "costItemId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the cost item
    const { data: costItem, error: itemError } = await supabase
      .from("cost_items")
      .select(`
        *,
        projects!cost_items_project_id_fkey (
          country,
          currency
        )
      `)
      .eq("id", costItemId)
      .single();

    if (itemError || !costItem) {
      console.error("Cost item not found:", itemError);
      return new Response(
        JSON.stringify({ error: "Cost item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectCountry = countryCode || costItem.projects?.country || "SE";
    const currency = costItem.projects?.currency || "SEK";
    const dbCountry = mapCountryToDb(projectCountry);

    // Calculate trust scores
    const result = await calculateTrustScore(supabase, costItem, dbCountry, currency);

    // Upsert the trust score
    const { error: upsertError } = await supabase
      .from("estimate_trust_scores")
      .upsert({
        cost_item_id: costItemId,
        overall_trust_score: result.overallTrustScore,
        plausibility_score: result.plausibilityScore,
        similarity_score: result.similarityScore,
        reference_count: result.referenceCount,
        explanation: result.explanation,
        country_code: projectCountry,
        calculated_at: new Date().toISOString(),
      }, {
        onConflict: "cost_item_id",
      });

    if (upsertError) {
      console.error("Failed to save trust score:", upsertError);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Trust score calculation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'kvm') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'lm' || u === 'rm') return 'm';
  return u;
}

async function calculateTrustScore(
  supabase: any,
  costItem: any,
  dbCountry: string,
  currency: string
): Promise<TrustScoreResult> {
  // Get the effective price being used
  const effectivePrice = costItem.user_override_price || 
                         costItem.recommended_unit_price || 
                         costItem.original_unit_price;
  
  if (!effectivePrice) {
    return {
      costItemId: costItem.id,
      overallTrustScore: 0,
      plausibilityScore: 0,
      similarityScore: 0,
      referenceCount: 0,
      explanation: "No price available for trust score calculation.",
    };
  }

  // Fetch similar benchmarks
  const normalizedUnit = normalizeUnit(costItem.unit);
  const searchTerms = generateSearchTerms(costItem.original_description);
  
  const { data: benchmarks, error: benchmarkError } = await supabase
    .from("benchmark_prices")
    .select("*")
    .eq("country", dbCountry)
    .eq("currency", currency);

  if (benchmarkError) {
    console.error("Failed to fetch benchmarks:", benchmarkError);
    return {
      costItemId: costItem.id,
      overallTrustScore: 50,
      plausibilityScore: 50,
      similarityScore: 50,
      referenceCount: 0,
      explanation: "Unable to calculate trust score due to database error.",
    };
  }

  // Filter to similar benchmarks
  const similarBenchmarks = (benchmarks || []).filter((b: any) => {
    const unitMatch = normalizeUnit(b.unit) === normalizedUnit;
    if (!unitMatch) return false;
    
    const descLower = (b.description || "").toLowerCase();
    const catLower = (b.category || "").toLowerCase();
    
    return searchTerms.some(term => 
      descLower.includes(term.toLowerCase()) || 
      catLower.includes(term.toLowerCase())
    );
  });

  // Also fetch from benchmark_costs (user-validated actuals)
  const { data: actualCosts } = await supabase
    .from("benchmark_costs")
    .select("*")
    .eq("country_code", costItem.projects?.country || "SE")
    .eq("approved", true);

  const similarActuals = (actualCosts || []).filter((a: any) => {
    const unitMatch = normalizeUnit(a.unit) === normalizedUnit;
    if (!unitMatch) return false;
    
    const descLower = (a.item_description || "").toLowerCase();
    return searchTerms.some(term => descLower.includes(term.toLowerCase()));
  });

  const totalReferences = similarBenchmarks.length + similarActuals.length;

  // Calculate PLAUSIBILITY SCORE (is the price within realistic ranges?)
  let plausibilityScore = 50; // Default
  let plausibilityReason = "";

  if (costItem.benchmark_min !== null && costItem.benchmark_max !== null) {
    const min = costItem.benchmark_min;
    const max = costItem.benchmark_max;
    const typical = costItem.benchmark_typical || ((min + max) / 2);
    
    if (effectivePrice >= min && effectivePrice <= max) {
      // Price is within range
      const distFromTypical = Math.abs(effectivePrice - typical);
      const range = max - min;
      const proximity = 1 - (distFromTypical / (range / 2));
      plausibilityScore = Math.round(70 + (proximity * 30)); // 70-100
      plausibilityReason = "Price is within the expected market range.";
    } else if (effectivePrice < min) {
      // Price is below range
      const percentBelow = ((min - effectivePrice) / min) * 100;
      if (percentBelow > 50) {
        plausibilityScore = 20;
        plausibilityReason = "Price is significantly below typical market rates (>50% under).";
      } else if (percentBelow > 30) {
        plausibilityScore = 40;
        plausibilityReason = "Price is below typical market rates (30-50% under).";
      } else {
        plausibilityScore = 55;
        plausibilityReason = "Price is slightly below typical market rates.";
      }
    } else {
      // Price is above range
      const percentAbove = ((effectivePrice - max) / max) * 100;
      if (percentAbove > 100) {
        plausibilityScore = 20;
        plausibilityReason = "Price is significantly above typical market rates (>100% over).";
      } else if (percentAbove > 50) {
        plausibilityScore = 40;
        plausibilityReason = "Price is above typical market rates (50-100% over).";
      } else {
        plausibilityScore = 55;
        plausibilityReason = "Price is slightly above typical market rates.";
      }
    }
  } else if (totalReferences > 0) {
    // Use similar benchmarks to estimate plausibility
    const allPrices = [
      ...similarBenchmarks.map((b: any) => b.avg_price),
      ...similarActuals.map((a: any) => a.unit_rate),
    ].filter(p => p && p > 0);
    
    if (allPrices.length > 0) {
      const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
      const minPrice = Math.min(...allPrices);
      const maxPrice = Math.max(...allPrices);
      
      if (effectivePrice >= minPrice * 0.5 && effectivePrice <= maxPrice * 2) {
        plausibilityScore = 70;
        plausibilityReason = "Price is within a reasonable range based on similar items.";
      } else {
        plausibilityScore = 40;
        plausibilityReason = "Price falls outside the typical range for similar items.";
      }
    }
  } else {
    plausibilityReason = "Limited price data available for comparison.";
  }

  // Calculate SIMILARITY SCORE (how well does the item match available data?)
  let similarityScore = 50; // Default
  let similarityReason = "";

  if (costItem.match_confidence) {
    // Use AI match confidence if available
    similarityScore = Math.round(costItem.match_confidence);
    similarityReason = `Based on AI matching confidence of ${costItem.match_confidence}%.`;
  } else if (totalReferences >= 50) {
    similarityScore = 95;
    similarityReason = `Strong reference data: ${totalReferences} similar items in database.`;
  } else if (totalReferences >= 20) {
    similarityScore = 85;
    similarityReason = `Good reference data: ${totalReferences} similar items available.`;
  } else if (totalReferences >= 10) {
    similarityScore = 75;
    similarityReason = `Moderate reference data: ${totalReferences} similar items found.`;
  } else if (totalReferences >= 5) {
    similarityScore = 65;
    similarityReason = `Limited reference data: ${totalReferences} similar items found.`;
  } else if (totalReferences > 0) {
    similarityScore = 50;
    similarityReason = `Very limited reference data: only ${totalReferences} similar item(s).`;
  } else {
    similarityScore = 30;
    similarityReason = "No similar items found in the reference database.";
  }

  // Calculate overall trust score
  const overallTrustScore = Math.round((plausibilityScore * 0.5) + (similarityScore * 0.5));

  // Build explanation
  const countryName = getCountryName(costItem.projects?.country || "SE");
  let explanation = `Trust Score: ${overallTrustScore}%\n\n`;
  explanation += `📊 Plausibility (${plausibilityScore}%): ${plausibilityReason}\n`;
  explanation += `🔍 Similarity (${similarityScore}%): ${similarityReason}\n\n`;
  explanation += `Based on ${totalReferences} similar items from the ${countryName} database.`;

  if (overallTrustScore < 50) {
    explanation += "\n\n⚠️ Limited reference data available. Consider manual verification.";
  }

  return {
    costItemId: costItem.id,
    overallTrustScore,
    plausibilityScore,
    similarityScore,
    referenceCount: totalReferences,
    explanation,
  };
}

function generateSearchTerms(description: string): string[] {
  const terms: string[] = [];
  const desc = description.toLowerCase();
  
  // Split into words and add significant ones
  const words = desc.split(/[\s,.\-\/]+/).filter(w => w.length >= 3);
  terms.push(...words);
  
  // Add the full description
  terms.push(desc);
  
  return [...new Set(terms)];
}

function getCountryName(countryCode: string): string {
  const names: Record<string, string> = {
    'SE': 'Sweden',
    'CZ': 'Czech Republic',
    'DE': 'Germany',
    'AT': 'Austria',
    'PL': 'Poland',
    'GB': 'United Kingdom',
    'US': 'United States',
  };
  return names[countryCode] || countryCode;
}
