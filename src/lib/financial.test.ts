import { describe, it, expect } from "vitest";
import { 
  formatCurrency, 
  parseCurrencyToCents, 
  percentage, 
  getMonthYear,
  getTransactionTypeColor,
  getBudgetTarget,
  isIncomeCategory,
  getMainCategoryOrder
} from "./financial";

describe("financial.ts characterization tests", () => {
  describe("formatCurrency", () => {
    it("formats standard amounts", () => {
      // Default is EUR, en-US locale usually puts symbol first
      expect(formatCurrency(1050)).toBe("€10.50");
      expect(formatCurrency(0)).toBe("€0.00");
    });

    it("formats negative amounts", () => {
      expect(formatCurrency(-525)).toBe("-€5.25");
    });

    it("formats with specific currencies", () => {
      expect(formatCurrency(1000, "USD")).toBe("$10.00");
      expect(formatCurrency(1000, "GBP")).toBe("£10.00");
    });
  });

  describe("parseCurrencyToCents", () => {
    it("parses standard decimal strings", () => {
      expect(parseCurrencyToCents("10.50")).toBe(1050);
      expect(parseCurrencyToCents("10")).toBe(1000);
      expect(parseCurrencyToCents("0")).toBe(0);
    });

    it("parses negative amounts", () => {
      expect(parseCurrencyToCents("-5.25")).toBe(-525);
    });

    it("handles rounding", () => {
      expect(parseCurrencyToCents("10.504")).toBe(1050);
      expect(parseCurrencyToCents("10.505")).toBe(1051); // Math.round behavior
    });

    it("handles invalid/empty inputs", () => {
      expect(parseCurrencyToCents("")).toBe(0);
      expect(parseCurrencyToCents("abc")).toBe(0);
      expect(parseCurrencyToCents("10abc50")).toBe(105000); // cleans non-numeric
    });
  });

  describe("percentage", () => {
    it("calculates simple percentages", () => {
      expect(percentage(10, 100)).toBe(10);
      expect(percentage(50, 100)).toBe(50);
    });

    it("handles rounding to 1 decimal place", () => {
      expect(percentage(1, 3)).toBe(33.3);
      expect(percentage(2, 3)).toBe(66.7);
    });

    it("handles zero total to avoid division by zero", () => {
      expect(percentage(10, 0)).toBe(0);
      expect(percentage(0, 0)).toBe(0);
    });
    
    it("handles negative parts", () => {
      expect(percentage(-10, 100)).toBe(-10);
    });
  });

  describe("getMonthYear", () => {
    it("formats dates as YYYY-MM", () => {
      const date = new Date("2026-05-15T12:00:00Z");
      expect(getMonthYear(date)).toBe("2026-05");
    });
  });

  describe("getTransactionTypeColor", () => {
    it("returns correct tailwind classes", () => {
      expect(getTransactionTypeColor("income")).toBe("text-income");
      expect(getTransactionTypeColor("expense")).toBe("text-expense");
      expect(getTransactionTypeColor("transfer")).toBe("text-transfer");
      expect(getTransactionTypeColor("unknown")).toBe("text-foreground");
    });
  });

  describe("getBudgetTarget", () => {
    it("returns 50/20/30 targets for Bulgarian category names", () => {
      expect(getBudgetTarget("Нужди")).toBe(50);
      expect(getBudgetTarget("Желания")).toBe(20);
      expect(getBudgetTarget("Инвестиции")).toBe(30);
    });

    it("returns 50/20/30 targets for new user English category names", () => {
      expect(getBudgetTarget("Needs")).toBe(50);
      expect(getBudgetTarget("Wants")).toBe(20);
      expect(getBudgetTarget("Investments")).toBe(30);
    });

    it("handles case-insensitivity and leading/trailing whitespace", () => {
      expect(getBudgetTarget(" needs ")).toBe(50);
      expect(getBudgetTarget("WANTS")).toBe(20);
      expect(getBudgetTarget("investments")).toBe(30);
      expect(getBudgetTarget(" нужди ")).toBe(50);
    });

    it("returns undefined for custom or invalid categories", () => {
      expect(getBudgetTarget("Groceries")).toBeUndefined();
      expect(getBudgetTarget("Income")).toBeUndefined();
      expect(getBudgetTarget("")).toBeUndefined();
      expect(getBudgetTarget(null)).toBeUndefined();
    });
  });

  describe("isIncomeCategory", () => {
    it("identifies income categories in Bulgarian and English", () => {
      expect(isIncomeCategory("Приходи")).toBe(true);
      expect(isIncomeCategory("Income")).toBe(true);
      expect(isIncomeCategory(" income ")).toBe(true);
      expect(isIncomeCategory("Needs")).toBe(false);
      expect(isIncomeCategory("Нужди")).toBe(false);
      expect(isIncomeCategory(null)).toBe(false);
    });
  });

  describe("getMainCategoryOrder", () => {
    it("orders Income, Needs, Wants, Investments first in both languages", () => {
      expect(getMainCategoryOrder("Приходи")).toBe(0);
      expect(getMainCategoryOrder("Income")).toBe(0);
      expect(getMainCategoryOrder("Нужди")).toBe(1);
      expect(getMainCategoryOrder("Needs")).toBe(1);
      expect(getMainCategoryOrder("Желания")).toBe(2);
      expect(getMainCategoryOrder("Wants")).toBe(2);
      expect(getMainCategoryOrder("Инвестиции")).toBe(3);
      expect(getMainCategoryOrder("Investments")).toBe(3);
      expect(getMainCategoryOrder("Other")).toBe(999);
    });
  });
});
