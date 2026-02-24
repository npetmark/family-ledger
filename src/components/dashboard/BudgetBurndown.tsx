import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, getMonthYear } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DynamicIcon } from "@/components/DynamicIcon";

function getBurndownColor(pct: number, alertThreshold: number): string {
  if (pct >= 100) return "[&>div]:bg-destructive";
  if (pct >= alertThreshold) return "[&>div]:bg-warning";
  return "[&>div]:bg-income";
}

function getBurndownTextColor(pct: number, alertThreshold: number): string {
  if (pct >= 100) return "text-destructive";
  if (pct >= alertThreshold) return "text-warning";
  return "text-income";
}

export function BudgetBurndown() {
  const { user } = useAuth();
  const monthYear = getMonthYear();

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets", user?.id, monthYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*, subcategories(name, icon, main_categories(name))")
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
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("transactions")
        .select("subcategory_id, amount")
        .eq("transaction_type", "expense")
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const budgetItems = budgets
    .filter((b) => b.amount > 0)
    .map((b) => {
      const spent = transactions
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
        budget: b.amount,
        spent,
        remaining,
        pct,
        alertThreshold: b.alert_threshold,
      };
    })
    .sort((a, b) => b.pct - a.pct);

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
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {budgetItems.map((item) => {
            const clampedPct = Math.min(item.pct, 100);
            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DynamicIcon name={item.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="text-xs text-right">
                    <span className={`font-mono-numbers font-medium ${getBurndownTextColor(item.pct, item.alertThreshold)}`}>
                      {formatCurrency(item.spent)}
                    </span>
                    <span className="text-muted-foreground"> / {formatCurrency(item.budget)}</span>
                  </div>
                </div>
                <Progress
                  value={clampedPct}
                  className={`h-1.5 ${getBurndownColor(item.pct, item.alertThreshold)}`}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {item.remaining >= 0
                      ? `${formatCurrency(item.remaining)} remaining`
                      : `${formatCurrency(Math.abs(item.remaining))} over budget (${Math.round(item.pct - 100)}% over)`}
                  </span>
                  <span>{Math.round(item.pct)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
