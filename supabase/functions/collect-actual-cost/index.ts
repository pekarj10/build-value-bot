import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * COLLECT ACTUAL COST DATA
 * 
 * When users mark items as "Actual" (real quotes/invoices),
 * this function validates and collects the data for learning.
 * 
 * Validation rules:
 * - Values must be positive and < 10M
 * - Description must be >= 3 words
 * - Unit must be a recognized construction unit
 * - Country code must be valid ISO 3166-1 alpha-2
 * 
 * NO PII is collected - only anonymous cost data.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CollectActualRequest {
  costItemId: string;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  needsAdminReview: boolean;
}

const VALID_UNITS = new Set([
  'm²', 'm2', 'sqm', 'kvm',
  'st', 'pcs', 'pc', 'piece', 'styck', 'stk',
  'm', 'meter', 'lm', 'rm',
  'kg', 'kilogram',
  'l', 'liter', 'litre',
  'h', 'hr', 'hour', 'tim', 'timmar',
  'set', 'kit', 'paket',
  'ton', 't',
  'm³', 'm3', 'cbm',
]);

const VALID_COUNTRY_CODES = new Set([
  'SE', 'CZ', 'DE', 'AT', 'PL', 'GB', 'US', 'SK', 'NO', 'DK', 'FI',
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { costItemId } = await req.json() as CollectActualRequest;

    if (!costItemId) {
      return new Response(
        JSON.stringify({ error: "costItemId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the cost item with project info
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
      return new Response(
        JSON.stringify({ error: "Cost item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the effective price (user override or recommended)
    const effectivePrice = costItem.user_override_price || 
                           costItem.recommended_unit_price || 
                           costItem.original_unit_price;

    if (!effectivePrice) {
      return new Response(
        JSON.stringify({ error: "No price available to collect" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const countryCode = costItem.projects?.country || "SE";
    const currency = costItem.projects?.currency || "SEK";

    // Validate the data
    const validation = validateCostData({
      description: costItem.original_description,
      unit: costItem.unit,
      quantity: costItem.quantity,
      unitRate: effectivePrice,
      totalCost: costItem.total_price || (effectivePrice * costItem.quantity),
      countryCode,
    });

    if (!validation.valid) {
      console.log(`Validation failed for ${costItemId}: ${validation.reason}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          reason: validation.reason,
          needsReview: validation.needsAdminReview,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate a preliminary trust score
    const trustScore = await calculatePreliminaryTrustScore(
      supabase, 
      costItem, 
      countryCode, 
      currency
    );

    // Determine if admin review is needed
    const needsAdminReview = trustScore < 50 || validation.needsAdminReview;

    // Insert into benchmark_costs
    const { error: insertError } = await supabase
      .from("benchmark_costs")
      .insert({
        item_description: costItem.original_description,
        unit: normalizeUnit(costItem.unit),
        quantity: costItem.quantity,
        unit_rate: effectivePrice,
        total_cost: costItem.total_price || (effectivePrice * costItem.quantity),
        country_code: countryCode,
        category: costItem.trade || inferCategory(costItem.original_description),
        trust_score: trustScore,
        approved: !needsAdminReview, // Auto-approve if trust score is high
        data_source: "user_actual",
      });

    if (insertError) {
      console.error("Failed to insert benchmark cost:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save actual cost data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        trustScore,
        approved: !needsAdminReview,
        message: needsAdminReview 
          ? "Cost data collected and sent for admin review."
          : "Cost data collected and added to learning database.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Collect actual cost error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function validateCostData(data: {
  description: string;
  unit: string;
  quantity: number;
  unitRate: number;
  totalCost: number;
  countryCode: string;
}): ValidationResult {
  // Check description length (at least 3 words)
  const words = data.description.trim().split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 3) {
    return { 
      valid: false, 
      reason: "Description too vague (less than 3 words)",
      needsAdminReview: false,
    };
  }

  // Check unit is recognized
  const normalizedUnit = normalizeUnit(data.unit);
  if (!VALID_UNITS.has(normalizedUnit) && !VALID_UNITS.has(data.unit.toLowerCase())) {
    return { 
      valid: false, 
      reason: `Unrecognized unit: ${data.unit}`,
      needsAdminReview: true,
    };
  }

  // Check values are positive
  if (data.unitRate <= 0 || data.totalCost <= 0) {
    return { 
      valid: false, 
      reason: "Price values must be positive",
      needsAdminReview: false,
    };
  }

  // Check for absurdly high values (>10M)
  if (data.totalCost > 10000000) {
    return { 
      valid: false, 
      reason: "Total cost exceeds maximum allowed value (10M)",
      needsAdminReview: true,
    };
  }

  // Check country code
  if (!VALID_COUNTRY_CODES.has(data.countryCode)) {
    return { 
      valid: false, 
      reason: `Invalid country code: ${data.countryCode}`,
      needsAdminReview: false,
    };
  }

  // Check for potential outliers (flag for review but still valid)
  if (data.unitRate < 1 || data.unitRate > 100000) {
    return { 
      valid: true, 
      needsAdminReview: true,
    };
  }

  return { valid: true, needsAdminReview: false };
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm2' || u === 'm²' || u === 'sqm' || u === 'kvm') return 'm²';
  if (u === 'st' || u === 'pcs' || u === 'pc' || u === 'piece' || u === 'styck') return 'st';
  if (u === 'm' || u === 'meter' || u === 'lm' || u === 'rm') return 'm';
  if (u === 'm3' || u === 'm³' || u === 'cbm') return 'm³';
  return u;
}

function inferCategory(description: string): string {
  const desc = description.toLowerCase();
  
  if (/floor|carpet|tile|parquet|vinyl|laminate/.test(desc)) return "Flooring";
  if (/wall|partition|drywall|gypsum/.test(desc)) return "Walls & Partitions";
  if (/roof|roofing/.test(desc)) return "Roofing";
  if (/window|door|glazing/.test(desc)) return "Windows & Doors";
  if (/facade|cladding|render|insulation/.test(desc)) return "Facade";
  if (/electric|electrical|wiring/.test(desc)) return "Electrical";
  if (/plumb|pipe|hvac|ventilation|heating/.test(desc)) return "HVAC & Plumbing";
  if (/demolition|remove|demolish/.test(desc)) return "Demolition";
  if (/paint|painting|finish/.test(desc)) return "Painting & Finishes";
  if (/concrete|foundation|structure/.test(desc)) return "Structural";
  
  return "General";
}

async function calculatePreliminaryTrustScore(
  supabase: any,
  costItem: any,
  countryCode: string,
  currency: string
): Promise<number> {
  const dbCountry = mapCountryToDb(countryCode);
  
  // Fetch similar benchmarks
  const { data: benchmarks } = await supabase
    .from("benchmark_prices")
    .select("avg_price, min_price, max_price")
    .eq("country", dbCountry)
    .eq("currency", currency);

  if (!benchmarks || benchmarks.length === 0) {
    return 50; // Default when no comparison data
  }

  const effectivePrice = costItem.user_override_price || 
                         costItem.recommended_unit_price || 
                         costItem.original_unit_price;

  // Simple check: is price within overall range of benchmarks?
  const allPrices = benchmarks.flatMap((b: any) => [b.min_price, b.avg_price, b.max_price].filter(Boolean));
  const minOverall = Math.min(...allPrices);
  const maxOverall = Math.max(...allPrices);

  if (effectivePrice >= minOverall * 0.3 && effectivePrice <= maxOverall * 3) {
    return 70; // Reasonable range
  }

  return 40; // Outside reasonable range
}

function mapCountryToDb(country: string): string {
  const mapping: Record<string, string> = {
    'SE': 'SWEDEN', 'CZ': 'CZECH_REPUBLIC', 'DE': 'GERMANY',
    'AT': 'AUSTRIA', 'PL': 'POLAND', 'GB': 'UNITED_KINGDOM', 'US': 'UNITED_STATES',
  };
  return mapping[country] || country.toUpperCase().replace(/ /g, '_');
}
