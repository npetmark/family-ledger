import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, getMonthYear } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/DynamicIcon";
import { ChevronRight } from "lucide-react";

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
  const monthYear = getMonthYear();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets", user?.id, monthYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*, subcategories(name, icon, main_categories(name, id, sort_order))")
        .eq("month_year", monthYear);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-for-budget", user?.id, monthYear],
    queryFn: async () => {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const startOfMonth = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const endOfMonth = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("transactions")
        .select("subcategory_id, amount, account_id, transaction_type")
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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
        name: sub?.name || "Unknown",
        icon: sub?.icon || "circle",
        mainCategory: sub?.main_categories?.name || "",
        mainCategoryId: sub?.main_categories?.id || "",
        mainCategorySortOrder: sub?.main_categories?.sort_order ?? 999,
        budget: b.amount,
        spent,
        remaining,
        pct,
        alertThreshold: b.alert_threshold,
      };
    });

  // Group by main category
  const mainCategoryOrder = ["Нужди", "Желания", "Инвестиции"];
  const grouped: Record<string, typeof budgetItems> = {};
  budgetItems.forEach((item) => {
    if (!grouped[item.mainCategory]) grouped[item.mainCategory] = [];
    grouped[item.mainCategory].push(item);
  });

  // Sort subcategories within each group by pct descending
  Object.values(grouped).forEach((items) => items.sort((a, b) => b.pct - a.pct));

  const investmentNames = ["Инвестиции", "Investments"];

  const sortedCategories = mainCategoryOrder
    .filter((name) => grouped[name])
    .map((name) => {
      const items = grouped[name];
      const totalBudget = items.reduce((s, b) => s + b.budget, 0);
      const totalSpent = items.reduce((s, b) => s + b.spent, 0);
      const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
      const isInvestment = investmentNames.includes(name);
      return { name, items, totalBudget, totalSpent, remaining: totalBudget - totalSpent, pct, isInvestment };
    });

  // Add any remaining categories not in the predefined order
  Object.entries(grouped).forEach(([name, items]) => {
    if (!mainCategoryOrder.includes(name)) {
      const totalBudget = items.reduce((s, b) => s + b.budget, 0);
      const totalSpent = items.reduce((s, b) => s + b.spent, 0);
      const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
      const isInvestment = investmentNames.includes(name);
      sortedCategories.push({ name, items, totalBudget, totalSpent, remaining: totalBudget - totalSpent, pct, isInvestment });
    }
  });

  const totalBudget = budgetItems.reduce((s, b) => s + b.budget, 0);
  const totalSpent = budgetItems.reduce((s, b) => s + b.spent, 0);
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  if (budgetItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Budget Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No budgets set for this month
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Budget Burndown</CardTitle>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-muted-foreground">Overall</span>
          <div className="text-sm">
            <span className={`font-mono-numbers font-medium ${getBurndownTextColor(totalPct, 90)}`}>
              {formatCurrency(totalSpent)}
            </span>
            <span className="text-muted-foreground"> / {formatCurrency(totalBudget)}</span>
          </div>
        </div>
        <Progress
          value={Math.min(totalPct, 100)}
          className={`h-2 mt-1 ${getBurndownColor(totalPct, 90)}`}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>
            {totalBudget - totalSpent >= 0
              ? `${formatCurrency(totalBudget - totalSpent)} remaining`
              : `${formatCurrency(Math.abs(totalBudget - totalSpent))} over budget`}
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

            return (
              <Collapsible key={cat.name}>
                <div className="space-y-1">
                  <CollapsibleTrigger className="flex w-full items-center justify-between group cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                    <div className="text-xs text-right">
                      <span className={`font-mono-numbers font-medium ${getBurndownTextColor(cat.pct, avgThreshold, cat.isInvestment)}`}>
                        {formatCurrency(cat.totalSpent)}
                      </span>
                      <span className="text-muted-foreground"> / {formatCurrency(cat.totalBudget)}</span>
                    </div>
                  </CollapsibleTrigger>
                  <Progress
                    value={clampedPct}
                    className={`h-1.5 ${getBurndownColor(cat.pct, avgThreshold, cat.isInvestment)}`}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {cat.remaining >= 0
                        ? `${formatCurrency(cat.remaining)} remaining`
                        : `${formatCurrency(Math.abs(cat.remaining))} over budget`}
                    </span>
                    <span>{Math.round(cat.pct)}%</span>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="ml-5 mt-2 space-y-3 border-l border-border pl-3">
                    {cat.items.map((item) => {
                      const itemClampedPct = Math.min(item.pct, 100);
                      return (
                        <div key={item.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <DynamicIcon name={item.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{item.name}</span>
                            </div>
                            <div className="text-xs text-right">
                              <span className={`font-mono-numbers font-medium ${getBurndownTextColor(item.pct, item.alertThreshold, cat.isInvestment)}`}>
                                {formatCurrency(item.spent)}
                              </span>
                              <span className="text-muted-foreground"> / {formatCurrency(item.budget)}</span>
                            </div>
                          </div>
                          <Progress
                            value={itemClampedPct}
                            className={`h-1.5 ${getBurndownColor(item.pct, item.alertThreshold, cat.isInvestment)}`}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>
                              {item.remaining >= 0
                                ? `${formatCurrency(item.remaining)} remaining`
                                : `${formatCurrency(Math.abs(item.remaining))} over budget`}
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
  );
}
