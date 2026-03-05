import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to get the current user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find pending invitations for this user's email
    const { data: invitations, error: invError } = await adminClient
      .from("project_invitations")
      .select("*")
      .eq("email", user.email)
      .eq("status", "pending");

    if (invError) throw invError;

    const accepted: string[] = [];

    for (const inv of invitations || []) {
      // Check if already a member
      const { data: existing } = await adminClient
        .from("project_members")
        .select("id")
        .eq("project_id", inv.project_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        // Add as member
        await adminClient.from("project_members").insert({
          project_id: inv.project_id,
          user_id: user.id,
          role: inv.role,
          invited_by: inv.invited_by,
        });
      }

      // Mark invitation as accepted
      await adminClient
        .from("project_invitations")
        .update({ status: "accepted" })
        .eq("id", inv.id);

      accepted.push(inv.project_id);
    }

    return new Response(
      JSON.stringify({ accepted, count: accepted.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
