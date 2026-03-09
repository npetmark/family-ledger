import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseAmount, extractNote } from "@/lib/parse-notification";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ShareTargetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const shared = searchParams.get("text") || searchParams.get("title") || "";
    setRawText(shared);

    const parsed = parseAmount(shared);
    if (parsed !== null) {
      setAmount((parsed / 100).toFixed(2));
    }
    setNote(extractNote(shared));
  }, [searchParams]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const amountCents = Math.round(parseFloat(amount || "0") * 100);

    const { error } = await supabase.from("pending_transactions" as any).insert({
      user_id: user.id,
      raw_text: rawText,
      parsed_amount: amountCents || null,
      parsed_note: note,
      transaction_type: "expense",
      status: "pending",
    });

    setSaving(false);
    if (error) {
      toast.error("Failed to save pending transaction");
    } else {
      toast.success("Saved as pending — confirm it on your dashboard");
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">New Pending Transaction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rawText && (
            <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground break-words">
              {rawText}
            </div>
          )}
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Transaction note"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              <Check className="h-4 w-4 mr-2" /> Save as Pending
            </Button>
            <Button variant="outline" onClick={() => navigate("/")} className="flex-1">
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
