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

export function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
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
    enc.encode(password) as unknown as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await cryptoObj.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
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
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    aesKey,
    plaintext as unknown as BufferSource
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
    enc.encode(password) as unknown as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await cryptoObj.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
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
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      aesKey,
      ciphertext as unknown as BufferSource
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
 * Helper to fetch all rows across PostgREST's default 1000-row limit using pagination.
 */
async function fetchAllPaged<T = any>(
  fetchPage: (from: number, to: number) => PromiseLike<any>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const res: any = await fetchPage(from, to);
    if (res?.error) {
      throw res.error;
    }
    const data = res?.data || [];
    all.push(...data);
    if (data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return all;
}

/**
 * Queries all data belonging to the household from the Supabase database.
 */
export async function createHouseholdBackup(householdId: string): Promise<HouseholdBackup> {
  // 1. Accounts
  const accounts = await fetchAllPaged((from, to) =>
    supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const accountIds = (accounts || []).map((a: { id: string }) => a.id);

  // 2. Main Categories
  const mainCats = await fetchAllPaged((from, to) =>
    supabase
      .from("main_categories")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // 3. Subcategories
  const subCats = await fetchAllPaged((from, to) =>
    supabase
      .from("subcategories")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // 4. Budgets
  const budgets = await fetchAllPaged((from, to) =>
    supabase
      .from("budgets")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // 5. Transactions (paginated to bypass PostgREST 1000-row default limit)
  let transactions: any[] = [];
  if (accountIds.length > 0) {
    transactions = await fetchAllPaged((from, to) =>
      supabase
        .from("transactions")
        .select("*")
        .in("account_id", accountIds)
        .order("date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    );
  }

  // 6. Recurring Transactions
  const recurring = await fetchAllPaged((from, to) =>
    supabase
      .from("recurring_transactions")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // 7. Transaction Templates
  const templates = await fetchAllPaged((from, to) =>
    supabase
      .from("transaction_templates")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // 8. Shopping Categories
  const shopCats = await fetchAllPaged((from, to) =>
    supabase
      .from("shopping_categories")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  // 9. Shopping Trips
  const shopTrips = await fetchAllPaged((from, to) =>
    supabase
      .from("shopping_trips")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const tripIds = (shopTrips || []).map((t: { id: string }) => t.id);

  // 10. Shopping Items (paginated to bypass PostgREST 1000-row default limit)
  let shoppingItems: any[] = [];
  if (tripIds.length > 0) {
    shoppingItems = await fetchAllPaged((from, to) =>
      supabase
        .from("shopping_items")
        .select("*")
        .in("trip_id", tripIds)
        .order("id", { ascending: true })
        .range(from, to)
    );
  }

  // 11. Shopping Item Dictionary
  const shopDict = await fetchAllPaged((from, to) =>
    supabase
      .from("shopping_item_dictionary")
      .select("*")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, to)
  );

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
  const currentTripIds = (currentTrips || []).map((t: { id: string }) => t.id);

  const { data: currentAccs } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", currentHouseholdId);
  const currentAccountIds = (currentAccs || []).map((a: { id: string }) => a.id);

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
