import { Language } from "./types";

/**
 * System default main categories and subcategories mapping.
 * Each entry maps between English (UK) and Bulgarian.
 */
interface DefaultNameMap {
  en: string;
  bg: string;
}

const DEFAULT_MAIN_CATEGORIES: DefaultNameMap[] = [
  { en: "Needs", bg: "Нужди" },
  { en: "Wants", bg: "Желания" },
  { en: "Investments", bg: "Инвестиции" },
  { en: "Income", bg: "Приходи" },
];

const DEFAULT_SUBCATEGORIES: DefaultNameMap[] = [
  // Needs
  { en: "Housing", bg: "Жилище" },
  { en: "Groceries", bg: "Пазар" },
  { en: "Utilities", bg: "Сметки" },
  { en: "Transport", bg: "Транспорт" },
  { en: "Insurance", bg: "Застраховки" },
  // Wants
  { en: "Eating Out", bg: "Хранене навън" },
  { en: "Entertainment", bg: "Забавления" },
  { en: "Shopping", bg: "Пазаруване" },
  { en: "Hobbies", bg: "Хобита" },
  // Investments
  { en: "Emergency Fund", bg: "Авариен фонд" },
  { en: "Stocks", bg: "Акции" },
  { en: "Savings", bg: "Спестявания" },
  // Common / Income
  { en: "Salary", bg: "Заплата" },
  { en: "Bonus", bg: "Бонус" },
  { en: "Rent", bg: "Наем" },
  { en: "Dining Out", bg: "Ресторанти" },
  { en: "Healthcare", bg: "Здраве" },
  { en: "Education", bg: "Образование" },
];

const DEFAULT_SHOPPING_CATEGORIES: DefaultNameMap[] = [
  { en: "Produce", bg: "Плодове и зеленчуци" },
  { en: "Meat & Fish", bg: "Месо и риба" },
  { en: "Dairy & Eggs", bg: "Млечни и яйца" },
  { en: "Bakery", bg: "Хляб и тестени" },
  { en: "Pantry", bg: "Бакалия" },
  { en: "Frozen", bg: "Замразени" },
  { en: "Drinks", bg: "Напитки" },
  { en: "Snacks", bg: "Закуски и сладки" },
  { en: "Household", bg: "За дома" },
  { en: "Personal Care", bg: "Лична грижа" },
  { en: "Baby", bg: "Бебешки" },
  { en: "Other", bg: "Други" },
  { en: "Excess (not on list)", bg: "Извън списъка (допълнителни)" },
];

const ACCOUNT_TYPE_CODES: Record<string, { en: string; bg: string }> = {
  cash: { en: "Cash", bg: "В брой" },
  card: { en: "Card", bg: "Карта" },
  bank: { en: "Bank Account", bg: "Банкова сметка" },
  checking: { en: "Checking Account", bg: "Разплащателна сметка" },
  savings: { en: "Savings Account", bg: "Спестовна сметка" },
  investment: { en: "Investment", bg: "Инвестиция" },
  custom: { en: "Custom", bg: "Друг" },
};

const DEFAULT_ACCOUNT_TYPES: DefaultNameMap[] = [
  { en: "Cash", bg: "В брой" },
  { en: "Card", bg: "Карта" },
  { en: "Bank Account", bg: "Банкова сметка" },
  { en: "Checking Account", bg: "Разплащателна сметка" },
  { en: "Savings Account", bg: "Спестовна сметка" },
  { en: "Credit Card", bg: "Кредитна карта" },
  { en: "Investment", bg: "Инвестиция" },
  { en: "Custom", bg: "Друг" },
];

const ALL_SYSTEM_NAMES = [
  ...DEFAULT_MAIN_CATEGORIES,
  ...DEFAULT_SUBCATEGORIES,
  ...DEFAULT_SHOPPING_CATEGORIES,
  ...DEFAULT_ACCOUNT_TYPES,
];

/**
 * Translates a system category/subcategory name into the active language.
 * If the input was custom user text (e.g. "UniCredit", "Custom Hobby"),
 * it is returned unchanged.
 */
export function translateCategory(name?: string | null, lang: Language = "en"): string {
  if (!name) return "";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Find matching default item
  const found = ALL_SYSTEM_NAMES.find(
    (item) => item.en.toLowerCase() === lower || item.bg.toLowerCase() === lower
  );

  if (found) {
    return found[lang];
  }

  // Language agnostic custom user input: preserve as-is
  return trimmed;
}

export function translateAccountType(type?: string | null, lang: Language = "en"): string {
  if (!type) return "";
  const lower = type.trim().toLowerCase();
  if (ACCOUNT_TYPE_CODES[lower]) {
    return ACCOUNT_TYPE_CODES[lower][lang];
  }
  return translateCategory(type, lang);
}
