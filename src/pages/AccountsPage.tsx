import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, parseCurrencyToCents, availableCurrencies } from "@/lib/financial";
import { DynamicIcon, availableIcons } from "@/components/DynamicIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const accountTypes = ["cash", "bank", "investment", "custom"];

export default function AccountsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", icon: "wallet", account_type: "bank", starting_balance: "", is_visible: true, currency: "EUR" });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: balanceRows = [] } = useQuery({
    queryKey: ["account-balances", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_account_balances");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const balanceMap = new Map<string, number>(
    balanceRows.map((r: any) => [r.account_id, Number(r.balance)])
  );

  const computeBalance = (acc: any) => balanceMap.get(acc.id) ?? acc.starting_balance;


  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        name: data.name,
        icon: data.icon,
        account_type: data.account_type,
        is_visible: data.is_visible,
        currency: data.currency,
        user_id: user!.id,
        starting_balance: parseCurrencyToCents(data.starting_balance),
      };
      if (editing) {
        const { error } = await supabase.from("accounts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      setOpen(false);
      setEditing(null);
      resetForm();
      toast.success(editing ? "Account updated" : "Account created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", icon: "wallet", account_type: "bank", starting_balance: "", is_visible: true, currency: "EUR" });

  const openEdit = (acc: any) => {
    setEditing(acc);
    setForm({
      name: acc.name,
      icon: acc.icon,
      account_type: acc.account_type,
      starting_balance: (acc.starting_balance / 100).toString(),
      is_visible: acc.is_visible,
      currency: acc.currency || "EUR",
    });
    setOpen(true);
  };

  const totalAssets = accounts
    .filter((a) => a.is_visible)
    .reduce((sum, a) => sum + computeBalance(a), 0);

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">Total visible assets: <span className="font-mono-numbers font-medium text-foreground">{formatCurrency(totalAssets)}</span></p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); resetForm(); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Account" : "New Account"}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-2">
                  {availableIcons.slice(0, 16).map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`p-2 rounded-lg border transition-colors ${form.icon === icon ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                      onClick={() => setForm({ ...form, icon })}
                    >
                      <DynamicIcon name={icon} className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Starting Balance</Label>
                <Input type="number" step="0.01" value={form.starting_balance} onChange={(e) => setForm({ ...form, starting_balance: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Visible in totals</Label>
                <Switch checked={form.is_visible} onCheckedChange={(v) => setForm({ ...form, is_visible: v })} />
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {editing ? "Update" : "Create"} Account
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...accounts].sort((a, b) => (b.is_visible ? 1 : 0) - (a.is_visible ? 1 : 0)).map((account) => {
          const balance = computeBalance(account);
          return (
            <Card key={account.id} className={!account.is_visible ? "opacity-60" : ""}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <DynamicIcon name={account.icon} className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{account.account_type} · {(account as any).currency || "EUR"}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(account)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(account.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-semibold font-mono-numbers">{formatCurrency(balance, (account as any).currency || "EUR")}</p>
                  {!account.is_visible && <p className="text-xs text-muted-foreground mt-1">Hidden from totals</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
