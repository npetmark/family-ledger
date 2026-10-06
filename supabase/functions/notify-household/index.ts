// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.42.0";
// deno-lint-ignore no-import-prefix
import { initializeApp, cert, getApps } from "npm:firebase-admin@12.1.0/app";
// deno-lint-ignore no-import-prefix
import { getMessaging } from "npm:firebase-admin@12.1.0/messaging";

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

    // Get all users in the household EXCEPT the one who created the transaction
    const { data: members, error: memError } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", account.household_id)
      .neq("user_id", transaction.created_by);

    if (memError || !members || members.length === 0) {
      return new Response(JSON.stringify({ message: "No other members to notify" }), { status: 200 });
    }

    const userIds = members.map(m => m.user_id);

    // Get device tokens for those users
    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token")
      .in("user_id", userIds);

    if (tokensError || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: "No device tokens found for members" }), { status: 200 });
    }

    // Prepare notifications
    const formattedAmount = (Math.abs(transaction.amount) / 100).toFixed(2);
    // Determine sign based on transaction type and actual amount
    const isExpense = transaction.transaction_type === "expense" || (transaction.amount < 0 && transaction.transaction_type !== "income");
    const amountStr = isExpense ? `-$${formattedAmount}` : `+$${formattedAmount}`;
    const fcmTokens = tokens.map(t => t.token);

    const message = {
      notification: {
        title: `New Transaction: ${account.name}`,
        body: `${amountStr} - ${transaction.note || transaction.description || 'No description'}`,
      },
      tokens: fcmTokens,
    };

    // Send notifications via Firebase Admin
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast(message);
    
    console.log(`Successfully sent ${response.successCount} messages; failed ${response.failureCount}`);

    return new Response(
      JSON.stringify({ success: true, responses: response }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

