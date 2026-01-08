import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParseRequest {
  projectId: string;
  storagePath: string;
}

interface ParsedItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  sheetName?: string;
  trade?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { projectId, storagePath } = await req.json() as ParseRequest;

    if (!projectId || !storagePath) {
      return new Response(
        JSON.stringify({ error: "Missing projectId or storagePath" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Parsing file: ${storagePath} for project: ${projectId}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("project-files")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      throw new Error("Failed to download file");
    }

    // Parse Excel file
    const arrayBuffer = await fileData.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

    const parsedItems: ParsedItem[] = [];

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

      if (jsonData.length < 2) continue; // Skip empty or header-only sheets

      // Try to detect column indices
      const headerRow = jsonData[0] as string[];
      const columnMap = detectColumns(headerRow);

      if (!columnMap.description) {
        console.log(`Skipping sheet ${sheetName}: no description column found`);
        continue;
      }

      // Determine trade from sheet name
      const trade = inferTradeFromSheetName(sheetName);

      // Process data rows
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[];
        if (!row || row.length === 0) continue;

        const description = row[columnMap.description];
        if (!description || typeof description !== "string" || description.trim().length < 3) {
          continue;
        }

        const quantity = parseNumber(row[columnMap.quantity ?? -1]);
        const unit = row[columnMap.unit ?? -1]?.toString() || "pcs";
        const unitPrice = parseNumber(row[columnMap.unitPrice ?? -1]);

        if (quantity === 0 && !unitPrice) continue; // Skip rows without meaningful data

        parsedItems.push({
          description: description.trim(),
          quantity: quantity || 1,
          unit: unit || "pcs",
          unitPrice: unitPrice || undefined,
          sheetName,
          trade,
        });
      }
    }

    console.log(`Parsed ${parsedItems.length} items from file`);

    if (parsedItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No cost items found in file",
          details: "Could not detect cost item columns (description, quantity, unit, price)"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert parsed items into database
    const itemsToInsert = parsedItems.map((item) => ({
      project_id: projectId,
      sheet_name: item.sheetName,
      trade: item.trade,
      original_description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      original_unit_price: item.unitPrice,
      status: "clarification",
    }));

    const { data: insertedItems, error: insertError } = await supabase
      .from("cost_items")
      .insert(itemsToInsert)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save parsed items");
    }

    // Update project status
    await supabase
      .from("projects")
      .update({ 
        status: "processing",
        total_items: parsedItems.length 
      })
      .eq("id", projectId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        itemCount: insertedItems?.length || 0,
        items: insertedItems 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("parse-excel error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Parsing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function detectColumns(headerRow: string[]): {
  description?: number;
  quantity?: number;
  unit?: number;
  unitPrice?: number;
} {
  const result: {
    description?: number;
    quantity?: number;
    unit?: number;
    unitPrice?: number;
  } = {};

  const descPatterns = [
    /desc|popis|název|name|položka|item|work|práce|činnost|specification/i,
  ];
  const qtyPatterns = [/qty|quantity|množství|počet|amount|mängd|antal/i];
  const unitPatterns = [/unit|jednotka|měrná|mj|enhet/i];
  const pricePatterns = [
    /price|cena|jednotková|unit.*price|j\.c\.|jc|pris|kostnad/i,
  ];

  headerRow.forEach((header, index) => {
    if (!header) return;
    const h = header.toString().toLowerCase();

    if (!result.description && descPatterns.some((p) => p.test(h))) {
      result.description = index;
    }
    if (!result.quantity && qtyPatterns.some((p) => p.test(h))) {
      result.quantity = index;
    }
    if (!result.unit && unitPatterns.some((p) => p.test(h))) {
      result.unit = index;
    }
    if (!result.unitPrice && pricePatterns.some((p) => p.test(h))) {
      result.unitPrice = index;
    }
  });

  // Fallback: if no description found, use first text column
  if (!result.description) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i]?.toString() || "";
      if (h.length > 3 && !/^\d+$/.test(h)) {
        result.description = i;
        break;
      }
    }
  }

  return result;
}

function inferTradeFromSheetName(sheetName: string): string | undefined {
  const lowerName = sheetName.toLowerCase();

  const tradeMap: Record<string, string> = {
    struct: "Structural",
    construct: "Structural",
    beton: "Structural",
    concrete: "Structural",
    steel: "Structural",
    ocel: "Structural",
    arch: "Architectural",
    facade: "Architectural",
    fasáda: "Architectural",
    window: "Architectural",
    okna: "Architectural",
    door: "Architectural",
    dveře: "Architectural",
    mech: "Mechanical",
    hvac: "Mechanical",
    vzduchotechnika: "Mechanical",
    topení: "Mechanical",
    heating: "Mechanical",
    cooling: "Mechanical",
    elektro: "Electrical",
    electr: "Electrical",
    lighting: "Electrical",
    osvětlení: "Electrical",
    plumb: "Plumbing",
    zti: "Plumbing",
    sanita: "Plumbing",
    water: "Plumbing",
    voda: "Plumbing",
    finish: "Finishes",
    podlah: "Finishes",
    floor: "Finishes",
    wall: "Finishes",
    paint: "Finishes",
    malb: "Finishes",
    demo: "Demolition",
    boura: "Demolition",
    exter: "External Works",
    venkov: "External Works",
    landscape: "External Works",
  };

  for (const [pattern, trade] of Object.entries(tradeMap)) {
    if (lowerName.includes(pattern)) {
      return trade;
    }
  }

  return sheetName;
}

function parseNumber(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;
  const str = value.toString().replace(/[^\d.,\-]/g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}
