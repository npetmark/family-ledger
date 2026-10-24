import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/queries/useAccounts";
import { useActiveSubcategories } from "@/hooks/queries/useCategories";
import { useRecurringTransactions, useSaveRecurringTransaction, useDeleteRecurringTransaction } from "@/hooks/queries/useTransactions";
import { useHouseholdMembers } from "@/hooks/queries/useHouseholdMembers";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents, compareMainCategories, compareSubcategories } from "@/lib/financial";
import { DynamicIcon } from "@/components/DynamicIcon";
import { AccountSelectItems, formatAccountNameWithOwner } from "@/components/AccountSelectItems";
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
import { useLanguage } from "@/lib/i18n";

const frequencies = ["daily", "weekly", "monthly", "yearly"] as const;

export default function RecurringPage() {
  const { user } = useAuth();
  const { t, formatDate, translateCategory } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: householdInfo } = useHouseholdMembers(user?.id);

  const [form, setForm] = useState({
    transaction_type: "expense",
    amount: "",
    frequency: "monthly",
    next_due_date: new Date(),
    account_id: "",
    subcategory_id: "",
    note: "",
  });

  const { data: recurring = [] } = useRecurringTransactions(user?.id);

  const { data: accounts = [] } = useAccounts(user?.id);
  const writableAccounts = accounts
    .filter(a => a.owner_user_id === null || a.owner_user_id === user?.id)
    .sort((a, b) => {
      if (a.owner_user_id === user?.id && b.owner_user_id === null) return -1;
      if (a.owner_user_id === null && b.owner_user_id === user?.id) return 1;
      return a.sort_order - b.sort_order;
    });

  const { data: subcategories = [] } = useActiveSubcategories(user?.id);

  const saveMutation = useSaveRecurringTransaction({
    onSuccess: () => {
      setOpen(false);
      setEditing(null);
      resetForm();
      toast.success(editing ? t("common.success") : t("common.success"));
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      user_id: user!.id,
      transaction_type: form.transaction_type,
      amount: parseCurrencyToCents(form.amount),
      frequency: form.frequency,
      next_due_date: format(form.next_due_date, "yyyy-MM-dd"),
      start_date: format(form.next_due_date, "yyyy-MM-dd"),
      account_id: form.account_id,
      subcategory_id: form.subcategory_id || null,
      note: form.note,
    };
    if (householdInfo?.householdId) {
      payload.household_id = householdInfo.householdId;
    }
    saveMutation.mutate({ id: editing?.id, payload });
  };

  const deleteMutation = useDeleteRecurringTransaction({
    onSuccess: () => {
      toast.success(t("common.success"));
    },
    onError: (e) => toast.error(e.message),
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("recurring.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("recurring.automatedRepeating")}</p>
        </div>
        <Button onClick={() => { setEditing(null); resetForm(); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> {t("recurring.addRecurring")}
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
                      <p className="font-medium">{r.subcategories?.name ? translateCategory(r.subcategories.name) : (r.note || t("recurring.title"))}</p>
                      <div className="flex gap-2 mt-1 items-center">
                        <Badge variant="secondary" className="text-xs capitalize">{t(`recurring.${r.frequency}` as any)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatAccountNameWithOwner(
                            accounts.find((a: any) => a.id === r.account_id) || { name: r.accounts?.name },
                            householdInfo?.members
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`font-mono-numbers font-medium ${r.transaction_type === "income" ? "text-income" : "text-expense"}`}>
                        {r.transaction_type === "income" ? "+" : "-"}{formatCurrency(r.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("recurring.next")}: {formatDate(new Date(r.next_due_date), "PP")}
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
              {t("recurring.noRecurringYet")}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("recurring.editRecurring") : t("recurring.newRecurring")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((type) => (
                <Button key={type} type="button" variant={form.transaction_type === type ? "default" : "outline"} size="sm" className="capitalize" onClick={() => setForm({ ...form, transaction_type: type })}>
                  {type === "expense" ? t("transactions.expense") : t("transactions.income")}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>{t("common.amount")}</Label>
              <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>{t("recurring.frequency")}</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {frequencies.map((f) => <SelectItem key={f} value={f} className="capitalize">{t(`recurring.${f}` as any)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("recurring.nextDueDate")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {formatDate(form.next_due_date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.next_due_date} onSelect={(d) => d && setForm({ ...form, next_due_date: d })} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>{t("transactions.account")}</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("transactions.selectAccount")} /></SelectTrigger>
                <SelectContent>
                  <AccountSelectItems
                    accounts={accounts}
                    currentUserId={user?.id}
                    householdMembers={householdInfo?.members}
                  />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("transactions.category")}</Label>
              <Select value={form.subcategory_id} onValueChange={(v) => setForm({ ...form, subcategory_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("transactions.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {[...subcategories]
                    .sort((a: any, b: any) =>
                      compareMainCategories(
                        { name: a.main_categories?.name, sort_order: a.main_categories?.sort_order },
                        { name: b.main_categories?.name, sort_order: b.main_categories?.sort_order }
                      ) || compareSubcategories(a, b)
                    )
                    .map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {translateCategory(s.main_categories?.name)} → {translateCategory(s.name)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("transactions.note")} ({t("common.optional")})</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
              {editing ? t("common.save") : t("common.add")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
