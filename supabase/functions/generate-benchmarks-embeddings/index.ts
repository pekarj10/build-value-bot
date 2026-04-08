import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generate embeddings for benchmark_prices rows that have NULL embedding.
 * Processes in batches, returns progress info.
 */

async function generateEmbedding(apiKey: string, text: string, maxRetries = 2): Promise<number[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
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

    // Verify admin
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

    // Parse optional batch parameters
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 50;
    const maxItems = body.maxItems || 500; // Process up to 500 per call to stay within function timeout

    // Fetch benchmarks with NULL embedding
    const { data: benchmarks, error: fetchError } = await supabase
      .from('benchmark_prices')
      .select('id, description, unit, category')
      .is('embedding', null)
      .order('id', { ascending: true })
      .limit(maxItems);

    if (fetchError) {
      throw new Error(`Failed to fetch benchmarks: ${fetchError.message}`);
    }

    if (!benchmarks || benchmarks.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, total: 0, remaining: 0, message: "All benchmarks already have embeddings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count total remaining (including beyond maxItems)
    const { count: totalMissing } = await supabase
      .from('benchmark_prices')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);

    console.log(`Processing ${benchmarks.length} of ${totalMissing} benchmarks missing embeddings`);

    let processed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < benchmarks.length; i += batchSize) {
      const batch = benchmarks.slice(i, i + batchSize);

      // Generate embeddings in parallel within each batch
      const results = await Promise.allSettled(
        batch.map(async (bm) => {
          const text = `${bm.description} ${bm.unit}`;
          const embedding = await generateEmbedding(LOVABLE_API_KEY, text);

          const { error: updateError } = await supabase
            .from('benchmark_prices')
            .update({ embedding: JSON.stringify(embedding) })
            .eq('id', bm.id);

          if (updateError) {
            throw new Error(`Update failed for ${bm.id}: ${updateError.message}`);
          }

          return bm.id;
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          processed++;
        } else {
          errors++;
          console.error('Embedding error:', r.reason);
        }
      }

      console.log(`Progress: ${processed + errors}/${benchmarks.length} (${processed} ok, ${errors} errors)`);

      // Rate limit between batches
      if (i + batchSize < benchmarks.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const remaining = (totalMissing || 0) - processed;

    console.log(`Done: ${processed} processed, ${errors} errors, ${remaining} remaining`);

    return new Response(
      JSON.stringify({
        processed,
        errors,
        total: totalMissing || 0,
        remaining: Math.max(0, remaining),
        message: remaining > 0
          ? `Processed ${processed} embeddings. ${remaining} still remaining — run again to continue.`
          : `All ${processed} embeddings generated successfully.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-benchmarks-embeddings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate embeddings" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
