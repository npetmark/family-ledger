import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useBudgetsWithCategories } from "@/hooks/queries/useBudgets";
import { useTransactions } from "@/hooks/queries/useTransactions";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, getMonthYear, isIncomeCategory, compareMainCategories, compareSubcategories } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

function getBurndownColor(pct: number, alertThreshold: number, isInvestment = false): string {
  if (isInvestment) {
    if (pct >= 80) return "[&>div]:bg-income";
    if (pct >= 50) return "[&>div]:bg-warning";
    return "[&>div]:bg-destructive";
  }
  if (pct >= 100) return "[&>div]:bg-destructive";
  if (pct >= alertThreshold) return "[&>div]:bg-warning";
  return "[&>div]:bg-income";
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

export function BudgetBurndown() {
  const { user } = useAuth();
  const { t, translateCategory } = useLanguage();
  const monthYear = getMonthYear();

  const { data: accounts = [] } = useAccounts(user?.id);

  const { data: budgets = [] } = useBudgetsWithCategories(user?.id, monthYear);

  const now = new Date();
  const dateFilter = useMemo(() => {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }, [monthYear]); // Intentionally using monthYear to trigger reload if it changes

  const { data: transactions = [] } = useTransactions(user?.id, dateFilter);


  // Filter by visible accounts only
  const visibleAccountIds = new Set(accounts.filter((a) => a.is_visible).map((a) => a.id));
  const visibleTransactions = transactions.filter((t) => visibleAccountIds.has(t.account_id));
  const expenseLike = visibleTransactions.filter(
    (t) => t.transaction_type === "expense" || (t.transaction_type === "transfer" && t.subcategory_id)
  );

  const budgetItems = budgets
    .filter((b) => b.amount > 0)
    .map((b) => {
      const spent = expenseLike
        .filter((t) => t.subcategory_id === b.subcategory_id)
        .reduce((sum, t) => sum + t.amount, 0);
      const remaining = b.amount - spent;
      const pct = (spent / b.amount) * 100;
      const sub = (b as any).subcategories;
      return {
        id: b.id,
        subcategoryId: b.subcategory_id,
        name: sub?.name || "Unknown",
        icon: sub?.icon || "circle",
        mainCategory: sub?.main_categories?.name || "",
        mainCategoryId: sub?.main_categories?.id || "",
        mainCategorySortOrder: sub?.main_categories?.sort_order ?? 999,
        subSortOrder: (sub?.sort_order ?? 999) as number,
        budget: b.amount,
        spent,
        remaining,
        pct,
        alertThreshold: b.alert_threshold,
        unbudgeted: false,
      };
    });

  // Add unbudgeted subcategories that have spending this month (excluding income)
  const budgetedSubIds = new Set(budgetItems.map((i) => i.subcategoryId));
  const unbudgetedMap = new Map<string, typeof budgetItems[number]>();
  expenseLike.forEach((t: any) => {
    const sub = t.subcategories;
    if (!sub) return;
    if (budgetedSubIds.has(t.subcategory_id)) return;
    const mainName = sub.main_categories?.name || "";
    if (isIncomeCategory(mainName)) return;
    const existing = unbudgetedMap.get(t.subcategory_id);
    if (existing) {
      existing.spent += t.amount;
      existing.remaining = -existing.spent;
    } else {
      unbudgetedMap.set(t.subcategory_id, {
        id: `unbudgeted-${t.subcategory_id}`,
        subcategoryId: t.subcategory_id,
        name: sub.name || "Unknown",
        icon: sub.icon || "circle",
        mainCategory: mainName,
        mainCategoryId: sub.main_categories?.id || "",
        mainCategorySortOrder: sub.main_categories?.sort_order ?? 999,
        subSortOrder: sub.sort_order ?? 999,
        budget: 0,
        spent: t.amount,
        remaining: -t.amount,
        pct: 0,
        alertThreshold: 90,
        unbudgeted: true,
      });
    }
  });
  const allItems = [...budgetItems, ...Array.from(unbudgetedMap.values())];

  // Group by main category
  const grouped: Record<string, typeof allItems> = {};
  allItems.forEach((item) => {
    if (!grouped[item.mainCategory]) grouped[item.mainCategory] = [];
    grouped[item.mainCategory].push(item);
  });

  // Fixed subcategory order within each group: budgeted first, then unbudgeted,
  // each by sort_order → name (not by % spent, so rows don't jump around)
  Object.values(grouped).forEach((items) =>
    items.sort((a, b) => {
      if (a.unbudgeted !== b.unbudgeted) return a.unbudgeted ? 1 : -1;
      return compareSubcategories(
        { name: a.name, sort_order: a.subSortOrder, id: a.subcategoryId },
        { name: b.name, sort_order: b.subSortOrder, id: b.subcategoryId }
      );
    })
  );

  const investmentNames = ["Инвестиции", "Investments"];

  const sortedCategories = Object.keys(grouped)
    .sort((a, b) =>
      compareMainCategories(
        { name: a, sort_order: grouped[a][0]?.mainCategorySortOrder },
        { name: b, sort_order: grouped[b][0]?.mainCategorySortOrder }
      )
    )
    .map((name) => {
      const items = grouped[name];
      const totalBudget = items.reduce((s, b) => s + b.budget, 0);
      const totalSpent = items.reduce((s, b) => s + b.spent, 0);
      const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
      const isInvestment = investmentNames.includes(name);
      return { name, items, totalBudget, totalSpent, remaining: totalBudget - totalSpent, pct, isInvestment };
    });

  const totalBudget = allItems.reduce((s, b) => s + b.budget, 0);
  const totalSpent = allItems.reduce((s, b) => s + b.spent, 0);
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  if (allItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{t("dashboard.budgetBurndown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            {t("dashboard.noBudgetsSet")}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">{t("dashboard.budgetBurndown")}</CardTitle>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-muted-foreground">{t("common.total")}</span>
          <div className="text-sm">
            <span className={`font-mono-numbers font-medium ${getBurndownTextColor(totalPct, 90)}`}>
              {formatCurrency(totalSpent)}
            </span>
            <span className="text-muted-foreground"> / {formatCurrency(totalBudget)}</span>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-pointer py-1">
              <Progress
                value={Math.min(totalPct, 100)}
                className={`h-2 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${getBurndownColor(totalPct, 90)}`}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-mono-numbers text-xs font-medium">
              {totalPct.toFixed(1)}% ({formatCurrency(totalSpent)} / {formatCurrency(totalBudget)})
            </span>
          </TooltipContent>
        </Tooltip>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>
            {totalBudget - totalSpent >= 0
              ? `${formatCurrency(totalBudget - totalSpent)} ${t("dashboard.remaining")}`
              : `${formatCurrency(Math.abs(totalBudget - totalSpent))} ${t("budgets.overBudget")}`}
          </span>
          <span>{Math.round(totalPct)}%</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedCategories.map((cat) => {
            const clampedPct = Math.min(cat.pct, 100);
            // Use average alert threshold from subcategories, default 90
            const avgThreshold = cat.items.length > 0
              ? cat.items.reduce((s, i) => s + i.alertThreshold, 0) / cat.items.length
              : 90;

            const displayName = translateCategory(cat.name);

            return (
              <Collapsible key={cat.name}>
                <div className="space-y-1">
                  <CollapsibleTrigger className="flex w-full items-center justify-between group cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                      <span className="text-sm font-medium">{displayName}</span>
                    </div>
                    <div className="text-xs text-right">
                      <span className={`font-mono-numbers font-medium ${getBurndownTextColor(cat.pct, avgThreshold, cat.isInvestment)}`}>
                        {formatCurrency(cat.totalSpent)}
                      </span>
                      <span className="text-muted-foreground"> / {formatCurrency(cat.totalBudget)}</span>
                    </div>
                  </CollapsibleTrigger>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-pointer py-1">
                        <Progress
                          value={clampedPct}
                          className={`h-1.5 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${getBurndownColor(cat.pct, avgThreshold, cat.isInvestment)}`}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-mono-numbers text-xs font-medium">
                        {cat.pct.toFixed(1)}% ({formatCurrency(cat.totalSpent)} / {formatCurrency(cat.totalBudget)})
                      </span>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {cat.remaining >= 0
                        ? `${formatCurrency(cat.remaining)} ${t("dashboard.remaining")}`
                        : `${formatCurrency(Math.abs(cat.remaining))} ${t("budgets.overBudget")}`}
                    </span>
                    <span>{Math.round(cat.pct)}%</span>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="ml-5 mt-2 space-y-3 border-l border-border pl-3">
                    {cat.items.map((item) => {
                      const itemClampedPct = Math.min(item.pct, 100);
                      const subName = translateCategory(item.name);
                      if (item.unbudgeted) {
                        return (
                          <div key={item.id} className="space-y-1 opacity-80">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <DynamicIcon name={item.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{subName}</span>
                                <span className="text-[10px] uppercase tracking-wide text-warning font-medium">{t("budgets.unbudgeted")}</span>
                              </div>
                              <div className="text-xs text-right">
                                <span className="font-mono-numbers font-medium text-warning">
                                  {formatCurrency(item.spent)}
                                </span>
                                <span className="text-muted-foreground"> / —</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={item.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DynamicIcon name={item.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{subName}</span>
                            </div>
                            <div className="text-xs text-right">
                              <span className={`font-mono-numbers font-medium ${getBurndownTextColor(item.pct, item.alertThreshold, cat.isInvestment)}`}>
                                {formatCurrency(item.spent)}
                              </span>
                              <span className="text-muted-foreground"> / {formatCurrency(item.budget)}</span>
                            </div>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-pointer py-1">
                                <Progress
                                  value={itemClampedPct}
                                  className={`h-1.5 transition-all hover:ring-2 hover:ring-primary/20 rounded-full ${getBurndownColor(item.pct, item.alertThreshold, cat.isInvestment)}`}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <span className="font-mono-numbers text-xs font-medium">
                                {item.pct.toFixed(1)}% ({formatCurrency(item.spent)} / {formatCurrency(item.budget)})
                              </span>
                            </TooltipContent>
                          </Tooltip>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {item.remaining >= 0
                                ? `${formatCurrency(item.remaining)} ${t("dashboard.remaining")}`
                                : `${formatCurrency(Math.abs(item.remaining))} ${t("budgets.overBudget")}`}
                            </span>
                            <span>{Math.round(item.pct)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
