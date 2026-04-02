import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents, getMonthYear } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Bell, AlertTriangle, Copy, Trash2 } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";

const BUDGET_TARGETS: Record<string, number> = {
  Нужди: 50,
  Желания: 20,
  Инвестиции: 30,
};

const INCOME_CATEGORY = "Приходи";

const ALERT_THRESHOLDS = [
  { value: "75", label: "75%" },
  { value: "90", label: "90%" },
  { value: "100", label: "100%" },
];

export default function BudgetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [budgetVersion, setBudgetVersion] = useState(0);
  const monthYear = getMonthYear(currentDate);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-with-main", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcategories")
        .select("*, main_categories(name, sort_order)")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets", user?.id, monthYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*").eq("month_year", monthYear);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
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
      return data;
    },
    enabled: !!user,
  });

  const prevMonthYear = getMonthYear(subMonths(currentDate, 1));
  const { data: prevBudgets = [] } = useQuery({
    queryKey: ["budgets", user?.id, prevMonthYear],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*").eq("month_year", prevMonthYear);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const copyFromPreviousMonth = useMutation({
    mutationFn: async () => {
      if (prevBudgets.length === 0) throw new Error("No budgets found in previous month");
      const existing = budgets.map((b) => b.subcategory_id);
      const toInsert = prevBudgets
        .filter((pb) => !existing.includes(pb.subcategory_id))
        .map((pb) => ({
          user_id: user!.id,
          subcategory_id: pb.subcategory_id,
          month_year: monthYear,
          amount: pb.amount,
          alert_threshold: pb.alert_threshold,
        }));
      const toUpdate = prevBudgets.filter((pb) => existing.includes(pb.subcategory_id));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("budgets").insert(toInsert);
        if (error) throw error;
      }
      for (const pb of toUpdate) {
        const existingBudget = budgets.find((b) => b.subcategory_id === pb.subcategory_id);
        if (existingBudget) {
          const { error } = await supabase
            .from("budgets")
            .update({ amount: pb.amount, alert_threshold: pb.alert_threshold })
            .eq("id", existingBudget.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget copied from previous month");
    },
    onError: (e) => toast.error(e.message),
  });

  const setBudgetMutation = useMutation({
    mutationFn: async ({
      subcategory_id,
      amount,
      alert_threshold,
    }: {
      subcategory_id: string;
      amount: string;
      alert_threshold?: number;
    }) => {
      const cents = parseCurrencyToCents(amount);
      const existing = budgets.find((b) => b.subcategory_id === subcategory_id);
      if (existing) {
        const update: any = { amount: cents };
        if (alert_threshold !== undefined) update.alert_threshold = alert_threshold;
        const { error } = await supabase.from("budgets").update(update).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("budgets").insert({
          user_id: user!.id,
          subcategory_id,
          month_year: monthYear,
          amount: cents,
          alert_threshold: alert_threshold ?? 90,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const setAlertMutation = useMutation({
    mutationFn: async ({ subcategory_id, alert_threshold }: { subcategory_id: string; alert_threshold: number }) => {
      const existing = budgets.find((b) => b.subcategory_id === subcategory_id);
      if (existing) {
        const { error } = await supabase.from("budgets").update({ alert_threshold }).eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Alert threshold updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const clearBudgetsMutation = useMutation({
    mutationFn: async () => {
      if (budgets.length === 0) throw new Error("No budgets to clear");
      const ids = budgets.map((b) => b.id);
      const { error } = await supabase.from("budgets").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setBudgetVersion((v) => v + 1);
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("All budgets cleared for this month");
    },
    onError: (e) => toast.error(e.message),
  });

  // Group by main category
  const grouped = subcategories
    .filter((sub) => (sub as any).main_categories?.name !== INCOME_CATEGORY)
    .reduce(
      (acc, sub) => {
        const mainName = (sub as any).main_categories?.name || "Other";
        if (!acc[mainName]) acc[mainName] = [];
        acc[mainName].push(sub);
        return acc;
      },
      {} as Record<string, typeof subcategories>,
    );

  // Filter transactions by visible accounts (matching Analytics behavior)
  const visibleAccountIds = new Set(accounts.filter((a) => a.is_visible).map((a) => a.id));
  const visibleTransactions = transactions.filter((t) => visibleAccountIds.has(t.account_id));

  const getSpent = (subId: string) =>
    visibleTransactions.filter((t) => t.subcategory_id === subId).reduce((s, t) => s + t.amount, 0);
  const getBudget = (subId: string) => budgets.find((b) => b.subcategory_id === subId)?.amount || 0;
  const getAlertThreshold = (subId: string) => budgets.find((b) => b.subcategory_id === subId)?.alert_threshold ?? 90;

  // Income for the month (transactions in income categories)
  const incomeTotal = visibleTransactions
    .filter((t) => {
      const mainName = (t as any).subcategories?.main_categories?.name;
      return mainName === INCOME_CATEGORY;
    })
    .reduce((s, t) => s + t.amount, 0);

  // Totals across all expense subcategories
  const expenseSubIds = subcategories
    .filter((sub) => (sub as any).main_categories?.name !== INCOME_CATEGORY)
    .map((sub) => sub.id);
  const totalBudget = expenseSubIds.reduce((s, id) => s + getBudget(id), 0);
  const totalSpent = expenseSubIds.reduce((s, id) => s + getSpent(id), 0);
  const budgetExceedsIncome = totalBudget > 0 && incomeTotal > 0 && totalBudget > incomeTotal;

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Budgets</h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[100px] text-center">{format(currentDate, "MMM yyyy")}</span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyFromPreviousMonth.mutate()}
            disabled={prevBudgets.length === 0 || copyFromPreviousMonth.isPending}
            className="text-xs gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy from {format(subMonths(currentDate, 1), "MMM")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Clear all budget values for this month?")) {
                clearBudgetsMutation.mutate();
              }
            }}
            disabled={budgets.length === 0 || clearBudgetsMutation.isPending}
            className="text-xs gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Total Budget Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Total Budget</div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Budget</div>
                <span className={`font-mono-numbers font-semibold ${budgetExceedsIncome ? "text-destructive animate-pulse" : ""}`}>
                  {formatCurrency(totalBudget)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Spent</div>
                <span className={`font-mono-numbers font-semibold ${totalSpent > totalBudget && totalBudget > 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(totalSpent)}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Income</div>
                <span className={`font-mono-numbers font-semibold ${budgetExceedsIncome ? "text-destructive animate-pulse" : ""}`}>
                  {formatCurrency(incomeTotal)}
                </span>
              </div>
            </div>
          </div>
          {totalBudget > 0 && (
            <Progress
              value={Math.min((totalSpent / totalBudget) * 100, 100)}
              className={`h-2 mt-3 ${totalSpent > totalBudget ? "[&>div]:bg-destructive" : ""}`}
            />
          )}
        </CardContent>
      </Card>

      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No active categories. Add categories first to set budgets.
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped)
        .sort(([a], [b]) => {
          const order = ["Нужди", "Желания", "Инвестиции"];
          const ai = order.indexOf(a);
          const bi = order.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
        .map(([mainName, subs]) => {
          const mainBudgetTotal = subs.reduce((s, sub) => s + getBudget(sub.id), 0);
          const mainSpentTotal = subs.reduce((s, sub) => s + getSpent(sub.id), 0);
          const mainPct = mainBudgetTotal > 0 ? Math.min((mainSpentTotal / mainBudgetTotal) * 100, 100) : 0;
          const isMainOver = mainSpentTotal > mainBudgetTotal && mainBudgetTotal > 0;

          return (
            <Card key={mainName}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-medium">{mainName}</CardTitle>
                    {BUDGET_TARGETS[mainName] && (
                      <Badge variant="secondary" className="text-xs font-mono-numbers">
                        {BUDGET_TARGETS[mainName]}%
                      </Badge>
                    )}
                    {isMainOver && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="text-right text-sm">
                    <span className={`font-mono-numbers ${isMainOver ? "text-destructive" : ""}`}>
                      {formatCurrency(mainSpentTotal)}
                    </span>
                    <span className="text-muted-foreground"> / {formatCurrency(mainBudgetTotal)}</span>
                  </div>
                </div>
                <Progress value={mainPct} className={`h-2 mt-2 ${isMainOver ? "[&>div]:bg-destructive" : ""}`} />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {subs.map((sub) => {
                    const budget = getBudget(sub.id);
                    const spent = getSpent(sub.id);
                    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                    const isOver = spent > budget && budget > 0;
                    const alertThreshold = getAlertThreshold(sub.id);
                    const isAlerted = budget > 0 && (spent / budget) * 100 >= alertThreshold;

                    return (
                      <div key={sub.id} className="space-y-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <div className="flex items-center gap-2 sm:min-w-[140px]">
                            <DynamicIcon name={sub.icon} className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{sub.name}</span>
                            {isAlerted && <Bell className="h-3 w-3 text-warning" />}
                            <span className={`text-xs font-mono-numbers sm:hidden ${isOver ? "text-destructive" : ""}`}>
                              {formatCurrency(spent)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <Progress value={pct} className={`h-1.5 ${isOver ? "[&>div]:bg-destructive" : ""}`} />
                          </div>
                          <div className="hidden sm:block text-right min-w-[90px]">
                            <span className={`text-xs font-mono-numbers ${isOver ? "text-destructive" : ""}`}>
                              {formatCurrency(spent)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              key={`${sub.id}-${budgetVersion}-${budget}`}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Budget"
                              className="flex-1 sm:w-24 h-8 text-xs"
                              defaultValue={budget > 0 ? (budget / 100).toFixed(2) : ""}
                              onBlur={(e) => {
                                if (e.target.value) {
                                  setBudgetMutation.mutate({ subcategory_id: sub.id, amount: e.target.value });
                                }
                              }}
                            />
                            <Select
                              value={alertThreshold.toString()}
                              onValueChange={(v) =>
                                setAlertMutation.mutate({ subcategory_id: sub.id, alert_threshold: parseInt(v) })
                              }
                            >
                              <SelectTrigger className="w-20 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALERT_THRESHOLDS.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
