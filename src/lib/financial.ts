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
