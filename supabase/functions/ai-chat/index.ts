import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI Cost Intelligence Assistant acting as a senior quantity surveyor and cost consultant.

You help users understand and analyze construction cost items, budgets, and pricing.

## YOUR ROLE

- Answer questions about cost items professionally
- Explain pricing recommendations and market benchmarks
- Help users understand why items are flagged for review
- Provide insights on cost optimization
- Compare costs to typical market rates

## GUIDELINES

- Be concise and professional
- Use markdown formatting for clarity
- Reference specific items when discussing them
- Provide actionable insights
- Acknowledge limitations when you don't have specific data

## CONTEXT

You have access to:
- Project details (country, currency, type)
- Summary of cost items by status and trade
- The user's conversation history

## TONE

- Professional but approachable
- Factual and precise
- Avoid generic AI language
- Be helpful and solution-oriented`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  project: {
    country: string;
    currency: string;
    projectType: string;
    name?: string;
  };
  itemsSummary?: string;
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

    const { messages, project, itemsSummary } = await req.json() as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`AI Chat request for project: ${project.name}`);

    // Build context-aware system prompt
    let systemContent = SYSTEM_PROMPT;
    systemContent += `\n\n## CURRENT PROJECT\n`;
    systemContent += `- Name: ${project.name || 'Unnamed Project'}\n`;
    systemContent += `- Country: ${project.country}\n`;
    systemContent += `- Currency: ${project.currency}\n`;
    systemContent += `- Type: ${project.projectType}\n`;
    
    if (itemsSummary) {
      systemContent += `\n## ITEMS SUMMARY\n${itemsSummary}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
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

    console.log("AI chat response generated");

    return new Response(
      JSON.stringify({ response: content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("ai-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Chat failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
