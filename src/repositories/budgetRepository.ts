import { supabase } from "@/integrations/supabase/client";

export const budgetRepository = {
  getBudgets: async (monthYear: string) => {
    const { data, error } = await supabase.from("budgets").select("*").eq("month_year", monthYear);
    if (error) throw error;
    return data;
  },

  getBudgetsWithCategories: async (monthYear: string) => {
    const { data, error } = await supabase
      .from("budgets")
      .select("*, subcategories(name, icon, main_categories(name, id, sort_order))")
      .eq("month_year", monthYear);
    if (error) throw error;
    return data;
  },

  findBudget: async (subcategoryId: string, monthYear: string, userId: string) => {
    const { data, error } = await supabase
      .from("budgets")
      .select("id")
      .eq("subcategory_id", subcategoryId)
      .eq("month_year", monthYear)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  createBudget: async (payload: any) => {
    const { error } = await supabase.from("budgets").insert(payload);
    if (error) throw error;
  },
  
  createBudgets: async (payloads: any[]) => {
    const { error } = await supabase.from("budgets").insert(payloads);
    if (error) throw error;
  },

  updateBudget: async (id: string, payload: any) => {
    const { error } = await supabase.from("budgets").update(payload).eq("id", id);
    if (error) throw error;
  },

  deleteBudgets: async (ids: string[]) => {
    const { error } = await supabase.from("budgets").delete().in("id", ids);
    if (error) throw error;
  },
};
