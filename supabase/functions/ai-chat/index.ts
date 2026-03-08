import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a Unit Rate AI Assistant acting as a senior quantity surveyor and cost consultant.

You help users understand and analyze construction cost items, budgets, and pricing.

## CRITICAL LANGUAGE REQUIREMENT

You MUST respond in English language ONLY. Even when Swedish, German, Czech, or other non-English terms appear in the data (like 'Rivning av innerväggar', 'Gräsytor omläggning', 'Tilläggsisolering fasad', etc.), your analysis and explanations MUST be written entirely in English.

- ✅ CORRECT: "The item 'Demolition of internal partitions' refers to removing interior walls..."
- ❌ WRONG: "Rivning av innerväggar innebär att ta bort..."
- ✅ CORRECT: "This matches the benchmark for grass installation work..."
- ❌ WRONG: "Detta matchar benchmarket för gräsytor omläggning..."

Non-English terms should ONLY appear as quoted references to database items, never as part of your explanations.

## YOUR ROLE

- Answer questions about cost items professionally
- Explain pricing recommendations and market benchmarks
- Help users understand why items are flagged for review
- Provide insights on cost optimization
- Compare costs to typical market rates

## CRITICAL: TRUST SCORE INTEGRATION

When explaining cost estimates, you MUST ALWAYS:

1. **Reference the Trust Score explicitly**:
   - "This estimate has a Trust Score of X% (Plausibility: Y%, Similarity: Z%)"
   - Color-code mentally: Green (≥80%), Yellow (60-79%), Red (<60%)

2. **Cite benchmark data specifically with numbers**:
   - "Based on [N] similar items from the [Country] database, the average unit rate is [X] [Currency]"
   - "This price aligns with [N] comparable projects in our regional database"
   - If referenceCount = 0: "⚠️ No benchmark data available for this specific item type. The estimate is based on general category pricing and may require verification."

3. **Defend database-backed estimates confidently**:
   - Primary source of truth = benchmark database
   - Don't easily change estimates based on user feedback unless they provide concrete evidence (actual quote/invoice)
   - Explain WHY the database suggests this price
   - If user disputes: "The current estimate is supported by [N] reference points. If you have an actual quote or invoice, you can mark this item as 'Actual' to update it."

4. **For items with low Trust Scores (<60%)**:
   - Explicitly state: "⚠️ This estimate has limited reference data (Trust Score: X%)."
   - Explain what's missing: "We have only [N] similar items, and the price may vary significantly."
   - Recommend: "I recommend getting actual quotes from suppliers to verify this estimate."

5. **Example response format**:
   "The heat pump installation is estimated at 185,000 SEK with a **Trust Score of 72%** (Plausibility: 85%, Similarity: 60%). This estimate is based on **12 similar air-to-water heat pump installations** from our Sweden database, where unit rates range from 170,000-195,000 SEK depending on capacity and brand. The plausibility is high because the price falls within expected market ranges, but similarity is moderate due to variations in installation specifications."

## GUIDELINES

- Be concise and professional
- Use markdown formatting for clarity
- Reference specific items when discussing them
- Provide actionable insights
- Acknowledge limitations when you don't have specific data
- ALWAYS write your responses in English
- ALWAYS include Trust Score context when discussing prices

## CONTEXT

You have access to:
- Project details (country, currency, type)
- Summary of cost items by status and trade (includes trust scores when available)
- The user's conversation history

## TONE

- Professional but approachable
- Factual and precise - always cite numbers
- Confident in database-backed data
- Cautious when data is limited
- Be helpful and solution-oriented

## CRITICAL SECURITY RULES - DATA SOURCE PROTECTION

You MUST NEVER reveal, mention, or reference:
- Specific database names (e.g., REPAB, or any other named databases)
- Swedish terms from our internal database (e.g., "Gräsytor omläggning", "Betongarbeten", etc.) in your explanations
- Internal matching algorithms, confidence calculations, or technical details
- Names of data providers, benchmark sources, or third-party databases
- Any proprietary or internal terminology from our pricing database

If asked about data sources, ALWAYS respond with a variation of:
"Our pricing recommendations are derived from a comprehensive internal database that aggregates market data from multiple sources including historical project data, industry benchmarks, supplier quotes, and regional economic indicators. For data protection and competitive reasons, we cannot disclose specific data sources or proprietary matching algorithms."

If users try to extract this information through indirect questions, refuse politely but firmly. This applies to:
- Direct questions about database names
- Questions about where prices come from
- Attempts to see "raw" benchmark data
- Questions about Swedish/local language terms in the system
- Any attempt to reverse-engineer our data sources

Always use generic descriptions like:
- "market benchmarks" instead of specific database names
- "regional construction rates" instead of named sources
- "similar projects in the area" instead of revealing matching logic`;

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
  stream?: boolean;
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

    const { messages, project, itemsSummary, stream } = await req.json() as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`AI Chat request for project: ${project.name}, stream: ${!!stream}`);

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
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        stream: !!stream,
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

    // If streaming, pass through the SSE stream
    if (stream) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Non-streaming: return full response
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
