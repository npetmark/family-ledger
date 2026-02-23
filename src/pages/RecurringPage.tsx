import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Repeat, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const frequencies = ["daily", "weekly", "monthly", "yearly"];

export default function RecurringPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [form, setForm] = useState({
    transaction_type: "expense",
    amount: "",
    frequency: "monthly",
    next_due_date: new Date(),
    account_id: "",
    subcategory_id: "",
    note: "",
  });

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
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(name)").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        user_id: user!.id,
        transaction_type: data.transaction_type,
        amount: parseCurrencyToCents(data.amount),
        frequency: data.frequency,
        next_due_date: format(data.next_due_date, "yyyy-MM-dd"),
        start_date: format(data.next_due_date, "yyyy-MM-dd"),
        account_id: data.account_id,
        subcategory_id: data.subcategory_id || null,
        note: data.note,
      };
      if (editing) {
        const { error } = await supabase.from("recurring_transactions").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recurring_transactions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      setOpen(false);
      setEditing(null);
      resetForm();
      toast.success(editing ? "Updated" : "Created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Deleted");
    },
  });

  const resetForm = () => setForm({ transaction_type: "expense", amount: "", frequency: "monthly", next_due_date: new Date(), account_id: "", subcategory_id: "", note: "" });

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      transaction_type: r.transaction_type,
      amount: (r.amount / 100).toString(),
      frequency: r.frequency,
      next_due_date: new Date(r.next_due_date),
      account_id: r.account_id,
      subcategory_id: r.subcategory_id || "",
      note: r.note || "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recurring Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">Automated repeating entries</p>
        </div>
        <Button onClick={() => { setEditing(null); resetForm(); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Recurring
        </Button>
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
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`font-mono-numbers font-medium ${r.transaction_type === "income" ? "text-income" : "text-expense"}`}>
                        {r.transaction_type === "income" ? "+" : "-"}{formatCurrency(r.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Next: {new Date(r.next_due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Recurring" : "New Recurring Transaction"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((type) => (
                <Button key={type} type="button" variant={form.transaction_type === type ? "default" : "outline"} size="sm" className="capitalize" onClick={() => setForm({ ...form, transaction_type: type })}>
                  {type}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {frequencies.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Next Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(form.next_due_date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.next_due_date} onSelect={(d) => d && setForm({ ...form, next_due_date: d })} />
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
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
