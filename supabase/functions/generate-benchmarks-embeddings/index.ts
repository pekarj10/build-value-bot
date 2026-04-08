import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ITEMS = 5;

async function generateEmbedding(apiKey: string, text: string): Promise<number[]> {
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
    throw new Error(`Embedding API ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Invalid embedding response format");
  }

  return embedding;
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

    const { data: benchmarks, error: fetchError } = await supabase
      .from("benchmark_prices")
      .select("id, description, unit")
      .is("embedding", null)
      .order("id", { ascending: true })
      .limit(MAX_ITEMS);

    if (fetchError) {
      throw new Error(`Failed to fetch benchmarks: ${fetchError.message}`);
    }

    if (!benchmarks || benchmarks.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, total: 0, remaining: 0, errors: 0, message: "All benchmarks already have embeddings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { count: totalMissing, error: countError } = await supabase
      .from("benchmark_prices")
      .select("id", { count: "exact", head: true })
      .is("embedding", null);

    if (countError) {
      throw new Error(`Failed to count benchmarks: ${countError.message}`);
    }

    const results = await Promise.all(
      benchmarks.map(async (bm) => {
        try {
          const text = `${bm.description} ${bm.unit}`;
          const embedding = await generateEmbedding(LOVABLE_API_KEY, text);

          const { error: updateError } = await supabase
            .from("benchmark_prices")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", bm.id);

          if (updateError) {
            throw new Error(`DB update failed for ${bm.id}: ${updateError.message}`);
          }

          return { id: bm.id, ok: true as const };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Embedding error for ${bm.id}:`, message);
          return { id: bm.id, ok: false as const, message };
        }
      })
    );

    const processed = results.filter((result) => result.ok).length;
    const failures = results.filter((result) => !result.ok);
    const errors = failures.length;
    const errorMessages = failures.map((result) => result.message).slice(0, 5);
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
            ? `Processed ${processed} embeddings. ${remaining} still remaining — continuing in small batches.`
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
