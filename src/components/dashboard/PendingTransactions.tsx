import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function PendingTransactions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: pending = [] } = useQuery({
    queryKey: ["pending_transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_transactions" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
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

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcategories")
        .select("*, main_categories(*)")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const confirmMutation = useMutation({
    mutationFn: async (item: any) => {
      if (!user || !item.account_id || !item.parsed_amount) {
        throw new Error("Please select an account and ensure amount is set");
      }
      // Create the real transaction
      const { error: txError } = await supabase.from("transactions").insert({
        user_id: user.id,
        account_id: item.account_id,
        subcategory_id: item.subcategory_id || null,
        amount: item.parsed_amount,
        transaction_type: item.transaction_type,
        note: item.parsed_note || "",
      });
      if (txError) throw txError;

      // Mark pending as confirmed
      const { error: upError } = await supabase
        .from("pending_transactions" as any)
        .update({ status: "confirmed" })
        .eq("id", item.id);
      if (upError) throw upError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      toast.success("Transaction confirmed");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pending_transactions" as any)
        .update({ status: "dismissed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending_transactions"] });
      toast.success("Dismissed");
    },
  });

  const updatePending = async (id: string, field: string, value: any) => {
    await supabase
      .from("pending_transactions" as any)
      .update({ [field]: value })
      .eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["pending_transactions"] });
  };

  if (pending.length === 0) return null;

  return (
    <Card className="border-dashed border-amber-500/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          Pending Confirmation
          <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
            {pending.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((item: any) => {
          const isExpanded = expandedId === item.id;
          return (
            <div key={item.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.parsed_note || "Shared transaction"}
                  </p>
                  <p className="text-lg font-semibold font-mono-numbers text-expense">
                    {item.parsed_amount ? formatCurrency(item.parsed_amount) : "No amount"}
                  </p>
                </div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {isExpanded && (
                <div className="space-y-2 pt-2 border-t border-border">
                  {item.raw_text && (
                    <p className="text-xs text-muted-foreground break-words">{item.raw_text}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={item.account_id || ""}
                      onValueChange={(v) => updatePending(item.id, "account_id", v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.subcategory_id || ""}
                      onValueChange={(v) => updatePending(item.id, "subcategory_id", v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {subcategories.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.main_categories?.name} → {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => confirmMutation.mutate(item)}
                      disabled={confirmMutation.isPending || !item.account_id}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => dismissMutation.mutate(item.id)}
                      disabled={dismissMutation.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
