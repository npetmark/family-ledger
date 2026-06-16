// Match shopping items against znamcenite.bg promotions via their public JSON API.
// Caches the full feed for 6h; translates EN -> BG via Lovable AI when needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_URL = "https://api.znamcenite.bg/api/v1/promotions";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 200;
const MAX_PAGES = 20;

type Promo = {
  title: string;
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

async function fetchAllPromos(): Promise<Promo[]> {
  const out: Promo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API_URL}?page=${page}&pageSize=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 LovableShopBot/1.0", "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`promotions API ${page} -> ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const it of items) {
      if (!it?.title || !it?.supermarketName || it?.currentPrice == null) continue;
      out.push({
        title: it.title,
        normName: normalize(it.title),
        store: it.supermarketName,
        priceCents: Math.round(Number(it.currentPrice) * 100),
        originalPriceCents: it.originalPrice != null ? Math.round(Number(it.originalPrice) * 100) : null,
        discountPct: it.discount != null ? Number(it.discount) : null,
      });
    }
    const totalPages = Number(data?.totalPages ?? 1);
    if (page >= totalPages) break;
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
  try {
    const fresh = await fetchAllPromos();
    if (fresh.length > 0) {
      await admin
        .from("shopping_promotions_cache")
        .upsert({ id: 1, promos: fresh as any, updated_at: new Date().toISOString() });
      return fresh;
    }
  } catch (e) {
    console.error("fetchAllPromos failed", e);
  }
  return (cache?.promos as Promo[]) ?? [];
}

function detectLang(s: string): "bg" | "en" | "other" {
  if (/[\u0400-\u04FF]/.test(s)) return "bg";
  if (/^[A-Za-z\s\d.,'’\-]+$/.test(s)) return "en";
  return "other";
}

async function translateToBg(names: string[], apiKey: string): Promise<Record<string, string>> {
  if (names.length === 0 || !apiKey) return {};
  const prompt =
    `Translate each grocery/shopping item name to Bulgarian (singular, common form, no article, no quantity). ` +
    `Reply ONLY with a JSON object mapping each original name (verbatim key) to its Bulgarian translation. ` +
    `Items: ${JSON.stringify(names)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
  // Tier 1: promo name contains the full query phrase as a word boundary.
  const phraseRe = new RegExp(`(^|\\s)${qNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "u");
  let hits = promos.filter((p) => phraseRe.test(p.normName));
  if (hits.length === 0) {
    // Tier 2: every query token appears as a whole-word match in the promo name.
    hits = promos.filter((p) => {
      const pTokens = new Set(tokenize(p.title));
      return qTokens.every((t) =>
        Array.from(pTokens).some((pt) => pt === t || pt.startsWith(t) || t.startsWith(pt)),
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

    const toTranslate: string[] = [];
    for (const it of items) {
      if (detectLang(it.name) !== "bg") toTranslate.push(it.name);
    }
    const translations = await translateToBg(toTranslate, LOVABLE_API_KEY);

    let updated = 0;
    const results: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const bgName = detectLang(it.name) === "bg" ? it.name : (translations[it.name] ?? it.name);
      const hits = matchPromos(bgName, promos);
      const stores = Array.from(new Set(hits.map((h) => h.store))).sort();
      const lowest = hits.length > 0 ? Math.min(...hits.map((h) => h.priceCents)) : null;
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
