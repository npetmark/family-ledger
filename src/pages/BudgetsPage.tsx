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
import { ChevronLeft, ChevronRight, Bell, AlertTriangle } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";

const BUDGET_TARGETS: Record<string, number> = {
  "Нужди": 50,
  "Желания": 20,
  "Инвестиции": 30,
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
  const monthYear = getMonthYear(currentDate);

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-with-main", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(name, sort_order)").eq("is_active", true).order("sort_order");
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
    queryKey: ["transactions-for-budget", user?.id, monthYear],
    queryFn: async () => {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split("T")[0];
      // Fetch expenses AND transfers with subcategory_id (fund transfers)
      const { data, error } = await supabase
        .from("transactions")
        .select("subcategory_id, amount, transaction_type")
        .in("transaction_type", ["expense", "transfer"])
        .not("subcategory_id", "is", null)
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const setBudgetMutation = useMutation({
    mutationFn: async ({ subcategory_id, amount, alert_threshold }: { subcategory_id: string; amount: string; alert_threshold?: number }) => {
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

  // Group by main category
  const grouped = subcategories
    .filter((sub) => (sub as any).main_categories?.name !== INCOME_CATEGORY)
    .reduce((acc, sub) => {
      const mainName = (sub as any).main_categories?.name || "Other";
      if (!acc[mainName]) acc[mainName] = [];
      acc[mainName].push(sub);
      return acc;
    }, {} as Record<string, typeof subcategories>);

  const getSpent = (subId: string) => transactions.filter((t) => t.subcategory_id === subId).reduce((s, t) => s + t.amount, 0);
  const getBudget = (subId: string) => budgets.find((b) => b.subcategory_id === subId)?.amount || 0;
  const getAlertThreshold = (subId: string) => budgets.find((b) => b.subcategory_id === subId)?.alert_threshold ?? 90;

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No active categories. Add categories first to set budgets.
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([mainName, subs]) => {
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
                    <Badge variant="secondary" className="text-xs font-mono-numbers">{BUDGET_TARGETS[mainName]}%</Badge>
                  )}
                  {isMainOver && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </div>
                <div className="text-right text-sm">
                  <span className={`font-mono-numbers ${isMainOver ? "text-destructive" : ""}`}>{formatCurrency(mainSpentTotal)}</span>
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
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <DynamicIcon name={sub.icon} className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{sub.name}</span>
                          {isAlerted && <Bell className="h-3 w-3 text-warning" />}
                        </div>
                        <div className="flex-1">
                          <Progress value={pct} className={`h-1.5 ${isOver ? "[&>div]:bg-destructive" : ""}`} />
                        </div>
                        <div className="text-right min-w-[90px]">
                          <span className={`text-xs font-mono-numbers ${isOver ? "text-destructive" : ""}`}>
                            {formatCurrency(spent)}
                          </span>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Budget"
                          className="w-24 h-8 text-xs"
                          defaultValue={budget > 0 ? (budget / 100).toFixed(2) : ""}
                          onBlur={(e) => {
                            if (e.target.value) {
                              setBudgetMutation.mutate({ subcategory_id: sub.id, amount: e.target.value });
                            }
                          }}
                        />
                        <Select
                          value={alertThreshold.toString()}
                          onValueChange={(v) => setAlertMutation.mutate({ subcategory_id: sub.id, alert_threshold: parseInt(v) })}
                        >
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALERT_THRESHOLDS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
