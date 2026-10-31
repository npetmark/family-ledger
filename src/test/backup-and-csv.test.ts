import { describe, it, expect } from "vitest";
import { encryptBackup, decryptBackup, HouseholdBackup } from "@/lib/backup";
import { escapeCsvField } from "@/lib/csvExport";

describe("CSV Export Helpers", () => {
  it("escapes fields with commas, quotes, and newlines correctly", () => {
    expect(escapeCsvField("simple")).toBe("simple");
    expect(escapeCsvField("with,comma")).toBe('"with,comma"');
    expect(escapeCsvField('with "quotes"')).toBe('"with ""quotes"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
    expect(escapeCsvField(42.5)).toBe("42.5");
  });
});

describe("Encrypted Backup & Restore Crypto", () => {
  const sampleBackup: HouseholdBackup = {
    format: "family-ledger-backup-payload",
    version: 1,
    createdAt: "2026-10-31T10:00:00.000Z",
    householdId: "test-household-id-1234",
    data: {
      accounts: [{ id: "acc-1", name: "Main Bank", starting_balance: 10000 }],
      main_categories: [{ id: "cat-1", name: "Needs" }],
      subcategories: [{ id: "sub-1", name: "Groceries" }],
      budgets: [{ id: "b-1", amount: 50000 }],
      transactions: [{ id: "tx-1", amount: 2500, note: "Dinner & drinks" }],
      recurring_transactions: [],
      transaction_templates: [],
      shopping_categories: [],
      shopping_trips: [{ id: "trip-1", name: "Weekend Shop" }],
      shopping_items: [{ id: "item-1", name: "Milk" }],
      shopping_item_dictionary: [],
    },
  };

  it("successfully encrypts and decrypts with the correct password", async () => {
    const password = "mySecretPassword123!";
    const encryptedJson = await encryptBackup(sampleBackup, password);

    expect(typeof encryptedJson).toBe("string");
    const envelope = JSON.parse(encryptedJson);
    expect(envelope.format).toBe("family-ledger-encrypted-backup");
    expect(envelope.salt).toBeDefined();
    expect(envelope.iv).toBeDefined();
    expect(envelope.ciphertext).toBeDefined();

    const decrypted = await decryptBackup(encryptedJson, password);
    expect(decrypted.format).toBe("family-ledger-backup-payload");
    expect(decrypted.householdId).toBe("test-household-id-1234");
    expect(decrypted.data.accounts).toHaveLength(1);
    expect(decrypted.data.accounts[0].name).toBe("Main Bank");
    expect(decrypted.data.transactions[0].note).toBe("Dinner & drinks");
  });

  it("fails to decrypt with an incorrect password", async () => {
    const password = "correctPassword123";
    const wrongPassword = "wrongPassword456";
    const encryptedJson = await encryptBackup(sampleBackup, password);

    await expect(decryptBackup(encryptedJson, wrongPassword)).rejects.toThrow(
      /Decryption failed/i
    );
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const password = "securePassword789";
    const encryptedJson = await encryptBackup(sampleBackup, password);
    const envelope = JSON.parse(encryptedJson);

    // Tamper with ciphertext by corrupting last few characters
    const tampered = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -6) + "AAAAAA",
    };

    await expect(decryptBackup(JSON.stringify(tampered), password)).rejects.toThrow(
      /Decryption failed/i
    );
  });
});
