import { toast } from "sonner";

/**
 * Lowercase + collapse whitespace. Strips Latin diacritics ("café" → "cafe")
 * but preserves Cyrillic precomposed letters like "й" (which would otherwise
 * decompose into "и" + combining breve and break dictionary lookups).
 */
export function normalizeName(input: string): string {
  const hasCyrillic = /[\u0400-\u04FF]/.test(input);
  const base = hasCyrillic
    ? input.normalize("NFC")
    : input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return base.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Detect language: bg if any Cyrillic letter present, otherwise en. */
export function detectLanguage(input: string): "en" | "bg" | "other" {
  if (/[\u0400-\u04FF]/.test(input)) return "bg";
  if (/[a-zA-Z]/.test(input)) return "en";
  return "other";
}

/** Units we recognise when parsing free-text entries like "chicken 1 kg". */
const KNOWN_UNITS = new Set<string>([
  "kg", "g", "l", "ml", "oz", "lb", "lbs",
  "pc", "pcs", "pack", "packs", "bag", "bags", "can", "cans", "box", "boxes",
  "кг", "г", "гр", "л", "мл", "бр", "броя", "пак",
]);

const UNIT_ALIASES: Record<string, string> = {
  гр: "г",
  броя: "бр",
  pcs: "pc",
  packs: "pack",
  bags: "bag",
  cans: "can",
  boxes: "box",
  lbs: "lb",
};

export interface ParsedShoppingEntry {
  name: string;
  quantity: number;
  unit: string | null;
}

/**
 * Parse "chicken 1 kg" / "сирене 500г" / "apples x3" into name + quantity + unit.
 * If no quantity/unit can be detected, name stays as-is and quantity defaults to 1.
 */
export function parseShoppingEntry(raw: string): ParsedShoppingEntry {
  const input = raw.replace(/\s+/g, " ").trim();
  if (!input) return { name: "", quantity: 1, unit: null };

  // Try leading quantity first: "20 eggs", "20 яйца", "2 kg chicken", "x3 apples"
  const leading = input.match(
    /^(?:[x×]\s*)?(\d+(?:[.,]\d+)?)\s*([A-Za-zА-Яа-я.]{1,6})?\s+(.+)$/u,
  );
  if (leading) {
    const qty = parseFloat(leading[1].replace(",", "."));
    const maybeUnit = (leading[2] ?? "").replace(/\.$/, "").toLowerCase();
    const rest = leading[3].trim();
    if (maybeUnit && KNOWN_UNITS.has(maybeUnit)) {
      return {
        name: rest,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit: UNIT_ALIASES[maybeUnit] ?? maybeUnit,
      };
    }
    // No recognised unit token — the chunk after the number is the full name.
    const name = (maybeUnit ? `${maybeUnit} ${rest}` : rest).trim();
    if (name) {
      return {
        name,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit: null,
      };
    }
  }

  // Trailing "<name> <qty> <unit?>" — "chicken 1 kg", "eggs 20", "сирене 500г"
  const trailing = input.match(
    /^(.+?)\s+(?:[x×]\s*)?(\d+(?:[.,]\d+)?)\s*([A-Za-zА-Яа-я.]{1,6})?\s*$/u,
  );
  if (trailing) {
    const namePart = trailing[1].trim();
    const qty = parseFloat(trailing[2].replace(",", "."));
    let unit = (trailing[3] ?? "").replace(/\.$/, "").toLowerCase() || null;

    if (unit && !KNOWN_UNITS.has(unit)) {
      // Unrecognised trailing token — leave the input alone so we don't lose info.
      return { name: input, quantity: 1, unit: null };
    }
    if (unit && UNIT_ALIASES[unit]) unit = UNIT_ALIASES[unit];

    if (namePart) {
      return {
        name: namePart,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit,
      };
    }
  }

  return { name: input, quantity: 1, unit: null };
}

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Ensure the user has an active shopping trip, returning its id.
 * Auto-creates one named "Shopping — <today>" when none exists.
 */
export async function ensureActiveTrip(userId: string): Promise<string> {
  const { data: existing, error } = await supabase
    .from("shopping_trips")
    .select("id")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;

  const name = `Shopping — ${format(new Date(), "EEE d MMM")}`;
  const { data: created, error: cErr } = await supabase
    .from("shopping_trips")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  if (cErr) throw cErr;
  return created.id;
}

/**
 * Add a single item to the active shopping trip. Accepts a free-text entry
 * like "chicken 1 kg" and parses out the quantity/unit. Auto-categorizes
 * via the dictionary and bumps usage counters.
 */
export async function addShoppingItem(opts: {
  userId: string;
  rawText: string;
  fallbackCategoryId?: string | null;
}): Promise<void> {
  const parsed = parseShoppingEntry(opts.rawText);
  if (!parsed.name) return;

  const tripId = await ensureActiveTrip(opts.userId);
  const norm = normalizeName(parsed.name);
  const lang = detectLanguage(parsed.name);

  // Look up dictionary entry to auto-categorize
  const { data: dict } = await supabase
    .from("shopping_item_dictionary")
    .select("id, category_id, display_name, usage_count, translation_key")
    .eq("user_id", opts.userId)
    .eq("normalized_name", norm)
    .maybeSingle();

  const display = dict?.display_name || parsed.name;
  const categoryId = dict?.category_id ?? opts.fallbackCategoryId ?? null;

  const { data: inserted, error: insertErr } = await supabase
    .from("shopping_items")
    .insert({
      user_id: opts.userId,
      trip_id: tripId,
      category_id: categoryId,
      name: display,
      normalized_name: norm,
      quantity: parsed.quantity,
      unit: parsed.unit,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  if (inserted?.id) {
    triggerPromoLookup([inserted.id]).catch((e) => console.warn("promo lookup failed", e));
  }

  if (dict) {
    await supabase
      .from("shopping_item_dictionary")
      .update({
        usage_count: (dict.usage_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", dict.id);
  } else {
    await supabase.from("shopping_item_dictionary").insert({
      user_id: opts.userId,
      normalized_name: norm,
      display_name: display,
      language: lang,
      category_id: categoryId,
      usage_count: 1,
      last_used_at: new Date().toISOString(),
      translation_key: norm,
    });
  }
}

/**
 * Invokes the match-shopping-promo edge function to enrich shopping items
 * with current promotions scraped from znamcenite.bg. Fire-and-forget safe.
 */
export async function triggerPromoLookup(itemIds: string[]): Promise<void> {
  if (!itemIds || itemIds.length === 0) return;
  const { error } = await supabase.functions.invoke("match-shopping-promo", {
    body: { item_ids: itemIds },
  });
  if (error) throw error;
}


/**
 * Item fields needed to compute the total cost of a single shopping line.
 * Pack size matters for items sold in fixed bundles: a promo "10-pack of eggs
 * for €2.00" means qty=20 eggs costs 2 × €2.00, NOT 20 × €2.00.
 */
export interface PricedLine {
  /** Promo unit price in cents (per 1 unit OR per 1 pack, depending on `pack_size`). */
  promo_price_cents?: number | null;
  /** Quantity the user wants, expressed in the item's `unit` (kg, l, pcs, …). */
  quantity?: number | null;
  /**
   * Optional pack size. When set, the promo price is per-pack and the user's
   * quantity is divided by this and rounded UP to the next whole pack.
   * Example: quantity=20 eggs, pack_size=10 → 2 packs.
   */
  pack_size?: number | null;
}

/** How many billable units (or packs) does this line represent? Always ≥ 1. */
export function computeBillableUnits(line: PricedLine): number {
  const qty = line.quantity && line.quantity > 0 ? line.quantity : 1;
  const pack = line.pack_size && line.pack_size > 0 ? line.pack_size : null;
  if (pack) return Math.max(1, Math.ceil(qty / pack));
  return qty;
}

/**
 * Total cost in cents for one shopping line, taking quantity (kg/l/pcs)
 * and optional pack_size into account. Returns 0 when no promo price is set.
 */
export function computeLineTotalCents(line: PricedLine): number {
  if (line.promo_price_cents == null) return 0;
  return Math.round(line.promo_price_cents * computeBillableUnits(line));
}

export interface RankableItem extends PricedLine {
  id: string;
  promo_stores?: string[] | null;
}

export interface StoreRank {
  store: string;
  count: number;
  total: number;
  itemIds: string[];
}

/**
 * Rank stores by: (1) most promo matches, (2) lowest total promo price,
 * (3) alphabetical for stable ties.
 */
export function rankStoresByDeals(items: RankableItem[]): {
  ranked: StoreRank[];
  promoItemCount: number;
  bestPossibleTotal: number;
} {
  const promoItems = items.filter(
    (i) => Array.isArray(i.promo_stores) && i.promo_stores.length > 0 && i.promo_price_cents != null,
  );
  const byStore = new Map<string, StoreRank>();
  for (const it of promoItems) {
    const lineTotal = computeLineTotalCents(it);
    for (const store of it.promo_stores!) {
      const cur = byStore.get(store) ?? { store, count: 0, total: 0, itemIds: [] };
      cur.count += 1;
      cur.total += lineTotal;
      cur.itemIds.push(it.id);
      byStore.set(store, cur);
    }
  }
  const ranked = Array.from(byStore.values()).sort(
    (a, b) => b.count - a.count || a.total - b.total || a.store.localeCompare(b.store),
  );
  const bestPossibleTotal = promoItems.reduce((s, i) => s + computeLineTotalCents(i), 0);
  return { ranked, promoItemCount: promoItems.length, bestPossibleTotal };
}






export interface UndoableDeleteOptions {
  message: string;
  onConfirm: () => Promise<void> | void;
  onUndo?: () => void;
  durationMs?: number;
}

/**
 * Show a toast with an Undo button. The destructive action only runs if the
 * user doesn't undo within `durationMs` (default 5s). Returns a function that
 * can be used to cancel the pending action manually.
 */
export function scheduleUndoableDelete(opts: UndoableDeleteOptions): () => void {
  const duration = opts.durationMs ?? 5000;
  let cancelled = false;
  const timer = setTimeout(async () => {
    if (cancelled) return;
    try {
      await opts.onConfirm();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
      opts.onUndo?.();
    }
  }, duration);

  toast(opts.message, {
    duration,
    action: {
      label: "Undo",
      onClick: () => {
        cancelled = true;
        clearTimeout(timer);
        opts.onUndo?.();
      },
    },
  });

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
