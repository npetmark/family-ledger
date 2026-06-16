// Match shopping items against znamcenite.bg promotions.
// Caches the scraped feed for 6h; translates EN -> BG via Lovable AI when needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMO_URL = "https://www.znamcenite.bg/promocii/";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const KNOWN_STORES = ["Billa", "Fantastico", "Kaufland", "Lidl"];

type Promo = {
  name: string;
  normName: string;
  store: string;
  priceCents: number;
  originalPriceCents: number | null;
  discountPct: number | null;
};

function normalize(input: string): string {
  let s = (input ?? "").toLowerCase().trim();
  const hasCyrillic = /[\u0400-\u04FF]/.test(s);
  s = s.normalize(hasCyrillic ? "NFC" : "NFKD");
  if (!hasCyrillic) s = s.replace(/[\u0300-\u036f]/g, "");
  return s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 3);
}

function parsePromoPage(html: string): Promo[] {
  // Match each `<div id="promo-...">...</div>` block (stop at next promo or closing parent grid).
  const blocks = html.split(/<div id="promo-/).slice(1);
  const out: Promo[] = [];
  for (const b of blocks) {
    const block = "<div id=\"promo-" + b;
    const nameMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    let store = "";
    for (const s of KNOWN_STORES) {
      const re = new RegExp(`alt="${s}"\\s+title="${s}"`, "i");
      if (re.test(block)) { store = s; break; }
    }
    if (!store) continue;

    const priceMatch = block.match(/<span class="text-base font-bold tabular-nums[^"]*">€([\d.,]+)<\/span>/);
    if (!priceMatch) continue;
    const originalMatch = block.match(/<span class="text-sm tabular-nums[^"]*line-through[^"]*">€([\d.,]+)<\/span>/);
    const discountMatch = block.match(/>-(\d+)%</);

    const priceCents = Math.round(parseFloat(priceMatch[1].replace(",", ".")) * 100);
    const originalPriceCents = originalMatch
      ? Math.round(parseFloat(originalMatch[1].replace(",", ".")) * 100)
      : null;
    const discountPct = discountMatch ? parseInt(discountMatch[1], 10) : null;

    out.push({
      name,
      normName: normalize(name),
      store,
      priceCents,
      originalPriceCents,
      discountPct,
    });
  }
  return out;
}

async function getPromos(admin: ReturnType<typeof createClient>): Promise<Promo[]> {
  const { data: cache } = await admin
    .from("shopping_promotions_cache")
    .select("promos, updated_at")
    .eq("id", 1)
    .maybeSingle();
  const ageMs = cache?.updated_at
    ? Date.now() - new Date(cache.updated_at as string).getTime()
    : Infinity;
  if (cache && ageMs < CACHE_TTL_MS && Array.isArray(cache.promos) && (cache.promos as Promo[]).length > 0) {
    return cache.promos as Promo[];
  }
  // Refresh
  const res = await fetch(PROMO_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableShopBot/1.0)" },
  });
  if (!res.ok) {
    if (cache?.promos) return cache.promos as Promo[];
    throw new Error(`Failed to fetch promotions: ${res.status}`);
  }
  const html = await res.text();
  const promos = parsePromoPage(html);
  if (promos.length === 0 && cache?.promos) return cache.promos as Promo[];
  await admin
    .from("shopping_promotions_cache")
    .upsert({ id: 1, promos: promos as any, updated_at: new Date().toISOString() });
  return promos;
}

function detectLang(s: string): "bg" | "en" | "other" {
  if (/[\u0400-\u04FF]/.test(s)) return "bg";
  if (/^[A-Za-z\s\d.,'’\-]+$/.test(s)) return "en";
  return "other";
}

async function translateToBg(names: string[], apiKey: string): Promise<Record<string, string>> {
  if (names.length === 0) return {};
  const prompt =
    `Translate each grocery item name to Bulgarian (singular, common form, no article, no quantity). ` +
    `Reply ONLY with a JSON object mapping the original English name to its Bulgarian translation. ` +
    `Items: ${JSON.stringify(names)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a precise translator. Output JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("translate failed", res.status, await res.text());
    return {};
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text);
    const out: Record<string, string> = {};
    for (const k of Object.keys(parsed)) out[k] = String(parsed[k]);
    return out;
  } catch {
    return {};
  }
}

function matchPromos(queryBg: string, promos: Promo[]): Promo[] {
  const qTokens = tokenize(queryBg);
  if (qTokens.length === 0) return [];
  const qNorm = normalize(queryBg);
  // Tier 1: promo name contains the full query phrase.
  let hits = promos.filter((p) => p.normName.includes(qNorm));
  if (hits.length === 0) {
    // Tier 2: every query token appears in the promo name.
    hits = promos.filter((p) => {
      const pTokens = new Set(tokenize(p.name));
      return qTokens.every((t) =>
        Array.from(pTokens).some((pt) => pt.includes(t) || t.includes(pt)),
      );
    });
  }
  return hits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const itemIds: string[] = Array.isArray(body?.item_ids) ? body.item_ids.slice(0, 200) : [];
    if (itemIds.length === 0) {
      return new Response(JSON.stringify({ error: "item_ids required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: items, error: itemsErr } = await admin
      .from("shopping_items")
      .select("id, name, user_id")
      .in("id", itemIds)
      .eq("user_id", user.id);
    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promos = await getPromos(admin);

    // Translation pass for non-BG names
    const toTranslate: string[] = [];
    for (const it of items) {
      if (detectLang(it.name) !== "bg") toTranslate.push(it.name);
    }
    let translations: Record<string, string> = {};
    if (toTranslate.length > 0 && LOVABLE_API_KEY) {
      translations = await translateToBg(toTranslate, LOVABLE_API_KEY);
    }

    let updated = 0;
    const results: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const bgName = detectLang(it.name) === "bg" ? it.name : (translations[it.name] ?? it.name);
      const hits = matchPromos(bgName, promos);
      const stores = Array.from(new Set(hits.map((h) => h.store))).sort();
      const lowest = hits.length > 0
        ? Math.min(...hits.map((h) => h.priceCents))
        : null;
      await admin
        .from("shopping_items")
        .update({
          promo_stores: stores.length > 0 ? stores : null,
          promo_price_cents: lowest,
          promo_checked_at: new Date().toISOString(),
        })
        .eq("id", it.id);
      updated++;
      results.push({ id: it.id, bgName, stores, lowest, hits: hits.length });
    }

    return new Response(JSON.stringify({ updated, results, promoCount: promos.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("match-shopping-promo error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
