import { supabase } from "@/integrations/supabase/client";

export const accountRepository = {
  getAccounts: async () => {
    const { data, error } = await supabase.from("accounts").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },

  getAccountBalances: async () => {
    const { data, error } = await supabase.rpc("get_account_balances");
    if (error) throw error;
    return data ?? [];
  },

  createAccount: async (payload: any) => {
    const { error } = await supabase.from("accounts").insert(payload);
    if (error) throw error;
  },

  updateAccount: async (id: string, payload: any) => {
    const { error } = await supabase.from("accounts").update(payload).eq("id", id);
    if (error) throw error;
  },

  deleteAccount: async (id: string) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) throw error;
  },
};
