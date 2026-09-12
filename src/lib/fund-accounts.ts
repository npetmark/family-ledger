// Mapping of keywords found in fund account names to their corresponding subcategory names.
// Transfers to accounts containing these keywords will be tagged with the subcategory for budget tracking.
export const FUND_KEYWORD_TO_SUBCATEGORY: Record<string, string> = {
  "Mortgage": 'Фонд "Ипотека"',
  "Travel": 'Фонд "Пътувания"',
  "Zhara": 'Фонд "Жара"',
  "Pension": 'Фонд "Пенсии"',
  "Emergency": 'Фонд "Аварии"',
  "Gifts": "Подаръци",
  "Car": 'Фонд "Автомобил"',
};

/**
 * Given a destination account name and a list of subcategories,
 * returns the matching subcategory ID if the account is a tracked fund.
 * Uses keyword matching (account name contains the keyword).
 */
export function getFundSubcategoryId(
  destAccountName: string,
  subcategories: { id: string; name: string }[]
): string | null {
  for (const [keyword, subcategoryName] of Object.entries(FUND_KEYWORD_TO_SUBCATEGORY)) {
    if (destAccountName.includes(keyword)) {
      const match = subcategories.find((s) => s.name === subcategoryName);
      return match?.id ?? null;
    }
  }
  return null;
}
