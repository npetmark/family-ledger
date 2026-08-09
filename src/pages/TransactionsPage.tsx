import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountFilter, AccountFilterValue, getFilteredAccountIds } from "@/components/AccountFilter";
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
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addMonths, addDays, addYears } from "date-fns";
import { getFundSubcategoryId } from "@/lib/fund-accounts";
import { scheduleUndoableDelete } from "@/lib/shopping";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FilterPreset = "day" | "week" | "month" | "year" | "custom";

function getAnchoredRange(preset: FilterPreset, anchor: Date): { from: Date; to: Date } {
  switch (preset) {
    case "day":
      return { from: startOfDay(anchor), to: endOfDay(anchor) };
    case "week":
      return { from: startOfWeek(anchor, { weekStartsOn: 1 }), to: endOfWeek(anchor, { weekStartsOn: 1 }) };
    case "year":
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
    case "month":
    default:
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
}

function shiftAnchor(preset: FilterPreset, anchor: Date, dir: 1 | -1): Date {
  switch (preset) {
    case "day":
      return addDays(anchor, dir);
    case "week":
      return addDays(anchor, dir * 7);
    case "year":
      return addYears(anchor, dir);
    case "month":
    default:
      return addMonths(anchor, dir);
  }
}

function formatAnchorLabel(preset: FilterPreset, anchor: Date): string {
  switch (preset) {
    case "day":
      return format(anchor, "EEE, d MMM yyyy");
    case "week": {
      const from = startOfWeek(anchor, { weekStartsOn: 1 });
      const to = endOfWeek(anchor, { weekStartsOn: 1 });
      return `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`;
    }
    case "year":
      return format(anchor, "yyyy");
    case "month":
    default:
      return format(anchor, "MMMM yyyy");
  }
}

export default function TransactionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [activePreset, setActivePreset] = useState<FilterPreset>("month");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [dateFilter, setDateFilter] = useState(getAnchoredRange("month", new Date()));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [accountFilter, setAccountFilter] = useState<AccountFilterValue>({ mode: "all-visible" });

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
      let subcategoryId: string | null = null;
      if (data.transaction_type === "transfer" && data.transfer_to_account_id) {
        const destAccount = accounts.find((a) => a.id === data.transfer_to_account_id);
        if (destAccount) subcategoryId = getFundSubcategoryId(destAccount.name, subcategories);
      } else if (data.transaction_type !== "transfer") {
        subcategoryId = data.subcategory_id || null;
      }
      const payload = {
        user_id: user!.id,
        transaction_type: data.transaction_type,
        amount: parseCurrencyToCents(data.amount),
        date: format(data.date, "yyyy-MM-dd"),
        account_id: data.account_id,
        subcategory_id: subcategoryId,
        note: data.note,
        transfer_to_account_id: data.transaction_type === "transfer" ? data.transfer_to_account_id || null : null,
      };
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      setOpen(false);
      setForm(emptyForm);
      toast.success("Transaction added");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      let subcategoryId: string | null = null;
      if (data.transaction_type === "transfer" && data.transfer_to_account_id) {
        const destAccount = accounts.find((a) => a.id === data.transfer_to_account_id);
        if (destAccount) subcategoryId = getFundSubcategoryId(destAccount.name, subcategories);
      } else if (data.transaction_type !== "transfer") {
        subcategoryId = data.subcategory_id || null;
      }
      const payload = {
        transaction_type: data.transaction_type,
        amount: parseCurrencyToCents(data.amount),
        date: format(data.date, "yyyy-MM-dd"),
        account_id: data.account_id,
        subcategory_id: subcategoryId,
        note: data.note,
        transfer_to_account_id: data.transaction_type === "transfer" ? data.transfer_to_account_id || null : null,
      };
      const { error } = await supabase.from("transactions").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      setEditOpen(false);
      setEditingTransaction(null);
      toast.success("Transaction updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const [pendingDeleteTxId, setPendingDeleteTxId] = useState<string | null>(null);

  const performDelete = (id: string) => {
    const keys = [["transactions"], ["account-balances"]];
    const snapshots = keys.map((k) => [k, queryClient.getQueryData(k)] as const);
    // Optimistically remove from caches
    keys.forEach((k) => {
      queryClient.setQueriesData({ queryKey: k }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((t: any) => t.id !== id);
      });
    });
    scheduleUndoableDelete({
      message: "Transaction deleted",
      onConfirm: async () => {
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) throw error;
        keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
      },
      onUndo: () => {
        snapshots.forEach(([k, snap]) => queryClient.setQueryData(k as any, snap));
      },
    });
  };

  const selectPreset = (preset: FilterPreset) => {
    if (preset === "custom") {
      setCustomRange({});
      setCalendarMonth(new Date());
      setCustomOpen(true);
      return;
    }
    const anchor = activePreset === "custom" ? new Date() : anchorDate;
    setAnchorDate(anchor);
    setActivePreset(preset);
    setDateFilter(getAnchoredRange(preset, anchor));
  };

  const stepPeriod = (dir: 1 | -1) => {
    if (activePreset === "custom") return;
    const next = shiftAnchor(activePreset, anchorDate, dir);
    setAnchorDate(next);
    setDateFilter(getAnchoredRange(activePreset, next));
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

  const filteredAccountIds = getFilteredAccountIds(accounts, accountFilter);
  const filteredTransactions = filteredAccountIds
    ? transactions.filter((t) => filteredAccountIds.includes(t.account_id))
    : transactions;

  const totalIncome = filteredTransactions.filter((t) => t.transaction_type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filteredTransactions.filter((t) => t.transaction_type === "expense").reduce((s, t) => s + t.amount, 0);

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
            <Calendar mode="single" selected={form.date} onSelect={(d) => d && setForm({ ...form, date: d })} className="pointer-events-auto" weekStartsOn={1} />
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
      <Button type="submit" className={`w-full ${
        form.transaction_type === "income" ? "bg-income hover:bg-income/90 text-income-foreground" :
        form.transaction_type === "transfer" ? "bg-transfer hover:bg-transfer/90 text-transfer-foreground" :
        "bg-expense hover:bg-expense/90 text-expense-foreground"
      }`} disabled={isPending}>
        {submitLabel}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <div className="flex gap-4 mt-1 text-sm">
            <span className="text-income font-mono-numbers">+{formatCurrency(totalIncome)}</span>
            <span className="text-expense font-mono-numbers">-{formatCurrency(totalExpenses)}</span>
          </div>
        </div>
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

        <AccountFilter accounts={accounts} value={accountFilter} onChange={setAccountFilter} />
      </div>

      {activePreset !== "custom" && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => stepPeriod(-1)} aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 text-center text-sm font-medium truncate">
            {formatAnchorLabel(activePreset, anchorDate)}
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => stepPeriod(1)} aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}


      {/* Custom range dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-fit max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs sm:text-sm font-medium text-center truncate">
              {isMobile
                ? format(calendarMonth, "MMMM yyyy")
                : `${format(calendarMonth, "MMMM yyyy")} – ${format(addMonths(calendarMonth, 1), "MMMM yyyy")}`}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center w-full">
            <Calendar
              weekStartsOn={1}
              mode="range"
              selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
              onSelect={(range) => {
                if (range) setCustomRange({ from: range.from, to: range.to });
                else setCustomRange({});
              }}
              numberOfMonths={isMobile ? 1 : 2}
              className="pointer-events-auto mx-auto p-0"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              classNames={{
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "hidden",
              }}
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
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
          {editingTransaction && (
            <DialogFooter className="sm:justify-start">
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  const id = editingTransaction.id;
                  setEditOpen(false);
                  setEditingTransaction(null);
                  setPendingDeleteTxId(id);
                }}
              >
                Delete transaction
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {(() => {
        // Group transactions by main category, then by subcategory
        type SubGroup = { name: string; icon: string; color: string; sortOrder: number; transactions: typeof transactions };
        type MainGroup = { name: string; color: string; sortOrder: number; subGroups: Record<string, SubGroup>; ungrouped: typeof transactions };

        // Fixed main category order: Income, Needs, Wants, Investments, Transfers
        const MAIN_CAT_ORDER: Record<string, number> = {
          "Income": 0, "Приходи": 0,
          "Needs": 1, "Нужди": 1,
          "Wants": 2, "Желания": 2,
          "Investments": 3, "Инвестиции": 3,
          "Transfers": 4,
          "Uncategorized": 5,
        };

        const getMainSortOrder = (name: string) => MAIN_CAT_ORDER[name] ?? 99;

        const mainGroups: Record<string, MainGroup> = {};

        filteredTransactions.forEach((t) => {
          const mainCatName = t.subcategories?.main_categories?.name || (t.transaction_type === "income" ? "Income" : t.transaction_type === "transfer" ? "Transfers" : "Uncategorized");
          const mainCatColor = t.subcategories?.main_categories?.color || (t.transaction_type === "income" ? "145 45% 42%" : "0 0% 50%");

          if (!mainGroups[mainCatName]) {
            mainGroups[mainCatName] = { name: mainCatName, color: mainCatColor, sortOrder: getMainSortOrder(mainCatName), subGroups: {}, ungrouped: [] };
          }

          const subName = t.subcategories?.name;
          if (subName) {
            const subId = t.subcategory_id || subName;
            if (!mainGroups[mainCatName].subGroups[subId]) {
              // Find the subcategory's sort_order from the subcategories query
              const subMeta = subcategories.find((s: any) => s.id === t.subcategory_id);
              mainGroups[mainCatName].subGroups[subId] = {
                name: subName,
                icon: t.subcategories?.icon || "circle",
                color: t.subcategories?.color || mainCatColor,
                sortOrder: subMeta?.sort_order ?? 999,
                transactions: [],
              };
            }
            mainGroups[mainCatName].subGroups[subId].transactions.push(t);
          } else {
            mainGroups[mainCatName].ungrouped.push(t);
          }
        });

        // Sort main groups by fixed order
        const groups = Object.values(mainGroups).sort((a, b) => a.sortOrder - b.sortOrder);
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

        const renderTransaction = (t: typeof transactions[0], groupColor: string) => (
          <div
            key={t.id}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group cursor-pointer"
            onClick={() => openEditDialog(t)}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `hsl(${t.subcategories?.color || groupColor} / 0.12)` }}
              >
                {t.transaction_type === "transfer" ? (
                  <ArrowLeftRight className="h-4 w-4" style={{ color: `hsl(${groupColor})` }} />
                ) : t.transaction_type === "income" ? (
                  <Banknote className="h-4 w-4" style={{ color: `hsl(${groupColor})` }} />
                ) : (
                  <DynamicIcon name={t.subcategories?.icon || "circle"} className="h-4 w-4" style={{ color: `hsl(${t.subcategories?.color || groupColor})` }} />
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
              <span className={`font-mono-numbers text-sm font-medium whitespace-nowrap flex-shrink-0 ${
                t.transaction_type === "income" ? "text-income" :
                t.transaction_type === "transfer" ? "text-transfer" : "text-expense"
              }`}>
                {t.transaction_type === "income" ? "+" : t.transaction_type === "expense" ? "-" : ""}
                {formatCurrency(t.amount)}
              </span>
            </div>
          </div>
        );

        return groups.map((group) => {
          const allTransactions = [...Object.values(group.subGroups).flatMap((sg) => sg.transactions), ...group.ungrouped];
          const totalAmount = allTransactions.reduce((s, t) => s + t.amount, 0);

          const isIncome = group.name === "Income" || group.name === "Приходи";
          return (
            <Collapsible key={group.name} defaultOpen={!isIncome}>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: `hsl(${group.color})` }} />
                      <span className="font-semibold text-sm">{group.name}</span>
                      <span className="text-xs text-muted-foreground">({allTransactions.length})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-numbers text-sm text-muted-foreground">
                        {formatCurrency(totalAmount)}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-2">
                    <div className="space-y-0.5">
                    {Object.values(group.subGroups)
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((sg) => {
                        // Sort transactions within subcategory by date desc
                        const sortedTxns = [...sg.transactions].sort((a, b) => b.date.localeCompare(a.date) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                        const subTotal = sortedTxns.reduce((s, t) => s + t.amount, 0);
                        if (sortedTxns.length === 1) {
                          return renderTransaction(sortedTxns[0], group.color);
                        }
                        return (
                          <Collapsible key={sg.name}>
                            <CollapsibleTrigger className="w-full">
                              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{ background: `hsl(${sg.color} / 0.12)` }}
                                  >
                                    <DynamicIcon name={sg.icon} className="h-4 w-4" style={{ color: `hsl(${sg.color})` }} />
                                  </div>
                                  <div className="text-left">
                                    <p className="text-sm font-medium">{sg.name}</p>
                                    <p className="text-xs text-muted-foreground">{sortedTxns.length} transactions</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono-numbers text-sm font-medium text-muted-foreground">
                                    {formatCurrency(subTotal)}
                                  </span>
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=closed]_&]:rotate-[-90deg]" />
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-6 border-l border-border/50 pl-2 space-y-0.5">
                                {sortedTxns.map((t) => renderTransaction(t, group.color))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                      {group.ungrouped.map((t) => renderTransaction(t, group.color))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        });
      })()}

      <AlertDialog open={!!pendingDeleteTxId} onOpenChange={(v) => !v && setPendingDeleteTxId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>You'll have 5 seconds to undo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = pendingDeleteTxId!;
                setPendingDeleteTxId(null);
                performDelete(id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
