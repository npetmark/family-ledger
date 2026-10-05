import { supabase } from "@/integrations/supabase/client";

export const categoryRepository = {
  getMainCategories: async () => {
    const { data, error } = await supabase.from("main_categories").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },
  
  createMainCategory: async (payload: any) => {
    const { error } = await supabase.from("main_categories").insert(payload);
    if (error) throw error;
  },
  
  updateMainCategory: async (id: string, payload: any) => {
    const { error } = await supabase.from("main_categories").update(payload).eq("id", id);
    if (error) throw error;
  },
  
  deleteMainCategory: async (id: string) => {
    // Delete subcategories first (simulating cascade if not set)
    await supabase.from("subcategories").delete().eq("main_category_id", id);
    const { error } = await supabase.from("main_categories").delete().eq("id", id);
    if (error) throw error;
  },

  getSubcategories: async () => {
    const { data, error } = await supabase.from("subcategories").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },

  getGroceriesSubcategoryId: async () => {
    const { data, error } = await supabase
      .from("subcategories")
      .select("id, name")
      .in("name", ["Пазар", "Groceries"]);
    if (error) throw error;
    const pick = data?.find((s) => s.name === "Пазар") ?? data?.[0];
    return pick?.id ?? null;
  },

  getActiveSubcategoriesWithMain: async () => {
    const { data, error } = await supabase
      .from("subcategories")
      .select("*, main_categories(id, name, color, sort_order)")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  },
  
  createSubcategory: async (payload: any) => {
    const { error } = await supabase.from("subcategories").insert(payload);
    if (error) throw error;
  },
  
  updateSubcategory: async (id: string, payload: any) => {
    const { error } = await supabase.from("subcategories").update(payload).eq("id", id);
    if (error) throw error;
  },
  
  deleteSubcategory: async (id: string) => {
    const { error } = await supabase.from("subcategories").delete().eq("id", id);
    if (error) throw error;
  },
};
