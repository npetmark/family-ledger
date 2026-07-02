import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, getMonthYear } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicIcon } from "@/components/DynamicIcon";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { BudgetBurndown } from "@/components/dashboard/BudgetBurndown";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// No hardcoded colors - use DB colors from main_categories

export default function DashboardPage() {
  const { user } = useAuth();
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", user?.id, "current-month"],
    queryFn: async () => {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
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

  const { data: mainCategories = [] } = useQuery({
    queryKey: ["main_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("main_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Compute account balances
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["all-transactions-for-balance", user?.id],
    queryFn: async () => {
      const pageSize = 1000;
      const all: any[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("transactions")
          .select("account_id, transaction_type, amount, transfer_to_account_id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      return all;
    },
    enabled: !!user,
  });

  const accountBalances = accounts.map((acc) => {
    let balance = acc.starting_balance;
    allTransactions.forEach((t) => {
      if (t.account_id === acc.id) {
        if (t.transaction_type === "income") balance += t.amount;
        else if (t.transaction_type === "expense") balance -= t.amount;
        else if (t.transaction_type === "transfer") balance -= t.amount;
      }
      if (t.transfer_to_account_id === acc.id && t.transaction_type === "transfer") {
        balance += t.amount;
      }
    });
    return { ...acc, computed_balance: balance };
  });

  const totalAssets = accountBalances
    .filter((a) => a.is_visible)
    .reduce((sum, a) => sum + a.computed_balance, 0);

  // Filter transactions by visible accounts (matching Analytics behavior)
  const visibleAccountIds = new Set(accounts.filter((a) => a.is_visible).map((a) => a.id));
  const visibleTransactions = transactions.filter((t) => visibleAccountIds.has(t.account_id));

  // All expense-like transactions (expenses + fund transfers with subcategory)
  const expenseLike = visibleTransactions.filter(
    (t) => t.transaction_type === "expense" || (t.transaction_type === "transfer" && t.subcategory_id)
  );
  const income = visibleTransactions.filter((t) => t.transaction_type === "income").reduce((sum, t) => sum + t.amount, 0);

  // Find the "Investments" main category to separate it from expenses
  const investmentCatIds = new Set(
    mainCategories.filter((c) => c.name === "Investments" || c.name === "Инвестиции").map((c) => c.id)
  );

  // Total Expenses = Needs + Wants only (excluding Investments)
  const nonInvestmentExpenses = expenseLike.filter(
    (t) => !investmentCatIds.has(t.subcategories?.main_categories?.id)
  );
  const totalExpenses = nonInvestmentExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Investments total (for savings)
  const investmentTotal = expenseLike
    .filter((t) => investmentCatIds.has(t.subcategories?.main_categories?.id))
    .reduce((sum, t) => sum + t.amount, 0);

  // Net Savings = Investments only
  const netSavings = investmentTotal;

  const categoryBreakdown = mainCategories.map((cat) => {
    const catExpenses = expenseLike.filter(
      (t) => t.subcategories?.main_categories?.id === cat.id
    );
    const total = catExpenses.reduce((sum, t) => sum + t.amount, 0);
    return {
      name: cat.name,
      value: total,
      color: `hsl(${cat.color})`,
    };
  }).filter((c) => c.value > 0);

  const recentTransactions = visibleTransactions.slice(0, 5);

  const visibleAccounts = accounts.filter((a) => a.is_visible);
  return (
    <div className="space-y-6 max-w-7xl animate-fade-in overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} overview
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 sm:pt-6 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 sm:hidden">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">Total Assets</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm text-muted-foreground">Total Assets</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-xl bg-primary/10 items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-lg sm:text-2xl font-semibold font-mono-numbers mt-1">{formatCurrency(totalAssets)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:pt-6 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 sm:hidden">
                <div className="h-8 w-8 rounded-lg bg-income/10 flex items-center justify-center flex-shrink-0">
                  <ArrowUpRight className="h-4 w-4 text-income" />
                </div>
                <p className="text-xs text-muted-foreground">Income</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm text-muted-foreground">Monthly Income</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-xl bg-income/10 items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-income" />
              </div>
            </div>
            <p className="text-lg sm:text-2xl font-semibold font-mono-numbers mt-1 text-income">{formatCurrency(income)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:pt-6 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 sm:hidden">
                <div className="h-8 w-8 rounded-lg bg-expense/10 flex items-center justify-center flex-shrink-0">
                  <ArrowDownRight className="h-4 w-4 text-expense" />
                </div>
                <p className="text-xs text-muted-foreground">Expenses</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm text-muted-foreground">Monthly Expenses</p>
              </div>
              <div className="hidden sm:flex h-10 w-10 rounded-xl bg-expense/10 items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-expense" />
              </div>
            </div>
            <p className="text-lg sm:text-2xl font-semibold font-mono-numbers mt-1 text-expense">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:pt-6 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 sm:hidden">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${netSavings >= 0 ? "bg-income/10" : "bg-expense/10"}`}>
                  {netSavings >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-income" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-expense" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Savings</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm text-muted-foreground">Net Savings</p>
              </div>
              <div className={`hidden sm:flex h-10 w-10 rounded-xl items-center justify-center ${netSavings >= 0 ? "bg-income/10" : "bg-expense/10"}`}>
                {netSavings >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-income" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-expense" />
                )}
              </div>
            </div>
            <p className={`text-lg sm:text-2xl font-semibold font-mono-numbers mt-1 ${netSavings >= 0 ? "text-income" : "text-expense"}`}>
              {formatCurrency(netSavings)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
                <div className="w-[160px] h-[160px] sm:w-[180px] sm:h-[180px] flex-shrink-0 overflow-visible">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={65}
                        paddingAngle={0}
                        dataKey="value"
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, index }) => {
                          const allExpensesForChart = expenseLike.reduce((sum, t) => sum + t.amount, 0);
                          const pct = allExpensesForChart > 0 ? Math.round((categoryBreakdown[index].value / allExpensesForChart) * 100) : 0;
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
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:flex-1 space-y-3">
                  {categoryBreakdown.map((cat, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="text-sm">{cat.name}</span>
                      </div>
                      <span className="text-sm font-mono-numbers font-medium">
                        {formatCurrency(cat.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                No expenses this month yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accounts Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const visibleSorted = accountBalances
                .filter((a) => a.is_visible)
                .sort((a, b) => b.computed_balance - a.computed_balance);
              const displayedAccounts = showAllAccounts ? visibleSorted : visibleSorted.slice(0, 5);
              const hasMore = visibleSorted.length > 5;

              return visibleSorted.length > 0 ? (
                <div className="space-y-3">
                  {displayedAccounts.map((account) => (
                    <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <DynamicIcon name={account.icon} className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{account.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{account.account_type}</p>
                        </div>
                      </div>
                      <span className="font-mono-numbers text-sm font-medium">
                        {formatCurrency(account.computed_balance)}
                      </span>
                    </div>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => setShowAllAccounts(!showAllAccounts)}
                      className="flex items-center justify-center gap-1 w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showAllAccounts ? (
                        <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
                      ) : (
                        <>Show {visibleSorted.length - 5} more <ChevronDown className="h-3.5 w-3.5" /></>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  No accounts yet. Create one to get started.
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Budget Burndown - full width below */}
      <BudgetBurndown />

      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} accounts={accounts} />
    </div>
  );
}
