// Translates a Bulgarian (or other-language) shopping item to English and
// picks the best matching category from the user's category list.
//
// Request:  { name: string, categories: [{ id, name }] }
// Response: { english_name: string, quantity: string | null, category_id: string | null, category_name: string | null }
//
// Uses Lovable AI Gateway with google/gemini-3-flash-preview.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CategoryRef { id: string; name: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const name: string = typeof body?.name === "string" ? body.name.trim() : "";
    const categories: CategoryRef[] = Array.isArray(body?.categories) ? body.categories : [];

    if (!name) {
      return new Response(JSON.stringify({ error: "name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (categories.length === 0) {
      return new Response(JSON.stringify({ error: "categories list is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoryList = categories.map((c) => `- ${c.name}`).join("\n");

    const systemPrompt =
      `You normalize grocery shopping list items. Given an item the user typed (possibly Bulgarian, Cyrillic, multi-word, or containing extra details/brands like "Кисело мляко: Млечна планета"), do THREE things:\n` +
      `1) Identify the 1 or more key words representing the actual product (ignoring brands, quantities, and extra text). Translate these key words to a clean, idiomatic English grocery name (title case, singular or plural as natural — e.g. "cherry tomatoes", "strained yogurt", "Himalayan salt", "orange juice"). If it's already English, lightly normalize it. Do not include the quantity in this name.\n` +
      `2) Extract any quantity or unit mentioned (e.g. "1 Kg", "2 pieces", "500g"). If no quantity is mentioned, leave it null.\n` +
      `3) Pick the single best-fit category for this core product from this exact list:\n${categoryList}\n` +
      `Reply ONLY as compact JSON: {"english_name":"...", "quantity":"...", "category_name":"..."}. The category_name MUST match one of the listed names exactly. No prose, no markdown.`;

    const aiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-3.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: name },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      return new Response(JSON.stringify({ error: "AI gateway error", status: aiResp.status, detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: { english_name?: string; quantity?: string | null; category_name?: string } = {};
    try { parsed = JSON.parse(content); } catch {
      // Try to extract a JSON object from any surrounding text
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const english_name = (parsed.english_name ?? "").trim() || name;
    const quantity = parsed.quantity ? parsed.quantity.trim() : null;
    const matchedCat = categories.find(
      (c) => c.name.toLowerCase() === (parsed.category_name ?? "").trim().toLowerCase(),
    ) ?? null;

    return new Response(
      JSON.stringify({
        english_name,
        quantity,
        category_id: matchedCat?.id ?? null,
        category_name: matchedCat?.name ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
