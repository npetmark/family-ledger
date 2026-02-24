import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DynamicIcon, availableIcons } from "@/components/DynamicIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_COLORS: Record<string, string> = {
  Needs: "bg-needs/10 text-needs",
  Wants: "bg-wants/10 text-wants",
  Investments: "bg-investments/10 text-investments",
};

export default function CategoriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Main category dialog
  const [mainOpen, setMainOpen] = useState(false);
  const [editingMain, setEditingMain] = useState<any>(null);
  const [mainForm, setMainForm] = useState({ name: "", color: "215 55% 52%" });

  // Subcategory dialog
  const [subOpen, setSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<any>(null);
  const [subForm, setSubForm] = useState({ name: "", icon: "circle", main_category_id: "", is_active: true });

  const { data: mainCategories = [] } = useQuery({
    queryKey: ["main_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("main_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-all", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("subcategories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Main category mutations
  const saveMainMutation = useMutation({
    mutationFn: async (data: typeof mainForm) => {
      if (editingMain) {
        const { error } = await supabase.from("main_categories").update({ name: data.name, color: data.color }).eq("id", editingMain.id);
        if (error) throw error;
      } else {
        const maxSort = mainCategories.length;
        const { error } = await supabase.from("main_categories").insert({ user_id: user!.id, name: data.name, color: data.color, sort_order: maxSort });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["main_categories"] });
      setMainOpen(false);
      setEditingMain(null);
      setMainForm({ name: "", color: "215 55% 52%" });
      toast.success(editingMain ? "Category updated" : "Category created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMainMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete subcategories first
      const { error: subErr } = await supabase.from("subcategories").delete().eq("main_category_id", id);
      if (subErr) throw subErr;
      const { error } = await supabase.from("main_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["main_categories"] });
      queryClient.invalidateQueries({ queryKey: ["subcategories-all"] });
      toast.success("Category deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Subcategory mutations
  const saveSubMutation = useMutation({
    mutationFn: async (data: typeof subForm) => {
      if (editingSub) {
        const { error } = await supabase.from("subcategories").update({ name: data.name, icon: data.icon, main_category_id: data.main_category_id, is_active: data.is_active }).eq("id", editingSub.id);
        if (error) throw error;
      } else {
        const subs = subcategories.filter((s) => s.main_category_id === data.main_category_id);
        const { error } = await supabase.from("subcategories").insert({ user_id: user!.id, name: data.name, icon: data.icon, main_category_id: data.main_category_id, is_active: data.is_active, sort_order: subs.length });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subcategories-all"] });
      queryClient.invalidateQueries({ queryKey: ["subcategories"] });
      setSubOpen(false);
      setEditingSub(null);
      setSubForm({ name: "", icon: "circle", main_category_id: "", is_active: true });
      toast.success(editingSub ? "Subcategory updated" : "Subcategory created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSubMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subcategories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subcategories-all"] });
      queryClient.invalidateQueries({ queryKey: ["subcategories"] });
      toast.success("Subcategory deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openEditMain = (cat: any) => {
    setEditingMain(cat);
    setMainForm({ name: cat.name, color: cat.color });
    setMainOpen(true);
  };

  const openAddSub = (mainCategoryId: string) => {
    setEditingSub(null);
    setSubForm({ name: "", icon: "circle", main_category_id: mainCategoryId, is_active: true });
    setSubOpen(true);
  };

  const openEditSub = (sub: any) => {
    setEditingSub(sub);
    setSubForm({ name: sub.name, icon: sub.icon, main_category_id: sub.main_category_id, is_active: sub.is_active });
    setSubOpen(true);
  };

  return (
    <div className="space-y-6 max-w-4xl w-full animate-fade-in overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">50/30/20 budgeting model</p>
        </div>
        <Button onClick={() => { setEditingMain(null); setMainForm({ name: "", color: "215 55% 52%" }); setMainOpen(true); }} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" /> Add Category
        </Button>
      </div>

      <div className="space-y-6">
        {mainCategories.map((cat) => {
          const subs = subcategories.filter((s) => s.main_category_id === cat.id);
          const colorClass = CATEGORY_COLORS[cat.name] || "bg-primary/10 text-primary";

          return (
            <Card key={cat.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className={colorClass}>
                      {cat.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {cat.name === "Needs" ? "50%" : cat.name === "Wants" ? "30%" : cat.name === "Investments" ? "20%" : ""} target
                    </span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditMain(cat)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMainMutation.mutate(cat.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openAddSub(cat.id)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Subcategory
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {subs.map((sub) => (
                    <div
                      key={sub.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border border-border transition-colors group ${
                        sub.is_active ? "bg-card" : "bg-muted/50 opacity-50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <DynamicIcon name={sub.icon} className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{sub.name}</p>
                        {!sub.is_active && <p className="text-xs text-muted-foreground">Inactive</p>}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSub(sub)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSubMutation.mutate(sub.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Category Dialog */}
      <Dialog open={mainOpen} onOpenChange={(v) => { setMainOpen(v); if (!v) setEditingMain(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMain ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMainMutation.mutate(mainForm); }}>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={mainForm.name} onChange={(e) => setMainForm({ ...mainForm, name: e.target.value })} required />
            </div>
            <Button type="submit" className="w-full" disabled={saveMainMutation.isPending}>
              {editingMain ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Subcategory Dialog */}
      <Dialog open={subOpen} onOpenChange={(v) => { setSubOpen(v); if (!v) setEditingSub(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSub ? "Edit Subcategory" : "New Subcategory"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveSubMutation.mutate(subForm); }}>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Parent Category</Label>
              <Select value={subForm.main_category_id} onValueChange={(v) => setSubForm({ ...subForm, main_category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {mainCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {availableIcons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={`p-2 rounded-lg border transition-colors ${subForm.icon === icon ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                    onClick={() => setSubForm({ ...subForm, icon })}
                  >
                    <DynamicIcon name={icon} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={subForm.is_active} onCheckedChange={(v) => setSubForm({ ...subForm, is_active: v })} />
            </div>
            <Button type="submit" className="w-full" disabled={saveSubMutation.isPending}>
              {editingSub ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
