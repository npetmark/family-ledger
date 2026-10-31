import { supabase } from "@/integrations/supabase/client";
import { formatAccountNameWithOwner } from "@/components/AccountSelectItems";
import { getFirstName } from "@/hooks/queries/useProfile";

export interface CsvExportOptions {
  accountIds: string[];
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  accounts: Array<{ id: string; name: string; currency?: string; owner_user_id?: string | null }>;
  householdMembers?: Array<{
    user_id: string;
    display_name?: string | null;
    profile?: {
      first_name?: string | null;
      last_name?: string | null;
      display_name?: string | null;
    } | null;
  }>;
  t: (key: string) => string;
  translateCategory?: (name: string) => string;
}

export function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportTransactionsToCsv(options: CsvExportOptions): Promise<{ count: number; filename: string }> {
  const { accountIds, dateRange, accounts, householdMembers, t, translateCategory } = options;

  if (!accountIds || accountIds.length === 0) {
    throw new Error("No accounts selected for export.");
  }

  // 1. Build query
  let query = supabase
    .from("transactions")
    .select(`
      id,
      date,
      amount,
      transaction_type,
      note,
      account_id,
      transfer_to_account_id,
      subcategory_id,
      created_by,
      subcategories (
        id,
        name,
        main_categories (
          id,
          name
        )
      )
    `)
    .in("account_id", accountIds)
    .order("date", { ascending: false });

  if (dateRange?.from) {
    const fromStr = dateRange.from.toISOString().split("T")[0];
    query = query.gte("date", fromStr);
  }
  if (dateRange?.to) {
    const toStr = dateRange.to.toISOString().split("T")[0];
    query = query.lte("date", toStr);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const memberMap = new Map(
    (householdMembers || []).map((m: any) => [
      m.user_id,
      getFirstName(m.profile) || m.display_name || m.user_id,
    ])
  );

  // CSV Headers
  const headers = [
    t("csv.date") || "Date",
    t("csv.type") || "Type",
    t("csv.amount") || "Amount",
    t("csv.currency") || "Currency",
    t("csv.account") || "Account",
    t("csv.toAccount") || "Transfer To",
    t("csv.mainCategory") || "Main Category",
    t("csv.subcategory") || "Subcategory",
    t("csv.note") || "Note",
    t("csv.createdBy") || "Created By",
  ];

  const lines: string[] = [headers.map(escapeCsvField).join(",")];

  for (const row of rows || []) {
    const acc = accountMap.get(row.account_id);
    const toAcc = row.transfer_to_account_id ? accountMap.get(row.transfer_to_account_id) : null;
    const sub = (row as any).subcategories;
    const main = sub?.main_categories;

    const accName = acc ? (formatAccountNameWithOwner(acc, householdMembers) || acc.name) : "";
    const toAccName = toAcc ? (formatAccountNameWithOwner(toAcc, householdMembers) || toAcc.name) : "";

    const subName = sub?.name ? (translateCategory ? translateCategory(sub.name) : sub.name) : "";
    const mainName = main?.name ? (translateCategory ? translateCategory(main.name) : main.name) : "";
    const creatorName = row.created_by ? memberMap.get(row.created_by) || row.created_by : "";

    // Amount formatted as decimal string (e.g. 25.50)
    const amountDecimal = (row.amount / 100).toFixed(2);

    let typeLabel = row.transaction_type;
    if (row.transaction_type === "income") typeLabel = t("quickAdd.income") || "Income";
    else if (row.transaction_type === "expense") typeLabel = t("quickAdd.expense") || "Expense";
    else if (row.transaction_type === "transfer") typeLabel = t("quickAdd.transfer") || "Transfer";

    const line = [
      escapeCsvField(row.date),
      escapeCsvField(typeLabel),
      escapeCsvField(amountDecimal),
      escapeCsvField(acc?.currency || "EUR"),
      escapeCsvField(accName),
      escapeCsvField(toAccName),
      escapeCsvField(mainName),
      escapeCsvField(subName),
      escapeCsvField(row.note || ""),
      escapeCsvField(creatorName),
    ].join(",");

    lines.push(line);
  }

  // Prepend UTF-8 BOM so Excel and other spreadsheet apps display Cyrillic/UTF-8 symbols properly
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const dateStamp = new Date().toISOString().split("T")[0];
  const filename = `family-ledger-transactions-${dateStamp}.csv`;

  downloadFile(csvContent, filename, "text/csv;charset=utf-8;");

  return { count: rows?.length || 0, filename };
}
