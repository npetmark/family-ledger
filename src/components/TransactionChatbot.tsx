import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/financial";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Send, ImagePlus, Check, X, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { DynamicIcon } from "@/components/DynamicIcon";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  image?: string;
  transactions?: ParsedTransaction[];
  budgetUpdates?: BudgetUpdate[];
};

type ParsedTransaction = {
  transaction_type: string;
  amount: number;
  account_id: string;
  subcategory_id: string | null;
  transfer_to_account_id: string | null;
  note: string;
  date: string;
};

type BudgetUpdate = {
  subcategory_id: string;
  amount: number;
  month_year: string;
};

export function TransactionChatbot({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I can help with transactions and budgets. Examples:\n\n• \"Spent 25 EUR on coffee at Starbucks\"\n• \"Got 1500 salary on my bank account\"\n• \"Create a budget for April: Ипотека 1182, Сметки 300\"\n• Send a receipt screenshot" },
  ]);
  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(id, name, color)").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const { data: mainCategories = [] } = useQuery({
    queryKey: ["main_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("main_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const parseMutation = useMutation({
    mutationFn: async ({ message, image, history }: { message?: string; image?: string; history?: { role: string; content: string }[] }) => {
      const { data, error } = await supabase.functions.invoke("parse-transaction", {
        body: { message, image, history },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { action?: string; transactions: ParsedTransaction[]; budget_updates?: BudgetUpdate[]; message: string; needs_clarification?: boolean };
    },
  });

  const saveBudgetMutation = useMutation({
    mutationFn: async (updates: BudgetUpdate[]) => {
      for (const bu of updates) {
        // Check if budget already exists for this subcategory + month
        const { data: existing } = await supabase
          .from("budgets")
          .select("id")
          .eq("subcategory_id", bu.subcategory_id)
          .eq("month_year", bu.month_year)
          .eq("user_id", user!.id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase.from("budgets").update({ amount: bu.amount }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("budgets").insert({
            user_id: user!.id,
            subcategory_id: bu.subcategory_id,
            month_year: bu.month_year,
            amount: bu.amount,
            alert_threshold: 90,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget updated!");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async (transactions: ParsedTransaction[]) => {
      const payload = transactions.map((t) => ({
        user_id: user!.id,
        transaction_type: t.transaction_type,
        amount: t.amount,
        date: t.date,
        account_id: t.account_id,
        subcategory_id: t.subcategory_id,
        note: t.note,
        transfer_to_account_id: t.transfer_to_account_id,
      }));
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      toast.success("Transactions saved!");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSend = async () => {
    const msg = input.trim();
    const img = imagePreview;
    if (!msg && !img) return;

    const userMsg: ChatMessage = { role: "user", content: msg || "📷 Image uploaded", image: img || undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setImagePreview(null);

    const history = newMessages
      .filter((m) => m.role === "user" || (m.role === "assistant" && !m.transactions?.length && !m.budgetUpdates?.length))
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const result = await parseMutation.mutateAsync({ message: msg || undefined, image: img || undefined, history });
      
      if (result.action === "budget" && !result.needs_clarification && result.budget_updates?.length) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.message, budgetUpdates: result.budget_updates },
        ]);
      } else {
        const showTransactions = !result.needs_clarification && result.transactions?.length > 0;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.message, transactions: showTransactions ? result.transactions : undefined },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, something went wrong: ${e.message}` }]);
    }

    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  const handleUpdateTransaction = (msgIndex: number, txIndex: number, field: string, value: string | null) => {
    setMessages((prev) => prev.map((msg, mi) => {
      if (mi !== msgIndex || !msg.transactions) return msg;
      const updated = [...msg.transactions];
      updated[txIndex] = { ...updated[txIndex], [field]: value };
      return { ...msg, transactions: updated };
    }));
  };

  const handleConfirm = (transactions: ParsedTransaction[]) => {
    saveMutation.mutate(transactions);
    setMessages((prev) => [...prev, { role: "assistant", content: `✅ ${transactions.length} transaction${transactions.length > 1 ? "s" : ""} saved successfully!` }]);
  };

  const handleConfirmBudget = (updates: BudgetUpdate[]) => {
    saveBudgetMutation.mutate(updates);
    setMessages((prev) => [...prev, { role: "assistant", content: `✅ ${updates.length} budget${updates.length > 1 ? "s" : ""} updated successfully!` }]);
  };

  const getSubcategoryName = (id: string) => {
    const sub = subcategories.find((s: any) => s.id === id);
    return sub ? (sub as any).name : "Unknown";
  };

  const getSubcategoryIcon = (id: string) => {
    const sub = subcategories.find((s: any) => s.id === id);
    return sub ? (sub as any).icon : "circle";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name || "Unknown";

  // Group subcategories by main category for the picker
  const groupedSubcategories = mainCategories.map((mc) => ({
    ...mc,
    subs: subcategories.filter((s: any) => s.main_category_id === mc.id),
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setMessages([messages[0]]); setInput(""); setImagePreview(null); } }}>
      <DialogContent className="flex flex-col max-h-[80vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Transaction Assistant</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2" ref={scrollRef}>
          <div className="space-y-3 pb-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {msg.image && (
                    <img src={msg.image} alt="Uploaded" className="max-h-32 rounded mb-2" />
                  )}
                  {msg.content}
                  {msg.transactions && msg.transactions.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.transactions.map((t, j) => (
                        <TransactionCard
                          key={j}
                          transaction={t}
                          accounts={accounts}
                          groupedSubcategories={groupedSubcategories}
                          onUpdate={(field, value) => handleUpdateTransaction(i, j, field, value)}
                        />
                      ))}
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="default" className="h-7 text-xs bg-income hover:bg-income/90 text-income-foreground" onClick={() => handleConfirm(msg.transactions!)} disabled={saveMutation.isPending}>
                          <Check className="h-3 w-3 mr-1" /> Confirm
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMessages((prev) => [...prev, { role: "assistant", content: "Cancelled. Tell me again or try differently." }])}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {parseMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Parsing...
                </div>
              </div>
            )}
          </div>
        </div>

        {imagePreview && (
          <div className="relative inline-block">
            <img src={imagePreview} alt="Preview" className="h-16 rounded border" />
            <button onClick={() => setImagePreview(null)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center text-xs">×</button>
          </div>
        )}

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a transaction..."
            className="flex-1"
          />
          <Button type="submit" size="icon" className="shrink-0" disabled={parseMutation.isPending || (!input.trim() && !imagePreview)}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransactionCard({
  transaction: t,
  accounts,
  groupedSubcategories,
  onUpdate,
}: {
  transaction: ParsedTransaction;
  accounts: any[];
  groupedSubcategories: any[];
  onUpdate: (field: string, value: string | null) => void;
}) {
  const [catOpen, setCatOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(t.note);

  const getSubcategoryName = (id: string | null) => {
    if (!id) return null;
    for (const g of groupedSubcategories) {
      const s = g.subs.find((s: any) => s.id === id);
      if (s) return s.name;
    }
    return null;
  };

  const getSubcategoryInfo = (id: string | null) => {
    if (!id) return null;
    for (const g of groupedSubcategories) {
      const s = g.subs.find((s: any) => s.id === id);
      if (s) return { name: s.name, icon: s.icon, mainCatName: g.name };
    }
    return null;
  };

  const subInfo = getSubcategoryInfo(t.subcategory_id);

  return (
    <div className="rounded bg-background/50 p-2.5 text-xs space-y-1.5">
      <div className="flex justify-between items-center">
        <span className={`font-medium capitalize ${
          t.transaction_type === "income" ? "text-income" :
          t.transaction_type === "transfer" ? "text-transfer" : "text-expense"
        }`}>{t.transaction_type}</span>
        <span className="font-bold">{formatCurrency(t.amount)}</span>
      </div>

      {/* Editable Account */}
      <div className="space-y-0.5">
        <label className="text-muted-foreground text-[10px] uppercase tracking-wide">Account</label>
        <Select value={t.account_id} onValueChange={(v) => onUpdate("account_id", v)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <div className="flex items-center gap-1.5">
                  <DynamicIcon name={a.icon} className="h-3 w-3" />
                  {a.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Editable Transfer destination */}
      {t.transaction_type === "transfer" && (
        <div className="space-y-0.5">
          <label className="text-muted-foreground text-[10px] uppercase tracking-wide">Transfer to</label>
          <Select value={t.transfer_to_account_id || ""} onValueChange={(v) => onUpdate("transfer_to_account_id", v)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.filter((a) => a.id !== t.account_id).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-1.5">
                    <DynamicIcon name={a.icon} className="h-3 w-3" />
                    {a.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Editable Category */}
      {t.transaction_type !== "transfer" && (
        <div className="space-y-0.5">
          <label className="text-muted-foreground text-[10px] uppercase tracking-wide">Category</label>
          <Popover open={catOpen} onOpenChange={setCatOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs justify-between font-normal">
                {subInfo ? (
                  <span className="flex items-center gap-1.5">
                    <DynamicIcon name={subInfo.icon} className="h-3 w-3" />
                    {subInfo.name}
                    <span className="text-muted-foreground">({subInfo.mainCatName})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Select category</span>
                )}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="max-h-64 overflow-y-auto overscroll-contain touch-pan-y p-1" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
              {groupedSubcategories.map((mc) => (
                <Collapsible key={mc.id} defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${mc.color})` }} />
                    {mc.name}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {mc.subs.map((s: any) => (
                      <button
                        key={s.id}
                        className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-xs rounded hover:bg-accent ${s.id === t.subcategory_id ? "bg-accent font-medium" : ""}`}
                        onClick={() => { onUpdate("subcategory_id", s.id); setCatOpen(false); }}
                      >
                        <DynamicIcon name={s.icon} className="h-3 w-3" />
                        {s.name}
                      </button>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Editable Note */}
      <div className="space-y-0.5">
        <label className="text-muted-foreground text-[10px] uppercase tracking-wide">Note</label>
        {editingNote ? (
          <Input
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={() => { onUpdate("note", noteValue); setEditingNote(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onUpdate("note", noteValue); setEditingNote(false); } }}
            className="h-7 text-xs"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setNoteValue(t.note); setEditingNote(true); }}
            className="w-full text-left px-2 py-1 rounded border border-transparent hover:border-border text-xs min-h-[28px] flex items-center"
          >
            {t.note || <span className="text-muted-foreground italic">Add note...</span>}
          </button>
        )}
      </div>
    </div>
  );
}
