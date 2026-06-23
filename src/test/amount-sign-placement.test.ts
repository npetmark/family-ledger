import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard: on narrow mobile widths the +/- sign of a transaction
 * amount must stay inline with the value (no wrapping above/below).
 *
 * The fix relies on two CSS hooks on the amount <span>:
 *   - `whitespace-nowrap` keeps the sign + number on one line
 *   - `flex-shrink-0` prevents the flex parent from squeezing it
 *
 * Additionally, the sign and `formatCurrency(...)` must be rendered
 * inside the SAME element (no intermediate block wrapper) so the
 * browser cannot break between them.
 */

const files = [
  "src/pages/TransactionsPage.tsx",
  "src/components/dashboard/RecentTransactions.tsx",
];

const SIGN_BLOCK_RE =
  /<span[^>]*className=\{?`?[^`"}]*?\}?[^>]*>\s*\{[^}]*transaction_type[^}]*\?\s*["']\+["'][^}]*\}\s*\{formatCurrency\([^)]+\)\}\s*<\/span>/s;

describe("transaction amount sign placement (mobile regression)", () => {
  for (const rel of files) {
    it(`${rel}: amount span keeps sign inline (whitespace-nowrap + flex-shrink-0)`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");

      // Locate the amount span that renders sign + formatCurrency together.
      const match = src.match(
        /<span([^>]*?)>\s*\{[^}]*transaction_type[^}]*["']\+["'][^}]*\}\s*\{formatCurrency\([^)]+\)\}\s*<\/span>/s,
      );
      expect(
        match,
        "Sign and formatCurrency must be rendered inside the same <span> (no wrapper between them)",
      ).toBeTruthy();

      const attrs = match![1];
      expect(attrs, "amount span must have `whitespace-nowrap`").toMatch(
        /whitespace-nowrap/,
      );
      expect(attrs, "amount span must have `flex-shrink-0`").toMatch(
        /flex-shrink-0/,
      );
    });
  }

  it("regex sanity: SIGN_BLOCK_RE is defined", () => {
    expect(SIGN_BLOCK_RE).toBeInstanceOf(RegExp);
  });
});
