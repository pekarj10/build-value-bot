import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 100;

async function generateEmbeddingsBulk(texts: string[]): Promise<number[][]> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data?.data || !Array.isArray(data.data)) {
    throw new Error("Invalid embedding response format");
  }

  // Sort by index to ensure correct ordering
  const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
  return sorted.map((item: any) => item.embedding);
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch up to BATCH_SIZE rows missing embeddings
    const { data: benchmarks, error: fetchError } = await supabase
      .from("benchmark_prices")
      .select("id, description, unit")
      .is("embedding", null)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw new Error(`Failed to fetch benchmarks: ${fetchError.message}`);
    }

    if (!benchmarks || benchmarks.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, total: 0, remaining: 0, errors: 0, message: "All benchmarks already have embeddings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count total missing
    const { count: totalMissing } = await supabase
      .from("benchmark_prices")
      .select("id", { count: "exact", head: true })
      .is("embedding", null);

    // Build text array and generate all embeddings in a single API call
    const texts = benchmarks.map((bm) => `${bm.description} ${bm.unit}`);
    const embeddings = await generateEmbeddingsBulk(texts);

    // Bulk update all rows
    let processed = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    await Promise.all(
      benchmarks.map(async (bm, i) => {
        try {
          const { error: updateError } = await supabase
            .from("benchmark_prices")
            .update({ embedding: JSON.stringify(embeddings[i]) })
            .eq("id", bm.id);

          if (updateError) {
            throw new Error(`DB update failed for ${bm.id}: ${updateError.message}`);
          }
          processed++;
        } catch (error) {
          errors++;
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`Update error for ${bm.id}:`, msg);
          if (errorMessages.length < 5) errorMessages.push(msg);
        }
      })
    );

    const remaining = Math.max(0, (totalMissing || 0) - processed);

    return new Response(
      JSON.stringify({
        processed,
        errors,
        total: totalMissing || 0,
        remaining,
        errorMessages,
        message:
          remaining > 0
            ? `Processed ${processed} embeddings. ${remaining} still remaining.`
            : `All ${processed} embeddings generated successfully.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to generate embeddings";
    console.error("generate-benchmarks-embeddings error:", msg);
    return new Response(
      JSON.stringify({ error: msg, processed: 0, errors: 1 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
