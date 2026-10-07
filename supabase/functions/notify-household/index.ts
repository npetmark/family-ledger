// deno-lint-ignore no-import-prefix
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.42.0";
// deno-lint-ignore no-import-prefix
import { initializeApp, cert, getApps } from "npm:firebase-admin@12.1.0/app";
// deno-lint-ignore no-import-prefix
import { getMessaging } from "npm:firebase-admin@12.1.0/messaging";

const APP_URL = Deno.env.get("APP_URL") || "https://npetmark.github.io/family-ledger/";
const STALE_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function formatAmount(cents: number, currency: string = "USD"): string {
  const amount = Math.abs(cents) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

async function getActorName(supabase: SupabaseClient, userId: string | null): Promise<string> {
  if (!userId) return "Someone";
  const { data } = await supabase.from("profiles").select("display_name, first_name").eq("id", userId).single();
  if (data) {
    return data.display_name || data.first_name || "Someone";
  }
  return "Someone";
}

async function getSingleName(supabase: SupabaseClient, table: string, id: string): Promise<string | null> {
  const { data } = await supabase.from(table).select("name").eq("id", id).single();
  return data ? data.name : null;
}

// Initialize Firebase Admin (only once)
const firebaseServiceAccountKey = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");

if (firebaseServiceAccountKey && getApps().length === 0) {
  try {
    const serviceAccount = JSON.parse(firebaseServiceAccountKey);
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // Verify it's an INSERT operation on the transactions table
    if (payload.type !== "INSERT" || payload.table !== "transactions") {
      return new Response(JSON.stringify({ message: "Ignored" }), { status: 200 });
    }

    const transaction = payload.record;
    
    // Create Supabase client using Service Role Key to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get account to find the household_id
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("household_id, name")
      .eq("id", transaction.account_id)
      .single();

    if (accError || !account) {
      throw accError || new Error("Account not found");
    }

    // Get all users in the household EXCEPT the one who created the transaction (if known)
    let membersQuery = supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", account.household_id);
      
    if (transaction.created_by) {
      membersQuery = membersQuery.neq("user_id", transaction.created_by);
    }

    const { data: members, error: memError } = await membersQuery;

    if (memError || !members || members.length === 0) {
      console.log(`No other members found in household ${account.household_id} to notify. memError:`, memError);
      return new Response(JSON.stringify({ message: "No other members to notify" }), { status: 200 });
    }

    const userIds = members.map(m => m.user_id);

    // Get device tokens for those users
    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token")
      .in("user_id", userIds);

    if (tokensError || !tokens || tokens.length === 0) {
      console.log(`No device tokens found for users:`, userIds);
      return new Response(JSON.stringify({ message: "No device tokens found for members" }), { status: 200 });
    }

    // Look up the details needed for the message text
    const actorId: string | null = transaction.created_by ?? transaction.user_id ?? null;
    const isTransfer = transaction.transaction_type === "transfer";

    const [actorName, subcategoryName, destinationAccountName] = await Promise.all([
      getActorName(supabase, actorId),
      !isTransfer && transaction.subcategory_id
        ? getSingleName(supabase, "subcategories", transaction.subcategory_id)
        : Promise.resolve(null),
      isTransfer && transaction.transfer_to_account_id
        ? getSingleName(supabase, "accounts", transaction.transfer_to_account_id)
        : Promise.resolve(null),
    ]);

    const amountStr = formatAmount(transaction.amount, account.currency);
    let summary: string;
    if (isTransfer) {
      summary = `${actorName} transferred ${amountStr} from ${account.name}` +
        (destinationAccountName ? ` to ${destinationAccountName}` : "");
    } else if (transaction.transaction_type === "income") {
      summary = `${actorName} received ${amountStr}` +
        (subcategoryName ? ` for ${subcategoryName}` : "") +
        ` in ${account.name}`;
    } else {
      summary = `${actorName} spent ${amountStr}` +
        (subcategoryName ? ` on ${subcategoryName}` : "") +
        ` from ${account.name}`;
    }
    const note = (transaction.note || transaction.description || "").trim();
    const body = note ? `${summary}\n${note}` : summary;

    const fcmTokens = tokens.map(t => t.token);

    const message = {
      notification: {
        title: "New Transaction",
        body,
      },
      webpush: {
        // Deliver promptly even if the phone is idle / in Doze.
        headers: { Urgency: "high", TTL: "86400" },
        notification: {
          icon: `${APP_URL}notification-icon-192.png`,
          // Small monochrome icon shown in the Android status bar (only the alpha channel is used).
          badge: `${APP_URL}notification-badge-96.png`,
          tag: `transaction-${transaction.id}`,
        },
        fcmOptions: {
          // Opened when the notification is tapped. `?/transactions` is understood by the SPA
          // redirect script in index.html, avoiding a GitHub Pages 404 round-trip.
          link: `${APP_URL}?/transactions`,
        },
      },
      tokens: fcmTokens,
    };

    // Send notifications via Firebase Admin
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast(message);
    
    console.log(`Successfully sent ${response.successCount} messages; failed ${response.failureCount}`);

    // Remove tokens that FCM reports as permanently invalid (app uninstalled, permission revoked, ...)
    const staleTokens = response.responses
      .map((r, i) => (!r.success && STALE_TOKEN_ERRORS.has(r.error?.code ?? "") ? fcmTokens[i] : null))
      .filter((t): t is string => t !== null);
    if (staleTokens.length > 0) {
      const { error: deleteError } = await supabase.from("device_tokens").delete().in("token", staleTokens);
      console.log(`Removed ${staleTokens.length} stale device token(s)`, deleteError ?? "");
    }

    return new Response(
      JSON.stringify({ success: true, responses: response }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

