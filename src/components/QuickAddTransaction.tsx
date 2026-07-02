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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, CalendarIcon, ChevronRight, MessageSquare, PenLine, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { getFundSubcategoryId } from "@/lib/fund-accounts";
import { DynamicIcon } from "@/components/DynamicIcon";
import { TransactionChatbot } from "@/components/TransactionChatbot";
import { addShoppingItem, parseShoppingEntry } from "@/lib/shopping";

export function QuickAddTransaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingText, setShoppingText] = useState("");
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
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(name, color)").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
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
      resetForm();
      toast.success("Transaction added");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({ transaction_type: "expense", amount: "", date: new Date(), account_id: "", subcategory_id: "", note: "", transfer_to_account_id: "" });

  const addShoppingMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user) throw new Error("Not signed in");
      await addShoppingItem({ userId: user.id, rawText: text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-items"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-active-trip"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-top-suggested"] });
      setShoppingText("");
      setShoppingOpen(false);
      toast.success("Added to shopping list");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add item"),
  });

  const shoppingPreview = shoppingText.trim() ? parseShoppingEntry(shoppingText) : null;

  return (
    <>
      {/* FAB Menu */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <Button
              onClick={() => { setChatOpen(true); setMenuOpen(false); }}
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg px-4 gap-2"
            >
              <MessageSquare className="h-4 w-4" /> AI Chatbot
            </Button>
            <Button
              onClick={() => { setOpen(true); setMenuOpen(false); }}
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg px-4 gap-2"
            >
              <PenLine className="h-4 w-4" /> Add Record
            </Button>
            <Button
              onClick={() => { setShoppingOpen(true); setMenuOpen(false); }}
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg px-4 gap-2"
            >
              <ShoppingCart className="h-4 w-4" /> Shopping Item
            </Button>
          </div>
        )}
        <Button
          onClick={() => setMenuOpen((v) => !v)}
          size="icon"
          className={`h-14 w-14 rounded-full shadow-lg transition-transform ${menuOpen ? "rotate-45" : ""}`}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      <TransactionChatbot open={chatOpen} onOpenChange={setChatOpen} />

      <Dialog open={shoppingOpen} onOpenChange={(v) => { setShoppingOpen(v); if (!v) setShoppingText(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to shopping list</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (shoppingText.trim()) addShoppingMutation.mutate(shoppingText);
            }}
          >
            <Input
              autoFocus
              value={shoppingText}
              onChange={(e) => setShoppingText(e.target.value)}
              placeholder="e.g. chicken 1 kg, мляко 2 л, eggs x10"
            />
            {shoppingPreview && shoppingPreview.name && (
              <p className="text-xs text-muted-foreground">
                Will add <span className="font-medium text-foreground">{shoppingPreview.name}</span>
                {shoppingPreview.quantity !== 1 || shoppingPreview.unit
                  ? ` · ${shoppingPreview.quantity}${shoppingPreview.unit ? ` ${shoppingPreview.unit}` : ""}`
                  : ""}
                {" "}to your active trip.
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={!shoppingText.trim() || addShoppingMutation.isPending}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to list
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Transaction</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
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
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(form.date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.date} onSelect={(d) => { if (d) { setForm({ ...form, date: d }); setDateOpen(false); } }} weekStartsOn={1} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent position="popper" side="bottom" sideOffset={4} className="max-h-60 overflow-y-auto">
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.transaction_type === "transfer" ? (
              <div className="space-y-2">
                <Label>Transfer To</Label>
                <Select value={form.transfer_to_account_id} onValueChange={(v) => setForm({ ...form, transfer_to_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent position="popper" side="bottom" sideOffset={4} className="max-h-60 overflow-y-auto">
                    {accounts.filter((a) => a.id !== form.account_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Category</Label>
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className={form.subcategory_id ? "text-foreground" : "text-muted-foreground"}>
                        {form.subcategory_id
                          ? subcategories.find((s: any) => s.id === form.subcategory_id)?.name || "Select category"
                          : "Select category"}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4} onOpenAutoFocus={(e) => e.preventDefault()}>
                    <div className="max-h-64 overflow-y-auto overscroll-contain touch-pan-y p-1" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
                      {(() => {
                        const categoryOrder = ["Нужди", "Желания", "Инвестиции", "Приходи"];
                        const grouped: Record<string, any[]> = {};
                        subcategories.forEach((s: any) => {
                          const mainName = s.main_categories?.name || "Other";
                          if (!grouped[mainName]) grouped[mainName] = [];
                          grouped[mainName].push(s);
                        });
                        const sortedEntries = categoryOrder
                          .filter((name) => grouped[name])
                          .map((name) => [name, grouped[name]] as const);
                        // Add any remaining categories not in the order
                        Object.entries(grouped).forEach(([name, subs]) => {
                          if (!categoryOrder.includes(name)) sortedEntries.push([name, subs]);
                        });
                         return sortedEntries.map(([mainName, subs]) => {
                          const mainCat = Object.values(grouped).length > 0
                            ? subcategories.find((s: any) => s.main_categories?.name === mainName)?.main_categories
                            : null;
                          return (
                          <Collapsible key={mainName}>
                            <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent rounded-sm">
                              <span className="flex items-center gap-1.5">
                                {mainCat?.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${mainCat.color})` }} />}
                                {mainName}
                              </span>
                              <ChevronRight className="h-3 w-3 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              {subs.map((s: any) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer ${
                                    form.subcategory_id === s.id ? "bg-accent font-medium" : ""
                                  }`}
                                  onClick={() => {
                                    setForm({ ...form, subcategory_id: s.id });
                                    setCategoryOpen(false);
                                  }}
                                >
                                  <DynamicIcon name={s.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                                  {s.name}
                                </button>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                        });
                      })()}
                    </div>
                  </PopoverContent>
                </Popover>
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
            }`} disabled={createMutation.isPending}>
              Add Transaction
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
