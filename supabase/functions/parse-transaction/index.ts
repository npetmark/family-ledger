import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const userId = claimsData.claims.sub;

    // Get user's accounts and subcategories for context
    const [accountsRes, subcatsRes] = await Promise.all([
      supabaseClient.from("accounts").select("id, name, account_type").order("sort_order"),
      supabaseClient.from("subcategories").select("id, name, icon, main_category_id, main_categories(name)").eq("is_active", true).order("sort_order"),
    ]);

    const accounts = accountsRes.data || [];
    const subcategories = subcatsRes.data || [];

    const body = await req.json();
    const { message, image } = body;

    if (!message && !image) {
      return new Response(JSON.stringify({ error: "Message or image is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (message && typeof message === "string" && message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message too long (max 2000 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const accountsList = accounts.map((a: any) => `- "${a.name}" (id: ${a.id}, type: ${a.account_type})`).join("\n");
    const categoriesList = subcategories.map((s: any) => `- "${s.name}" under "${s.main_categories?.name}" (id: ${s.id})`).join("\n");

    const systemPrompt = `You are a financial transaction parser for a personal finance app. Your job is to extract transaction details from user messages (text or receipt/notification screenshots).

Available accounts:
${accountsList}

Available subcategories (with main category):
${categoriesList}

For each transaction found, extract:
- transaction_type: "expense", "income", or "transfer"
- amount: number in cents (e.g. 35.23 EUR = 3523)
- account_id: best matching account UUID from the list above
- subcategory_id: best matching subcategory UUID from the list (null for transfers)
- transfer_to_account_id: destination account UUID (only for transfers, otherwise null)
- note: a brief descriptive note
- date: ISO date string (YYYY-MM-DD), default to today if not specified

Rules:
- Match accounts by name similarity (e.g. "UniCredit" → the bank account, "cash" → cash account)
- Match categories by semantic meaning (e.g. "groceries" → the groceries/food subcategory, "salary" → income subcategory)
- If multiple transactions are found (e.g. from a screenshot with multiple notifications), return ALL of them
- Amounts should be in cents (multiply by 100)
- Today's date is ${new Date().toISOString().split("T")[0]}
- IMPORTANT: If the user did NOT specify which account the transaction is from (for expenses/income) or the source/destination accounts (for transfers), do NOT guess. Instead, set "needs_clarification" to true and ask the user in the "message" field which account to use. List the available account names in your question.
- Similarly if amount is missing, ask for it.
- Only set "needs_clarification" to false when you have all required info.

Return ONLY valid JSON with this structure:
{
  "needs_clarification": true/false,
  "transactions": [{ transaction_type, amount, account_id, subcategory_id, transfer_to_account_id, note, date }],
  "message": "friendly summary or clarification question"
}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (image && message) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: message || "Parse the transactions from this image" },
          { type: "image_url", image_url: { url: image } },
        ],
      });
    } else if (image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Parse the transactions from this image" },
          { type: "image_url", image_url: { url: image } },
        ],
      });
    } else {
      messages.push({ role: "user", content: message });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI parsing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { transactions: [], message: "I couldn't parse that. Could you rephrase?" };
    }

    // Validate transactions
    if (parsed.transactions && Array.isArray(parsed.transactions)) {
      parsed.transactions = parsed.transactions.map((t: any) => ({
        transaction_type: ["expense", "income", "transfer"].includes(t.transaction_type) ? t.transaction_type : "expense",
        amount: typeof t.amount === "number" && t.amount > 0 ? Math.round(t.amount) : 0,
        account_id: accounts.some((a: any) => a.id === t.account_id) ? t.account_id : accounts[0]?.id || null,
        subcategory_id: subcategories.some((s: any) => s.id === t.subcategory_id) ? t.subcategory_id : null,
        transfer_to_account_id: t.transaction_type === "transfer" && accounts.some((a: any) => a.id === t.transfer_to_account_id) ? t.transfer_to_account_id : null,
        note: typeof t.note === "string" ? t.note.slice(0, 500) : "",
        date: t.date || new Date().toISOString().split("T")[0],
      }));
      // Filter out invalid
      parsed.transactions = parsed.transactions.filter((t: any) => t.amount > 0 && t.account_id);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-transaction error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
