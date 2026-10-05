import { supabase } from "@/integrations/supabase/client";

export const transactionRepository = {
  createTransaction: async (payload: any) => {
    const { error } = await supabase.from("transactions").insert(payload);
    if (error) throw error;
  },

  updateTransaction: async (id: string, payload: any) => {
    const { error } = await supabase.from("transactions").update(payload).eq("id", id);
    if (error) throw error;
  },

  deleteTransaction: async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) throw error;
  },

  getTransactionsByDateRange: async (fromStr: string, toStr: string) => {
    const pageSize = 1000;
    const all: any[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, subcategories(name, icon, color, main_categories(name, color)), accounts!transactions_account_id_fkey(name, icon)")
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return all;
  },

  getRecurringTransactions: async () => {
    const { data, error } = await supabase
      .from("recurring_transactions")
      .select("*, subcategories(name, icon, color), accounts!recurring_transactions_account_id_fkey(name, icon)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  createRecurringTransaction: async (payload: any) => {
    const { error } = await supabase.from("recurring_transactions").insert(payload);
    if (error) throw error;
  },

  updateRecurringTransaction: async (id: string, payload: any) => {
    const { error } = await supabase.from("recurring_transactions").update(payload).eq("id", id);
    if (error) throw error;
  },

  deleteRecurringTransaction: async (id: string) => {
    const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
    if (error) throw error;
  },
};
