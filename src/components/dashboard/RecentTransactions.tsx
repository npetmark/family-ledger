import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents } from "@/lib/financial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/DynamicIcon";
import {
  ArrowUpRight, ArrowDownRight, ArrowLeftRight,
  Trash2, CalendarIcon, ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
// fund-accounts import removed - not needed for simple edit

interface RecentTransactionsProps {
  transactions: any[];
  accounts: any[];
}

export function RecentTransactions({ transactions, accounts }: RecentTransactionsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const [form, setForm] = useState({
    transaction_type: "expense",
    amount: "",
    date: new Date(),
    account_id: "",
    subcategory_id: "",
    note: "",
    transfer_to_account_id: "",
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["subcategories-with-main", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcategories")
        .select("*, main_categories(name, id, color, sort_order)")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && editOpen,
  });

  const grouped = categories.reduce((acc: Record<string, { name: string; color: string; sortOrder: number; items: any[] }>, sub) => {
    const main = (sub as any).main_categories;
    if (!main) return acc;
    if (!acc[main.id]) acc[main.id] = { name: main.name, color: main.color, sortOrder: main.sort_order, items: [] };
    acc[main.id].items.push(sub);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  const recentTransactions = transactions.slice(0, 5);

  const openEdit = (tx: any) => {
    setEditingTx(tx);
    setForm({
      transaction_type: tx.transaction_type,
      amount: (tx.amount / 100).toFixed(2),
      date: new Date(tx.date),
      account_id: tx.account_id,
      subcategory_id: tx.subcategory_id || "",
      note: tx.note || "",
      transfer_to_account_id: tx.transfer_to_account_id || "",
    });
    setEditOpen(true);
  };

  const openDelete = (tx: any) => {
    setEditingTx(tx);
    setDeleteOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingTx) return;
      const amount = parseCurrencyToCents(form.amount);
      const isTransfer = form.transaction_type === "transfer";

      const payload: any = {
        transaction_type: form.transaction_type,
        amount,
        date: format(form.date, "yyyy-MM-dd"),
        account_id: form.account_id,
        subcategory_id: isTransfer ? null : (form.subcategory_id || null),
        note: form.note || "",
        transfer_to_account_id: isTransfer ? (form.transfer_to_account_id || null) : null,
      };

      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", editingTx.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      toast.success("Transaction updated");
      setEditOpen(false);
      setEditingTx(null);
    },
    onError: () => toast.error("Failed to update transaction"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editingTx) return;
      const { error } = await supabase.from("transactions").delete().eq("id", editingTx.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      toast.success("Transaction deleted");
      setDeleteOpen(false);
      setEditingTx(null);
    },
    onError: () => toast.error("Failed to delete transaction"),
  });

  const getAccountName = (id: string) => accounts.find((a: any) => a.id === id)?.name || "";

  const selectedSubcategory = categories.find((c) => c.id === form.subcategory_id);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length > 0 ? (
            <div className="space-y-1">
              {recentTransactions.map((t) => {
                const accountName = getAccountName(t.account_id);
                const categoryName = t.subcategories?.name;
                const mainCatColor = t.subcategories?.main_categories?.color;

                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          t.transaction_type === "income"
                            ? "bg-income/10"
                            : t.transaction_type === "transfer"
                            ? "bg-transfer/10"
                            : "bg-expense/10"
                        }`}
                      >
                        {t.transaction_type === "income" ? (
                          <ArrowUpRight className="h-4 w-4 text-income" />
                        ) : t.transaction_type === "transfer" ? (
                          <ArrowLeftRight className="h-4 w-4 text-transfer" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-expense" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {categoryName && (
                            <div className="flex items-center gap-1.5">
                              {mainCatColor && (
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: `hsl(${mainCatColor})` }}
                                />
                              )}
                              <span className="text-sm font-medium truncate">{categoryName}</span>
                            </div>
                          )}
                          {!categoryName && (
                            <span className="text-sm font-medium truncate">
                              {t.transaction_type === "transfer" ? "Transfer" : t.note || "Transaction"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{accountName}</span>
                          {t.note && categoryName && (
                            <>
                              <span>·</span>
                              <span className="truncate">{t.note}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{format(new Date(t.date), "MMM d")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`font-mono-numbers text-sm font-medium ${
                          t.transaction_type === "income"
                            ? "text-income"
                            : t.transaction_type === "transfer"
                            ? "text-transfer"
                            : "text-expense"
                        }`}
                      >
                        {t.transaction_type === "income" ? "+" : t.transaction_type === "expense" ? "-" : ""}
                        {formatCurrency(t.amount)}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openDelete(t)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No transactions this month yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingTx(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={form.transaction_type} onValueChange={(v) => setForm({ ...form, transaction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(form.date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date}
                    onSelect={(d) => { if (d) { setForm({ ...form, date: d }); setDateOpen(false); } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>{form.transaction_type === "transfer" ? "From Account" : "Account"}</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <DynamicIcon name={a.icon} className="h-4 w-4" />
                        {a.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.transaction_type === "transfer" && (
              <div>
                <Label>To Account</Label>
                <Select value={form.transfer_to_account_id} onValueChange={(v) => setForm({ ...form, transfer_to_account_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a: any) => a.id !== form.account_id).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <DynamicIcon name={a.icon} className="h-4 w-4" />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.transaction_type !== "transfer" && (
              <div>
                <Label>Category</Label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      {selectedSubcategory ? (
                        <div className="flex items-center gap-2">
                          <DynamicIcon name={selectedSubcategory.icon} className="h-4 w-4" />
                          {selectedSubcategory.name}
                        </div>
                      ) : (
                        "Select category"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div
                      className="max-h-64 overflow-y-auto overscroll-contain touch-pan-y p-1"
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      {sortedGroups.map(([mainId, group]) => (
                        <Collapsible key={mainId} defaultOpen>
                          <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium hover:bg-muted/50 rounded">
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 [&[data-state=open]>svg]:rotate-90" />
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: `hsl(${group.color})` }}
                            />
                            {group.name}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-4">
                              {group.items.map((sub: any) => (
                                <button
                                  key={sub.id}
                                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted/50 ${
                                    form.subcategory_id === sub.id ? "bg-primary/10 text-primary" : ""
                                  }`}
                                  onClick={() => {
                                    setForm({ ...form, subcategory_id: sub.id });
                                    setCategoryOpen(false);
                                  }}
                                >
                                  <DynamicIcon name={sub.icon} className="h-4 w-4" />
                                  {sub.name}
                                </button>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div>
              <Label>Note</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
