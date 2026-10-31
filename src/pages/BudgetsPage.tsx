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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronsUpDown, Bell, Copy, Trash2, History, Pencil, Check, Menu } from "lucide-react";
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

  const saveBudgetsMutation = useSaveBudgets({
    onSuccess: () => toast.success("Budget updated"),
    onError: (e) => toast.error(e.message),
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

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllCategories}
                className="text-xs gap-1.5"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                {allCollapsed ? t("budgets.expandAll") : t("budgets.collapseAll")}
              </Button>
              {isEditing && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleToggleEdit}
                  className="text-xs gap-1.5 font-medium animate-in fade-in"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("budgets.doneEditing")}
                </Button>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleToggleEdit} className="gap-2 cursor-pointer">
                  {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  <span>{isEditing ? t("budgets.doneEditing") : t("budgets.editBudgets")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => copyFromPreviousMonth.mutate()}
                  disabled={prevBudgets.length === 0 || copyFromPreviousMonth.isPending}
                  className="gap-2 cursor-pointer"
                >
                  <Copy className="h-4 w-4" />
                  <span>{t("budgets.copyPrevMonth")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm(t("budgets.clearBudgetsConfirm"))) {
                      clearBudgetsMutation.mutate();
                    }
                  }}
                  disabled={budgets.length === 0 || clearBudgetsMutation.isPending}
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t("budgets.clearBudgets")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                          <TooltipContent align="end" className="max-w-[260px] text-xs">
                            <div className="font-semibold">{t("budgets.target")}: {targetPct}% ({formatCurrency(targetAmount)})</div>
                            <div className="text-muted-foreground text-[11px] mt-0.5 leading-snug">
                              {t("budgets.targetTooltip")}
                            </div>
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
                          <TooltipContent align="end" className="max-w-[260px] text-xs">
                            <div className="font-semibold">{t("budgets.budgeted")}: {budgetedPct.toFixed(1)}% ({formatCurrency(mainBudgetTotal)})</div>
                            <div className="text-muted-foreground text-[11px] mt-0.5 leading-snug">
                              {offTarget ? t("budgets.budgetedOffTargetTooltip") : t("budgets.budgetedTooltip")}
                            </div>
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
                                <span className="text-[10px] uppercase tracking-wide text-warning border border-warning/40 rounded-full py-0.5 px-2 font-semibold">
                                  {t("budgets.unbudgeted")}
                                </span>
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
      </div>
    </TooltipProvider>
  );
}
