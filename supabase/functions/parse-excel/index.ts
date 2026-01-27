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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
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

    // Check file extension
    const fileExtension = storagePath.split('.').pop()?.toLowerCase();
    let parsedItems: ParsedItem[] = [];

    if (fileExtension === 'pdf') {
      // Parse PDF using AI
      console.log("Parsing PDF file using AI...");
      parsedItems = await parsePdfWithAI(fileData, lovableApiKey);
    } else {
      // Parse Excel file
      parsedItems = await parseExcelFile(fileData);
    }

    console.log(`Parsed ${parsedItems.length} items from file`);

    if (parsedItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No cost items found in file",
          details: "Could not detect or extract cost items from the file"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert parsed items into database
    const itemsToInsert = parsedItems.map((item) => ({
      project_id: projectId,
      sheet_name: item.sheetName || "PDF",
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

// Parse PDF using AI to extract structured cost items
async function parsePdfWithAI(fileData: Blob, apiKey?: string): Promise<ParsedItem[]> {
  if (!apiKey) {
    throw new Error("AI API key not configured for PDF parsing");
  }

  // Convert PDF to base64
  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  console.log(`PDF size: ${arrayBuffer.byteLength} bytes`);

  // Use AI to extract cost items from PDF
  const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are an expert at extracting construction cost items from bill of quantities (BOQ) PDFs.
          
Your task is to extract cost line items from the provided PDF document.

For each item, extract:
- description: The item description/specification
- quantity: The numeric quantity (default to 1 if not found)
- unit: The unit of measurement (m, m2, m3, pcs, kg, etc.)
- unitPrice: The unit price if available (null if not found)
- trade: The trade category (Structural, Architectural, Mechanical, Electrical, Plumbing, Finishes, etc.)

IMPORTANT:
- Extract ALL cost items you can find
- Skip headers, totals, subtotals, and summary rows
- Handle multiple languages (Czech, Swedish, English, etc.)
- Return a valid JSON array only, no other text
- If you cannot find any items, return an empty array []

Example output:
[
  {"description": "Concrete foundation C30/37", "quantity": 45.5, "unit": "m3", "unitPrice": 150, "trade": "Structural"},
  {"description": "Steel reinforcement B500B", "quantity": 2500, "unit": "kg", "unitPrice": 1.2, "trade": "Structural"}
]`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all cost items from this bill of quantities PDF. Return only a JSON array."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", errorText);
    throw new Error(`AI parsing failed: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "[]";
  
  console.log("AI response received, parsing items...");

  // Parse the JSON response
  try {
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const items = JSON.parse(jsonStr);
    
    if (!Array.isArray(items)) {
      console.error("AI response is not an array:", items);
      return [];
    }

    return items.map((item: Record<string, unknown>) => ({
      description: String(item.description || ""),
      quantity: Number(item.quantity) || 1,
      unit: String(item.unit || "pcs"),
      unitPrice: item.unitPrice ? Number(item.unitPrice) : undefined,
      trade: String(item.trade || "General"),
      sheetName: "PDF Extract",
    })).filter((item: ParsedItem) => item.description.length > 2);
  } catch (e) {
    console.error("Failed to parse AI response:", e, content);
    return [];
  }
}

// Parse Excel file
async function parseExcelFile(fileData: Blob): Promise<ParsedItem[]> {
  const arrayBuffer = await fileData.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

  const parsedItems: ParsedItem[] = [];

  console.log(`Workbook has ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(", ")}`);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

    console.log(`Sheet "${sheetName}" has ${jsonData.length} rows`);
    
    if (jsonData.length < 1) continue;

    // Log first few rows to debug
    for (let i = 0; i < Math.min(3, jsonData.length); i++) {
      const row = jsonData[i] as unknown[];
      console.log(`Row ${i}: ${JSON.stringify(row?.slice(0, 8))}`);
    }

    // Find the header row
    let headerRowIndex = -1;
    let headerRow: string[] = [];
    
    for (let i = 0; i < Math.min(15, jsonData.length); i++) {
      const row = jsonData[i] as unknown[];
      if (!row) continue;
      
      let nonEmptyCount = 0;
      for (const cell of row) {
        if (cell !== null && cell !== undefined && cell !== "") {
          nonEmptyCount++;
        }
      }
      
      if (nonEmptyCount >= 2) {
        headerRow = row.map(cell => cell?.toString() || "");
        headerRowIndex = i;
        console.log(`Found potential header at row ${i} with ${nonEmptyCount} cells: ${headerRow.slice(0, 5).join(" | ")}`);
        break;
      }
    }

    if (headerRowIndex === -1 || headerRow.length === 0) {
      if (jsonData.length > 0 && jsonData[0]) {
        headerRow = (jsonData[0] as unknown[]).map(cell => cell?.toString() || "");
        headerRowIndex = 0;
        console.log(`Using first row as header fallback: ${headerRow.slice(0, 5).join(" | ")}`);
      } else {
        console.log(`Skipping sheet ${sheetName}: no usable header row found`);
        continue;
      }
    }

    const columnMap = detectColumns(headerRow);
    console.log(`Column detection for "${sheetName}": desc=${columnMap.description}, qty=${columnMap.quantity}, unit=${columnMap.unit}, price=${columnMap.unitPrice}`);

    if (columnMap.description === undefined) {
      for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
        const header = headerRow[colIdx];
        if (header && header.length >= 1) {
          columnMap.description = colIdx;
          console.log(`Using column ${colIdx} ("${header}") as description fallback`);
          break;
        }
      }
    }

    if (columnMap.description === undefined) {
      console.log(`Skipping sheet ${sheetName}: could not determine description column`);
      continue;
    }

    const trade = inferTradeFromSheetName(sheetName);

    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i] as unknown[];
      if (!row || row.length === 0) continue;

      const descValue = row[columnMap.description];
      const description = descValue?.toString()?.trim() || "";
      
      if (description.length < 2) continue;
      
      const lowerDesc = description.toLowerCase();
      // Only skip if it looks like a summary row (starts with total/sum keywords)
      // Allow "total" within parentheses as context (e.g., "total längd 3500 m")
      const isSummaryRow = 
        /^(total|celkem|suma|summa|subtotal|delsumma)/i.test(lowerDesc) ||
        (lowerDesc.includes("total") && !lowerDesc.includes("(total"));
      if (isSummaryRow) continue;

      const quantity = columnMap.quantity !== undefined ? parseNumber(row[columnMap.quantity]) : 1;
      const unit = columnMap.unit !== undefined ? (row[columnMap.unit]?.toString() || "pcs") : "pcs";
      const unitPrice = columnMap.unitPrice !== undefined ? parseNumber(row[columnMap.unitPrice]) : undefined;

      parsedItems.push({
        description,
        quantity: quantity || 1,
        unit: unit || "pcs",
        unitPrice: unitPrice || undefined,
        sheetName,
        trade,
      });
    }
    
    console.log(`Extracted ${parsedItems.length} items so far from sheet "${sheetName}"`);
  }

  return parsedItems;
}

function detectColumns(headerRow: string[]): {
  description?: number;
  quantity?: number;
  unit?: number;
  unitPrice?: number;
  totalPrice?: number;
} {
  const result: {
    description?: number;
    quantity?: number;
    unit?: number;
    unitPrice?: number;
    totalPrice?: number;
  } = {};

  // Expanded patterns for multi-language support (English, Swedish, Czech, German)
  const descPatterns = [
    /^desc/i, /^popis/i, /^název/i, /^name/i, /^položka/i, /^item/i, 
    /^work/i, /^práce/i, /^činnost/i, /^specification/i, /^beskrivning/i,
    /^artikel/i, /^post/i, /^rubrik/i, /^benämning/i, /^arbete/i,
  ];
  
  // CRITICAL: Added "how much" and Swedish "hur mycket"
  // Using \s* for any whitespace and making patterns more flexible
  const qtyPatterns = [
    /^qty/i, /^quantity/i, /^množství/i, /^počet/i, /^amount/i, 
    /^mängd/i, /^antal/i, /how\s*much/i, /hur\s*mycket/i,
    /^st$/i, /^stk$/i, /^kpl$/i, /^pcs$/i, /^kvantitet/i, /^menge/i,
    /^number/i, /^count/i, /^antal$/i, /^no\.?$/i,
  ];
  
  const unitPatterns = [
    /^unit$/i, /^jednotka/i, /^měrná/i, /^mj$/i, /^enhet/i,
    /^måttenhet/i, /^einheit/i,
  ];
  
  const pricePatterns = [
    /^price/i, /^cena/i, /^jednotková/i, /unit.*price/i, /^j\.c\./i, /^jc$/i, 
    /^pris$/i, /^kostnad/i, /^à-pris/i, /^a-pris/i, /^enhetspris/i, /^preis/i,
  ];
  
  // Total price patterns (to avoid confusing with unit price)
  const totalPatterns = [
    /^total/i, /^celkem/i, /^suma/i, /^summa/i, /^belopp/i, /^gesamt/i,
    /total\s*price/i, /total\s*pris/i,
  ];

  headerRow.forEach((header, index) => {
    if (!header) return;
    const h = header.toString().toLowerCase().trim();
    
    console.log(`Checking column ${index}: "${header}" (normalized: "${h}")`);

    // Check total first to avoid matching it as unit price
    if (!result.totalPrice && totalPatterns.some((p) => p.test(h))) {
      console.log(`  → Matched as TOTAL`);
      result.totalPrice = index;
      return;
    }
    if (!result.description && descPatterns.some((p) => p.test(h))) {
      console.log(`  → Matched as DESCRIPTION`);
      result.description = index;
    }
    if (!result.quantity && qtyPatterns.some((p) => p.test(h))) {
      console.log(`  → Matched as QUANTITY`);
      result.quantity = index;
    }
    if (!result.unit && unitPatterns.some((p) => p.test(h))) {
      console.log(`  → Matched as UNIT`);
      result.unit = index;
    }
    if (!result.unitPrice && pricePatterns.some((p) => p.test(h))) {
      console.log(`  → Matched as UNIT PRICE`);
      result.unitPrice = index;
    }
  });

  // Fallback: if description not found, use first column with text
  if (result.description === undefined) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i]?.toString() || "";
      if (h.length > 3 && !/^\d+$/.test(h)) {
        result.description = i;
        break;
      }
    }
  }

  console.log(`Column detection result: desc=${result.description}, qty=${result.quantity}, unit=${result.unit}, price=${result.unitPrice}, total=${result.totalPrice}`);

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