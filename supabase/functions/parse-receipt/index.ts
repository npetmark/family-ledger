// Parses a shopping receipt image and matches its line items against the
// current trip's shopping list. Returns matched items (with actual paid
// prices) and unmatched lines that should be added as excess.
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await sb.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { image, trip_id } = body as { image?: string; trip_id?: string };
    if (!image || !trip_id) {
      return new Response(JSON.stringify({ error: "image and trip_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current trip's items so the AI can match against them.
    const { data: items, error: itemsErr } = await sb
      .from("shopping_items")
      .select("id, name, normalized_name, quantity, unit, price_cents, promo_price_cents, promo_pack_size")
      .eq("trip_id", trip_id);
    if (itemsErr) throw itemsErr;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const itemsList = (items ?? []).map((i: any) =>
      `- id="${i.id}" name="${i.name}" qty=${i.quantity}${i.unit ? ` ${i.unit}` : ""}`
    ).join("\n");

    const systemPrompt = `You are a receipt parser. The user uploads a shopping receipt (possibly in Bulgarian or English) and you must:
1. Identify every purchased line item with its TOTAL paid price.
2. Match each line to one of the user's planned shopping list items (by name similarity, language-agnostic — e.g. "Хляб" matches "Bread").
3. Return any line that does NOT match a planned item as "unmatched" — these will be added as excess.

User's planned items:
${itemsList || "(no items)"}

Return ONLY valid JSON of the form:
{
  "matched": [{ "item_id": "<uuid>", "actual_price_cents": <integer cents>, "receipt_name": "<as written on receipt>" }],
  "unmatched": [{ "name": "<clean human name>", "quantity": <number, default 1>, "unit": "<kg|l|pcs|null>", "actual_price_cents": <integer> }],
  "currency_hint": "EUR" | "BGN" | null
}

Rules:
- Prices are in CENTS (integer). E.g. 3.45 lv → 345.
- actual_price_cents is the TOTAL paid for that line (qty × unit price as printed on the receipt), not the unit price.
- Match conservatively — if unsure, leave it unmatched.
- Skip totals, taxes, discounts, change, and other non-product lines.
- Do not invent items not visible on the receipt.`;

    const aiBody = {
      model: "gemini-3.8-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Parse this receipt and match items to my list." },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    };
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      console.error("itemsList length:", itemsList.length);
      return new Response(JSON.stringify({ error: "Receipt parsing failed", upstream: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { matched: [], unmatched: [], currency_hint: null };
    }

    const validIds = new Set((items ?? []).map((i: any) => i.id));
    const matched = Array.isArray(parsed.matched) ? parsed.matched : [];
    const unmatched = Array.isArray(parsed.unmatched) ? parsed.unmatched : [];

    const safeMatched = matched
      .map((m: any) => ({
        item_id: typeof m.item_id === "string" && validIds.has(m.item_id) ? m.item_id : null,
        actual_price_cents: typeof m.actual_price_cents === "number" && m.actual_price_cents >= 0 ? Math.round(m.actual_price_cents) : null,
        receipt_name: typeof m.receipt_name === "string" ? m.receipt_name.slice(0, 200) : "",
      }))
      .filter((m: any) => m.item_id && m.actual_price_cents != null);

    const safeUnmatched = unmatched
      .map((u: any) => ({
        name: typeof u.name === "string" ? u.name.slice(0, 200).trim() : "",
        quantity: typeof u.quantity === "number" && u.quantity > 0 ? u.quantity : 1,
        unit: typeof u.unit === "string" && u.unit.length > 0 && u.unit !== "null" ? u.unit.slice(0, 10) : null,
        actual_price_cents: typeof u.actual_price_cents === "number" && u.actual_price_cents >= 0 ? Math.round(u.actual_price_cents) : 0,
      }))
      .filter((u: any) => u.name);

    return new Response(JSON.stringify({
      matched: safeMatched,
      unmatched: safeUnmatched,
      currency_hint: parsed.currency_hint ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
