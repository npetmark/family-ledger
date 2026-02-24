import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DynamicIcon } from "@/components/DynamicIcon";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Sparkles, Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AVAILABLE_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

const SUB_COLORS = [
  "hsl(168, 35%, 38%)", "hsl(38, 85%, 55%)", "hsl(215, 55%, 52%)", "hsl(280, 45%, 55%)",
  "hsl(145, 45%, 42%)", "hsl(0, 60%, 52%)", "hsl(30, 70%, 50%)", "hsl(190, 50%, 45%)",
  "hsl(320, 40%, 50%)", "hsl(60, 60%, 45%)", "hsl(240, 40%, 55%)", "hsl(100, 40%, 40%)",
];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: yearTransactions = [] } = useQuery({
    queryKey: ["analytics-transactions", user?.id, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, subcategories(name, icon, color, main_category_id, main_categories(id, name, color))")
        .gte("date", `${selectedYear}-01-01`)
        .lte("date", `${selectedYear}-12-31`)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: mainCategories = [] } = useQuery({
    queryKey: ["main_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("main_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-analytics", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(name, color)").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // AI Analysis
  const aiMutation = useMutation({
    mutationFn: async () => {
      const monthlyData = MONTHS.map((m, i) => {
        const monthTxns = yearTransactions.filter((t) => new Date(t.date).getMonth() === i);
        return {
          month: m,
          income: monthTxns.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0) / 100,
          expenses: monthTxns.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0) / 100,
          categories: mainCategories.map((c) => ({
            name: c.name,
            total: monthTxns.filter((t) => t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0) / 100,
          })),
        };
      });

      const catSummary = mainCategories.map((c) => ({
        name: c.name,
        total: yearTransactions.filter((t) => t.transaction_type === "expense" && t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0) / 100,
      }));

      const { data, error } = await supabase.functions.invoke("analyze-spending", {
        body: { transactions: monthlyData, categories: catSummary, year: selectedYear },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onError: (e) => toast.error(e.message),
  });

  // Computed data
  const expenses = yearTransactions.filter((t) => t.transaction_type === "expense");
  const incomes = yearTransactions.filter((t) => t.transaction_type === "income");
  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);

  // Monthly trend data
  const monthlyTrend = useMemo(() => MONTHS.map((m, i) => {
    const monthTxns = yearTransactions.filter((t) => new Date(t.date).getMonth() === i);
    return {
      month: m,
      income: monthTxns.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0),
      expenses: monthTxns.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0),
    };
  }), [yearTransactions]);

  // Monthly by main category
  const monthlyByCategory = useMemo(() => MONTHS.map((m, i) => {
    const monthTxns = expenses.filter((t) => new Date(t.date).getMonth() === i);
    const entry: Record<string, any> = { month: m };
    mainCategories.forEach((c) => {
      entry[c.name] = monthTxns.filter((t) => t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0);
    });
    return entry;
  }), [expenses, mainCategories]);

  // Pie data by subcategory
  const subcategoryPieData = useMemo(() => {
    const map: Record<string, { name: string; value: number; icon: string; color: string; mainCat: string }> = {};
    expenses.forEach((t) => {
      const subId = t.subcategory_id || "uncategorized";
      const subName = t.subcategories?.name || "Uncategorized";
      const subIcon = t.subcategories?.icon || "circle";
      const subColor = t.subcategories?.color || "0 0% 50%";
      const mainCatName = t.subcategories?.main_categories?.name || "Other";
      if (!map[subId]) map[subId] = { name: subName, value: 0, icon: subIcon, color: subColor, mainCat: mainCatName };
      map[subId].value += t.amount;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Main category pie data
  const mainCatPieData = useMemo(() => {
    return mainCategories.map((c) => ({
      name: c.name,
      value: expenses.filter((t) => t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0),
      color: `hsl(${c.color})`,
    })).filter((c) => c.value > 0);
  }, [expenses, mainCategories]);

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-mono-numbers font-medium">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const pieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
        <p className="font-medium">{d.name}</p>
        <p className="font-mono-numbers">{formatCurrency(d.value)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Yearly spending analysis and trends</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => aiMutation.mutate()}
            disabled={aiMutation.isPending || yearTransactions.length === 0}
          >
            {aiMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Analysis
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Income</p>
            <p className="text-2xl font-semibold font-mono-numbers mt-1 text-income">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-semibold font-mono-numbers mt-1 text-expense">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Net Savings</p>
            <p className={`text-2xl font-semibold font-mono-numbers mt-1 ${totalIncome - totalExpenses >= 0 ? "text-income" : "text-expense"}`}>
              {formatCurrency(totalIncome - totalExpenses)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis Results */}
      {aiMutation.data && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Spending Analysis — {selectedYear}
            </CardTitle>
            <CardDescription>{aiMutation.data.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {aiMutation.data.monthlyInsight && (
              <p className="text-sm text-muted-foreground italic">{aiMutation.data.monthlyInsight}</p>
            )}

            {aiMutation.data.trends?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Trends</h4>
                <div className="grid gap-2">
                  {aiMutation.data.trends.map((t: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/60">
                      {t.type === "positive" ? <TrendingUp className="h-4 w-4 text-income mt-0.5 shrink-0" /> :
                       t.type === "negative" ? <TrendingDown className="h-4 w-4 text-expense mt-0.5 shrink-0" /> :
                       <Minus className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiMutation.data.suggestions?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Suggestions</h4>
                <div className="grid gap-2">
                  {aiMutation.data.suggestions.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/60">
                      {s.priority === "high" ? <AlertTriangle className="h-4 w-4 text-expense mt-0.5 shrink-0" /> :
                       s.priority === "medium" ? <Info className="h-4 w-4 text-accent mt-0.5 shrink-0" /> :
                       <CheckCircle className="h-4 w-4 text-income mt-0.5 shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Income vs Expenses</TabsTrigger>
          <TabsTrigger value="categories">By Category</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        {/* Income vs Expenses Line Chart */}
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Monthly Income vs Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={(v) => `€${(v / 100).toFixed(0)}`} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={customTooltip} />
                    <Legend />
                    <Line type="monotone" dataKey="income" name="Income" stroke="hsl(145, 50%, 42%)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(0, 60%, 52%)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stacked bar by category */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Monthly Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyByCategory}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={(v) => `€${(v / 100).toFixed(0)}`} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={customTooltip} />
                    <Legend />
                    {mainCategories.map((c, i) => (
                      <Bar key={c.id} dataKey={c.name} stackId="a" fill={`hsl(${c.color})`} radius={i === mainCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pie chart breakdown */}
        <TabsContent value="breakdown">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Main category pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">By Main Category</CardTitle>
              </CardHeader>
              <CardContent>
                {mainCatPieData.length > 0 ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={mainCatPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                            {mainCatPieData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={pieTooltip} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-2">
                      {mainCatPieData.map((cat, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="text-sm">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{totalExpenses > 0 ? Math.round(cat.value / totalExpenses * 100) : 0}%</span>
                            <span className="text-sm font-mono-numbers font-medium">{formatCurrency(cat.value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No expenses this year</div>
                )}
              </CardContent>
            </Card>

            {/* Subcategory pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">By Subcategory</CardTitle>
              </CardHeader>
              <CardContent>
                {subcategoryPieData.length > 0 ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={subcategoryPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value">
                            {subcategoryPieData.map((entry, index) => (
                              <Cell key={index} fill={`hsl(${entry.color})`} />
                            ))}
                          </Pie>
                          <Tooltip content={pieTooltip} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5 max-h-[200px] overflow-y-auto">
                      {subcategoryPieData.map((sub, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: `hsl(${sub.color} / 0.15)` }}>
                              <DynamicIcon name={sub.icon} className="h-3.5 w-3.5" style={{ color: `hsl(${sub.color})` }} />
                            </div>
                            <div>
                              <span className="text-sm">{sub.name}</span>
                              <span className="text-xs text-muted-foreground ml-1.5">({sub.mainCat})</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{totalExpenses > 0 ? Math.round(sub.value / totalExpenses * 100) : 0}%</span>
                            <span className="text-sm font-mono-numbers font-medium">{formatCurrency(sub.value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No expenses this year</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
