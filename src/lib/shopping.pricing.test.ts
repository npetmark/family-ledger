import { describe, it, expect } from "vitest";
import {
  computeBillableUnits,
  computeLineTotalCents,
  rankStoresByDeals,
  type RankableItem,
} from "./shopping";

// All prices are in cents (BIGINT-safe). Per project rule: no floating-point money math.

describe("computeBillableUnits", () => {
  it("defaults to 1 unit when quantity is missing or zero", () => {
    expect(computeBillableUnits({})).toBe(1);
    expect(computeBillableUnits({ quantity: 0 })).toBe(1);
    expect(computeBillableUnits({ quantity: null })).toBe(1);
  });

  it("returns the raw quantity for unitless / per-unit items", () => {
    expect(computeBillableUnits({ quantity: 1 })).toBe(1);
    expect(computeBillableUnits({ quantity: 2 })).toBe(2);
    expect(computeBillableUnits({ quantity: 0.5 })).toBe(0.5); // 500 g
    expect(computeBillableUnits({ quantity: 1.75 })).toBe(1.75); // 1.75 L
  });

  it("rounds up to whole packs when pack_size is set", () => {
    // 20 eggs requested, sold in boxes of 10 → 2 packs
    expect(computeBillableUnits({ quantity: 20, pack_size: 10 })).toBe(2);
    // 6 eggs requested, sold in boxes of 10 → still 1 pack (you can't buy 0.6 of a box)
    expect(computeBillableUnits({ quantity: 6, pack_size: 10 })).toBe(1);
    // 25 eggs, box of 10 → 3 packs
    expect(computeBillableUnits({ quantity: 25, pack_size: 10 })).toBe(3);
    // 20 eggs, box of 6 → ceil(20/6) = 4 packs
    expect(computeBillableUnits({ quantity: 20, pack_size: 6 })).toBe(4);
    // 30 eggs, box of 30 → exactly 1 pack
    expect(computeBillableUnits({ quantity: 30, pack_size: 30 })).toBe(1);
  });

  it("handles fractional quantities against a pack size by rounding up to whole packs", () => {
    // 2.5 eggs requested, pack of 10 → 1 pack (you can't buy a quarter of a box)
    expect(computeBillableUnits({ quantity: 2.5, pack_size: 10 })).toBe(1);
    // 10.5 eggs, pack of 10 → 2 packs
    expect(computeBillableUnits({ quantity: 10.5, pack_size: 10 })).toBe(2);
    // 0.1 of a pack still rounds up to 1
    expect(computeBillableUnits({ quantity: 0.1, pack_size: 10 })).toBe(1);
  });
});


describe("computeLineTotalCents", () => {
  it("returns 0 when no promo price is set", () => {
    expect(computeLineTotalCents({ quantity: 5 })).toBe(0);
    expect(computeLineTotalCents({ promo_price_cents: null, quantity: 3 })).toBe(0);
  });

  it("multiplies promo price by quantity for kg-based items", () => {
    // chicken @ €0.29/kg, 2 kg → €0.58
    expect(computeLineTotalCents({ promo_price_cents: 29, quantity: 2 })).toBe(58);
    // beef @ €12.50/kg, 0.5 kg → €6.25
    expect(computeLineTotalCents({ promo_price_cents: 1250, quantity: 0.5 })).toBe(625);
  });

  it("multiplies promo price by quantity for litre-based items", () => {
    // milk @ €1.39/L, 3 L → €4.17
    expect(computeLineTotalCents({ promo_price_cents: 139, quantity: 3 })).toBe(417);
    // juice @ €2.49/L, 1.5 L → €3.735 → rounds to €3.74
    expect(computeLineTotalCents({ promo_price_cents: 249, quantity: 1.5 })).toBe(374);
  });

  it("multiplies promo price by quantity for piece-based items", () => {
    // apples @ €0.45/pc, 6 pcs → €2.70
    expect(computeLineTotalCents({ promo_price_cents: 45, quantity: 6 })).toBe(270);
  });

  it("treats missing quantity as 1 unit", () => {
    expect(computeLineTotalCents({ promo_price_cents: 199 })).toBe(199);
    expect(computeLineTotalCents({ promo_price_cents: 199, quantity: 0 })).toBe(199);
  });

  it("uses pack_size for items sold in fixed bundles (eggs)", () => {
    // Pack of 10 eggs for €2.00. User wants 20 eggs → 2 packs → €4.00.
    expect(
      computeLineTotalCents({ promo_price_cents: 200, quantity: 20, pack_size: 10 }),
    ).toBe(400);
    // Same pack, user wants 6 eggs → still 1 pack → €2.00 (NOT 6 × €2.00).
    expect(
      computeLineTotalCents({ promo_price_cents: 200, quantity: 6, pack_size: 10 }),
    ).toBe(200);
    // Pack of 6 for €1.50, user wants 20 → ceil(20/6) = 4 packs → €6.00.
    expect(
      computeLineTotalCents({ promo_price_cents: 150, quantity: 20, pack_size: 6 }),
    ).toBe(600);
    // Pack of 30 for €5.99, user wants 30 → exactly 1 pack → €5.99.
    expect(
      computeLineTotalCents({ promo_price_cents: 599, quantity: 30, pack_size: 30 }),
    ).toBe(599);
  });
});

describe("rankStoresByDeals", () => {
  const baseItem = (over: Partial<RankableItem> & { id: string }): RankableItem => ({
    promo_price_cents: 100,
    quantity: 1,
    promo_stores: ["Kaufland"],
    ...over,
  });

  it("ignores items without a promo or without stores", () => {
    const result = rankStoresByDeals([
      baseItem({ id: "1", promo_price_cents: null }),
      baseItem({ id: "2", promo_stores: [] }),
      baseItem({ id: "3", promo_stores: null }),
    ]);
    expect(result.promoItemCount).toBe(0);
    expect(result.ranked).toEqual([]);
    expect(result.bestPossibleTotal).toBe(0);
  });

  it("ranks primarily by number of matching items per store", () => {
    const items: RankableItem[] = [
      baseItem({ id: "1", promo_stores: ["Kaufland"] }),
      baseItem({ id: "2", promo_stores: ["Kaufland"] }),
      baseItem({ id: "3", promo_stores: ["Kaufland"] }),
      baseItem({ id: "4", promo_stores: ["Kaufland"] }),
      baseItem({ id: "5", promo_stores: ["Kaufland"] }),
      baseItem({ id: "6", promo_stores: ["Lidl"] }),
      baseItem({ id: "7", promo_stores: ["Lidl"] }),
      baseItem({ id: "8", promo_stores: ["Lidl"] }),
      baseItem({ id: "9", promo_stores: ["Fantastico"] }),
    ];
    const { ranked } = rankStoresByDeals(items);
    expect(ranked.map((r) => r.store)).toEqual(["Kaufland", "Lidl", "Fantastico"]);
    expect(ranked[0].count).toBe(5);
  });

  it("breaks ties on count by lowest total promo price (with quantity applied)", () => {
    const items: RankableItem[] = [
      // Both stores match 2 items, but Lidl is cheaper overall.
      baseItem({ id: "a", promo_stores: ["Kaufland"], promo_price_cents: 500, quantity: 2 }), // 1000
      baseItem({ id: "b", promo_stores: ["Kaufland"], promo_price_cents: 300, quantity: 1 }), // 300 → 1300
      baseItem({ id: "c", promo_stores: ["Lidl"], promo_price_cents: 400, quantity: 2 }),     // 800
      baseItem({ id: "d", promo_stores: ["Lidl"], promo_price_cents: 200, quantity: 1 }),     // 200 → 1000
    ];
    const { ranked } = rankStoresByDeals(items);
    expect(ranked[0].store).toBe("Lidl");
    expect(ranked[0].total).toBe(1000);
    expect(ranked[1].total).toBe(1300);
  });

  it("applies pack_size when computing per-store totals", () => {
    const items: RankableItem[] = [
      // Eggs: 20 needed, pack of 10 for €2.00 at Kaufland → 2 packs = €4.00 (NOT €40.00).
      baseItem({
        id: "eggs",
        promo_stores: ["Kaufland"],
        promo_price_cents: 200,
        quantity: 20,
        pack_size: 10,
      }),
    ];
    const { ranked, bestPossibleTotal } = rankStoresByDeals(items);
    expect(ranked[0].total).toBe(400);
    expect(bestPossibleTotal).toBe(400);
  });

  it("counts an item for every store it has a promo at", () => {
    const items: RankableItem[] = [
      baseItem({ id: "1", promo_stores: ["Kaufland", "Lidl"] }),
    ];
    const { ranked } = rankStoresByDeals(items);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((r) => r.count === 1)).toBe(true);
  });
});
