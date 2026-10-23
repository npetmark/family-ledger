import { describe, it, expect } from "vitest";
import { translateCategory, translateAccountType } from "@/lib/i18n/categories";
import { en } from "@/lib/i18n/translations/en";
import { bg } from "@/lib/i18n/translations/bg";

describe("i18n system tests", () => {
  describe("translateCategory", () => {
    it("translates system main categories between English and Bulgarian", () => {
      expect(translateCategory("Needs", "bg")).toBe("Нужди");
      expect(translateCategory("Нужди", "en")).toBe("Needs");
      expect(translateCategory("Wants", "bg")).toBe("Желания");
      expect(translateCategory("Желания", "en")).toBe("Wants");
      expect(translateCategory("Investments", "bg")).toBe("Инвестиции");
      expect(translateCategory("Income", "bg")).toBe("Приходи");
    });

    it("translates system subcategories between English and Bulgarian", () => {
      expect(translateCategory("Groceries", "bg")).toBe("Пазар");
      expect(translateCategory("Пазар", "en")).toBe("Groceries");
      expect(translateCategory("Rent", "bg")).toBe("Наем");
      expect(translateCategory("Dining Out", "bg")).toBe("Ресторанти");
      expect(translateCategory("Salary", "bg")).toBe("Заплата");
    });

    it("translates system shopping categories", () => {
      expect(translateCategory("Produce", "bg")).toBe("Плодове и зеленчуци");
      expect(translateCategory("Bakery", "bg")).toBe("Хляб и тестени");
      expect(translateCategory("Excess (not on list)", "bg")).toBe("Извън списъка (допълнителни)");
      expect(translateCategory("Other", "bg")).toBe("Други");
    });

    it("leaves custom user text untouched (language-agnostic)", () => {
      // User's specific example: UniCredit account name
      expect(translateCategory("UniCredit", "bg")).toBe("UniCredit");
      expect(translateCategory("UniCredit", "en")).toBe("UniCredit");

      // Custom user categories/accounts
      expect(translateCategory("My Custom Hobby", "bg")).toBe("My Custom Hobby");
      expect(translateCategory("Kaufland Trip", "bg")).toBe("Kaufland Trip");
      expect(translateCategory("DSK Bank EUR", "bg")).toBe("DSK Bank EUR");
      expect(translateCategory("Revolut Vault", "bg")).toBe("Revolut Vault");
    });

    it("handles null or empty gracefully", () => {
      expect(translateCategory(null, "bg")).toBe("");
      expect(translateCategory(undefined, "en")).toBe("");
      expect(translateCategory("", "bg")).toBe("");
    });
  });

  describe("translateAccountType", () => {
    it("translates standard account types", () => {
      expect(translateAccountType("cash", "bg")).toBe("В брой");
      expect(translateAccountType("cash", "en")).toBe("Cash");
      expect(translateAccountType("bank", "bg")).toBe("Банкова сметка");
      expect(translateAccountType("bank", "en")).toBe("Bank Account");
      expect(translateAccountType("investment", "bg")).toBe("Инвестиция");
      expect(translateAccountType("investment", "en")).toBe("Investment");
      expect(translateAccountType("custom", "bg")).toBe("Друг");
      expect(translateAccountType("custom", "en")).toBe("Custom");
    });

    it("falls back to raw string for non-system types", () => {
      expect(translateAccountType("crypto_wallet", "bg")).toBe("crypto_wallet");
    });
  });

  describe("Translation dictionaries consistency", () => {
    it("ensures English and Bulgarian dictionaries have identical top-level keys", () => {
      const enKeys = Object.keys(en).sort();
      const bgKeys = Object.keys(bg).sort();
      expect(bgKeys).toEqual(enKeys);
    });

    it("ensures all sub-keys match across languages", () => {
      for (const section of Object.keys(en) as (keyof typeof en)[]) {
        const enSectionKeys = Object.keys(en[section]).sort();
        const bgSectionKeys = Object.keys(bg[section]).sort();
        expect(bgSectionKeys).toEqual(enSectionKeys);
      }
    });
  });
});
