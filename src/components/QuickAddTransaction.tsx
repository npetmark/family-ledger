import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseCurrencyToCents } from "@/lib/financial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export function QuickAddTransaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    transaction_type: "expense",
    amount: "",
    date: new Date(),
    account_id: "",
    subcategory_id: "",
    note: "",
    transfer_to_account_id: "",
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(name)").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        user_id: user!.id,
        transaction_type: data.transaction_type,
        amount: parseCurrencyToCents(data.amount),
        date: format(data.date, "yyyy-MM-dd"),
        account_id: data.account_id,
        subcategory_id: data.transaction_type !== "transfer" ? data.subcategory_id || null : null,
        note: data.note,
        transfer_to_account_id: data.transaction_type === "transfer" ? data.transfer_to_account_id || null : null,
      };
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      setOpen(false);
      resetForm();
      toast.success("Transaction added");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({ transaction_type: "expense", amount: "", date: new Date(), account_id: "", subcategory_id: "", note: "", transfer_to_account_id: "" });

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Transaction</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
            <div className="grid grid-cols-3 gap-2">
              {(["expense", "income", "transfer"] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={form.transaction_type === type ? "default" : "outline"}
                  size="sm"
                  className="capitalize"
                  onClick={() => setForm({ ...form, transaction_type: type })}
                >
                  {type}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(form.date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.date} onSelect={(d) => d && setForm({ ...form, date: d })} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.transaction_type === "transfer" ? (
              <div className="space-y-2">
                <Label>Transfer To</Label>
                <Select value={form.transfer_to_account_id} onValueChange={(v) => setForm({ ...form, transfer_to_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id !== form.account_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.subcategory_id} onValueChange={(v) => setForm({ ...form, subcategory_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {subcategories.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.main_categories?.name} → {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              Add Transaction
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
