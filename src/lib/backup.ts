import { supabase } from "@/integrations/supabase/client";
import { downloadFile } from "./csvExport";

export interface HouseholdBackupData {
  accounts: any[];
  main_categories: any[];
  subcategories: any[];
  budgets: any[];
  transactions: any[];
  recurring_transactions: any[];
  transaction_templates: any[];
  shopping_categories: any[];
  shopping_trips: any[];
  shopping_items: any[];
  shopping_item_dictionary: any[];
}

export interface HouseholdBackup {
  format: "family-ledger-backup-payload";
  version: 1;
  createdAt: string;
  householdId: string;
  data: HouseholdBackupData;
}

export interface EncryptedBackupEnvelope {
  format: "family-ledger-encrypted-backup";
  version: 1;
  createdAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface RestoreStats {
  accounts: number;
  main_categories: number;
  subcategories: number;
  budgets: number;
  transactions: number;
  recurring_transactions: number;
  transaction_templates: number;
  shopping_categories: number;
  shopping_trips: number;
  shopping_items: number;
  shopping_item_dictionary: number;
}

// Helper to get crypto object in browser or Node test environment
function getCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API is not available in this environment.");
}

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a backup payload with AES-GCM (256-bit) and PBKDF2 key derivation.
 */
export async function encryptBackup(payload: HouseholdBackup, password: string): Promise<string> {
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters long.");
  }

  const cryptoObj = getCrypto();
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();

  const keyMaterial = await cryptoObj.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await cryptoObj.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = await cryptoObj.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext
  );

  const envelope: EncryptedBackupEnvelope = {
    format: "family-ledger-encrypted-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  };

  return JSON.stringify(envelope, null, 2);
}

/**
 * Decrypts an encrypted backup file using the password.
 */
export async function decryptBackup(encryptedJson: string, password: string): Promise<HouseholdBackup> {
  if (!password) {
    throw new Error("Password is required to decrypt the backup.");
  }

  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(encryptedJson);
  } catch {
    throw new Error("Invalid backup file: Not a valid JSON document.");
  }

  if (
    envelope.format !== "family-ledger-encrypted-backup" ||
    !envelope.salt ||
    !envelope.iv ||
    !envelope.ciphertext
  ) {
    throw new Error("Invalid backup file format: Missing expected security headers.");
  }

  const cryptoObj = getCrypto();
  const salt = base64ToBuffer(envelope.salt);
  const iv = base64ToBuffer(envelope.iv);
  const ciphertext = base64ToBuffer(envelope.ciphertext);
  const enc = new TextEncoder();

  const keyMaterial = await cryptoObj.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await cryptoObj.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await cryptoObj.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );
  } catch {
    throw new Error("Decryption failed. The password provided is incorrect, or the file is corrupted.");
  }

  const dec = new TextDecoder();
  const jsonStr = dec.decode(decryptedBuffer);
  const payload = JSON.parse(jsonStr) as HouseholdBackup;

  if (payload.format !== "family-ledger-backup-payload" || !payload.data) {
    throw new Error("Decrypted data is not a valid Family Ledger backup payload.");
  }

  return payload;
}

/**
 * Queries all data belonging to the household from the Supabase database.
 */
export async function createHouseholdBackup(householdId: string): Promise<HouseholdBackup> {
  // 1. Accounts
  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", householdId);
  if (accErr) throw accErr;

  const accountIds = (accounts || []).map((a) => a.id);

  // 2. Main Categories
  const { data: mainCats, error: mcErr } = await supabase
    .from("main_categories")
    .select("*")
    .eq("household_id", householdId);
  if (mcErr) throw mcErr;

  // 3. Subcategories
  const { data: subCats, error: scErr } = await supabase
    .from("subcategories")
    .select("*")
    .eq("household_id", householdId);
  if (scErr) throw scErr;

  // 4. Budgets
  const { data: budgets, error: bErr } = await supabase
    .from("budgets")
    .select("*")
    .eq("household_id", householdId);
  if (bErr) throw bErr;

  // 5. Transactions
  let transactions: any[] = [];
  if (accountIds.length > 0) {
    const { data: txs, error: txErr } = await supabase
      .from("transactions")
      .select("*")
      .in("account_id", accountIds);
    if (txErr) throw txErr;
    transactions = txs || [];
  }

  // 6. Recurring Transactions
  const { data: recurring, error: recErr } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("household_id", householdId);
  if (recErr) throw recErr;

  // 7. Transaction Templates
  const { data: templates, error: tmplErr } = await supabase
    .from("transaction_templates")
    .select("*")
    .eq("household_id", householdId);
  if (tmplErr) throw tmplErr;

  // 8. Shopping Categories
  const { data: shopCats, error: shcErr } = await supabase
    .from("shopping_categories")
    .select("*")
    .eq("household_id", householdId);
  if (shcErr) throw shcErr;

  // 9. Shopping Trips
  const { data: shopTrips, error: shtErr } = await supabase
    .from("shopping_trips")
    .select("*")
    .eq("household_id", householdId);
  if (shtErr) throw shtErr;

  const tripIds = (shopTrips || []).map((t) => t.id);

  // 10. Shopping Items
  let shoppingItems: any[] = [];
  if (tripIds.length > 0) {
    const { data: shItems, error: shiErr } = await supabase
      .from("shopping_items")
      .select("*")
      .in("trip_id", tripIds);
    if (shiErr) throw shiErr;
    shoppingItems = shItems || [];
  }

  // 11. Shopping Item Dictionary
  const { data: shopDict, error: shdErr } = await supabase
    .from("shopping_item_dictionary")
    .select("*")
    .eq("household_id", householdId);
  if (shdErr) throw shdErr;

  return {
    format: "family-ledger-backup-payload",
    version: 1,
    createdAt: new Date().toISOString(),
    householdId,
    data: {
      accounts: accounts || [],
      main_categories: mainCats || [],
      subcategories: subCats || [],
      budgets: budgets || [],
      transactions: transactions || [],
      recurring_transactions: recurring || [],
      transaction_templates: templates || [],
      shopping_categories: shopCats || [],
      shopping_trips: shopTrips || [],
      shopping_items: shoppingItems || [],
      shopping_item_dictionary: shopDict || [],
    },
  };
}

/**
 * Downloads an encrypted backup file to the user's computer.
 */
export async function downloadEncryptedBackup(householdId: string, password: string): Promise<string> {
  const backup = await createHouseholdBackup(householdId);
  const encryptedJson = await encryptBackup(backup, password);
  const dateStamp = new Date().toISOString().split("T")[0];
  const filename = `family-ledger-backup-${dateStamp}.flbackup`;

  downloadFile(encryptedJson, filename, "application/json;charset=utf-8;");
  return filename;
}

/**
 * Batch insert utility to avoid hitting database parameter/payload limits.
 */
async function insertInChunks(table: string, rows: any[]) {
  if (!rows || rows.length === 0) return;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table as any).insert(chunk);
    if (error) throw error;
  }
}

/**
 * Cleanly replaces current household records with records from the decrypted backup.
 */
export async function restoreHouseholdBackup(
  backup: HouseholdBackup,
  currentHouseholdId: string,
  currentUserId: string
): Promise<RestoreStats> {
  const { data } = backup;
  if (!data) {
    throw new Error("Invalid backup payload structure.");
  }

  // 1. Fetch current trip IDs and account IDs to clean up dependents
  const { data: currentTrips } = await supabase
    .from("shopping_trips")
    .select("id")
    .eq("household_id", currentHouseholdId);
  const currentTripIds = (currentTrips || []).map((t) => t.id);

  const { data: currentAccs } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", currentHouseholdId);
  const currentAccountIds = (currentAccs || []).map((a) => a.id);

  // 2. DELETE existing records in reverse dependency order (children first)
  if (currentTripIds.length > 0) {
    await supabase.from("shopping_items").delete().in("trip_id", currentTripIds);
  }
  await supabase.from("shopping_trips").delete().eq("household_id", currentHouseholdId);
  await supabase.from("shopping_item_dictionary").delete().eq("household_id", currentHouseholdId);
  await supabase.from("shopping_categories").delete().eq("household_id", currentHouseholdId);

  if (currentAccountIds.length > 0) {
    await supabase.from("transactions").delete().in("account_id", currentAccountIds);
  }
  await supabase.from("recurring_transactions").delete().eq("household_id", currentHouseholdId);
  await supabase.from("transaction_templates").delete().eq("household_id", currentHouseholdId);
  await supabase.from("budgets").delete().eq("household_id", currentHouseholdId);
  await supabase.from("subcategories").delete().eq("household_id", currentHouseholdId);
  await supabase.from("main_categories").delete().eq("household_id", currentHouseholdId);
  await supabase.from("accounts").delete().eq("household_id", currentHouseholdId);

  // 3. INSERT backup records in dependency order (parents first)
  // Re-map household_id to currentHouseholdId to allow restores into fresh or re-initialized households
  const accountsToInsert = (data.accounts || []).map((a) => ({
    ...a,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("accounts", accountsToInsert);

  const mainCatsToInsert = (data.main_categories || []).map((mc) => ({
    ...mc,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("main_categories", mainCatsToInsert);

  const subCatsToInsert = (data.subcategories || []).map((sc) => ({
    ...sc,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("subcategories", subCatsToInsert);

  const budgetsToInsert = (data.budgets || []).map((b) => ({
    ...b,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("budgets", budgetsToInsert);

  const txsToInsert = (data.transactions || []).map((tx) => ({
    ...tx,
    created_by: currentUserId,
    user_id: currentUserId,
  }));
  await insertInChunks("transactions", txsToInsert);

  const recToInsert = (data.recurring_transactions || []).map((r) => ({
    ...r,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("recurring_transactions", recToInsert);

  const tmplToInsert = (data.transaction_templates || []).map((tmpl) => ({
    ...tmpl,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("transaction_templates", tmplToInsert);

  const shopCatsToInsert = (data.shopping_categories || []).map((sc) => ({
    ...sc,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("shopping_categories", shopCatsToInsert);

  const shopTripsToInsert = (data.shopping_trips || []).map((st) => ({
    ...st,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("shopping_trips", shopTripsToInsert);

  const shopItemsToInsert = (data.shopping_items || []).map((si) => ({
    ...si,
  }));
  await insertInChunks("shopping_items", shopItemsToInsert);

  const shopDictToInsert = (data.shopping_item_dictionary || []).map((sd) => ({
    ...sd,
    household_id: currentHouseholdId,
    user_id: currentUserId,
  }));
  await insertInChunks("shopping_item_dictionary", shopDictToInsert);

  return {
    accounts: accountsToInsert.length,
    main_categories: mainCatsToInsert.length,
    subcategories: subCatsToInsert.length,
    budgets: budgetsToInsert.length,
    transactions: txsToInsert.length,
    recurring_transactions: recToInsert.length,
    transaction_templates: tmplToInsert.length,
    shopping_categories: shopCatsToInsert.length,
    shopping_trips: shopTripsToInsert.length,
    shopping_items: shopItemsToInsert.length,
    shopping_item_dictionary: shopDictToInsert.length,
  };
}
