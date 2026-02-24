import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowUpRight, ArrowDownRight, ArrowLeftRight, CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";

type FilterPreset = "day" | "week" | "month" | "custom";

function getPresetRange(preset: FilterPreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "day":
      return { from: startOfDay(now), to: now };
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

export default function TransactionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<FilterPreset>("month");
  const [dateFilter, setDateFilter] = useState(getPresetRange("month"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

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

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", user?.id, dateFilter.from.toISOString(), dateFilter.to.toISOString()],
    queryFn: async () => {
      const fromStr = `${dateFilter.from.getFullYear()}-${String(dateFilter.from.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.from.getDate()).padStart(2, "0")}`;
      const toStr = `${dateFilter.to.getFullYear()}-${String(dateFilter.to.getMonth() + 1).padStart(2, "0")}-${String(dateFilter.to.getDate()).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("transactions")
        .select("*, subcategories(name, icon, main_categories(name)), accounts!transactions_account_id_fkey(name, icon)")
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      toast.success("Transaction deleted");
    },
  });

  const resetForm = () => setForm({ transaction_type: "expense", amount: "", date: new Date(), account_id: "", subcategory_id: "", note: "", transfer_to_account_id: "" });

  const selectPreset = (preset: FilterPreset) => {
    if (preset === "custom") {
      setCustomRange({});
      setCalendarMonth(new Date());
      setCustomOpen(true);
      return;
    }
    setActivePreset(preset);
    setDateFilter(getPresetRange(preset));
  };

  const confirmCustomRange = () => {
    if (customRange.from && customRange.to) {
      setActivePreset("custom");
      setDateFilter({ from: customRange.from, to: customRange.to });
      setCustomOpen(false);
    }
  };

  const totalIncome = transactions.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <div className="flex gap-4 mt-1 text-sm">
            <span className="text-income font-mono-numbers">+{formatCurrency(totalIncome)}</span>
            <span className="text-expense font-mono-numbers">-{formatCurrency(totalExpenses)}</span>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Transaction</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
              <div className="grid grid-cols-3 gap-2">
                {(["expense", "income", "transfer"] as const).map((type) => (
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
      </div>

      {/* Time filter presets */}
      <div className="flex gap-2 flex-wrap">
        {(["day", "week", "month"] as const).map((preset) => (
          <Button
            key={preset}
            variant={activePreset === preset ? "default" : "outline"}
            size="sm"
            className="capitalize"
            onClick={() => selectPreset(preset)}
          >
            {preset}
          </Button>
        ))}
        <Button
          variant={activePreset === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => selectPreset("custom")}
        >
          {activePreset === "custom"
            ? `${format(dateFilter.from, "MMM d")} – ${format(dateFilter.to, "MMM d")}`
            : "Custom"}
        </Button>
      </div>

      {/* Custom range dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
          </DialogHeader>
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
              mode="range"
              selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
              onSelect={(range) => {
                if (range) setCustomRange({ from: range.from, to: range.to });
                else setCustomRange({});
              }}
              numberOfMonths={2}
              className="pointer-events-auto mx-auto"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              classNames={{
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "hidden",
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button onClick={confirmCustomRange} disabled={!customRange.from || !customRange.to}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          {transactions.length > 0 ? (
            <div className="space-y-1">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group">
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
                      <p className="text-sm font-medium">
                        {t.subcategories?.name || t.note || (t.transaction_type === "transfer" ? "Transfer" : "Transaction")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(t as any).accounts?.name} · {new Date(t.date).toLocaleDateString()}
                        {t.note && t.subcategories?.name ? ` · ${t.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono-numbers text-sm font-medium ${
                      t.transaction_type === "income" ? "text-income" :
                      t.transaction_type === "transfer" ? "text-transfer" : "text-expense"
                    }`}>
                      {t.transaction_type === "income" ? "+" : t.transaction_type === "expense" ? "-" : ""}
                      {formatCurrency(t.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => deleteMutation.mutate(t.id)}
                    >
                      <span className="text-xs">✕</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No transactions in this period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
