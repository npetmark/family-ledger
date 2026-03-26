import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/financial";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, ImagePlus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  image?: string;
  transactions?: ParsedTransaction[];
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

export function TransactionChatbot({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! Tell me about your transaction or send a screenshot of a receipt/notification. For example:\n\n• \"Spent 25 EUR on coffee at Starbucks\"\n• \"Got 1500 salary on my bank account\"\n• \"Transfer 200 from Card to Cash\"" },
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
      const { data, error } = await supabase.from("subcategories").select("*, main_categories(name)").eq("is_active", true).order("sort_order");
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
      return data as { transactions: ParsedTransaction[]; message: string; needs_clarification?: boolean };
    },
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
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setImagePreview(null);

    try {
      const result = await parseMutation.mutateAsync({ message: msg || undefined, image: img || undefined });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.message, transactions: result.transactions },
      ]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, something went wrong: ${e.message}` }]);
    }

    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  const handleConfirm = (transactions: ParsedTransaction[]) => {
    saveMutation.mutate(transactions);
    setMessages((prev) => [...prev, { role: "assistant", content: `✅ ${transactions.length} transaction${transactions.length > 1 ? "s" : ""} saved successfully!` }]);
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
  const getSubcategoryName = (id: string | null) => {
    if (!id) return null;
    return subcategories.find((s: any) => s.id === id)?.name || null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setMessages([messages[0]]); setInput(""); setImagePreview(null); } }}>
      <DialogContent className="flex flex-col max-h-[80vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Transaction Assistant</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-2" ref={scrollRef}>
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
                    <div className="mt-2 space-y-1.5">
                      {msg.transactions.map((t, j) => (
                        <div key={j} className="rounded bg-background/50 p-2 text-xs space-y-0.5">
                          <div className="flex justify-between items-center">
                            <span className={`font-medium capitalize ${
                              t.transaction_type === "income" ? "text-income" :
                              t.transaction_type === "transfer" ? "text-transfer" : "text-expense"
                            }`}>{t.transaction_type}</span>
                            <span className="font-bold">{formatCurrency(t.amount)}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {getAccountName(t.account_id)}
                            {t.transfer_to_account_id && ` → ${getAccountName(t.transfer_to_account_id)}`}
                          </div>
                          {getSubcategoryName(t.subcategory_id) && (
                            <div className="text-muted-foreground">📁 {getSubcategoryName(t.subcategory_id)}</div>
                          )}
                          {t.note && <div className="text-muted-foreground">📝 {t.note}</div>}
                        </div>
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
        </ScrollArea>

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
