import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents } from "@/lib/financial";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/DynamicIcon";
import { Plus, ArrowLeftRight, CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, Pencil, Banknote } from "lucide-react";
import { toast } from "sonner";
import { format, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addMonths } from "date-fns";

type FilterPreset = "day" | "week" | "month" | "year" | "custom";

function getPresetRange(preset: FilterPreset, year?: number): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "day":
      return { from: startOfDay(now), to: now };
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "year": {
      const y = year ?? now.getFullYear();
      return { from: startOfYear(new Date(y, 0, 1)), to: endOfYear(new Date(y, 0, 1)) };
    }
    case "month":
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

const AVAILABLE_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

export default function TransactionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [activePreset, setActivePreset] = useState<FilterPreset>("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dateFilter, setDateFilter] = useState(getPresetRange("month"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const emptyForm = {
    transaction_type: "expense",
    amount: "",
    date: new Date(),
    account_id: "",
    subcategory_id: "",
    note: "",
    transfer_to_account_id: "",
  };

  const [form, setForm] = useState(emptyForm);

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
        .select("*, subcategories(name, icon, color, main_categories(name, color)), accounts!transactions_account_id_fkey(name, icon)")
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
      setForm(emptyForm);
      toast.success("Transaction added");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const payload = {
        transaction_type: data.transaction_type,
        amount: parseCurrencyToCents(data.amount),
        date: format(data.date, "yyyy-MM-dd"),
        account_id: data.account_id,
        subcategory_id: data.transaction_type !== "transfer" ? data.subcategory_id || null : null,
        note: data.note,
        transfer_to_account_id: data.transaction_type === "transfer" ? data.transfer_to_account_id || null : null,
      };
      const { error } = await supabase.from("transactions").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      setEditOpen(false);
      setEditingTransaction(null);
      toast.success("Transaction updated");
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

  const selectPreset = (preset: FilterPreset) => {
    if (preset === "custom") {
      setCustomRange({});
      setCalendarMonth(new Date());
      setCustomOpen(true);
      return;
    }
    setActivePreset(preset);
    setDateFilter(getPresetRange(preset, selectedYear));
  };

  const handleYearChange = (year: string) => {
    const y = parseInt(year);
    setSelectedYear(y);
    if (activePreset === "year") {
      setDateFilter(getPresetRange("year", y));
    }
  };

  const confirmCustomRange = () => {
    if (customRange.from && customRange.to) {
      setActivePreset("custom");
      setDateFilter({ from: customRange.from, to: customRange.to });
      setCustomOpen(false);
    }
  };

  const openEditDialog = (t: any) => {
    setEditingTransaction(t);
    setForm({
      transaction_type: t.transaction_type,
      amount: (t.amount / 100).toFixed(2),
      date: new Date(t.date + "T00:00:00"),
      account_id: t.account_id,
      subcategory_id: t.subcategory_id || "",
      note: t.note || "",
      transfer_to_account_id: t.transfer_to_account_id || "",
    });
    setEditOpen(true);
  };

  const totalIncome = transactions.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0);

  const renderTransactionForm = (onSubmit: (e: React.FormEvent) => void, submitLabel: string, isPending: boolean) => (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid grid-cols-3 gap-2">
        {(["expense", "income", "transfer"] as const).map((type) => {
          const isActive = form.transaction_type === type;
          const colorMap = {
            expense: isActive ? "bg-expense text-expense-foreground hover:bg-expense/90" : "border-expense/40 text-expense hover:bg-expense/10",
            income: isActive ? "bg-income text-income-foreground hover:bg-income/90" : "border-income/40 text-income hover:bg-income/10",
            transfer: isActive ? "bg-transfer text-transfer-foreground hover:bg-transfer/90" : "border-transfer/40 text-transfer hover:bg-transfer/10",
          };
          return (
            <Button key={type} type="button" variant={isActive ? "default" : "outline"} size="sm" className={`capitalize ${colorMap[type]}`} onClick={() => setForm({ ...form, transaction_type: type })}>
              {type}
            </Button>
          );
        })}
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
            <Calendar mode="single" selected={form.date} onSelect={(d) => d && setForm({ ...form, date: d })} className="pointer-events-auto" />
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
              {(() => {
                const grouped: Record<string, any[]> = {};
                subcategories.forEach((s: any) => {
                  const mainName = s.main_categories?.name || "Other";
                  if (!grouped[mainName]) grouped[mainName] = [];
                  grouped[mainName].push(s);
                });
                return Object.entries(grouped).map(([mainName, subs]) => (
                  <div key={mainName}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{mainName}</div>
                    {subs.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </div>
                ));
              })()}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Note (optional)</Label>
        <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {submitLabel}
      </Button>
    </form>
  );

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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Transaction</DialogTitle>
            </DialogHeader>
            {renderTransactionForm((e) => { e.preventDefault(); createMutation.mutate(form); }, "Add Transaction", createMutation.isPending)}
          </DialogContent>
        </Dialog>
      </div>

      {/* Time filter presets */}
      <div className="flex gap-2 flex-wrap items-center">
        {(["day", "week", "month", "year"] as const).map((preset) => (
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

        {activePreset === "year" && (
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[100px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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

      {/* Edit transaction dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingTransaction(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          {renderTransactionForm(
            (e) => { e.preventDefault(); if (editingTransaction) updateMutation.mutate({ id: editingTransaction.id, data: form }); },
            "Save Changes",
            updateMutation.isPending
          )}
        </DialogContent>
      </Dialog>

      {(() => {
        // Group transactions by main category
        const grouped = transactions.reduce<Record<string, { name: string; color: string; transactions: typeof transactions }>>((acc, t) => {
          const mainCatName = t.subcategories?.main_categories?.name || (t.transaction_type === "income" ? "Income" : t.transaction_type === "transfer" ? "Transfers" : "Uncategorized");
          const mainCatColor = t.subcategories?.main_categories?.color || (t.transaction_type === "income" ? "145 45% 42%" : "0 0% 50%");
          if (!acc[mainCatName]) acc[mainCatName] = { name: mainCatName, color: mainCatColor, transactions: [] };
          acc[mainCatName].transactions.push(t);
          return acc;
        }, {});

        const groups = Object.values(grouped);
        if (groups.length === 0) {
          return (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                  No transactions in this period
                </div>
              </CardContent>
            </Card>
          );
        }

        return groups.map((group) => (
          <Collapsible key={group.name} defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: `hsl(${group.color})` }} />
                    <span className="font-semibold text-sm">{group.name}</span>
                    <span className="text-xs text-muted-foreground">({group.transactions.length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-numbers text-sm text-muted-foreground">
                      {formatCurrency(group.transactions.reduce((s, t) => s + t.amount, 0))}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-2">
                  <div className="space-y-0.5">
                    {group.transactions.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => openEditDialog(t)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: `hsl(${t.subcategories?.color || group.color} / 0.12)` }}
                          >
                            {t.transaction_type === "transfer" ? (
                              <ArrowLeftRight className="h-4 w-4" style={{ color: `hsl(${group.color})` }} />
                            ) : t.transaction_type === "income" ? (
                              <Banknote className="h-4 w-4" style={{ color: `hsl(${group.color})` }} />
                            ) : (
                              <DynamicIcon name={t.subcategories?.icon || "circle"} className="h-4 w-4" style={{ color: `hsl(${t.subcategories?.color || group.color})` }} />
                            )}
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
                          <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(t.id); }}
                          >
                            <span className="text-xs">✕</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ));
      })()}
    </div>
  );
}
