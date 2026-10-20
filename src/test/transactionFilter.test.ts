import { describe, it, expect } from "vitest";
import { matchesTransactionSearch, TransactionSearchItem } from "@/lib/transactionFilter";

describe("matchesTransactionSearch", () => {
  const sampleTx: TransactionSearchItem = {
    id: "tx-1",
    note: "Coffee at Starbucks",
    amount: 499, // 4.99 EUR
    date: "2026-10-15",
    transaction_type: "expense",
    subcategories: {
      name: "Restaurants & Cafes",
      main_categories: { name: "Wants" },
    },
    accounts: {
      name: "UniCredit",
    },
  };

  const transferTx: TransactionSearchItem = {
    id: "tx-2",
    note: "Monthly savings transfer",
    amount: 50000, // 500.00 EUR
    date: "2026-10-01",
    transaction_type: "transfer",
    transfer_to_account_id: "acc-savings",
    accounts: {
      name: "UniCredit",
    },
  };

  const mockAccounts = [
    { id: "acc-unicredit", name: "UniCredit" },
    { id: "acc-savings", name: "Emergency Savings" },
  ];

  it("returns true for empty query", () => {
    expect(matchesTransactionSearch(sampleTx, "")).toBe(true);
    expect(matchesTransactionSearch(sampleTx, "   ")).toBe(true);
  });

  describe("Keyword matching", () => {
    it("matches note keyword case-insensitively", () => {
      expect(matchesTransactionSearch(sampleTx, "coffee")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "STARBUCKS")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "tea")).toBe(false);
    });

    it("matches subcategory name", () => {
      expect(matchesTransactionSearch(sampleTx, "restaurants")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "cafes")).toBe(true);
    });

    it("matches main category name", () => {
      expect(matchesTransactionSearch(sampleTx, "wants")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "needs")).toBe(false);
    });

    it("matches account name", () => {
      expect(matchesTransactionSearch(sampleTx, "unicredit")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "revolut")).toBe(false);
    });

    it("matches destination account name for transfers", () => {
      expect(matchesTransactionSearch(transferTx, "savings", mockAccounts)).toBe(true);
    });

    it("matches transaction type in English and Bulgarian", () => {
      expect(matchesTransactionSearch(sampleTx, "expense")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "разход")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "transfer")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "превод")).toBe(true);
    });
  });

  describe("Amount matching", () => {
    it("matches formatted decimal amount with dot or comma", () => {
      expect(matchesTransactionSearch(sampleTx, "4.99")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "4,99")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "4.9")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "5.00")).toBe(false);
    });

    it("matches raw cents", () => {
      expect(matchesTransactionSearch(sampleTx, "499")).toBe(true);
    });

    it("matches large amounts and whole numbers", () => {
      expect(matchesTransactionSearch(transferTx, "500")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "500.00")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "500,00")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "50000")).toBe(true);
    });
  });

  describe("Date matching", () => {
    it("matches ISO date string substrings", () => {
      expect(matchesTransactionSearch(sampleTx, "2026-10-15")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "10-15")).toBe(true);
    });

    it("matches day of month", () => {
      expect(matchesTransactionSearch(sampleTx, "15")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "01")).toBe(true);
      expect(matchesTransactionSearch(transferTx, "1")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "28")).toBe(false);
    });

    it("matches localized and formatted dates", () => {
      expect(matchesTransactionSearch(sampleTx, "15.10")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "15/10")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "Oct 15")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "15 Oct")).toBe(true);
      expect(matchesTransactionSearch(sampleTx, "October 15")).toBe(true);
    });
  });
});
