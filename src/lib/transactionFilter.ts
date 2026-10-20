import { format } from "date-fns";

export interface TransactionSearchItem {
  id?: string;
  note?: string | null;
  amount: number;
  date: string;
  transaction_type: string;
  subcategory_id?: string | null;
  transfer_to_account_id?: string | null;
  subcategories?: {
    name?: string | null;
    main_categories?: { name?: string | null } | null;
  } | null;
  accounts?: { name?: string | null } | null;
}

export function matchesTransactionSearch(
  t: TransactionSearchItem,
  query: string,
  accounts: Array<{ id: string; name: string }> = []
): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;

  // 1. Keyword check: Note, subcategory, main category, source account name, destination account name
  if (t.note && t.note.toLowerCase().includes(q)) return true;
  if (t.subcategories?.name && t.subcategories.name.toLowerCase().includes(q)) return true;
  if (t.subcategories?.main_categories?.name && t.subcategories.main_categories.name.toLowerCase().includes(q)) return true;
  if (t.accounts?.name && t.accounts.name.toLowerCase().includes(q)) return true;

  if (t.transfer_to_account_id) {
    const dest = accounts.find((a) => a.id === t.transfer_to_account_id);
    if (dest?.name && dest.name.toLowerCase().includes(q)) return true;
  }

  // Transaction type (English & Bulgarian)
  const typeStr = t.transaction_type?.toLowerCase() || "";
  if (typeStr.includes(q)) return true;
  if (typeStr === "expense" && "разход".includes(q)) return true;
  if (typeStr === "income" && "приход".includes(q)) return true;
  if (typeStr === "transfer" && "превод".includes(q)) return true;

  // 2. Amount check: "4.99", "4,99", "499", "25", "25.00"
  const qNorm = q.replace(",", ".");
  const decimalStr = (t.amount / 100).toFixed(2); // "4.99"
  const rawCentsStr = String(t.amount); // "499"
  const plainDecimal = String(t.amount / 100); // "4.99" or "5"
  if (
    decimalStr.includes(qNorm) ||
    rawCentsStr.includes(qNorm) ||
    plainDecimal.includes(qNorm)
  ) {
    return true;
  }

  // 3. Date check: "2026-10-15", "10-15", "15.10", "15/10", "Oct 15", "15 Oct", "October 15", "15"
  if (t.date && t.date.includes(q)) return true;
  try {
    const parts = t.date.split("-").map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const [year, month, day] = parts;
      const dateObj = new Date(year, month - 1, day);
      // Exact day of month match (e.g. "15" or "05")
      if (q === String(day) || q === String(day).padStart(2, "0")) {
        return true;
      }
      const formatted = [
        format(dateObj, "MMM d").toLowerCase(),
        format(dateObj, "d MMM").toLowerCase(),
        format(dateObj, "MMMM d").toLowerCase(),
        format(dateObj, "d MMMM").toLowerCase(),
        format(dateObj, "dd.MM.yyyy").toLowerCase(),
        format(dateObj, "dd.MM").toLowerCase(),
        format(dateObj, "dd/MM/yyyy").toLowerCase(),
        format(dateObj, "dd/MM").toLowerCase(),
        format(dateObj, "yyyy-MM-dd").toLowerCase(),
      ];
      if (formatted.some((f) => f.includes(q))) return true;
    }
  } catch {
    // ignore parse errors
  }

  return false;
}
