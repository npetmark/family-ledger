import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents, getMonthYear } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";

const CATEGORY_COLORS: Record<string, string> = {
  Needs: "bg-needs",
  Wants: "bg-wants",
  Investments: "bg-investments",
};

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

  const setBudgetMutation = useMutation({
    mutationFn: async ({ subcategory_id, amount }: { subcategory_id: string; amount: string }) => {
      const cents = parseCurrencyToCents(amount);
      const existing = budgets.find((b) => b.subcategory_id === subcategory_id);
      if (existing) {
        const { error } = await supabase.from("budgets").update({ amount: cents }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("budgets").insert({
          user_id: user!.id,
          subcategory_id,
          month_year: monthYear,
          amount: cents,
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

  // Group by main category
  const grouped = subcategories.reduce((acc, sub) => {
    const mainName = sub.main_categories?.name || "Other";
    if (!acc[mainName]) acc[mainName] = [];
    acc[mainName].push(sub);
    return acc;
  }, {} as Record<string, typeof subcategories>);

  const getSpent = (subId: string) => transactions.filter((t) => t.subcategory_id === subId).reduce((s, t) => s + t.amount, 0);
  const getBudget = (subId: string) => budgets.find((b) => b.subcategory_id === subId)?.amount || 0;

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

      {Object.entries(grouped).map(([mainName, subs]) => {
        const mainBudgetTotal = subs.reduce((s, sub) => s + getBudget(sub.id), 0);
        const mainSpentTotal = subs.reduce((s, sub) => s + getSpent(sub.id), 0);
        const mainPct = mainBudgetTotal > 0 ? Math.min((mainSpentTotal / mainBudgetTotal) * 100, 100) : 0;
        const progressColor = CATEGORY_COLORS[mainName] || "bg-primary";

        return (
          <Card key={mainName}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">{mainName}</CardTitle>
                <div className="text-right text-sm">
                  <span className="font-mono-numbers">{formatCurrency(mainSpentTotal)}</span>
                  <span className="text-muted-foreground"> / {formatCurrency(mainBudgetTotal)}</span>
                </div>
              </div>
              <Progress value={mainPct} className="h-2 mt-2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {subs.map((sub) => {
                  const budget = getBudget(sub.id);
                  const spent = getSpent(sub.id);
                  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                  const isOver = spent > budget && budget > 0;

                  return (
                    <div key={sub.id} className="flex items-center gap-4">
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <DynamicIcon name={sub.icon} className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{sub.name}</span>
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
