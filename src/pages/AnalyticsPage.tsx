import { useState, useMemo, useRef, useCallback } from "react";
import { AccountFilter, AccountFilterValue, getFilteredAccountIds } from "@/components/AccountFilter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { DynamicIcon } from "@/components/DynamicIcon";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Sparkles, Loader2, AlertTriangle, CheckCircle, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addMonths, eachDayOfInterval, eachMonthOfInterval } from "date-fns";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AVAILABLE_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

import { getSubcategoryShade } from "@/components/ColorPicker";

type FilterPreset = "week" | "month" | "year" | "custom";

function getPresetRange(preset: FilterPreset, year?: number, month?: number): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "week": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "year": { const y = year ?? now.getFullYear(); return { from: startOfYear(new Date(y, 0, 1)), to: endOfYear(new Date(y, 0, 1)) }; }
    case "month":
    default: {
      const m = month ?? now.getMonth();
      const y = year ?? now.getFullYear();
      const d = new Date(y, m, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }
  }
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [activePreset, setActivePreset] = useState<FilterPreset>("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [dateFilter, setDateFilter] = useState(getPresetRange("month"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [accountFilter, setAccountFilter] = useState<AccountFilterValue>({ mode: "all-visible" });

  const selectPreset = (preset: FilterPreset) => {
    if (preset === "custom") { setCustomRange({}); setCalendarMonth(new Date()); setCustomOpen(true); return; }
    setActivePreset(preset);
    setDateFilter(getPresetRange(preset, selectedYear, selectedMonth));
  };

  const handleYearChange = (year: string) => {
    const y = parseInt(year);
    setSelectedYear(y);
    if (activePreset === "year") setDateFilter(getPresetRange("year", y));
    if (activePreset === "month") setDateFilter(getPresetRange("month", y, selectedMonth));
  };

  const handleMonthChange = (month: string) => {
    const m = parseInt(month);
    setSelectedMonth(m);
    if (activePreset === "month") setDateFilter(getPresetRange("month", selectedYear, m));
  };

  const confirmCustomRange = () => {
    if (customRange.from && customRange.to) {
      setActivePreset("custom");
      setDateFilter({ from: customRange.from, to: customRange.to });
      setCustomOpen(false);
    }
  };

  const fromStr = `${dateFilter.from.getFullYear()}-${String(dateFilter.from.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.from.getDate()).padStart(2, "0")}`;
  const toStr = `${dateFilter.to.getFullYear()}-${String(dateFilter.to.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.to.getDate()).padStart(2, "0")}`;

  const { data: yearTransactions = [] } = useQuery({
    queryKey: ["analytics-transactions", user?.id, fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, subcategories(name, icon, color, main_category_id, main_categories(id, name, color))")
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
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

  // Filter transactions by account
  const filteredAccountIds = getFilteredAccountIds(accounts, accountFilter);
  const filteredYearTransactions = filteredAccountIds
    ? yearTransactions.filter((t) => filteredAccountIds.includes(t.account_id))
    : yearTransactions;

  // AI Analysis
  const aiMutation = useMutation({
    mutationFn: async () => {
      const monthlyData = MONTHS.map((m, i) => {
        const monthTxns = filteredYearTransactions.filter((t) => new Date(t.date).getMonth() === i);
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
        total: filteredYearTransactions.filter((t) => t.transaction_type === "expense" && t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0) / 100,
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

  // Include fund transfers (transfers with subcategory_id) alongside expenses
  const allExpenseLike = filteredYearTransactions.filter(
    (t) => t.transaction_type === "expense" || (t.transaction_type === "transfer" && t.subcategory_id)
  );
  const incomes = filteredYearTransactions.filter((t) => t.transaction_type === "income");
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);

  // Identify investment category to separate from expenses
  const investmentCatIds = new Set(
    mainCategories.filter((c) => c.name === "Investments" || c.name === "Инвестиции").map((c) => c.id)
  );

  // Expenses = all expense-like MINUS investments
  const expenses = allExpenseLike.filter(
    (t) => !investmentCatIds.has(t.subcategories?.main_categories?.id)
  );
  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0);

  // Investments total
  const investmentExpenses = allExpenseLike.filter(
    (t) => investmentCatIds.has(t.subcategories?.main_categories?.id)
  );
  const totalInvestments = investmentExpenses.reduce((s, t) => s + t.amount, 0);

  // Net Savings = Investments only
  const netSavings = totalInvestments;

  // For pie charts, use ALL expense-like (including investments) so investments still show in breakdown
  const allExpenses = allExpenseLike;

  // Monthly trend data
  const trendData = useMemo(() => {
    if (activePreset === "year") {
      // Monthly granularity
      return eachMonthOfInterval({ start: dateFilter.from, end: dateFilter.to }).map((monthDate) => {
        const m = monthDate.getMonth();
        const y = monthDate.getFullYear();
        const monthTxns = filteredYearTransactions.filter((t) => {
          const d = new Date(t.date);
          return d.getMonth() === m && d.getFullYear() === y;
        });
        return {
          label: format(monthDate, "MMM"),
          income: monthTxns.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0),
          expenses: monthTxns.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0),
        };
      });
    } else {
      // Daily granularity for week, month, custom
      return eachDayOfInterval({ start: dateFilter.from, end: dateFilter.to }).map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayTxns = filteredYearTransactions.filter((t) => t.date === dayStr);
        return {
          label: format(day, activePreset === "week" ? "EEE d" : "d MMM"),
          income: dayTxns.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0),
          expenses: dayTxns.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0),
        };
      });
    }
  }, [filteredYearTransactions, activePreset, dateFilter]);

  const categoryTrendData = useMemo(() => {
    if (activePreset === "year") {
      return eachMonthOfInterval({ start: dateFilter.from, end: dateFilter.to }).map((monthDate) => {
        const m = monthDate.getMonth();
        const y = monthDate.getFullYear();
        const monthTxns = allExpenses.filter((t) => {
          const d = new Date(t.date);
          return d.getMonth() === m && d.getFullYear() === y;
        });
        const entry: Record<string, any> = { label: format(monthDate, "MMM") };
        mainCategories.forEach((c) => {
          entry[c.name] = monthTxns.filter((t) => t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0);
        });
        return entry;
      });
    } else {
      return eachDayOfInterval({ start: dateFilter.from, end: dateFilter.to }).map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayTxns = allExpenses.filter((t) => t.date === dayStr);
        const entry: Record<string, any> = { label: format(day, activePreset === "week" ? "EEE d" : "d MMM") };
        mainCategories.forEach((c) => {
          entry[c.name] = dayTxns.filter((t) => t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0);
        });
        return entry;
      });
    }
  }, [allExpenses, mainCategories, activePreset, dateFilter]);

  // Pie data by subcategory — colors derived from parent main category
  const subcategoryPieData = useMemo(() => {
    const map: Record<string, { name: string; value: number; icon: string; mainCatColor: string; mainCat: string; subId: string }> = {};
    allExpenses.forEach((t) => {
      const subId = t.subcategory_id || "uncategorized";
      const subName = t.subcategories?.name || "Uncategorized";
      const subIcon = t.subcategories?.icon || "circle";
      const mainCatColor = t.subcategories?.main_categories?.color || "0 0% 50%";
      const mainCatName = t.subcategories?.main_categories?.name || "Other";
      if (!map[subId]) map[subId] = { name: subName, value: 0, icon: subIcon, mainCatColor, mainCat: mainCatName, subId };
      map[subId].value += t.amount;
    });
    const sorted = Object.values(map).sort((a, b) => b.value - a.value);

    // Group by main category to compute shade indices
    const mainCatGroups: Record<string, number[]> = {};
    sorted.forEach((item, idx) => {
      if (!mainCatGroups[item.mainCat]) mainCatGroups[item.mainCat] = [];
      mainCatGroups[item.mainCat].push(idx);
    });

    return sorted.map((item, idx) => {
      const group = mainCatGroups[item.mainCat];
      const indexInGroup = group.indexOf(idx);
      const shade = getSubcategoryShade(item.mainCatColor, indexInGroup, group.length);
      return { ...item, color: shade };
    });
  }, [allExpenses]);

  // Top 5 transactions per subcategory for tooltip
  const topTransactionsBySubcategory = useMemo(() => {
    const map: Record<string, { note: string; amount: number; date: string }[]> = {};
    allExpenses.forEach((t) => {
      const subId = t.subcategory_id || "uncategorized";
      if (!map[subId]) map[subId] = [];
      map[subId].push({
        note: t.note || t.subcategories?.name || "Transaction",
        amount: t.amount,
        date: t.date,
      });
    });
    // Sort each by amount desc, keep top 5
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => b.amount - a.amount);
      map[k] = map[k].slice(0, 5);
    });
    return map;
  }, [allExpenses]);

  // Main category pie data
  const mainCatPieData = useMemo(() => {
    const totalAllExpenses = allExpenses.reduce((s, t) => s + t.amount, 0);
    return mainCategories.map((c) => ({
      name: c.name,
      value: allExpenses.filter((t) => t.subcategories?.main_categories?.id === c.id).reduce((s, t) => s + t.amount, 0),
      color: `hsl(${c.color})`,
    })).filter((c) => c.value > 0);
  }, [allExpenses, mainCategories]);

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
    <div className="space-y-6 max-w-7xl w-full animate-fade-in overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Spending analysis and trends</p>
        </div>
        <Button
          variant="outline"
          onClick={() => aiMutation.mutate()}
          disabled={aiMutation.isPending || filteredYearTransactions.length === 0}
          className="w-full sm:w-auto"
        >
          {aiMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          AI Analysis
        </Button>
      </div>

      {/* Time filter presets */}
      <div className="flex gap-2 flex-wrap items-center">
        {(["week", "month", "year"] as const).map((preset) => (
          <Button key={preset} variant={activePreset === preset ? "default" : "outline"} size="sm" className="capitalize" onClick={() => selectPreset(preset)}>
            {preset}
          </Button>
        ))}
        <Button variant={activePreset === "custom" ? "default" : "outline"} size="sm" onClick={() => selectPreset("custom")}>
          {activePreset === "custom" ? `${format(dateFilter.from, "MMM d")} – ${format(dateFilter.to, "MMM d")}` : "Custom"}
        </Button>
        {activePreset === "month" && (
          <>
            <Select value={String(selectedMonth)} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AVAILABLE_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        {activePreset === "year" && (
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <AccountFilter accounts={accounts} value={accountFilter} onChange={setAccountFilter} />
      </div>

      {/* Custom range dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Select Date Range</DialogTitle></DialogHeader>
          <div className="flex items-center justify-between gap-2 px-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              {format(calendarMonth, "MMMM yyyy")} – {format(addMonths(calendarMonth, 1), "MMMM yyyy")}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center w-full overflow-x-auto">
            <Calendar
              weekStartsOn={1}
              mode="range"
              selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
              onSelect={(range) => { if (range) setCustomRange({ from: range.from, to: range.to }); else setCustomRange({}); }}
              numberOfMonths={2}
              className="pointer-events-auto mx-auto"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              classNames={{ caption: "flex justify-center pt-1 relative items-center", caption_label: "text-sm font-medium", nav: "hidden" }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button onClick={confirmCustomRange} disabled={!customRange.from || !customRange.to}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <p className={`text-2xl font-semibold font-mono-numbers mt-1 ${netSavings >= 0 ? "text-income" : "text-expense"}`}>
              {formatCurrency(netSavings)}
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
        <TabsList className="w-full sm:w-auto flex">
          <TabsTrigger value="trends" className="flex-1 sm:flex-none text-xs sm:text-sm">Income vs Expenses</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1 sm:flex-none text-xs sm:text-sm">By Category</TabsTrigger>
          <TabsTrigger value="breakdown" className="flex-1 sm:flex-none text-xs sm:text-sm">Breakdown</TabsTrigger>
        </TabsList>

        {/* Income vs Expenses Line Chart */}
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                {activePreset === "year" ? "Monthly" : "Daily"} Income vs Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] sm:h-[350px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
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
              <CardTitle className="text-base font-medium">
                {activePreset === "year" ? "Monthly" : "Daily"} Expenses by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] sm:h-[350px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryTrendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
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
                          <Pie
                            data={mainCatPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={0} dataKey="value"
                            label={({ cx, cy, midAngle, innerRadius, outerRadius, index }) => {
                              const totalAll = mainCatPieData.reduce((s, c) => s + c.value, 0);
                              const pct = totalAll > 0 ? Math.round((mainCatPieData[index].value / totalAll) * 100) : 0;
                              if (pct < 5) return null;
                              const RADIAN = Math.PI / 180;
                              const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                              const x = cx + radius * Math.cos(-midAngle * RADIAN);
                              const y = cy + radius * Math.sin(-midAngle * RADIAN);
                              return (
                                <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
                                  {pct}%
                                </text>
                              );
                            }}
                            labelLine={false}
                          >
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
                          <span className="text-sm font-mono-numbers font-medium">{formatCurrency(cat.value)}</span>
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
                          <Pie
                            data={subcategoryPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={0} dataKey="value"
                            label={({ cx, cy, midAngle, innerRadius, outerRadius, index }) => {
                              const totalAll = subcategoryPieData.reduce((s, c) => s + c.value, 0);
                              const pct = totalAll > 0 ? Math.round((subcategoryPieData[index].value / totalAll) * 100) : 0;
                              if (pct < 5) return null;
                              const RADIAN = Math.PI / 180;
                              const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                              const x = cx + radius * Math.cos(-midAngle * RADIAN);
                              const y = cy + radius * Math.sin(-midAngle * RADIAN);
                              return (
                                <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
                                  {pct}%
                                </text>
                              );
                            }}
                            labelLine={false}
                          >
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
                          <span className="text-sm font-mono-numbers font-medium">{formatCurrency(sub.value)}</span>
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
