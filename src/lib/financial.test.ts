import { describe, it, expect } from "vitest";
import { 
  formatCurrency, 
  parseCurrencyToCents, 
  percentage, 
  getMonthYear,
  getTransactionTypeColor 
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
});
