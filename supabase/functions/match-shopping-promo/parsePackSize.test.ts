import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parsePackSize } from "./index.ts";

Deno.test("parsePackSize - Bulgarian piece counts", () => {
  assertEquals(parsePackSize("Яйца размер L 10 бр"), 10);
  assertEquals(parsePackSize("Яйца M 6бр"), 6);
  assertEquals(parsePackSize("Кренвирши 6 бройки"), 6);
  assertEquals(parsePackSize("Кифли 4 броя"), 4);
  assertEquals(parsePackSize("Яйца 30 бр."), 30);
  assertEquals(parsePackSize("Яйца 20бр"), 20);
});

Deno.test("parsePackSize - English piece counts", () => {
  assertEquals(parsePackSize("Eggs Large 10 pcs"), 10);
  assertEquals(parsePackSize("Eggs 6 pieces"), 6);
  assertEquals(parsePackSize("Coca-Cola 6 pc"), 6);
  assertEquals(parsePackSize("Beer 12 ct"), 12);
});

Deno.test("parsePackSize - multipack notation Nx<size>", () => {
  assertEquals(parsePackSize("Бира 6x500 мл"), 6);
  assertEquals(parsePackSize("Вода 4×1.5 л"), 4);
  assertEquals(parsePackSize("Coca-Cola 6 x 330 ml"), 6);
});

Deno.test("parsePackSize - returns null for per-weight/per-volume titles", () => {
  assertEquals(parsePackSize("Пилешко филе кг"), null);
  assertEquals(parsePackSize("Мляко 1 л"), null);
  assertEquals(parsePackSize("Сирене 500 г"), null);
  assertEquals(parsePackSize("Olive oil 1 L"), null);
  assertEquals(parsePackSize(""), null);
});

Deno.test("parsePackSize - ignores out-of-range counts", () => {
  // Single-piece items are not "packs" — return null.
  assertEquals(parsePackSize("Хляб 1 бр"), null);
  // Absurdly large numbers are likely weights/codes, not pack counts.
  assertEquals(parsePackSize("Article 500 бр"), null);
});

Deno.test("parsePackSize - prefers explicit piece count over multipack notation", () => {
  // Both "10 бр" and a stray "x" — piece count wins.
  assertEquals(parsePackSize("Яйца L 10 бр размер XL"), 10);
});
