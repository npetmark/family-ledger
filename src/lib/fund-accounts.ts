// Mapping of fund account names to their corresponding subcategory names.
// Transfers to these accounts will be tagged with the subcategory for budget tracking.
export const FUND_ACCOUNT_TO_SUBCATEGORY: Record<string, string> = {
  "Mortgage": "Ипотека",
  "Travel": "Пътуване",
  "Zhara": "Жара",
  "Pension": "Пенсии",
  "Emergency": "Аварии",
};

/**
 * Given a destination account name and a list of subcategories,
 * returns the matching subcategory ID if the account is a tracked fund.
 */
export function getFundSubcategoryId(
  destAccountName: string,
  subcategories: { id: string; name: string }[]
): string | null {
  const subcategoryName = FUND_ACCOUNT_TO_SUBCATEGORY[destAccountName];
  if (!subcategoryName) return null;
  const match = subcategories.find((s) => s.name === subcategoryName);
  return match?.id ?? null;
}
