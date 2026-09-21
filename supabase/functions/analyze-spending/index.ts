import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Input validation
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transactions, categories, year } = body;

    if (!Array.isArray(transactions) || transactions.length > 12) {
      return new Response(JSON.stringify({ error: "Invalid transactions: must be an array with at most 12 entries" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(categories) || categories.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid categories: must be an array with at most 100 entries" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return new Response(JSON.stringify({ error: "Invalid year: must be an integer between 2000 and 2100" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit payload size by re-serializing validated data
    const safeTransactions = transactions.map((t: Record<string, unknown>) => ({
      month: String(t.month ?? "").slice(0, 20),
      income: Number(t.income) || 0,
      expenses: Number(t.expenses) || 0,
    }));

    const safeCategories = categories.map((c: Record<string, unknown>) => ({
      name: String(c.name ?? "").slice(0, 100),
      total: Number(c.total) || 0,
    }));

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const systemPrompt = `You are a financial analyst assistant for a personal finance app. Analyze the user's spending data and provide actionable insights.

Be concise but specific. Use actual numbers from the data. Structure your response as JSON with these fields:
- summary: A 2-3 sentence overview of the year's finances
- trends: Array of 3-5 trend observations (each: { title: string, description: string, type: "positive" | "negative" | "neutral" })
- suggestions: Array of 3-5 actionable suggestions (each: { title: string, description: string, priority: "high" | "medium" | "low" })
- monthlyInsight: A brief note about the best and worst spending months
- budgetHealth: "healthy" | "warning" | "critical" based on spending patterns

Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Analyze my ${year} financial data:

Categories: ${JSON.stringify(safeCategories)}

Monthly transaction summary: ${JSON.stringify(safeTransactions)}

Provide analysis of spending patterns, trends, and actionable suggestions.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    
    // Try to parse the JSON from the AI response
    let analysis;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        summary: content,
        trends: [],
        suggestions: [],
        monthlyInsight: "",
        budgetHealth: "neutral",
      };
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-spending error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
