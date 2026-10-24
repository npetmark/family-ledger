import { formatDistanceToNow } from "date-fns";

const CURRENCY_MAP: Record<string, string> = {
  EUR: "EUR",
  USD: "USD",
  GBP: "GBP",
  CHF: "CHF",
  JPY: "JPY",
  CAD: "CAD",
  AUD: "AUD",
  SEK: "SEK",
  NOK: "NOK",
  DKK: "DKK",
  PLN: "PLN",
  CZK: "CZK",
  HUF: "HUF",
  RON: "RON",
  BGN: "BGN",
  HRK: "HRK",
  TRY: "TRY",
  BRL: "BRL",
  INR: "INR",
  CNY: "CNY",
};

export const availableCurrencies = Object.keys(CURRENCY_MAP);

// Format cents to currency string
export function formatCurrency(cents: number, currency = "EUR"): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Parse currency input to cents
export function parseCurrencyToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

// Format a date relative to now
export function formatRelativeDate(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

// Calculate percentage
export function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// Get month-year string for budgets
export function getMonthYear(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Transaction type colors
export function getTransactionTypeColor(type: string): string {
  switch (type) {
    case "income": return "text-income";
    case "expense": return "text-expense";
    case "transfer": return "text-transfer";
    default: return "text-foreground";
  }
}

// 50/30/20 Budgeting model targets
// Needs: 50%, Wants: 20%, Investments: 30%
export const BUDGET_TARGETS: Record<string, number> = {
  Нужди: 50,
  Needs: 50,
  Желания: 20,
  Wants: 20,
  Инвестиции: 30,
  Investments: 30,
};

export function getBudgetTarget(categoryName?: string | null): number | undefined {
  if (!categoryName) return undefined;
  const trimmed = categoryName.trim();
  if (BUDGET_TARGETS[trimmed] !== undefined) return BUDGET_TARGETS[trimmed];
  const lower = trimmed.toLowerCase();
  const entry = Object.entries(BUDGET_TARGETS).find(([k]) => k.toLowerCase() === lower);
  return entry ? entry[1] : undefined;
}

export function isIncomeCategory(categoryName?: string | null): boolean {
  if (!categoryName) return false;
  const n = categoryName.trim().toLowerCase();
  return n === "приходи" || n === "income";
}

export function getMainCategoryOrder(categoryName?: string | null): number {
  if (!categoryName) return 999;
  const n = categoryName.trim().toLowerCase();
  if (n === "приходи" || n === "income") return 0;
  if (n === "нужди" || n === "needs") return 1;
  if (n === "желания" || n === "wants") return 2;
  if (n === "инвестиции" || n === "investments") return 3;
  if (n === "преводи" || n === "transfers") return 4;
  if (n === "без категория" || n === "uncategorized") return 5;
  return 999;
}

type SortableCategory = { name?: string | null; sort_order?: number | null; id?: string | null };

const compareNames = (a?: string | null, b?: string | null) =>
  (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base", numeric: true });

/**
 * Fixed, deterministic order for main categories:
 * system order (Income, Needs, Wants, Investments, Transfers, Uncategorized),
 * then the user's sort_order, then name, then id.
 */
export function compareMainCategories(a: SortableCategory, b: SortableCategory): number {
  return (
    getMainCategoryOrder(a.name) - getMainCategoryOrder(b.name) ||
    (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
    compareNames(a.name, b.name) ||
    compareNames(a.id, b.id)
  );
}

/**
 * Fixed, deterministic order for subcategories: sort_order, then name, then id.
 * Never depends on amounts or transaction dates, so the list doesn't jump around.
 */
export function compareSubcategories(a: SortableCategory, b: SortableCategory): number {
  return (
    (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
    compareNames(a.name, b.name) ||
    compareNames(a.id, b.id)
  );
}
