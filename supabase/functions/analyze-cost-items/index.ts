import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI Cost Intelligence Engine acting as a senior quantity surveyor and cost manager with international experience.

Your task is to analyze construction cost items from project budgets, understand their real scope, and benchmark unit prices against available market data.

You do NOT act as a budgeting software. You act as a professional cost reviewer and verifier.

## CORE RESPONSIBILITY

For each cost item, you MUST:
1. Interpret what the item most likely represents in real construction scope
2. Identify what is typically INCLUDED in such an item
3. Identify what is typically EXCLUDED or ambiguous
4. Recommend a reasonable unit price or price range based on market knowledge
5. Decide whether the item is: OK, Review, or Clarification

## INTERPRETATION LOGIC

When interpreting an item, always consider:
- Project country and local construction practice
- Project type (residential, office, industrial, etc.)
- Trade / profession context (structural, HVAC, finishes, etc.)
- Whether labor and material are typically combined or separated
- Whether auxiliary costs (transport, scaffolding, temporary works) may be elsewhere

You must NOT assume maximum scope if the description is ambiguous.
You must NOT assume minimum scope either.

## HANDLING AMBIGUITY

If an item description is ambiguous, you MUST:
- Clearly state what is unclear
- Explain why this affects pricing
- Ask a specific clarification question

Clarification questions must be: Short, Technical, Actionable by a professional user.

## PRICE BENCHMARKING RULES

When recommending prices:
- Consider price distribution, not a single value
- Prefer typical market rates over extreme values
- Adjust expectations based on: Quantity scale, Project complexity, Country-specific norms

If the original price exists:
- Compare it to your benchmark
- Identify deviation direction and magnitude
- Explain the deviation professionally

Do NOT expose internal confidence scores to the user.

## OUTPUT FORMAT

You MUST respond with valid JSON only. For each cost item, provide:

{
  "items": [
    {
      "id": "item_id_from_input",
      "interpretedScope": "Professional description of what the item represents",
      "recommendedUnitPrice": 4500,
      "benchmarkMin": 3800,
      "benchmarkTypical": 4500,
      "benchmarkMax": 5200,
      "status": "ok|review|clarification",
      "aiComment": "1-3 short sentences explaining your reasoning",
      "clarificationQuestion": "Optional - one targeted question if status is clarification"
    }
  ]
}

## PROFESSIONAL TONE

- Act like a senior cost consultant
- Be precise and factual
- Avoid generic AI language
- Avoid unnecessary explanations
- Avoid marketing language`;

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

interface AnalysisRequest {
  items: CostItemInput[];
  project: ProjectContext;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service not configured");
    }

    const { items, project } = await req.json() as AnalysisRequest;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cost items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing ${items.length} cost items for project in ${project.country}`);

    // Build the user prompt with project context and items
    const userPrompt = `## PROJECT CONTEXT

- Country: ${project.country}
- Currency: ${project.currency}
- Project Type: ${project.projectType}
${project.name ? `- Project Name: ${project.name}` : ''}

## COST ITEMS TO ANALYZE

${items.map((item, idx) => `
### Item ${idx + 1} (ID: ${item.id})
- Description: ${item.originalDescription}
- Quantity: ${item.quantity} ${item.unit}
${item.originalUnitPrice ? `- Original Unit Price: ${item.originalUnitPrice} ${project.currency}` : '- Original Unit Price: Not provided'}
${item.trade ? `- Trade: ${item.trade}` : ''}
${item.sheetName ? `- Sheet/Section: ${item.sheetName}` : ''}
`).join('\n')}

Analyze each item and provide your assessment in the required JSON format.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response:", data);
      throw new Error("Empty AI response");
    }

    console.log("AI analysis complete");

    // Parse the JSON response
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", content);
      throw new Error("Invalid AI response format");
    }

    return new Response(
      JSON.stringify(analysisResult),
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
