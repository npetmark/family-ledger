import { describe, it, expect } from "vitest";
import { getCategorizedAccounts, getAccountOwnerName } from "@/components/AccountSelectItems";

describe("AccountSelectItems logic", () => {
  const currentUserId = "user-1";
  const partnerUserId = "user-2";

  const householdMembers = [
    {
      user_id: currentUserId,
      profile: { first_name: "Ivan", last_name: "Markov", display_name: "Ivan Markov" },
    },
    {
      user_id: partnerUserId,
      profile: { first_name: "Maria", last_name: "Markova", display_name: "Maria Markova" },
    },
  ];

  const accounts = [
    { id: "acc-1", name: "Ivan Checking", owner_user_id: currentUserId, sort_order: 1 },
    { id: "acc-2", name: "Family Joint", owner_user_id: null, sort_order: 2 },
    { id: "acc-3", name: "Maria Revolut", owner_user_id: partnerUserId, sort_order: 1 },
    { id: "acc-4", name: "Maria Savings", owner_user_id: partnerUserId, sort_order: 2 },
  ];

  it("resolves owner name correctly for other members and omits for self or joint", () => {
    expect(getAccountOwnerName(partnerUserId, currentUserId, householdMembers)).toBe("Maria");
    expect(getAccountOwnerName(currentUserId, currentUserId, householdMembers)).toBeUndefined();
    expect(getAccountOwnerName(null, currentUserId, householdMembers)).toBeUndefined();
    expect(getAccountOwnerName("unknown-user", currentUserId, householdMembers)).toBeUndefined();
  });

  it("filters to only owned and shared accounts when isTransfer is false", () => {
    const result = getCategorizedAccounts({
      accounts,
      currentUserId,
      householdMembers,
      isTransfer: false,
    });

    expect(result.ownedAccounts.map((a) => a.id)).toEqual(["acc-1", "acc-2"]);
    expect(result.otherAccounts).toHaveLength(0);
  });

  it("categorizes accounts into owned accounts and other accounts when isTransfer is true", () => {
    const result = getCategorizedAccounts({
      accounts,
      currentUserId,
      householdMembers,
      isTransfer: true,
    });

    expect(result.ownedAccounts.map((a) => a.id)).toEqual(["acc-1", "acc-2"]);
    expect(result.otherAccounts.map((a) => a.id)).toEqual(["acc-3", "acc-4"]);
    expect(result.otherAccounts[0].ownerName).toBe("Maria");
    expect(result.otherAccounts[1].ownerName).toBe("Maria");
  });

  it("excludes excludeAccountId from both categories", () => {
    const resultExcludingOwned = getCategorizedAccounts({
      accounts,
      currentUserId,
      householdMembers,
      excludeAccountId: "acc-1",
      isTransfer: true,
    });

    expect(resultExcludingOwned.ownedAccounts.map((a) => a.id)).toEqual(["acc-2"]);
    expect(resultExcludingOwned.otherAccounts.map((a) => a.id)).toEqual(["acc-3", "acc-4"]);

    const resultExcludingOther = getCategorizedAccounts({
      accounts,
      currentUserId,
      householdMembers,
      excludeAccountId: "acc-3",
      isTransfer: true,
    });

    expect(resultExcludingOther.ownedAccounts.map((a) => a.id)).toEqual(["acc-1", "acc-2"]);
    expect(resultExcludingOther.otherAccounts.map((a) => a.id)).toEqual(["acc-4"]);
  });

  it("sorts owned accounts: personal first, then shared, preserving sort_order", () => {
    const mixedAccounts = [
      { id: "acc-shared-1", name: "Shared 1", owner_user_id: null, sort_order: 1 },
      { id: "acc-personal-2", name: "Personal 2", owner_user_id: currentUserId, sort_order: 2 },
      { id: "acc-personal-1", name: "Personal 1", owner_user_id: currentUserId, sort_order: 1 },
      { id: "acc-shared-2", name: "Shared 2", owner_user_id: null, sort_order: 2 },
    ];

    const result = getCategorizedAccounts({
      accounts: mixedAccounts,
      currentUserId,
      householdMembers,
      isTransfer: false,
    });

    expect(result.ownedAccounts.map((a) => a.id)).toEqual([
      "acc-personal-1",
      "acc-personal-2",
      "acc-shared-1",
      "acc-shared-2",
    ]);
  });
});
