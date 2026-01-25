import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MutationEntry {
  id: string;
  cost_item_id: string;
  user_id: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: string;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

interface TimelineEntry {
  id: string;
  timestamp: string;
  user_name: string | null;
  user_email: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: string;
  reason: string | null;
}

interface CostItemSnapshot {
  [key: string]: unknown;
}

interface ProfileRecord {
  id: string;
  full_name: string | null;
  email: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Expected paths:
    // /cost-item-mutations/{costItemId}/timeline
    // /cost-item-mutations/{costItemId}/version/{timestamp}
    // /cost-item-mutations/{costItemId}/restore
    // /cost-item-mutations/{costItemId}/log
    
    const costItemId = pathParts[1];
    const action = pathParts[2];
    const timestamp = pathParts[3]; // For version endpoint

    if (!costItemId) {
      return new Response(
        JSON.stringify({ error: "Cost item ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth token
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // deno-lint-ignore no-explicit-any
    const supabase: SupabaseClient<any> = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    // Verify user has access to this cost item
    const { data: costItem, error: costItemError } = await supabase
      .from("cost_items")
      .select("id, project_id")
      .eq("id", costItemId)
      .single();

    if (costItemError || !costItem) {
      console.error("Cost item not found:", costItemError);
      return new Response(
        JSON.stringify({ error: "Cost item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route to appropriate handler
    switch (action) {
      case "timeline":
        return await handleTimeline(req, supabase, costItemId, url);
      case "version":
        return await handleVersion(supabase, costItemId, timestamp);
      case "restore":
        return await handleRestore(req, supabase, costItemId);
      case "log":
        return await handleLog(req, supabase, costItemId);
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err) {
    const error = err as Error;
    console.error("Error in cost-item-mutations:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// GET /timeline - Get mutation history for a cost item
async function handleTimeline(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  costItemId: string,
  url: URL
): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const fieldFilter = url.searchParams.get("field_filter");
  const offset = (page - 1) * limit;

  console.log(`Fetching timeline for cost item ${costItemId}, page ${page}, limit ${limit}`);

  // Build query
  let query = supabase
    .from("cost_item_mutations")
    .select(`
      id,
      cost_item_id,
      user_id,
      field_name,
      old_value,
      new_value,
      change_type,
      reason,
      created_at
    `)
    .eq("cost_item_id", costItemId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (fieldFilter) {
    query = query.eq("field_name", fieldFilter);
  }

  const { data: mutations, error } = await query;

  if (error) {
    console.error("Error fetching mutations:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch timeline" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mutationData = mutations as MutationEntry[] || [];

  // Get user profiles for mutations
  const userIds = [...new Set(mutationData.filter(m => m.user_id).map(m => m.user_id))];
  let userProfiles: Record<string, { full_name: string | null; email: string | null }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    const profileData = profiles as ProfileRecord[] || [];
    userProfiles = profileData.reduce((acc, p) => {
      acc[p.id] = { full_name: p.full_name, email: p.email };
      return acc;
    }, {} as Record<string, { full_name: string | null; email: string | null }>);
  }

  // Format response
  const timeline: TimelineEntry[] = mutationData.map((m) => ({
    id: m.id,
    timestamp: m.created_at,
    user_name: m.user_id ? userProfiles[m.user_id]?.full_name || "Unknown User" : "System",
    user_email: m.user_id ? userProfiles[m.user_id]?.email || null : null,
    field_name: m.field_name,
    old_value: m.old_value,
    new_value: m.new_value,
    change_type: m.change_type,
    reason: m.reason,
  }));

  // Get total count
  const { count } = await supabase
    .from("cost_item_mutations")
    .select("id", { count: "exact", head: true })
    .eq("cost_item_id", costItemId);

  return new Response(
    JSON.stringify({
      data: timeline,
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: (offset + limit) < (count || 0),
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// GET /version/{timestamp} - Get cost item state at a specific point in time
async function handleVersion(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  costItemId: string,
  timestamp: string | undefined
): Promise<Response> {
  if (!timestamp) {
    return new Response(
      JSON.stringify({ error: "Timestamp is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate timestamp format
  const targetDate = new Date(decodeURIComponent(timestamp));
  if (isNaN(targetDate.getTime())) {
    return new Response(
      JSON.stringify({ error: "Invalid timestamp format. Use ISO 8601 format." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Getting version of cost item ${costItemId} at ${targetDate.toISOString()}`);

  // Get current state
  const { data: currentItem, error: itemError } = await supabase
    .from("cost_items")
    .select("*")
    .eq("id", costItemId)
    .single();

  if (itemError || !currentItem) {
    return new Response(
      JSON.stringify({ error: "Cost item not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get all mutations AFTER the target timestamp (to reverse them)
  const { data: mutations, error: mutationsError } = await supabase
    .from("cost_item_mutations")
    .select("*")
    .eq("cost_item_id", costItemId)
    .gt("created_at", targetDate.toISOString())
    .order("created_at", { ascending: false });

  if (mutationsError) {
    console.error("Error fetching mutations for version:", mutationsError);
    return new Response(
      JSON.stringify({ error: "Failed to reconstruct version" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mutationData = mutations as MutationEntry[] || [];

  // Reconstruct the state by reversing mutations
  const reconstructedItem: CostItemSnapshot = { ...(currentItem as Record<string, unknown>) };
  
  for (const mutation of mutationData) {
    // For each mutation after the target time, revert to old_value
    if (mutation.field_name !== "item") {
      reconstructedItem[mutation.field_name] = mutation.old_value;
    }
  }

  return new Response(
    JSON.stringify({
      data: reconstructedItem,
      as_of: targetDate.toISOString(),
      mutations_reversed: mutationData.length,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// POST /restore - Restore cost item to a previous state
async function handleRestore(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  costItemId: string
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const { restore_to_timestamp, reason } = body;

  if (!restore_to_timestamp) {
    return new Response(
      JSON.stringify({ error: "restore_to_timestamp is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const targetDate = new Date(restore_to_timestamp);
  if (isNaN(targetDate.getTime())) {
    return new Response(
      JSON.stringify({ error: "Invalid timestamp format" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (targetDate > new Date()) {
    return new Response(
      JSON.stringify({ error: "Cannot restore to a future timestamp" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (reason && reason.length > 500) {
    return new Response(
      JSON.stringify({ error: "Reason must be max 500 characters" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Restoring cost item ${costItemId} to ${targetDate.toISOString()}`);

  // Get the historical state
  const { data: currentItem } = await supabase
    .from("cost_items")
    .select("*")
    .eq("id", costItemId)
    .single();

  if (!currentItem) {
    return new Response(
      JSON.stringify({ error: "Cost item not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get all mutations AFTER the target timestamp
  const { data: mutations } = await supabase
    .from("cost_item_mutations")
    .select("*")
    .eq("cost_item_id", costItemId)
    .gt("created_at", targetDate.toISOString())
    .order("created_at", { ascending: false });

  const mutationData = mutations as MutationEntry[] || [];

  if (mutationData.length === 0) {
    return new Response(
      JSON.stringify({ error: "No changes to restore from this timestamp" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Build the update object by collecting old values
  const updates: Record<string, string | number | null> = {};
  const restoredFields: string[] = [];

  for (const mutation of mutationData) {
    if (mutation.field_name !== "item" && !(mutation.field_name in updates)) {
      updates[mutation.field_name] = mutation.old_value;
      restoredFields.push(mutation.field_name);
    }
  }

  // Parse numeric fields back to numbers
  const numericFields = [
    "quantity", "original_unit_price", "recommended_unit_price",
    "benchmark_min", "benchmark_typical", "benchmark_max",
    "total_price", "user_override_price", "match_confidence"
  ];

  for (const field of numericFields) {
    if (field in updates && updates[field] !== null) {
      updates[field] = parseFloat(updates[field] as string);
    }
  }

  // Apply the restoration
  const { data: restoredItem, error: updateError } = await supabase
    .from("cost_items")
    .update(updates)
    .eq("id", costItemId)
    .select()
    .single();

  if (updateError) {
    console.error("Error restoring cost item:", updateError);
    return new Response(
      JSON.stringify({ error: "Failed to restore cost item" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Log the restore action with reason
  if (reason) {
    await supabase
      .from("cost_item_mutations")
      .insert({
        cost_item_id: costItemId,
        field_name: "restore",
        old_value: JSON.stringify({ fields: restoredFields }),
        new_value: targetDate.toISOString(),
        change_type: "restore",
        reason: reason,
      });
  }

  return new Response(
    JSON.stringify({
      data: restoredItem,
      restored_to: targetDate.toISOString(),
      fields_restored: restoredFields,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// POST /log - Manually log a mutation with reason
async function handleLog(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  costItemId: string
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const { field_name, old_value, new_value, change_type, reason } = body;

  // Validate required fields
  const validChangeTypes = ["create", "update", "status_change", "price_override", "note_added", "delete", "restore"];
  const validFieldNames = [
    "status", "original_unit_price", "recommended_unit_price", "original_description",
    "quantity", "unit", "user_override_price", "user_clarification", "interpreted_scope",
    "ai_comment", "total_price", "item", "restore"
  ];

  if (!field_name || !validFieldNames.includes(field_name)) {
    return new Response(
      JSON.stringify({ error: `field_name must be one of: ${validFieldNames.join(", ")}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!change_type || !validChangeTypes.includes(change_type)) {
    return new Response(
      JSON.stringify({ error: `change_type must be one of: ${validChangeTypes.join(", ")}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (old_value === null && new_value === null && !["create", "delete", "restore"].includes(change_type)) {
    return new Response(
      JSON.stringify({ error: "Both old_value and new_value cannot be null" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (reason && reason.length > 500) {
    return new Response(
      JSON.stringify({ error: "Reason must be max 500 characters" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Insert mutation
  const { data: mutation, error } = await supabase
    .from("cost_item_mutations")
    .insert({
      cost_item_id: costItemId,
      user_id: user?.id || null,
      field_name,
      old_value: old_value?.toString() || null,
      new_value: new_value?.toString() || null,
      change_type,
      reason: reason || null,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error logging mutation:", error);
    return new Response(
      JSON.stringify({ error: "Failed to log mutation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ data: mutation }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
