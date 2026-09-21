import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Timing-safe string compare
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const API_KEY = Deno.env.get("EXPORT_API_KEY");
  const USER_ID = Deno.env.get("EXPORT_USER_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!API_KEY || !USER_ID || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Server not configured" }, 500);
  }

  const provided = req.headers.get("x-api-key") || "";
  if (!provided || !safeEq(provided, API_KEY)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const resource = (url.searchParams.get("resource") || "all").toLowerCase();
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to");     // YYYY-MM-DD
  const month = url.searchParams.get("month"); // YYYY-MM

  const isDate = (s: string | null) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
  const isMonth = (s: string | null) => !s || /^\d{4}-\d{2}$/.test(s);
  if (!isDate(from) || !isDate(to) || !isMonth(month)) {
    return json({ error: "Invalid date format. Use YYYY-MM-DD or YYYY-MM." }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const want = (r: string) => resource === "all" || resource === r;

    const out: Record<string, unknown> = {
      user_id: USER_ID,
      generated_at: new Date().toISOString(),
      currency_note: "All amounts are integers in minor units (cents).",
    };

    // Accounts (needed for balances always)
    const { data: accounts, error: accErr } = await supabase
      .from("accounts")
      .select("id, name, icon, account_type, currency, starting_balance, is_visible, sort_order")
      .eq("user_id", USER_ID)
      .order("sort_order");
    if (accErr) throw accErr;

    if (want("accounts") || want("balances")) {
      out.accounts = accounts;
    }

    // Transactions
    let tx: any[] = [];
    if (want("transactions") || want("balances")) {
      let q = supabase
        .from("transactions")
        .select("id, account_id, subcategory_id, transaction_type, amount, date, note, tags, transfer_to_account_id, created_at")
        .eq("user_id", USER_ID)
        .order("date", { ascending: false });
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      const { data, error } = await q.limit(10000);
      if (error) throw error;
      tx = data || [];
      if (want("transactions")) out.transactions = tx;
    }

    // Balances = starting_balance + sum(income) - sum(expense) + transfers_in - transfers_out
    if (want("balances")) {
      // Pull ALL transactions for accurate balance (ignore from/to for balance calc)
      const { data: allTx, error: allErr } = await supabase
        .from("transactions")
        .select("account_id, transfer_to_account_id, transaction_type, amount")
        .eq("user_id", USER_ID)
        .limit(100000);
      if (allErr) throw allErr;

      const balances = (accounts || []).map((a: any) => {
        let bal = Number(a.starting_balance) || 0;
        for (const t of allTx || []) {
          const amt = Number(t.amount) || 0;
          if (t.transaction_type === "income" && t.account_id === a.id) bal += amt;
          else if (t.transaction_type === "expense" && t.account_id === a.id) bal -= amt;
          else if (t.transaction_type === "transfer") {
            if (t.account_id === a.id) bal -= amt;
            if (t.transfer_to_account_id === a.id) bal += amt;
          }
        }
        return {
          account_id: a.id,
          name: a.name,
          currency: a.currency,
          balance: bal,
        };
      });
      out.balances = balances;
    }

    // Budgets
    if (want("budgets")) {
      let bq = supabase
        .from("budgets")
        .select("id, subcategory_id, month_year, amount, alert_threshold")
        .eq("user_id", USER_ID)
        .order("month_year", { ascending: false });
      if (month) bq = bq.eq("month_year", month);
      const { data: budgets, error: bErr } = await bq.limit(10000);
      if (bErr) throw bErr;
      out.budgets = budgets;
    }

    // Categories (helpful lookup)
    if (want("categories") || want("budgets") || want("transactions") || resource === "all") {
      const [{ data: mains }, { data: subs }] = await Promise.all([
        supabase.from("main_categories").select("id, name, color, sort_order").eq("user_id", USER_ID).order("sort_order"),
        supabase.from("subcategories").select("id, main_category_id, name, icon, color, is_active, sort_order").eq("user_id", USER_ID).order("sort_order"),
      ]);
      out.main_categories = mains;
      out.subcategories = subs;
    }

    return json(out);
  } catch (e) {
    console.error("data-export error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
