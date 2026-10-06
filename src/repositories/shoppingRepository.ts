import { supabase } from "@/integrations/supabase/client";

export const shoppingRepository = {
  getCategories: async () => {
    const { data, error } = await supabase.from("shopping_categories").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },

  getActiveTrip: async (userId: string) => {
    const { data, error } = await supabase
      .from("shopping_trips")
      .select("*")
      .eq("status", "active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  getTripItems: async (tripId: string) => {
    const { data, error } = await supabase
      .from("shopping_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },

  getPastTrips: async (userId: string) => {
    const { data, error } = await supabase
      .from("shopping_trips")
      .select("*")
      .eq("status", "completed")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  },

  createTrip: async (userId: string, name: string) => {
    const { data, error } = await supabase
      .from("shopping_trips")
      .insert({ user_id: userId, name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateTrip: async (id: string, payload: any) => {
    const { error } = await supabase.from("shopping_trips").update(payload).eq("id", id);
    if (error) throw error;
  },

  createItem: async (payload: any) => {
    const { data, error } = await supabase.from("shopping_items").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  updateItem: async (id: string, payload: any) => {
    const { error } = await supabase.from("shopping_items").update(payload).eq("id", id);
    if (error) throw error;
  },

  deleteItem: async (id: string) => {
    const { error } = await supabase.from("shopping_items").delete().eq("id", id);
    if (error) throw error;
  },

  insertItemsBulk: async (items: any[]) => {
    const { error } = await supabase.from("shopping_items").insert(items);
    if (error) throw error;
  },

  getDictionaryEntries: async (userId: string) => {
    const { data, error } = await supabase
      .from("shopping_item_dictionary")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data;
  },

  getSuggestions: async (debounced: string) => {
    const { data, error } = await supabase
      .from("shopping_item_dictionary")
      .select("*")
      .ilike("normalized_name", `${debounced}%`)
      .order("usage_count", { ascending: false })
      .limit(8);
    if (error) throw error;
    return data;
  },

  getTopSuggested: async () => {
    const { data, error } = await supabase
      .from("shopping_item_dictionary")
      .select("*")
      .gt("usage_count", 0)
      .order("usage_count", { ascending: false })
      .order("last_used_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    return data;
  },

  updateDictionaryEntry: async (id: string, payload: any) => {
    const { error } = await supabase.from("shopping_item_dictionary").update(payload).eq("id", id);
    if (error) throw error;
  },

  insertDictionaryEntry: async (payload: any) => {
    const { error } = await supabase.from("shopping_item_dictionary").insert(payload);
    if (error) throw error;
  },

  uploadReceipt: async (path: string, file: File) => {
    const { error } = await supabase.storage.from("shopping-receipts").upload(path, file, { upsert: true });
    if (error) throw error;
  },

  createSignedUrl: async (path: string, expiresIn: number) => {
    const { data, error } = await supabase.storage.from("shopping-receipts").createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data?.signedUrl;
  },

  parseReceipt: async (path: string, currencyHint: string | null) => {
    const { data, error } = await supabase.functions.invoke("parse-receipt", {
      body: { receipt_path: path, currency_hint: currencyHint },
    });
    if (error) throw error;
    return data;
  },

  findDictionaryEntry: async (normalizedName: string) => {
    const { data } = await supabase
      .from("shopping_item_dictionary")
      .select("*")
      .eq("normalized_name", normalizedName)
      .limit(1)
      .maybeSingle();
    return data;
  },
  findLastPricedItem: async (normalizedName: string) => {
    const { data } = await supabase
      .from("shopping_items")
      .select("price_cents, unit")
      .eq("normalized_name", normalizedName)
      .not("price_cents", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
  findDictionaryEntryById: async (id: string) => {
    const { data } = await supabase
      .from("shopping_item_dictionary")
      .select("*")
      .eq("id", id)
      .single();
    return data;
  },
  updateItemsBulk: async (updates: any[]) => {
    const { error } = await supabase.from("shopping_items").upsert(updates);
    if (error) throw error;
  },
  insertTransaction: async (payload: any) => {
    const { error } = await supabase.from("transactions").insert(payload);
    if (error) throw error;
  },
  moveItemsToTrip: async (tripId: string, itemIds: string[]) => {
    const { error } = await supabase
      .from("shopping_items")
      .update({ trip_id: tripId, checked: false })
      .in("id", itemIds);
    if (error) throw error;
  },
  deleteTrip: async (id: string) => {
    const { error } = await supabase.from("shopping_trips").delete().eq("id", id);
    if (error) throw error;
  },
  renameTrip: async (id: string, name: string) => {
    const { error } = await supabase.from("shopping_trips").update({ name }).eq("id", id);
    if (error) throw error;
  },
  getExistingExcessMatches: async (tripId: string, itemIds: string[]) => {
    const { data } = await supabase
      .from("shopping_items")
      .select("*")
      .eq("trip_id", tripId)
      .in("id", itemIds);
    return data;
  },
  deleteItemsBulk: async (itemIds: string[]) => {
    const { error } = await supabase.from("shopping_items").delete().in("id", itemIds);
    if (error) throw error;
  },
  updateDictionaryCategoryByTranslationKey: async (translationKey: string, categoryId: string, userId: string) => {
    const { error } = await supabase
      .from("shopping_item_dictionary")
      .update({ category_id: categoryId })
      .eq("user_id", userId)
      .eq("translation_key", translationKey);
    if (error) throw error;
  },
  clearDictionaryUsage: async (userId: string) => {
    const { error } = await supabase
      .from("shopping_item_dictionary")
      .update({ usage_count: 0, last_used_at: null as any })
      .eq("user_id", userId);
    if (error) throw error;
  },
};
