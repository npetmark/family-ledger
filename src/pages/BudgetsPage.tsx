import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useActiveSubcategories } from "@/hooks/queries/useCategories";
import { useBudgets, useSaveBudgets, useDeleteBudgets } from "@/hooks/queries/useBudgets";
import { useHouseholdMembers } from "@/hooks/queries/useHouseholdMembers";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents, getMonthYear, getBudgetTarget, isIncomeCategory, compareMainCategories, compareSubcategories } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronsUpDown, Bell, Copy, Trash2, History, Pencil, Check, RotateCcw, Sparkles } from "lucide-react";
import { addMonths, subMonths } from "date-fns";
import { useLanguage } from "@/lib/i18n";

type MainCategoryInfo = Pick<Tables<"main_categories">, "id" | "name" | "color" | "sort_order">;
type SubcategoryWithMain = Tables<"subcategories"> & {
  main_categories?: MainCategoryInfo | null;
};
type TransactionWithSubcategory = Tables<"transactions"> & {
  subcategories?: SubcategoryWithMain | null;
};
type BudgetInsertPayload = {
  user_id: string;
  subcategory_id: string;
  month_year: string;
  amount: number;
  alert_threshold?: number;
  household_id?: string;
};
type BudgetUpdatePayload = {
  amount?: number;
  alert_threshold?: number;
};

function getBurndownColor(pct: number, alertThreshold: number, isInvestment = false): string {
  if (isInvestment) {
    if (pct >= 80) return "[&>div]:bg-primary";
    if (pct >= 50) return "[&>div]:bg-warning";
    return "[&>div]:bg-destructive";
  }
  if (pct >= 100) return "[&>div]:bg-destructive";
  if (pct >= alertThreshold) return "[&>div]:bg-warning";
  return "[&>div]:bg-primary";
}

function getBurndownTextColor(pct: number, alertThreshold: number, isInvestment = false): string {
  if (isInvestment) {
    if (pct >= 80) return "text-income";
    if (pct >= 50) return "text-warning";
    return "text-destructive";
  }
  if (pct >= 100) return "text-destructive";
  if (pct >= alertThreshold) return "text-warning";
  return "text-income";
}

export default function BudgetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t, translateCategory, formatDate, language } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [budgetVersion, setBudgetVersion] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [restoreSub, setRestoreSub] = useState<SubcategoryWithMain | null>(null);
  const [restoreAmounts, setRestoreAmounts] = useState<Record<string, string>>({});
  const monthYear = getMonthYear(currentDate);

  const { data: householdInfo } = useHouseholdMembers(user?.id);
  const householdId = householdInfo?.householdId;

  const { data: accounts = [] } = useAccounts(user?.id);

  const { data: rawSubcategories = [] } = useActiveSubcategories(user?.id);
  const subcategories = rawSubcategories as SubcategoryWithMain[];

  const { data: budgets = [] } = useBudgets(user?.id, monthYear);

  const { data: transactions = [] } = useQuery<TransactionWithSubcategory[]>({
    queryKey: ["transactions-for-budgets", user?.id, monthYear],
    queryFn: async () => {
      const y = currentDate.getFullYear(),
        m = currentDate.getMonth();
      const startOfMonth = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const endOfMonth = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("transactions")
        .select("*, subcategories(*, main_categories(*))")
        .gte("date", startOfMonth)
        .lte("date", endOfMonth)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransactionWithSubcategory[];
    },
    enabled: !!user,
  });

  const prevMonthYear = getMonthYear(subMonths(currentDate, 1));
  const { data: prevBudgets = [] } = useBudgets(user?.id, prevMonthYear);

  // Previous month transactions for reference spending
  const { data: prevTransactions = [] } = useQuery<TransactionWithSubcategory[]>({
    queryKey: ["prev-transactions-for-budgets", user?.id, prevMonthYear],
    queryFn: async () => {
      const prevDate = subMonths(currentDate, 1);
      const y = prevDate.getFullYear(),
        m = prevDate.getMonth();
      const startOfMonth = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const endOfMonth = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("transactions")
        .select("*, subcategories(*, main_categories(*))")
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);
      if (error) throw error;
      return (data ?? []) as TransactionWithSubcategory[];
    },
    enabled: !!user,
  });

  // Historical data for the Restore Subcategory History modal
  const restoreSubId = restoreSub?.id;
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ["subcategory-restore-history", user?.id, restoreSubId],
    queryFn: async () => {
      if (!restoreSubId) {
        return { allBudgets: [], subTransactions: [], orphanTransactions: [] };
      }
      const [allBudgetsRes, subTxRes, orphanTxRes] = await Promise.all([
        supabase.from("budgets").select("*").order("month_year", { ascending: false }),
        supabase
          .from("transactions")
          .select("id, amount, date, note, account_id, subcategory_id")
          .eq("subcategory_id", restoreSubId)
          .order("date", { ascending: false }),
        supabase
          .from("transactions")
          .select("id, amount, date, note, account_id, subcategory_id, transaction_type")
          .is("subcategory_id", null)
          .eq("transaction_type", "expense")
          .order("date", { ascending: false }),
      ]);
      if (allBudgetsRes.error) throw allBudgetsRes.error;
      if (subTxRes.error) throw subTxRes.error;
      if (orphanTxRes.error) throw orphanTxRes.error;
      return {
        allBudgets: allBudgetsRes.data ?? [],
        subTransactions: subTxRes.data ?? [],
        orphanTransactions: orphanTxRes.data ?? [],
      };
    },
    enabled: !!user && !!restoreSubId,
  });

  // Compute per-month estimates when historyData loads
  const monthlyRestoreRows = useMemo(() => {
    if (!restoreSub || !historyData) return [];
    const mainName = restoreSub.main_categories?.name || "";
    const targetPct = getBudgetTarget(mainName); // e.g. 50 for Needs
    const siblingSubIds = new Set(
      subcategories
        .filter((s) => s.main_category_id === restoreSub.main_category_id && s.id !== restoreSub.id)
        .map((s) => s.id)
    );
    const otherMainSubIds = new Set(
      subcategories
        .filter((s) => s.main_category_id !== restoreSub.main_category_id && !isIncomeCategory(s.main_categories?.name))
        .map((s) => s.id)
    );

    const monthSet = new Set<string>([monthYear]);
    historyData.allBudgets.forEach((b) => monthSet.add(b.month_year));
    historyData.subTransactions.forEach((tx) => monthSet.add(tx.date.slice(0, 7)));

    const sortedMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    return sortedMonths.map((my) => {
      const monthBudgets = historyData.allBudgets.filter((b) => b.month_year === my);
      const existingForSub = monthBudgets.find((b) => b.subcategory_id === restoreSub.id);
      const siblingBudgetTotal = monthBudgets
        .filter((b) => siblingSubIds.has(b.subcategory_id))
        .reduce((s, b) => s + b.amount, 0);
      const otherMainBudgetTotal = monthBudgets
        .filter((b) => otherMainSubIds.has(b.subcategory_id))
        .reduce((s, b) => s + b.amount, 0);

      // If targetPct is 50%, expectedMainTotal = otherMainBudgetTotal * (50 / 50)
      let inferredFromTarget = 0;
      if (targetPct !== undefined && targetPct < 100 && otherMainBudgetTotal > 0) {
        const expectedMainTotal = Math.round(otherMainBudgetTotal * (targetPct / (100 - targetPct)));
        inferredFromTarget = Math.max(0, expectedMainTotal - siblingBudgetTotal);
      }

      const spentInMonth = historyData.subTransactions
        .filter((tx) => tx.date.startsWith(my))
        .reduce((s, tx) => s + tx.amount, 0);

      return {
        monthYear: my,
        existingBudgetId: existingForSub?.id,
        existingAmount: existingForSub?.amount ?? 0,
        spentInMonth,
        inferredFromTarget,
        siblingBudgetTotal,
        otherMainBudgetTotal,
      };
    });
  }, [restoreSub, historyData, subcategories, monthYear]);

  useEffect(() => {
    if (!restoreSub || monthlyRestoreRows.length === 0) return;
    setRestoreAmounts((prev) => {
      const next = { ...prev };
      monthlyRestoreRows.forEach((r) => {
        if (next[r.monthYear] === undefined) {
          const defaultCents =
            r.existingAmount > 0
              ? r.existingAmount
              : r.inferredFromTarget > 0
              ? r.inferredFromTarget
              : r.spentInMonth;
          next[r.monthYear] = defaultCents > 0 ? (defaultCents / 100).toFixed(2) : "";
        }
      });
      return next;
    });
  }, [restoreSub, monthlyRestoreRows]);

  const relinkOrphansMutation = useMutation({
    mutationFn: async () => {
      if (!restoreSub || !historyData?.orphanTransactions.length) return;
      const ids = historyData.orphanTransactions.map((t) => t.id);
      const { error } = await supabase
        .from("transactions")
        .update({ subcategory_id: restoreSub.id })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        language === "bg"
          ? "Транзакциите бяха успешно свързани с подкатегорията"
          : "Uncategorized transactions re-linked successfully"
      );
      refetchHistory();
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-for-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["prev-transactions-for-budgets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBudgetsMutation = useSaveBudgets({
    onSuccess: () => toast.success("Budget updated"),
    onError: (e) => toast.error(e.message),
  });

  const saveRestoredBudgetsMutation = useMutation({
    mutationFn: async () => {
      if (!restoreSub || !user) return;
      const inserts: BudgetInsertPayload[] = [];
      const updates: { id: string; payload: BudgetUpdatePayload }[] = [];

      monthlyRestoreRows.forEach((row) => {
        const raw = restoreAmounts[row.monthYear];
        if (raw === undefined || raw.trim() === "") return;
        const cents = parseCurrencyToCents(raw);
        if (cents <= 0 && !row.existingBudgetId) return;

        if (row.existingBudgetId) {
          updates.push({
            id: row.existingBudgetId,
            payload: { amount: cents },
          });
        } else {
          inserts.push({
            user_id: user.id,
            subcategory_id: restoreSub.id,
            month_year: row.monthYear,
            amount: cents,
            alert_threshold: 90,
            ...(householdId ? { household_id: householdId } : {}),
          });
        }
      });

      if (inserts.length === 0 && updates.length === 0) return;
      await saveBudgetsMutation.mutateAsync({ inserts, updates });
    },
    onSuccess: () => {
      setBudgetVersion((v) => v + 1);
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budgets-with-categories"] });
      setRestoreSub(null);
      setRestoreAmounts({});
    },
  });

  const copyFromPreviousMonth = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (prevBudgets.length === 0) throw new Error("No budgets found in previous month");
      const existingIds = budgets.map((b) => b.subcategory_id);
      
      const inserts: BudgetInsertPayload[] = prevBudgets
        .filter((pb) => !existingIds.includes(pb.subcategory_id))
        .map((pb) => ({
          user_id: user.id,
          subcategory_id: pb.subcategory_id,
          month_year: monthYear,
          amount: pb.amount,
          alert_threshold: pb.alert_threshold,
          ...(householdId ? { household_id: householdId } : {}),
        }));
        
      const updates = prevBudgets
        .filter((pb) => existingIds.includes(pb.subcategory_id))
        .flatMap((pb) => {
          const existingBudget = budgets.find((b) => b.subcategory_id === pb.subcategory_id);
          if (!existingBudget) return [];
          return [{
            id: existingBudget.id,
            payload: { amount: pb.amount, alert_threshold: pb.alert_threshold },
          }];
        });

      await saveBudgetsMutation.mutateAsync({ inserts, updates });
    },
    onSuccess: () => {
      toast.success(t("budgets.copiedSuccess"));
    },
    onError: (e) => toast.error(e.message),
  });

  const setBudgetMutation = useMutation({
    mutationFn: async ({ subcategory_id, amount, alert_threshold }: { subcategory_id: string; amount: string; alert_threshold?: number; }) => {
      if (!user) return;
      const cents = parseCurrencyToCents(amount);
      const existing = budgets.find((b) => b.subcategory_id === subcategory_id);
      
      if (existing) {
        const payload: BudgetUpdatePayload = { amount: cents };
        if (alert_threshold !== undefined) payload.alert_threshold = alert_threshold;
        await saveBudgetsMutation.mutateAsync({ inserts: [], updates: [{ id: existing.id, payload }] });
      } else {
        const payload: BudgetInsertPayload = {
          user_id: user.id,
          subcategory_id,
          month_year: monthYear,
          amount: cents,
          alert_threshold: alert_threshold ?? 90,
        };
        if (householdId) {
          payload.household_id = householdId;
        }
        await saveBudgetsMutation.mutateAsync({ inserts: [payload], updates: [] });
      }
    }
  });

  const deleteBudgetsMutation = useDeleteBudgets({
    onSuccess: () => {
      setBudgetVersion((v) => v + 1);
      toast.success(t("budgets.clearedSuccess"));
    },
    onError: (e) => toast.error(e.message),
  });

  const clearBudgetsMutation = useMutation({
    mutationFn: async () => {
      if (budgets.length === 0) throw new Error("No budgets to clear");
      const ids = budgets.map((b) => b.id);
      await deleteBudgetsMutation.mutateAsync(ids);
    }
  });

  // Group by main category
  const grouped = subcategories
    .filter((sub) => !isIncomeCategory(sub.main_categories?.name))
    .reduce(
      (acc, sub) => {
        const mainName = sub.main_categories?.name || "Other";
        if (!acc[mainName]) acc[mainName] = [];
        acc[mainName].push(sub);
        return acc;
      },
      {} as Record<string, SubcategoryWithMain[]>,
    );

  // Filter transactions by visible accounts (matching Analytics behavior)
  const visibleAccountIds = new Set(accounts.filter((a) => a.is_visible).map((a) => a.id));
  const visibleTransactions = transactions.filter((t) => visibleAccountIds.has(t.account_id));

  const getSpent = (subId: string) =>
    visibleTransactions.filter((t) => t.subcategory_id === subId).reduce((s, t) => s + t.amount, 0);
  const getBudget = (subId: string) => budgets.find((b) => b.subcategory_id === subId)?.amount || 0;

  const prevVisibleTransactions = prevTransactions.filter((t) => visibleAccountIds.has(t.account_id));
  const getPrevSpent = (subId: string) =>
    prevVisibleTransactions.filter((t) => t.subcategory_id === subId).reduce((s, t) => s + t.amount, 0);

  // Income for the month (transactions in income categories)
  const incomeTotal = visibleTransactions
    .filter((t) => {
      const mainName = t.subcategories?.main_categories?.name;
      return isIncomeCategory(mainName);
    })
    .reduce((s, t) => s + t.amount, 0);

  // Totals across all expense subcategories
  const expenseSubIds = subcategories
    .filter((sub) => !isIncomeCategory(sub.main_categories?.name))
    .map((sub) => sub.id);
  const totalBudget = expenseSubIds.reduce((s, id) => s + getBudget(id), 0);
  const totalSpent = expenseSubIds.reduce((s, id) => s + getSpent(id), 0);

  const sortedMainEntries = Object.entries(grouped).sort(([a, subsA], [b, subsB]) =>
    compareMainCategories(
      { name: a, ...subsA[0]?.main_categories },
      { name: b, ...subsB[0]?.main_categories }
    )
  );

  const allCollapsed =
    sortedMainEntries.length > 0 &&
    sortedMainEntries.every(([name]) => !!collapsedCategories[name]);

  const toggleAllCategories = () => {
    if (allCollapsed) {
      setCollapsedCategories({});
    } else {
      const next: Record<string, boolean> = {};
      sortedMainEntries.forEach(([name]) => {
        next[name] = true;
      });
      setCollapsedCategories(next);
    }
  };

  const toggleCategory = (mainName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [mainName]: !prev[mainName],
    }));
  };

  const handleToggleEdit = () => {
    if (!isEditing) {
      // Opening edit mode -> expand all for quick editing
      setCollapsedCategories({});
    }
    setIsEditing((prev) => !prev);
  };

  const openRestoreModal = (sub: SubcategoryWithMain) => {
    setRestoreAmounts({});
    setRestoreSub(sub);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 max-w-4xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{t("budgets.title")}</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[100px] text-center">{formatDate(currentDate, "MMM yyyy")}</span>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={handleToggleEdit}
                className="text-xs gap-1.5 font-medium"
              >
                {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {isEditing ? t("budgets.doneEditing") : t("budgets.editBudgets")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAllCategories}
                className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                {allCollapsed ? t("budgets.expandAll") : t("budgets.collapseAll")}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyFromPreviousMonth.mutate()}
                disabled={prevBudgets.length === 0 || copyFromPreviousMonth.isPending}
                className="text-xs gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                {t("budgets.copyPrevMonth")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(t("budgets.clearBudgetsConfirm"))) {
                    clearBudgetsMutation.mutate();
                  }
                }}
                disabled={budgets.length === 0 || clearBudgetsMutation.isPending}
                className="text-xs gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("budgets.clearBudgets")}
              </Button>
            </div>
          </div>
        </div>

        {/* Total Budget Summary */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{t("budgets.totalBudget")}</div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">{t("budgets.budgeted")}</div>
                  <span className={`font-mono-numbers font-semibold ${totalBudget > incomeTotal && incomeTotal > 0 ? "text-destructive animate-pulse" : ""}`}>
                    {formatCurrency(totalBudget)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">{t("dashboard.spent")}</div>
                  <span className={`font-mono-numbers font-semibold ${totalSpent > totalBudget && totalBudget > 0 ? "text-destructive" : ""}`}>
                    {formatCurrency(totalSpent)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">{t("transactions.income")}</div>
                  <span className="font-mono-numbers font-semibold">
                    {formatCurrency(incomeTotal)}
                  </span>
                </div>
              </div>
            </div>
            {totalBudget > 0 && (
              <div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-pointer py-1">
                      <Progress
                        value={Math.min((totalSpent / totalBudget) * 100, 100)}
                        className={`h-2.5 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${totalSpent > totalBudget ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="font-mono-numbers text-xs font-medium">
                      {((totalSpent / totalBudget) * 100).toFixed(1)}% {t("dashboard.spent")} ({formatCurrency(totalSpent)} / {formatCurrency(totalBudget)})
                    </span>
                  </TooltipContent>
                </Tooltip>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>
                    {totalBudget - totalSpent >= 0
                      ? `${formatCurrency(totalBudget - totalSpent)} ${t("dashboard.remaining")}`
                      : `${formatCurrency(Math.abs(totalBudget - totalSpent))} ${t("budgets.overBudget")}`}
                  </span>
                  <span className="font-mono-numbers">{Math.round((totalSpent / totalBudget) * 100)}%</span>
                </div>
              </div>
            )}

            {/* Main Categories Burndown Overview */}
            {sortedMainEntries.length > 0 && (
              <div className="pt-3 border-t border-border/50 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("dashboard.budgetBurndown")}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {sortedMainEntries.map(([mainName, unsortedSubs]) => {
                    const subs = [...unsortedSubs];
                    const mBudget = subs.reduce((s, sub) => s + getBudget(sub.id), 0);
                    const mSpent = subs.reduce((s, sub) => s + getSpent(sub.id), 0);
                    const mPct = mBudget > 0 ? (mSpent / mBudget) * 100 : 0;
                    const mClampedPct = Math.min(mPct, 100);
                    const mIsInvestment = ["Инвестиции", "Investments"].includes(mainName);
                    const mTargetPct = getBudgetTarget(mainName);
                    const mDisplayName = translateCategory(mainName);
                    const mColor = subs[0]?.main_categories?.color;

                    return (
                      <div key={mainName} className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            {mColor && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: `hsl(${mColor})` }}
                              />
                            )}
                            <span className="truncate">{mDisplayName}</span>
                            {mTargetPct !== undefined && (
                              <span className="text-[10px] text-muted-foreground font-mono-numbers shrink-0">({mTargetPct}%)</span>
                            )}
                          </div>
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-pointer py-0.5">
                              <Progress
                                value={mClampedPct}
                                className={`h-2 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${getBurndownColor(mPct, 90, mIsInvestment)}`}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="font-mono-numbers text-xs font-medium">
                              {mPct.toFixed(1)}% ({formatCurrency(mSpent)} / {formatCurrency(mBudget)})
                            </span>
                          </TooltipContent>
                        </Tooltip>

                        <div className="flex items-center justify-between text-xs font-mono-numbers">
                          <div>
                            <span className={`font-semibold ${getBurndownTextColor(mPct, 90, mIsInvestment)}`}>
                              {formatCurrency(mSpent)}
                            </span>
                            <span className="text-muted-foreground"> / {formatCurrency(mBudget)}</span>
                          </div>
                          <span className="text-muted-foreground text-[11px] font-medium">{Math.round(mPct)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {sortedMainEntries.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                {t("budgets.noCategoriesYet")}
              </div>
            </CardContent>
          </Card>
        )}

        {sortedMainEntries.map(([mainName, unsortedSubs]) => {
          const subs = [...unsortedSubs].sort(compareSubcategories);
          const mainBudgetTotal = subs.reduce((s, sub) => s + getBudget(sub.id), 0);
          const mainSpentTotal = subs.reduce((s, sub) => s + getSpent(sub.id), 0);
          const mainPct = mainBudgetTotal > 0 ? Math.min((mainSpentTotal / mainBudgetTotal) * 100, 100) : 0;
          const isMainOver = mainSpentTotal > mainBudgetTotal && mainBudgetTotal > 0;
          const isInvestment = ["Инвестиции", "Investments"].includes(mainName);
          const targetPct = getBudgetTarget(mainName);
          const budgetedPct = totalBudget > 0 ? (mainBudgetTotal / totalBudget) * 100 : 0;
          const targetAmount = targetPct !== undefined ? Math.round((totalBudget * targetPct) / 100) : 0;
          const offTarget = targetPct !== undefined && Math.abs(budgetedPct - targetPct) > 2;

          const mainCatColor = subs[0]?.main_categories?.color || "215 55% 52%";
          const displayName = translateCategory(mainName);
          const isOpen = !collapsedCategories[mainName];

          return (
            <Card key={mainName} className="overflow-hidden transition-shadow">
              <Collapsible open={isOpen} onOpenChange={() => toggleCategory(mainName)}>
                <CardHeader
                  className="py-3 px-4 cursor-pointer select-none bg-muted/40 hover:bg-muted/60 dark:bg-muted/20 dark:hover:bg-muted/30 border-b border-border/60 transition-colors"
                  onClick={() => toggleCategory(mainName)}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? "" : "-rotate-90"}`}
                      />
                      <div
                        className="w-3 h-3 rounded-full shrink-0 ring-2 ring-background shadow-xs"
                        style={{ backgroundColor: `hsl(${mainCatColor})` }}
                      />
                      <CardTitle className="text-base font-bold tracking-tight text-foreground truncate">{displayName}</CardTitle>
                      <span className="text-xs text-muted-foreground font-normal shrink-0">({subs.length})</span>
                    </div>

                    {targetPct !== undefined && (
                      <div className="grid grid-cols-2 gap-1.5 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="secondary"
                              className="h-6 px-2.5 inline-flex items-center justify-center text-xs font-mono-numbers whitespace-nowrap cursor-help"
                            >
                              {t("budgets.target")} {targetPct}%
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent align="end">
                            <span>{t("budgets.target")}: {targetPct}% ({formatCurrency(targetAmount)})</span>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={`h-6 px-2.5 inline-flex items-center justify-center text-xs font-mono-numbers whitespace-nowrap cursor-help ${
                                offTarget ? "text-warning border-warning/50 bg-warning/10" : "bg-background/80"
                              }`}
                            >
                              {t("budgets.budgeted")} {budgetedPct.toFixed(1)}%
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent align="end">
                            <span>{t("budgets.budgeted")}: {budgetedPct.toFixed(1)}% ({formatCurrency(mainBudgetTotal)})</span>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="cursor-pointer py-1 mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Progress
                          value={mainPct}
                          className={`h-2 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${getBurndownColor(mainPct, 90, isInvestment)}`}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-mono-numbers text-xs font-medium">
                        {mainBudgetTotal > 0 ? ((mainSpentTotal / mainBudgetTotal) * 100).toFixed(1) : "0.0"}% {t("dashboard.spent")} ({formatCurrency(mainSpentTotal)} / {formatCurrency(mainBudgetTotal)})
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex items-center justify-between text-xs font-mono-numbers mt-1.5">
                    <div>
                      <span className={`font-semibold ${isMainOver ? "text-destructive" : ""}`}>
                        {formatCurrency(mainSpentTotal)}
                      </span>
                      <span className="text-muted-foreground"> / {formatCurrency(mainBudgetTotal)}</span>
                    </div>
                    <span className="text-muted-foreground font-medium">{Math.round(mainPct)}%</span>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-3 pb-4 px-4">
                    <div className="space-y-2 divide-y divide-border/30 [&>div:not(:first-child)]:pt-2">
                      {subs.map((sub) => {
                        const budget = getBudget(sub.id);
                        const spent = getSpent(sub.id);
                        const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                        const isOver = spent > budget && budget > 0;
                        const isAlerted = budget > 0 && (spent / budget) * 100 >= 90;
                        const isUnbudgetedSpend = budget === 0 && spent > 0;
                        const prevSpent = getPrevSpent(sub.id);
                        const subColor = mainCatColor || sub.color || "215 55% 52%";
                        const subIconStyle = { backgroundColor: `hsl(${subColor} / 0.12)`, color: `hsl(${subColor})` };

                        if (isEditing) {
                          return (
                            <div
                              key={sub.id}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-2 rounded-lg bg-muted/30 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 sm:min-w-[180px]">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={subIconStyle}>
                                  <DynamicIcon name={sub.icon} className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-medium">{translateCategory(sub.name)}</span>
                              </div>

                              <div className="flex-1">
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 flex-wrap gap-2">
                                  <span>
                                    {t("dashboard.spent")}: <strong className="font-mono-numbers text-foreground">{formatCurrency(spent)}</strong>
                                  </span>
                                  <div className="flex items-center gap-3">
                                    {prevSpent > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBudgetMutation.mutate({
                                            subcategory_id: sub.id,
                                            amount: (prevSpent / 100).toFixed(2),
                                          });
                                        }}
                                        className="hover:underline text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
                                        title={`${t("budgets.applyLastMonth")}: ${formatCurrency(prevSpent)}`}
                                      >
                                        <History className="h-3 w-3 shrink-0" />
                                        <span className="font-mono-numbers">{t("budgets.applyLastMonth")} ({formatCurrency(prevSpent)})</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openRestoreModal(sub)}
                                      className="hover:underline text-[11px] text-primary flex items-center gap-1 cursor-pointer transition-colors font-medium"
                                    >
                                      <RotateCcw className="h-3 w-3 shrink-0" />
                                      <span>{language === "bg" ? "Възстанови по месеци" : "Restore multi-month"}</span>
                                    </button>
                                  </div>
                                </div>
                                <Progress
                                  value={pct}
                                  className={`h-1.5 rounded-full ${isOver ? "[&>div]:bg-destructive" : ""}`}
                                />
                              </div>

                              <div className="flex items-center gap-2 justify-end sm:min-w-[130px]">
                                <Input
                                  key={`${sub.id}-${budgetVersion}-${budget}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  className="w-24 sm:w-28 h-8 text-xs font-mono-numbers text-right"
                                  defaultValue={budget > 0 ? (budget / 100).toFixed(2) : ""}
                                  onBlur={(e) => {
                                    if (e.target.value !== "" || budget > 0) {
                                      setBudgetMutation.mutate({
                                        subcategory_id: sub.id,
                                        amount: e.target.value || "0",
                                      });
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={sub.id}
                            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-1.5 px-1 rounded-md hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 sm:min-w-[180px] flex-wrap">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={subIconStyle}>
                                <DynamicIcon name={sub.icon} className="h-4 w-4" />
                              </div>
                              <span className="text-sm font-medium">{translateCategory(sub.name)}</span>
                              {isAlerted && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Bell className="h-3.5 w-3.5 text-warning shrink-0 cursor-default" />
                                  </TooltipTrigger>
                                  <TooltipContent>{t("budgets.alertThreshold")}</TooltipContent>
                                </Tooltip>
                              )}
                              {isUnbudgetedSpend && (
                                <button
                                  type="button"
                                  onClick={() => openRestoreModal(sub)}
                                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-warning border border-warning/40 hover:bg-warning/10 rounded-full py-0.5 px-2 font-semibold cursor-pointer transition-colors"
                                  title={language === "bg" ? "Натиснете за възстановяване на бюджетите по месеци" : "Click to restore monthly budgets"}
                                >
                                  {t("budgets.unbudgeted")}
                                  <RotateCcw className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>

                            <div className="flex-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="cursor-pointer py-1">
                                    {isUnbudgetedSpend ? (
                                      <Progress value={100} className="h-2 transition-all hover:ring-2 hover:ring-warning/20 rounded-full [&>div]:bg-warning" />
                                    ) : (
                                      <Progress value={pct} className={`h-2 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${isOver ? "[&>div]:bg-destructive" : ""}`} />
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <span className="font-mono-numbers text-xs font-medium">
                                    {isUnbudgetedSpend
                                      ? `${t("budgets.unbudgeted")}: ${formatCurrency(spent)}`
                                      : `${budget > 0 ? ((spent / budget) * 100).toFixed(1) : "0.0"}% (${formatCurrency(spent)} / ${formatCurrency(budget)})`}
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 sm:min-w-[180px]">
                              <div className="text-right text-xs">
                                <span className={`font-mono-numbers font-semibold ${isOver ? "text-destructive" : isUnbudgetedSpend ? "text-warning" : ""}`}>
                                  {formatCurrency(spent)}
                                </span>
                                <span className="text-muted-foreground font-mono-numbers">
                                  {" "}/ {budget > 0 ? formatCurrency(budget) : "—"}
                                </span>
                              </div>
                              <div className="min-w-[48px] text-right">
                                {budget > 0 ? (
                                  <Badge
                                    variant={isOver ? "destructive" : "secondary"}
                                    className="font-mono-numbers text-[11px] px-1.5 py-0"
                                  >
                                    {((spent / budget) * 100).toFixed(0)}%
                                  </Badge>
                                ) : isUnbudgetedSpend ? (
                                  <Badge variant="outline" className="font-mono-numbers text-[11px] text-warning border-warning/40 px-1.5 py-0">
                                    !
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground font-mono-numbers">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}

        {/* Multi-month Budget & Transaction Recovery Dialog */}
        <Dialog open={!!restoreSub} onOpenChange={(open) => { if (!open) setRestoreSub(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-primary" />
                {language === "bg"
                  ? `Възстановяване на бюджети: ${translateCategory(restoreSub?.name)}`
                  : `Restore Monthly Budgets: ${translateCategory(restoreSub?.name)}`}
              </DialogTitle>
              <DialogDescription>
                {language === "bg"
                  ? "Оценихме липсващия бюджет за всеки месец спрямо целта 50/30/20 (остатъка от другите подкатегории) и реалните разходи за месеца."
                  : "We estimated each month's missing budget from your 50/30/20 target gap (remaining main category budget) and your actual spending in that month."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {historyData?.orphanTransactions && historyData.orphanTransactions.length > 0 && (
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-center justify-between gap-3">
                  <div className="text-xs space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {language === "bg"
                        ? `Намерени са ${historyData.orphanTransactions.length} транзакции без категория`
                        : `Found ${historyData.orphanTransactions.length} uncategorized expense transactions`}
                    </p>
                    <p className="text-muted-foreground">
                      {language === "bg"
                        ? "Ако те са били от тази изтрита подкатегория, можете да ги свържете отново с 1 клик."
                        : "If these belonged to this deleted subcategory, re-link them first so monthly spend is accurate."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs"
                    disabled={relinkOrphansMutation.isPending}
                    onClick={() => relinkOrphansMutation.mutate()}
                  >
                    {language === "bg" ? "Свържи ги" : "Re-link"}
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const next: Record<string, string> = {};
                    monthlyRestoreRows.forEach((r) => {
                      const val = r.inferredFromTarget > 0 ? r.inferredFromTarget : r.spentInMonth;
                      next[r.monthYear] = val > 0 ? (val / 100).toFixed(2) : "";
                    });
                    setRestoreAmounts(next);
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  {language === "bg" ? "Попълни от 50/30/20 остатък" : "Fill from 50/30/20 Target Gap"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const next: Record<string, string> = {};
                    monthlyRestoreRows.forEach((r) => {
                      next[r.monthYear] = r.spentInMonth > 0 ? (r.spentInMonth / 100).toFixed(2) : "";
                    });
                    setRestoreAmounts(next);
                  }}
                >
                  <History className="h-3 w-3" />
                  {language === "bg" ? "Попълни от реално изхарчено" : "Fill from Actual Monthly Spend"}
                </Button>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-border/50 border rounded-lg px-3">
                {monthlyRestoreRows.map((row) => {
                  const [y, m] = row.monthYear.split("-").map(Number);
                  const monthLabel = formatDate(new Date(y, m - 1, 1), "MMM yyyy");
                  return (
                    <div key={row.monthYear} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-semibold text-sm">{monthLabel}</div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 font-mono-numbers">
                          <span>
                            {t("dashboard.spent")}: <strong className="text-foreground">{formatCurrency(row.spentInMonth)}</strong>
                          </span>
                          {row.inferredFromTarget > 0 && (
                            <span>
                              {language === "bg" ? "50% остатък" : "50% gap"}:{" "}
                              <strong className="text-primary">{formatCurrency(row.inferredFromTarget)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="w-28 h-8 text-xs font-mono-numbers text-right shrink-0"
                        value={restoreAmounts[row.monthYear] ?? ""}
                        onChange={(e) =>
                          setRestoreAmounts((prev) => ({
                            ...prev,
                            [row.monthYear]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRestoreSub(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => saveRestoredBudgetsMutation.mutate()}
                disabled={saveRestoredBudgetsMutation.isPending}
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
