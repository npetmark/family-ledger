import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { en } from "@/lib/i18n/translations/en";
import { bg } from "@/lib/i18n/translations/bg";

describe("Transactions page timeline and collapse/expand", () => {
  it("formats short date pattern as dd/MM/yy", () => {
    const d = new Date(2026, 10, 5); // 5 Nov 2026
    expect(format(d, "dd/MM/yy")).toBe("05/11/26");
  });

  it("contains expandAll and collapseAll translations in both en and bg", () => {
    expect(en.transactions.expandAll).toBe("Expand All");
    expect(en.transactions.collapseAll).toBe("Collapse All");
    expect(bg.transactions.expandAll).toBe("Разгъни всички");
    expect(bg.transactions.collapseAll).toBe("Сгъни всички");
  });
});

