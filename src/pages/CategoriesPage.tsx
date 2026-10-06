import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMainCategories, useSubcategories, useSaveMainCategory, useDeleteMainCategory, useSaveSubcategory, useDeleteSubcategory } from "@/hooks/queries/useCategories";
import { useAuth } from "@/hooks/useAuth";
import { DynamicIcon, availableIcons } from "@/components/DynamicIcon";
import { ColorPicker } from "@/components/ColorPicker";
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

const BUDGET_TARGETS: Record<string, string> = {
  "Нужди": "50%",
  "Желания": "20%",
  "Инвестиции": "30%",
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
  const [subForm, setSubForm] = useState({ name: "", icon: "circle", main_category_id: "", is_active: true, color: "168 35% 38%" });

  const { data: mainCategories = [] } = useMainCategories(user?.id);
  const { data: subcategories = [] } = useSubcategories(user?.id);

  const saveMainMutation = useSaveMainCategory({
    onSuccess: () => {
      setMainOpen(false);
      setEditingMain(null);
      setMainForm({ name: "", color: "215 55% 52%" });
      toast.success(editingMain ? "Category updated" : "Category created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMainMutation = useDeleteMainCategory({
    onSuccess: () => toast.success("Category deleted"),
    onError: (e) => toast.error(e.message),
  });

  const saveSubMutation = useSaveSubcategory({
    onSuccess: () => {
      setSubOpen(false);
      setEditingSub(null);
      setSubForm({ name: "", icon: "circle", main_category_id: "", is_active: true, color: "168 35% 38%" });
      toast.success(editingSub ? "Subcategory updated" : "Subcategory created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSubMutation = useDeleteSubcategory({
    onSuccess: () => toast.success("Subcategory deleted"),
    onError: (e) => toast.error(e.message),
  });

  const handleSaveMain = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      user_id: user!.id,
      name: mainForm.name,
      color: mainForm.color,
      ...(editingMain ? {} : { sort_order: mainCategories.length })
    };
    saveMainMutation.mutate({ id: editingMain?.id, payload });
  };

  const handleSaveSub = (e: React.FormEvent) => {
    e.preventDefault();
    const subs = subcategories.filter((s) => s.main_category_id === subForm.main_category_id);
    const payload = {
      user_id: user!.id,
      name: subForm.name,
      icon: subForm.icon,
      main_category_id: subForm.main_category_id,
      is_active: subForm.is_active,
      color: subForm.color,
      ...(editingSub ? {} : { sort_order: subs.length })
    };
    saveSubMutation.mutate({ id: editingSub?.id, payload });
  };

  const openEditMain = (cat: any) => {
    setEditingMain(cat);
    setMainForm({ name: cat.name, color: cat.color });
    setMainOpen(true);
  };

  const openAddSub = (mainCategoryId: string) => {
    setEditingSub(null);
    setSubForm({ name: "", icon: "circle", main_category_id: mainCategoryId, is_active: true, color: "168 35% 38%" });
    setSubOpen(true);
  };

  const openEditSub = (sub: any) => {
    setEditingSub(sub);
    setSubForm({ name: sub.name, icon: sub.icon, main_category_id: sub.main_category_id, is_active: sub.is_active, color: sub.color || "168 35% 38%" });
    setSubOpen(true);
  };

  return (
    <div className="space-y-6 max-w-4xl w-full overflow-hidden">
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
          const colorStyle = { backgroundColor: `hsl(${cat.color} / 0.1)`, color: `hsl(${cat.color})` };

          return (
            <Card key={cat.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" style={colorStyle}>
                      {cat.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {BUDGET_TARGETS[cat.name] ? `${BUDGET_TARGETS[cat.name]} target` : ""}
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
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={colorStyle}>
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
          <form className="space-y-4" onSubmit={handleSaveMain}>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={mainForm.name} onChange={(e) => setMainForm({ ...mainForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker value={mainForm.color} onChange={(c) => setMainForm({ ...mainForm, color: c })} />
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
          <form className="space-y-4" onSubmit={handleSaveSub}>
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
            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker value={subForm.color} onChange={(c) => setSubForm({ ...subForm, color: c })} />
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
