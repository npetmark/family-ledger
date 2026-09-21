// Match shopping items against znamcenite.bg promotions via their public JSON API.
// Caches the full feed for 6h; uses Lovable AI to both translate EN->BG and
// classify each query into the znamcenite category/subcategory slugs so that
// we only consider promos in the right subcategory (e.g. "chicken fillet"
// matches raw chicken but not chicken meatballs).
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_URL = "https://api.znamcenite.bg/api/v1/promotions";
const CATEGORIES_URL = "https://api.znamcenite.bg/api/v1/categories";
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
  categorySlug: string | null;
  parentCategorySlug: string | null;
  /** Pieces per pack parsed from the title (e.g. "Яйца L 10 бр" → 10). null = not a multi-piece pack. */
  packSize: number | null;
};

type CategoryTree = Array<{
  slug: string;
  name: string;
  children: Array<{ slug: string; name: string }>;
}>;

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

/**
 * Parse pack size from a promo title for items sold in fixed multi-piece bundles
 * (eggs in boxes of 10, beers in 6-packs, etc). Returns null when the price is
 * per kg, per litre, or the title doesn't mention a piece count — in those
 * cases the promo price is already per unit and no division/multiplication
 * adjustment is needed.
 *
 * Examples:
 *   "Яйца размер L 10 бр"        → 10
 *   "Кренвирши 6 бройки"          → 6
 *   "Бира 6x500 мл"               → 6
 *   "Coca-Cola 6 pcs"             → 6
 *   "Мляко 1 л"                   → null (per-litre, not a pack)
 *   "Пилешко филе кг"             → null
 */
export function parsePackSize(title: string): number | null {
  const t = (title ?? "").toLowerCase();

  // Reject obvious per-weight/per-volume titles where there is no piece count.
  // We still allow piece counts to win if both are present (e.g. "6x500 мл").

  // 1) "<N> бр" / "<N> броя" / "<N> бройки" / "<N> pcs" / "<N> pieces" / "<N> ct"
  const piecesRe = /(\d{1,3})\s*(бр(?:оя|ойки|\.)?|pcs?\b|pieces?\b|ct\b|count\b)/u;
  const m1 = t.match(piecesRe);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 2 && n <= 200) return n;
  }

  // 2) "<N>x<size>" / "<N>×<size>" style multipacks ("6x500 мл", "4×0.5 л")
  const multiRe = /(?:^|\s)(\d{1,3})\s*[x×]\s*\d/u;
  const m2 = t.match(multiRe);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n >= 2 && n <= 200) return n;
  }

  return null;
}

/**
 * Fallback pack size for products that are virtually always sold in fixed
 * multi-piece bundles but whose promo titles often omit the count
 * (znamcenite.bg titles like just "Яйца" or "Pressed eggs"). Returns null
 * when no confident default applies.
 *
 * Applied only when `parsePackSize` returned null AND the matched promo
 * looks like the right product class (the matcher already restricted by
 * subcategory, so we can trust the title keyword).
 */
export function defaultPackSize(promoTitle: string, itemName: string): number | null {
  const hay = `${promoTitle} ${itemName}`.toLowerCase();
  // Eggs — typical Bulgarian retail pack is 10.
  if (/(^|\s)(яйц[ае]|egg|eggs)(\s|$)/u.test(hay)) return 10;
  return null;
}

/**
 * Detect the price's base unit from a promo title. znamcenite titles often
 * carry a measurement keyword (кг, kg, л, l, мл, г, бр…) that tells you
 * whether the listed price is per kilogram, per litre, or per piece/pack.
 * Returns a short canonical label ("kg" | "g" | "l" | "ml" | "piece") or
 * null when no unit can be confidently inferred.
 */
export function detectPriceUnit(title: string): "kg" | "g" | "l" | "ml" | "piece" | null {
  const t = (title ?? "").toLowerCase();
  // Per-weight
  if (/(^|\s|\d)(кг|kg)(\s|$|\.)/u.test(t)) return "kg";
  if (/(^|\s|\d)(мл|ml)(\s|$|\.)/u.test(t)) return "ml";
  if (/(^|\s|\d)(л|l)(\s|$|\.)/u.test(t) && !/мл|ml/.test(t)) return "l";
  if (/(^|\s|\d)(г|гр|g)(\s|$|\.)/u.test(t)) return "g";
  // Per-piece / pack
  if (/(\d+\s*(бр|броя|бройки|pcs?|pieces?|ct\b|count\b))/u.test(t)) return "piece";
  return null;
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
        categorySlug: it.categorySlug ?? null,
        parentCategorySlug: it.parentCategorySlug ?? null,
        packSize: parsePackSize(it.title),
      });
    }
    const totalPages = Number(data?.totalPages ?? 1);
    if (page >= totalPages) break;
  }
  return out;
}

async function fetchCategoryTree(): Promise<CategoryTree> {
  try {
    const res = await fetch(CATEGORIES_URL, {
      headers: { "User-Agent": "Mozilla/5.0 LovableShopBot/1.0", "Accept": "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((p: any) => ({
      slug: String(p.slug),
      name: String(p.name),
      children: Array.isArray(p.children)
        ? p.children.map((c: any) => ({ slug: String(c.slug), name: String(c.name) }))
        : [],
    }));
  } catch (e) {
    console.error("fetchCategoryTree failed", e);
    return [];
  }
}

async function getPromos(admin: any): Promise<Promo[]> {
  const { data: cache } = await admin
    .from("shopping_promotions_cache")
    .select("promos, updated_at")
    .eq("id", 1)
    .maybeSingle();
  const ageMs = cache?.updated_at
    ? Date.now() - new Date(cache.updated_at as string).getTime()
    : Infinity;
  const cached = cache?.promos as Promo[] | undefined;
  const hasCategoryInfo = Array.isArray(cached) && cached.length > 0 &&
    cached.some((p) => p && (p.categorySlug || p.parentCategorySlug));
  const hasPackInfo = Array.isArray(cached) && cached.length > 0 &&
    cached.some((p) => p && "packSize" in p);
  if (cached && ageMs < CACHE_TTL_MS && cached.length > 0 && hasCategoryInfo && hasPackInfo) {
    return cached;
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
  return cached ?? [];
}



type ItemClassification = {
  bg: string;
  // subcategory slugs (preferred). If empty, fall back to parents.
  subSlugs: string[];
  // parent slugs allowed when no usable subcategory match exists.
  parentSlugs: string[];
};

async function classifyItems(
  names: string[],
  tree: CategoryTree,
  apiKey: string,
): Promise<Record<string, ItemClassification>> {
  if (names.length === 0 || !apiKey || tree.length === 0) return {};
  const taxonomy = tree.map((p) => ({
    parent: { slug: p.slug, name: p.name },
    subs: p.children.map((c) => ({ slug: c.slug, name: c.name })),
  }));
  const prompt =
    `For each grocery shopping item, do two things:\n` +
    `1. Translate the name to Bulgarian (singular, common form, no quantity).\n` +
    `2. Pick the NARROW subcategory slugs from the taxonomy that contain RAW/CORE products matching the item. ` +
    `Exclude subcategories that merely contain the ingredient but are a different product class. ` +
    `Examples: "chicken fillet" -> ONLY ["pileshko-i-pueshko-meso"] (raw poultry), NOT "kayma-i-mesni-zagotovki" (mince/meatballs) ` +
    `or "kolbasi-i-shunki" parent. "pork" -> ["svinsko-meso"], NOT "kayma-i-mesni-zagotovki". ` +
    `"yogurt" -> ["kiselo-mlyako"]. "cheese" -> ["sirene","kashkaval","meki-sirena","delikatesni-sirena"]. ` +
    `Return up to 4 sub slugs. Also include up to 2 parent slugs as a broader fallback.\n` +
    `Taxonomy: ${JSON.stringify(taxonomy)}\n` +
    `Items: ${JSON.stringify(names)}\n` +
    `Reply with JSON: {"items":{"<original name>":{"bg":"...","subSlugs":[...],"parentSlugs":[...]}}}`;
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "You translate and classify grocery items. Output JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("classifyItems failed", res.status, await res.text());
    return {};
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text);
    const itemsObj = parsed?.items ?? parsed ?? {};
    const validSubs = new Set<string>();
    const validParents = new Set<string>();
    for (const p of tree) {
      validParents.add(p.slug);
      for (const c of p.children) validSubs.add(c.slug);
    }
    const out: Record<string, ItemClassification> = {};
    for (const k of Object.keys(itemsObj)) {
      const v = itemsObj[k] ?? {};
      const subSlugs = Array.isArray(v.subSlugs)
        ? v.subSlugs.map(String).filter((s: string) => validSubs.has(s))
        : [];
      const parentSlugs = Array.isArray(v.parentSlugs)
        ? v.parentSlugs.map(String).filter((s: string) => validParents.has(s))
        : [];
      out[k] = {
        bg: String(v.bg ?? k),
        subSlugs,
        parentSlugs,
      };
    }
    return out;
  } catch (e) {
    console.error("classifyItems parse error", e);
    return {};
  }
}

function matchPromos(
  queryBg: string,
  classification: ItemClassification | undefined,
  promos: Promo[],
): Promo[] {
  const qTokens = tokenize(queryBg);
  if (qTokens.length === 0) return [];
  const qNorm = normalize(queryBg);

  // Restrict promo pool to allowed subcategories (preferred) or parent categories.
  const subSet = new Set(classification?.subSlugs ?? []);
  const parentSet = new Set(classification?.parentSlugs ?? []);
  let pool = promos;
  if (subSet.size > 0) {
    pool = promos.filter((p) => p.categorySlug && subSet.has(p.categorySlug));
  } else if (parentSet.size > 0) {
    pool = promos.filter((p) => p.parentCategorySlug && parentSet.has(p.parentCategorySlug));
  }

  const phraseRe = new RegExp(`(^|\\s)${qNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "u");
  let hits = pool.filter((p) => phraseRe.test(p.normName));
  if (hits.length === 0) {
    hits = pool.filter((p) => {
      const pTokens = new Set(tokenize(p.title));
      return qTokens.every((t) =>
        Array.from(pTokens).some((pt) => pt === t || pt.startsWith(t) || t.startsWith(pt)),
      );
    });
  }
  // If we restricted to a subcategory and the phrase/token match found nothing,
  // accept ALL promos in that subcategory — they're already the right product class.
  if (hits.length === 0 && subSet.size > 0 && pool.length > 0) {
    hits = pool;
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

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
      .select("id, name, user_id, quantity, unit")
      .in("id", itemIds)
      .eq("user_id", user.id);

    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [promos, tree] = await Promise.all([getPromos(admin), fetchCategoryTree()]);

    const classification = await classifyItems(
      items.map((it) => it.name),
      tree,
      GEMINI_API_KEY,
    );

    let updated = 0;
    const results: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const cls = classification[it.name];
      const bgName = cls?.bg ?? it.name;
      const hits = matchPromos(bgName, cls, promos);
      const stores = Array.from(new Set(hits.map((h) => h.store))).sort();
      // Pick the promo with the lowest PER-PIECE price so multi-pack deals
      // (e.g. "10 eggs for €2 = €0.20/egg") win over a single-piece sticker price.
      let bestHit: Promo | null = null;
      let bestPerUnit = Infinity;
      for (const h of hits) {
        const pack = h.packSize && h.packSize > 0 ? h.packSize : 1;
        const perUnit = h.priceCents / pack;
        if (perUnit < bestPerUnit) {
          bestPerUnit = perUnit;
          bestHit = h;
        }
      }
      const resolvedPack = bestHit
        ? (bestHit.packSize ?? defaultPackSize(bestHit.title, it.name))
        : null;

      // Per-store best offer (cheapest per-piece in each store) so the edit
      // dialog can show "Lidl €1.99 · Kaufland €2.30 · Fantastico €2.10".
      const bestByStore = new Map<string, { price_cents: number; pack_size: number | null; title: string; per_unit_cents: number }>();
      for (const h of hits) {
        const pack = h.packSize && h.packSize > 0 ? h.packSize : 1;
        const perUnit = h.priceCents / pack;
        const cur = bestByStore.get(h.store);
        if (!cur || perUnit < cur.per_unit_cents) {
          bestByStore.set(h.store, {
            price_cents: h.priceCents,
            pack_size: h.packSize ?? defaultPackSize(h.title, it.name),
            title: h.title,
            per_unit_cents: perUnit,
          });
        }
      }
      const promoOffers = Array.from(bestByStore.entries())
        .map(([store, v]) => ({
          store,
          price_cents: v.price_cents,
          pack_size: v.pack_size,
          title: v.title,
          unit: detectPriceUnit(v.title),
        }))
        .sort((a, b) => {
          const ap = (a.price_cents) / (a.pack_size && a.pack_size > 0 ? a.pack_size : 1);
          const bp = (b.price_cents) / (b.pack_size && b.pack_size > 0 ? b.pack_size : 1);
          return ap - bp || a.store.localeCompare(b.store);
        });



      // Quantity normalization for piece-counted items.
      // - Fractional pieces don't make sense ("2.5 eggs" → buy 3).
      // - If the best deal is a multi-piece pack, round UP to a whole multiple
      //   of the pack size (10 eggs + 20-pack deal → bump to 20).
      // Weight/volume units (kg, g, l, ml) are left untouched so 0.5 kg etc. stays.
      const isPieceUnit = !it.unit || /^(piece|pieces|pc|pcs|pack|packs|box|boxes|can|cans|bag|bags|бр|броя|пак)$/i.test(it.unit);
      let nextQuantity: number | null = null;
      if (isPieceUnit) {
        const rawQty = Number(it.quantity ?? 0) || 0;
        if (rawQty > 0) {
          const integerQty = Math.ceil(rawQty);
          const pack = resolvedPack && resolvedPack > 1 ? resolvedPack : 1;
          const adjusted = Math.max(pack, Math.ceil(integerQty / pack) * pack);
          if (adjusted !== rawQty) nextQuantity = adjusted;
        }
      }


      await admin
        .from("shopping_items")
        .update({
          promo_stores: stores.length > 0 ? stores : null,
          promo_price_cents: bestHit ? bestHit.priceCents : null,
          promo_pack_size: resolvedPack,
          promo_offers: promoOffers.length > 0 ? promoOffers : null,
          promo_checked_at: new Date().toISOString(),
          ...(nextQuantity !== null ? { quantity: nextQuantity } : {}),
        })
        .eq("id", it.id);

      updated++;
      results.push({
        id: it.id, bgName,
        subSlugs: cls?.subSlugs ?? [],
        parentSlugs: cls?.parentSlugs ?? [],
        stores,
        lowest: bestHit?.priceCents ?? null,
        packSize: resolvedPack,
        adjustedQuantity: nextQuantity,
        hits: hits.length,

      });

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
