import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Repeat } from "lucide-react";

export default function RecurringPage() {
  const { user } = useAuth();

  const { data: recurring = [] } = useQuery({
    queryKey: ["recurring", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .select("*, subcategories(name, icon), accounts!recurring_transactions_account_id_fkey(name)")
        .order("next_due_date");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Recurring Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">Automated repeating entries</p>
      </div>

      {recurring.length > 0 ? (
        <div className="space-y-3">
          {recurring.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      r.transaction_type === "income" ? "bg-income/10" : "bg-expense/10"
                    }`}>
                      {r.subcategories ? (
                        <DynamicIcon name={r.subcategories.icon} className={`h-5 w-5 ${r.transaction_type === "income" ? "text-income" : "text-expense"}`} />
                      ) : (
                        <Repeat className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{r.subcategories?.name || r.note || "Recurring"}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs capitalize">{r.frequency}</Badge>
                        <span className="text-xs text-muted-foreground">{r.accounts?.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono-numbers font-medium ${r.transaction_type === "income" ? "text-income" : "text-expense"}`}>
                      {r.transaction_type === "income" ? "+" : "-"}{formatCurrency(r.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Next: {new Date(r.next_due_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No recurring transactions yet
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
