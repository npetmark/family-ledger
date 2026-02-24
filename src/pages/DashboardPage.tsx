import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, getMonthYear } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicIcon } from "@/components/DynamicIcon";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { BudgetBurndown } from "@/components/dashboard/BudgetBurndown";

const CATEGORY_COLORS = [
  "hsl(215, 55%, 52%)",
  "hsl(280, 45%, 55%)",
  "hsl(145, 45%, 42%)",
];

export default function DashboardPage() {
  const { user } = useAuth();

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
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
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
      const { data, error } = await supabase.from("transactions").select("account_id, transaction_type, amount, transfer_to_account_id");
      if (error) throw error;
      return data;
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

  // Monthly expenses by main category
  const expenses = transactions.filter((t) => t.transaction_type === "expense");
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const income = transactions.filter((t) => t.transaction_type === "income").reduce((sum, t) => sum + t.amount, 0);

  const categoryBreakdown = mainCategories.map((cat, i) => {
    const catExpenses = expenses.filter(
      (t) => t.subcategories?.main_categories?.id === cat.id
    );
    const total = catExpenses.reduce((sum, t) => sum + t.amount, 0);
    return {
      name: cat.name,
      value: total,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    };
  }).filter((c) => c.value > 0);

  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} overview
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Assets</p>
                <p className="text-2xl font-semibold font-mono-numbers mt-1">{formatCurrency(totalAssets)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Income</p>
                <p className="text-2xl font-semibold font-mono-numbers mt-1 text-income">{formatCurrency(income)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-income/10 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-income" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Expenses</p>
                <p className="text-2xl font-semibold font-mono-numbers mt-1 text-expense">{formatCurrency(totalExpenses)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-expense/10 flex items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-expense" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net This Month</p>
                <p className={`text-2xl font-semibold font-mono-numbers mt-1 ${income - totalExpenses >= 0 ? "text-income" : "text-expense"}`}>
                  {formatCurrency(income - totalExpenses)}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${income - totalExpenses >= 0 ? "bg-income/10" : "bg-expense/10"}`}>
                {income - totalExpenses >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-income" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-expense" />
                )}
              </div>
            </div>
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
              <div className="flex items-center gap-6">
                <div className="w-40 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
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
                <div className="flex-1 space-y-3">
                  {categoryBreakdown.map((cat, i) => (
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
            {accountBalances.length > 0 ? (
              <div className="space-y-3">
                {accountBalances.filter((a) => a.is_visible).map((account) => (
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
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                No accounts yet. Create one to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Budget Burndown */}
      <BudgetBurndown />

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length > 0 ? (
            <div className="space-y-2">
              {recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      t.transaction_type === "income" ? "bg-income/10" :
                      t.transaction_type === "transfer" ? "bg-transfer/10" : "bg-expense/10"
                    }`}>
                      {t.transaction_type === "income" ? <ArrowUpRight className="h-4 w-4 text-income" /> :
                       t.transaction_type === "transfer" ? <ArrowLeftRight className="h-4 w-4 text-transfer" /> :
                       <ArrowDownRight className="h-4 w-4 text-expense" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.subcategories?.name || t.note || "Transaction"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`font-mono-numbers text-sm font-medium ${
                    t.transaction_type === "income" ? "text-income" :
                    t.transaction_type === "transfer" ? "text-transfer" : "text-expense"
                  }`}>
                    {t.transaction_type === "income" ? "+" : t.transaction_type === "expense" ? "-" : ""}
                    {formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No transactions this month yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
