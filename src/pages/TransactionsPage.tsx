import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountFilter, AccountFilterValue, getFilteredAccountIds } from "@/components/AccountFilter";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useActiveSubcategories } from "@/hooks/queries/useCategories";
import { useTransactions, useSaveTransaction, useDeleteTransaction } from "@/hooks/queries/useTransactions";
import { useHouseholdMembers } from "@/hooks/queries/useHouseholdMembers";
import { getFirstName } from "@/hooks/queries/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency, parseCurrencyToCents, getMainCategoryOrder, compareMainCategories, compareSubcategories } from "@/lib/financial";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/DynamicIcon";
import { AccountSelectItems, formatAccountNameWithOwner } from "@/components/AccountSelectItems";
import { Plus, ArrowLeftRight, CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronsUpDown, Pencil, Banknote, Users, User, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addMonths, addDays, addYears } from "date-fns";
import { getFundSubcategoryId } from "@/lib/fund-accounts";
import { scheduleUndoableDelete } from "@/lib/shopping";
import { matchesTransactionSearch } from "@/lib/transactionFilter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/lib/i18n";

type FilterPreset = "day" | "week" | "month" | "year" | "custom";

function getAnchoredRange(preset: FilterPreset, anchor: Date): { from: Date; to: Date } {
  switch (preset) {
    case "day":
      return { from: startOfDay(anchor), to: endOfDay(anchor) };
    case "week":
      return { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) };
    case "year":
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case "month":
    default:
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
}

function shiftAnchor(preset: FilterPreset, anchor: Date, dir: 1 | -1): Date {
  switch (preset) {
    case "day":
      return addDays(anchor, dir);
    case "week":
      return addDays(anchor, dir * 7);
    case "year":
      return addYears(anchor, dir);
    case "month":
    default:
      return addMonths(anchor, dir);
  }
}

function formatAnchorLabel(preset: FilterPreset, anchor: Date, formatDate: (d: Date, f?: string) => string): string {
  switch (preset) {
    case "day":
      return formatDate(anchor, "EEE, d MMM yyyy");
    case "week": {
      const from = startOfWeek(anchor, { weekStartsOn: 1 });
      const to = endOfWeek(anchor, { weekStartsOn: 1 });
      return `${formatDate(from, "d MMM")} – ${formatDate(to, "d MMM yyyy")}`;
    }
    case "year":
      return formatDate(anchor, "yyyy");
    case "month":
    default:
      return formatDate(anchor, "MMMM yyyy");
  }
}

export default function TransactionsPage() {
  const { user } = useAuth();
  const { t, formatDate, translateCategory } = useLanguage();
  const { data: householdInfo } = useHouseholdMembers(user?.id);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [activePreset, setActivePreset] = useState<FilterPreset>("month");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [dateFilter, setDateFilter] = useState(getAnchoredRange("month", new Date()));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [accountFilter, setAccountFilter] = useState<AccountFilterValue>({ mode: "all-visible" });
  const [searchQuery, setSearchQuery] = useState("");
  const [openMainGroups, setOpenMainGroups] = useState<Record<string, boolean>>({});
  const [openSubGroups, setOpenSubGroups] = useState<Record<string, boolean>>({});
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const emptyForm = {
    transaction_type: "expense",
    amount: "",
    date: new Date(),
    account_id: "",
    subcategory_id: "",
    note: "",
    transfer_to_account_id: "",
  };

  const [form, setForm] = useState(emptyForm);

  const { data: accounts = [] } = useAccounts(user?.id);
  const writableAccounts = useMemo(() => {
    return accounts
      .filter((a: any) => a.owner_user_id === null || a.owner_user_id === user?.id)
      .sort((a: any, b: any) => {
        if (a.owner_user_id === user?.id && b.owner_user_id === null) return -1;
        if (a.owner_user_id === null && b.owner_user_id === user?.id) return 1;
        return a.sort_order - b.sort_order;
      });
  }, [accounts, user?.id]);

  const { data: subcategories = [] } = useActiveSubcategories(user?.id);

  const grouped = subcategories.reduce((acc: Record<string, { name: string; color: string; sortOrder: number; items: any[] }>, sub) => {
    const main = (sub as any).main_categories;
    if (!main) return acc;
    if (!acc[main.id]) acc[main.id] = { name: main.name, color: main.color, sortOrder: main.sort_order, items: [] };
    acc[main.id].items.push(sub);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped)
    .sort(([idA, a], [idB, b]) => compareMainCategories({ name: a.name, sort_order: a.sortOrder, id: idA }, { name: b.name, sort_order: b.sortOrder, id: idB }))
    .map(([id, g]) => [id, { ...g, items: [...g.items].sort(compareSubcategories) }] as const);
  const selectedSubcategory = subcategories.find((c: any) => c.id === form.subcategory_id);

  const { data: transactions = [] } = useTransactions(user?.id, dateFilter);



  const updateMutation = useSaveTransaction({
    onSuccess: () => {
      setEditOpen(false);
      setEditingTransaction(null);
      toast.success("Transaction updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleUpdate = (data: any) => {
    let subcategoryId: string | null = null;
    if (data.transaction_type === "transfer" && data.transfer_to_account_id) {
      const destAccount = accounts.find((a) => a.id === data.transfer_to_account_id);
      if (destAccount) subcategoryId = getFundSubcategoryId(destAccount.name, subcategories);
    } else if (data.transaction_type !== "transfer") {
      subcategoryId = data.subcategory_id || null;
    }
    const payload = {
      transaction_type: data.transaction_type,
      amount: parseCurrencyToCents(data.amount),
      date: format(data.date, "yyyy-MM-dd"),
      account_id: data.account_id,
      subcategory_id: subcategoryId,
      note: data.note,
      transfer_to_account_id: data.transaction_type === "transfer" ? data.transfer_to_account_id || null : null,
    };
    updateMutation.mutate({ id: editingTransaction!.id, payload });
  };

  const [pendingDeleteTxId, setPendingDeleteTxId] = useState<string | null>(null);

  const deleteMutation = useDeleteTransaction({
    onSuccess: () => {},
    onError: (e) => toast.error(e.message),
  });

  const performDelete = (id: string) => {
    scheduleUndoableDelete({
      message: "Transaction deleted",
      onConfirm: async () => {
        deleteMutation.mutate(id);
      },
      onUndo: () => {
      },
    });
  };

  const selectPreset = (preset: FilterPreset) => {
    if (preset === "custom") {
      setCustomRange({});
      setCalendarMonth(new Date());
      setCustomOpen(true);
      return;
    }
    const anchor = activePreset === "custom" ? new Date() : anchorDate;
    setAnchorDate(anchor);
    setActivePreset(preset);
    setDateFilter(getAnchoredRange(preset, anchor));
  };

  const stepPeriod = (dir: 1 | -1) => {
    if (activePreset === "custom") return;
    const next = shiftAnchor(activePreset, anchorDate, dir);
    setAnchorDate(next);
    setDateFilter(getAnchoredRange(activePreset, next));
  };


  const confirmCustomRange = () => {
    if (customRange.from && customRange.to) {
      setActivePreset("custom");
      setDateFilter({ from: customRange.from, to: customRange.to });
      setCustomOpen(false);
    }
  };

  const openEditDialog = (t: any) => {
    setEditingTransaction(t);
    setForm({
      transaction_type: t.transaction_type,
      amount: (t.amount / 100).toFixed(2),
      date: new Date(t.date + "T00:00:00"),
      account_id: t.account_id,
      subcategory_id: t.subcategory_id || "",
      note: t.note || "",
      transfer_to_account_id: t.transfer_to_account_id || "",
    });
    setEditOpen(true);
  };

  const filteredAccountIds = getFilteredAccountIds(accounts, accountFilter);
  const accountFilteredTransactions = filteredAccountIds
    ? transactions.filter((t) => filteredAccountIds.includes(t.account_id) || (t.transfer_to_account_id && filteredAccountIds.includes(t.transfer_to_account_id)))
    : transactions;

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return accountFilteredTransactions;
    return accountFilteredTransactions.filter((t) =>
      matchesTransactionSearch(t, searchQuery, accounts, householdInfo?.members)
    );
  }, [accountFilteredTransactions, searchQuery, accounts, householdInfo?.members]);

  const totalIncome = filteredTransactions.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filteredTransactions.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0);

  // Group transactions by main category, then by subcategory
  type SubGroup = { name: string; icon: string; color: string; sortOrder: number; transactions: typeof transactions };
  type MainGroup = { name: string; color: string; sortOrder: number; dbSortOrder: number; subGroups: Record<string, SubGroup>; ungrouped: typeof transactions };

  const groups = useMemo(() => {
    const mainGroups: Record<string, MainGroup> = {};

    filteredTransactions.forEach((tItem) => {
      const mainCatName = tItem.subcategories?.main_categories?.name || (tItem.transaction_type === "income" ? "Income" : tItem.transaction_type === "transfer" ? "Transfers" : "Uncategorized");
      const mainCatColor = tItem.subcategories?.main_categories?.color || (tItem.transaction_type === "income" ? "145 45% 42%" : "0 0% 50%");

      if (!mainGroups[mainCatName]) {
        const dbSortOrder = (tItem.subcategories?.main_categories as any)?.sort_order ?? 999;
        mainGroups[mainCatName] = { name: mainCatName, color: mainCatColor, sortOrder: getMainCategoryOrder(mainCatName), dbSortOrder, subGroups: {}, ungrouped: [] };
      }

      const subName = tItem.subcategories?.name;
      if (subName) {
        const subId = tItem.subcategory_id || subName;
        if (!mainGroups[mainCatName].subGroups[subId]) {
          const subMeta = subcategories.find((s: any) => s.id === tItem.subcategory_id);
          mainGroups[mainCatName].subGroups[subId] = {
            name: subName,
            icon: tItem.subcategories?.icon || subMeta?.icon || "circle",
            color: mainCatColor || (subMeta as any)?.main_categories?.color || tItem.subcategories?.color || subMeta?.color,
            sortOrder: (tItem.subcategories as any)?.sort_order ?? subMeta?.sort_order ?? 999,
            transactions: [],
          };
        }
        mainGroups[mainCatName].subGroups[subId].transactions.push(tItem);
      } else {
        mainGroups[mainCatName].ungrouped.push(tItem);
      }
    });

    return Object.values(mainGroups).sort((a, b) =>
      a.sortOrder - b.sortOrder || compareMainCategories({ name: a.name, sort_order: a.dbSortOrder }, { name: b.name, sort_order: b.dbSortOrder })
    );
  }, [filteredTransactions, subcategories]);

  const collapsibleSubKeys = useMemo(() => {
    const keys: { groupName: string; subId: string }[] = [];
    groups.forEach((group) => {
      Object.entries(group.subGroups).forEach(([subId, sg]) => {
        if (sg.transactions.length > 1) {
          keys.push({ groupName: group.name, subId });
        }
      });
    });
    return keys;
  }, [groups]);

  const isMainGroupOpen = (groupName: string) => {
    if (openMainGroups[groupName] !== undefined) {
      return openMainGroups[groupName];
    }
    const isIncome = groupName === "Income" || groupName === "Приходи";
    return !isIncome;
  };

  const isSubGroupOpen = (groupName: string, subId: string) => {
    const key = `${groupName}:${subId}`;
    if (openSubGroups[key] !== undefined) {
      return openSubGroups[key];
    }
    return false;
  };

  const allRecordsExpanded = useMemo(() => {
    if (groups.length === 0) return false;
    const allMainsOpen = groups.every((g) => isMainGroupOpen(g.name));
    if (collapsibleSubKeys.length === 0) return allMainsOpen;
    const allSubsOpen = collapsibleSubKeys.every(({ groupName, subId }) => isSubGroupOpen(groupName, subId));
    return allMainsOpen && allSubsOpen;
  }, [groups, openMainGroups, openSubGroups, collapsibleSubKeys]);

  const toggleAllRecords = () => {
    if (allRecordsExpanded) {
      const nextSub: Record<string, boolean> = {};
      collapsibleSubKeys.forEach(({ groupName, subId }) => {
        nextSub[`${groupName}:${subId}`] = false;
      });
      setOpenSubGroups(nextSub);
    } else {
      const nextMain: Record<string, boolean> = {};
      const nextSub: Record<string, boolean> = {};
      groups.forEach((g) => {
        nextMain[g.name] = true;
      });
      collapsibleSubKeys.forEach(({ groupName, subId }) => {
        nextSub[`${groupName}:${subId}`] = true;
      });
      setOpenMainGroups(nextMain);
      setOpenSubGroups(nextSub);
    }
  };

  const renderTransaction = (
    tItem: typeof transactions[0],
    groupColor: string,
    options?: {
      hideDate?: boolean;
      timeline?: {
        isFirst: boolean;
        isLast: boolean;
        dotColor: string;
      };
    }
  ) => {
    const account: any = accounts.find((a: any) => a.id === tItem.account_id);
    const destAccount: any = accounts.find((a: any) => a.id === tItem.transfer_to_account_id);
    const accountDisplayName = formatAccountNameWithOwner(
      account || { name: (tItem as any).accounts?.name, owner_user_id: account?.owner_user_id },
      householdInfo?.members
    );
    const destDisplayName = destAccount ? formatAccountNameWithOwner(destAccount, householdInfo?.members) : null;
    const subMeta = subcategories.find((s: any) => s.id === tItem.subcategory_id);
    const subColor = groupColor || (subMeta as any)?.main_categories?.color || tItem.subcategories?.color || subMeta?.color;
    const subIcon = tItem.subcategories?.icon || subMeta?.icon || "circle";
    const hideDate = options?.hideDate ?? false;
    const timeline = options?.timeline;

    return (
      <div
        key={tItem.id}
        className={`flex items-center justify-between rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer ${
          timeline ? "p-2 sm:p-2.5" : "p-3"
        }`}
        onClick={() => openEditDialog(tItem)}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 self-stretch">
          {timeline && (
            <>
              {/* Timeline track with continuous line and dot */}
              <div className="relative flex items-center justify-center w-7 sm:w-8 shrink-0 self-stretch">
                <div
                  className={`absolute top-0 left-1/2 -translate-x-1/2 w-px bg-border/70 ${
                    timeline.isLast ? "bottom-1/2" : "bottom-0"
                  }`}
                />
                <div
                  className="relative z-10 w-2.5 h-2.5 rounded-full ring-2 ring-background transition-all duration-200 group-hover:scale-125 group-hover:ring-primary/40"
                  style={{ backgroundColor: `hsl(${timeline.dotColor})` }}
                />
              </div>
              {/* Timeline short date (dd/mm/yy) */}
              <span className="font-mono text-[11px] sm:text-xs text-muted-foreground group-hover:text-foreground font-medium shrink-0 select-none ml-0.5 sm:ml-1 mr-1.5 sm:mr-2.5 tabular-nums transition-colors w-[52px] sm:w-[58px]">
                {formatDate(new Date(tItem.date), "dd/MM/yy")}
              </span>
            </>
          )}

          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `hsl(${subColor} / 0.12)` }}
          >
            {tItem.transaction_type === "transfer" ? (
              <ArrowLeftRight className="h-4 w-4" style={{ color: `hsl(${groupColor})` }} />
            ) : tItem.transaction_type === "income" ? (
              <Banknote className="h-4 w-4" style={{ color: `hsl(${groupColor})` }} />
            ) : (
              <DynamicIcon name={subIcon} className="h-4 w-4" style={{ color: `hsl(${subColor})` }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium break-words">
              {translateCategory(tItem.subcategories?.name) || tItem.note || (tItem.transaction_type === "transfer" ? t("transactions.transfer") : t("transactions.title"))}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span className="truncate flex items-center gap-1.5">
                {accountDisplayName}
                {tItem.transaction_type === "transfer" && destDisplayName && (
                  <span className="text-muted-foreground">
                    → {destDisplayName}
                  </span>
                )}
              </span>
              {!hideDate && (
                <>
                  <span>·</span>
                  <span className="flex-shrink-0">{formatDate(new Date(tItem.date), "dd/MM/yyyy")}</span>
                </>
              )}
              {tItem.note && tItem.subcategories?.name ? (
                <>
                  <span>·</span>
                  <span className="break-words line-clamp-2">{tItem.note}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-2">
          <span className={`font-mono-numbers text-sm font-medium whitespace-nowrap flex-shrink-0 ${
            tItem.transaction_type === "income" ? "text-income" :
            tItem.transaction_type === "transfer" ? "text-transfer" : "text-expense"
          }`}>
            {tItem.transaction_type === "income" ? "+" : tItem.transaction_type === "expense" ? "-" : ""}
            {formatCurrency(tItem.amount)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("transactions.title")}</h1>
          <div className="flex gap-4 mt-1 text-sm">
            <span className="text-income font-mono-numbers">+{formatCurrency(totalIncome)}</span>
            <span className="text-expense font-mono-numbers">-{formatCurrency(totalExpenses)}</span>
          </div>
        </div>

        {filteredTransactions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAllRecords}
            className="text-xs gap-1.5 h-8 shrink-0"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {allRecordsExpanded ? t("transactions.collapseAll") : t("transactions.expandAll")}
          </Button>
        )}
      </div>

      {/* Time filter presets, account filter & search */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          {(["day", "week", "month", "year"] as const).map((preset) => (
            <Button
              key={preset}
              variant={activePreset === preset ? "default" : "outline"}
              size="sm"
              className="capitalize"
              onClick={() => selectPreset(preset)}
            >
              {t(`transactions.${preset}`)}
            </Button>
          ))}
          <Button
            variant={activePreset === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => selectPreset("custom")}
          >
            {activePreset === "custom"
              ? `${formatDate(dateFilter.from, "MMM d")} – ${formatDate(dateFilter.to, "MMM d")}`
              : t("transactions.custom")}
          </Button>

          <AccountFilter
            accounts={accounts}
            value={accountFilter}
            onChange={setAccountFilter}
            currentUserId={user?.id}
            householdMembers={householdInfo?.members}
          />
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("transactions.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-8 text-xs sm:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              aria-label={t("transactions.clearSearch")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {activePreset !== "custom" && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => stepPeriod(-1)} aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 text-center text-sm font-medium truncate">
            {formatAnchorLabel(activePreset, anchorDate, formatDate)}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => stepPeriod(1)} aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}


      {/* Custom range dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-fit max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{t("transactions.selectDateRange")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs sm:text-sm font-medium text-center truncate">
              {isMobile
                ? formatDate(calendarMonth, "MMMM yyyy")
                : `${formatDate(calendarMonth, "MMMM yyyy")} – ${formatDate(addMonths(calendarMonth, 1), "MMMM yyyy")}`}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center w-full">
            <Calendar
              weekStartsOn={1}
              mode="range"
              selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
              onSelect={(range) => {
                if (range) setCustomRange({ from: range.from, to: range.to });
                else setCustomRange({});
              }}
              numberOfMonths={isMobile ? 1 : 2}
              className="pointer-events-auto mx-auto p-0"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              classNames={{
                caption: isMobile ? "hidden" : "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "hidden",
              }}
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setCustomOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={confirmCustomRange} disabled={!customRange.from || !customRange.to}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingTransaction(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transactions.editTransaction")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("accounts.accountType")}</Label>
              <Select
                value={form.transaction_type}
                onValueChange={(v) => {
                  const isOther = accounts.some(
                    (a: any) => a.id === form.account_id && a.owner_user_id !== null && a.owner_user_id !== user?.id
                  );
                  setForm((prev) => ({
                    ...prev,
                    transaction_type: v,
                    account_id: v !== "transfer" && isOther ? "" : prev.account_id,
                    transfer_to_account_id: v === "transfer" ? prev.transfer_to_account_id : "",
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">{t("transactions.expense")}</SelectItem>
                  <SelectItem value="income">{t("transactions.income")}</SelectItem>
                  <SelectItem value="transfer">{t("transactions.transfer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("common.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("common.date")}</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDate(form.date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date}
                    onSelect={(d) => { if (d) { setForm({ ...form, date: d }); setDateOpen(false); } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>{form.transaction_type === "transfer" ? t("transactions.fromAccount") : t("common.account")}</Label>
              <Select
                value={form.account_id}
                onValueChange={(v) => {
                  setForm((prev) => ({
                    ...prev,
                    account_id: v,
                    transfer_to_account_id: prev.transfer_to_account_id === v ? "" : prev.transfer_to_account_id,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <AccountSelectItems
                    accounts={accounts}
                    currentUserId={user?.id}
                    householdMembers={householdInfo?.members}
                    excludeAccountId={form.transaction_type === "transfer" ? form.transfer_to_account_id : undefined}
                    isTransfer={form.transaction_type === "transfer"}
                  />
                </SelectContent>
              </Select>
            </div>
            {form.transaction_type === "transfer" && (
              <div>
                <Label>{t("transactions.toAccount")}</Label>
                <Select
                  value={form.transfer_to_account_id}
                  onValueChange={(v) => {
                    setForm((prev) => ({
                      ...prev,
                      transfer_to_account_id: v,
                      account_id: prev.account_id === v ? "" : prev.account_id,
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <AccountSelectItems
                      accounts={accounts}
                      currentUserId={user?.id}
                      householdMembers={householdInfo?.members}
                      excludeAccountId={form.account_id}
                      isTransfer={true}
                    />
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.transaction_type !== "transfer" && (
              <div>
                <Label>{t("common.category")}</Label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      {selectedSubcategory ? (
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name={selectedSubcategory.icon}
                            className="h-4 w-4 shrink-0"
                            style={{ color: `hsl(${(selectedSubcategory as any).main_categories?.color || selectedSubcategory.color || "var(--primary)"})` }}
                          />
                          <span className="truncate">{translateCategory(selectedSubcategory.name)}</span>
                        </div>
                      ) : (
                        t("quickAdd.selectCategory")
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div
                      className="max-h-64 overflow-y-auto overscroll-contain touch-pan-y p-1"
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      {sortedGroups.map(([mainId, group]) => (
                        <Collapsible key={mainId} defaultOpen>
                          <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium hover:bg-muted/50 rounded">
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 [&[data-state=open]>svg]:rotate-90" />
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: `hsl(${group.color})` }}
                            />
                            {translateCategory(group.name)}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-4">
                              {group.items.map((sub: any) => {
                                const subColor = group.color || sub.color;
                                return (
                                  <button
                                    key={sub.id}
                                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted/50 ${
                                      form.subcategory_id === sub.id ? "bg-primary/10 text-primary" : ""
                                    }`}
                                    onClick={() => {
                                      setForm({ ...form, subcategory_id: sub.id });
                                      setCategoryOpen(false);
                                    }}
                                  >
                                    <DynamicIcon name={sub.icon} className="h-4 w-4 shrink-0" style={{ color: `hsl(${subColor})` }} />
                                    <span className="truncate">{translateCategory(sub.name)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div>
              <Label>{t("common.notes")}</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between pt-2">
            {editingTransaction && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  const id = editingTransaction.id;
                  setEditOpen(false);
                  setEditingTransaction(null);
                  setPendingDeleteTxId(id);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete")}
              </Button>
            )}
            {!editingTransaction && <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditingTransaction(null); }}>{t("common.cancel")}</Button>
              <Button onClick={() => handleUpdate(form)} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground gap-1.5">
              <span>{searchQuery.trim() ? t("transactions.noTransactionsMatch") : t("transactions.noTransactionsPeriod")}</span>
              {searchQuery.trim() && (
                <Button variant="outline" size="sm" onClick={() => setSearchQuery("")} className="text-xs h-7">
                  {t("transactions.clearSearch")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => {
          const allTransactions = [...Object.values(group.subGroups).flatMap((sg) => sg.transactions), ...group.ungrouped];
          const totalAmount = allTransactions.reduce((s, tItem) => s + tItem.amount, 0);

          return (
            <Collapsible
              key={group.name}
              open={isMainGroupOpen(group.name)}
              onOpenChange={(open) => setOpenMainGroups((prev) => ({ ...prev, [group.name]: open }))}
            >
              <Card>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: `hsl(${group.color})` }} />
                      <span className="font-semibold text-sm">{translateCategory(group.name)}</span>
                      <span className="text-xs text-muted-foreground">({allTransactions.length})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-numbers text-sm text-muted-foreground">
                        {formatCurrency(totalAmount)}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-2">
                    <div className="space-y-0.5">
                      {Object.entries(group.subGroups)
                        .sort(([idA, a], [idB, b]) => compareSubcategories({ name: a.name, sort_order: a.sortOrder, id: idA }, { name: b.name, sort_order: b.sortOrder, id: idB }))
                        .map(([subId, sg]) => {
                          const sortedTxns = [...sg.transactions].sort((a, b) => b.date.localeCompare(a.date) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                          const subTotal = sortedTxns.reduce((s, tItem) => s + tItem.amount, 0);
                          if (sortedTxns.length === 1) {
                            return renderTransaction(sortedTxns[0], group.color);
                          }
                          return (
                            <Collapsible
                              key={`${group.name}:${subId}`}
                              open={isSubGroupOpen(group.name, subId)}
                              onOpenChange={(open) => setOpenSubGroups((prev) => ({ ...prev, [`${group.name}:${subId}`]: open }))}
                            >
                              <CollapsibleTrigger className="w-full">
                                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                                      style={{ background: `hsl(${sg.color} / 0.12)` }}
                                    >
                                      <DynamicIcon name={sg.icon} className="h-4 w-4" style={{ color: `hsl(${sg.color})` }} />
                                    </div>
                                    <div className="text-left min-w-0 flex-1">
                                      <p className="text-sm font-medium break-words">{translateCategory(sg.name)}</p>
                                      <p className="text-xs text-muted-foreground">{sortedTxns.length} {t("transactions.numTransactions")}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono-numbers text-sm font-medium text-muted-foreground">
                                      {formatCurrency(subTotal)}
                                    </span>
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="space-y-0.5 ml-1 sm:ml-2">
                                  {sortedTxns.map((tItem, idx) =>
                                    renderTransaction(tItem, group.color, {
                                      hideDate: true,
                                      timeline: {
                                        isFirst: idx === 0,
                                        isLast: idx === sortedTxns.length - 1,
                                        dotColor: sg.color || group.color,
                                      },
                                    })
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      {group.ungrouped.map((tItem) => renderTransaction(tItem, group.color))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })
      )}

      <AlertDialog open={!!pendingDeleteTxId} onOpenChange={(v) => !v && setPendingDeleteTxId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("transactions.deleteTransactionPrompt")}</AlertDialogTitle>
            <AlertDialogDescription>{t("transactions.undoWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = pendingDeleteTxId!;
                setPendingDeleteTxId(null);
                performDelete(id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
