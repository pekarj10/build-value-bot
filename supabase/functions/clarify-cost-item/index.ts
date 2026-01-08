import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI Cost Intelligence Engine acting as a senior quantity surveyor reviewing a user's clarification for a construction cost item.

The user has provided additional information about an item that was previously flagged for clarification.

## YOUR TASK

Based on the clarification provided:
1. Re-interpret the scope of work with the new information
2. Update your price recommendation if the clarification changes your assessment
3. Decide the new status: OK or Review (only use Clarification if still unclear)
4. Provide a brief professional comment

## PROFESSIONAL TONE

- Act like a senior cost consultant
- Be precise and factual
- Acknowledge the clarification professionally
- Do NOT argue with the user
- Adapt your recommendation based on their input

## OUTPUT FORMAT

Respond with valid JSON only:

{
  "interpretedScope": "Updated professional description based on clarification",
  "recommendedUnitPrice": 4500,
  "benchmarkMin": 3800,
  "benchmarkTypical": 4500,
  "benchmarkMax": 5200,
  "status": "ok|review|clarification",
  "aiComment": "Brief acknowledgment of clarification and updated assessment"
}`;

interface ClarificationRequest {
  item: {
    id: string;
    originalDescription: string;
    interpretedScope: string;
    quantity: number;
    unit: string;
    originalUnitPrice?: number;
    recommendedUnitPrice: number;
    trade?: string;
    sheetName?: string;
    aiComment: string;
  };
  clarification: string;
  project: {
    country: string;
    currency: string;
    projectType: string;
  };
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

    const { item, clarification, project } = await req.json() as ClarificationRequest;

    if (!item || !clarification) {
      return new Response(
        JSON.stringify({ error: "Missing item or clarification" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing clarification for item ${item.id}`);

    const userPrompt = `## PROJECT CONTEXT

- Country: ${project.country}
- Currency: ${project.currency}
- Project Type: ${project.projectType}

## ORIGINAL ITEM

- Description: ${item.originalDescription}
- Quantity: ${item.quantity} ${item.unit}
${item.originalUnitPrice ? `- Original Unit Price: ${item.originalUnitPrice} ${project.currency}` : '- Original Unit Price: Not provided'}
${item.trade ? `- Trade: ${item.trade}` : ''}
${item.sheetName ? `- Sheet/Section: ${item.sheetName}` : ''}

## PREVIOUS AI INTERPRETATION

${item.interpretedScope}

## PREVIOUS AI COMMENT

${item.aiComment}

## PREVIOUS RECOMMENDED PRICE

${item.recommendedUnitPrice} ${project.currency}

## USER CLARIFICATION

${clarification}

Based on this clarification, provide your updated assessment in the required JSON format.`;

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

    console.log("Clarification processed");

    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", content);
      throw new Error("Invalid AI response format");
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("clarify-cost-item error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
