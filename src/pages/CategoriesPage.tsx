import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMainCategories,
  useSubcategories,
  useSaveMainCategory,
  useDeleteMainCategory,
  useSaveSubcategory,
  useDeleteSubcategory,
  useReorderSubcategories,
  useReorderMainCategories,
} from "@/hooks/queries/useCategories";
import { useHouseholdMembers } from "@/hooks/queries/useHouseholdMembers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { DynamicIcon, availableIcons } from "@/components/DynamicIcon";
import { ColorPicker } from "@/components/ColorPicker";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { getBudgetTarget, compareMainCategories, compareSubcategories } from "@/lib/financial";
import { useLanguage } from "@/lib/i18n";
import { scheduleUndoableDelete } from "@/lib/shopping";

type MainCategoryRow = Tables<"main_categories">;
type SubcategoryRow = Tables<"subcategories">;

export default function CategoriesPage({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t, translateCategory } = useLanguage();
  const { data: householdInfo } = useHouseholdMembers(user?.id);
  const householdId = householdInfo?.householdId;

  // Main category dialog
  const [mainOpen, setMainOpen] = useState(false);
  const [editingMain, setEditingMain] = useState<MainCategoryRow | null>(null);
  const [mainForm, setMainForm] = useState({ name: "", color: "215 55% 52%" });

  // Subcategory dialog
  const [subOpen, setSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubcategoryRow | null>(null);
  const [subForm, setSubForm] = useState({ name: "", icon: "circle", main_category_id: "", is_active: true, color: "215 55% 52%" });

  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "main" | "sub";
    id: string;
    name: string;
  } | null>(null);

  const { data: mainCategories = [] } = useMainCategories(user?.id);
  const { data: subcategories = [] } = useSubcategories(user?.id);

  // Sync any out-of-date subcategory colors in DB to match their parent main category's color
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || mainCategories.length === 0 || subcategories.length === 0) return;
    const colorByMainId = new Map(mainCategories.map((mc) => [mc.id, mc.color]));
    const outOfSync = subcategories.filter((sub) => {
      const parentColor = colorByMainId.get(sub.main_category_id);
      return parentColor && sub.color !== parentColor;
    });
    syncedRef.current = true;
    if (outOfSync.length > 0) {
      Promise.all(
        outOfSync.map((sub) => {
          const parentColor = colorByMainId.get(sub.main_category_id);
          if (!parentColor) return Promise.resolve();
          return supabase
            .from("subcategories")
            .update({ color: parentColor })
            .eq("id", sub.id);
        })
      ).then(() => {
        queryClient.invalidateQueries({ queryKey: ["subcategories"] });
        queryClient.invalidateQueries({ queryKey: ["active-subcategories"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      });
    }
  }, [mainCategories, subcategories, queryClient]);

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
      setSubForm({ name: "", icon: "circle", main_category_id: "", is_active: true, color: "215 55% 52%" });
      toast.success(editingSub ? "Subcategory updated" : "Subcategory created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSubMutation = useDeleteSubcategory({
    onError: (e) => toast.error(e.message),
  });

  const reorderSubMutation = useReorderSubcategories({
    onError: (e) => toast.error(e.message),
  });

  const reorderMainMutation = useReorderMainCategories({
    onError: (e) => toast.error(e.message),
  });

  const [draggedSubId, setDraggedSubId] = useState<string | null>(null);
  const [dragOverSubId, setDragOverSubId] = useState<string | null>(null);

  const handleMoveSub = (mainCatId: string, currentIndex: number, direction: -1 | 1) => {
    const parentSubs = subcategories.filter((s) => s.main_category_id === mainCatId).sort(compareSubcategories);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= parentSubs.length) return;

    const reordered = [...parentSubs];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered.map((s, idx) => ({ id: s.id, sort_order: idx }));

    const subKey = ["subcategories", user?.id];
    const activeKey = ["active-subcategories", user?.id];
    const updateSortMap = new Map(updates.map((u) => [u.id, u.sort_order]));

    queryClient.setQueryData<SubcategoryRow[]>(subKey, (old) =>
      (old ?? []).map((s) => (updateSortMap.has(s.id) ? { ...s, sort_order: updateSortMap.get(s.id)! } : s))
    );
    queryClient.setQueryData<any[]>(activeKey, (old) =>
      (old ?? []).map((s) => (updateSortMap.has(s.id) ? { ...s, sort_order: updateSortMap.get(s.id)! } : s))
    );

    reorderSubMutation.mutate(updates);
  };

  const handleDropSub = (mainCatId: string, targetSubId: string) => {
    if (!draggedSubId || draggedSubId === targetSubId) {
      setDraggedSubId(null);
      setDragOverSubId(null);
      return;
    }

    const parentSubs = subcategories.filter((s) => s.main_category_id === mainCatId).sort(compareSubcategories);
    const fromIndex = parentSubs.findIndex((s) => s.id === draggedSubId);
    const toIndex = parentSubs.findIndex((s) => s.id === targetSubId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedSubId(null);
      setDragOverSubId(null);
      return;
    }

    const reordered = [...parentSubs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const updates = reordered.map((s, idx) => ({ id: s.id, sort_order: idx }));

    const subKey = ["subcategories", user?.id];
    const activeKey = ["active-subcategories", user?.id];
    const updateSortMap = new Map(updates.map((u) => [u.id, u.sort_order]));

    queryClient.setQueryData<SubcategoryRow[]>(subKey, (old) =>
      (old ?? []).map((s) => (updateSortMap.has(s.id) ? { ...s, sort_order: updateSortMap.get(s.id)! } : s))
    );
    queryClient.setQueryData<any[]>(activeKey, (old) =>
      (old ?? []).map((s) => (updateSortMap.has(s.id) ? { ...s, sort_order: updateSortMap.get(s.id)! } : s))
    );

    reorderSubMutation.mutate(updates);
    setDraggedSubId(null);
    setDragOverSubId(null);
  };

  const handleMoveMain = (currentIndex: number, direction: -1 | 1) => {
    const sortedMains = [...mainCategories].sort(compareMainCategories);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= sortedMains.length) return;

    const reordered = [...sortedMains];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered.map((c, idx) => ({ id: c.id, sort_order: idx }));

    const mainKey = ["main_categories", user?.id];
    const updateSortMap = new Map(updates.map((u) => [u.id, u.sort_order]));

    queryClient.setQueryData<MainCategoryRow[]>(mainKey, (old) =>
      (old ?? []).map((c) => (updateSortMap.has(c.id) ? { ...c, sort_order: updateSortMap.get(c.id)! } : c))
    );

    reorderMainMutation.mutate(updates);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    const { type, id, name } = deleteConfirm;
    setDeleteConfirm(null);
    const displayName = translateCategory(name);

    if (type === "sub") {
      const subKey = ["subcategories", user?.id];
      const activeKey = ["active-subcategories", user?.id];
      const prevSubs = queryClient.getQueryData<SubcategoryRow[]>(subKey);
      const prevActive = queryClient.getQueryData<SubcategoryRow[]>(activeKey);

      queryClient.setQueryData<SubcategoryRow[]>(subKey, (old) => (old ?? []).filter((s) => s.id !== id));
      queryClient.setQueryData<SubcategoryRow[]>(activeKey, (old) => (old ?? []).filter((s) => s.id !== id));

      scheduleUndoableDelete({
        message: `${displayName} ${t("categories.deletedToast")}`,
        durationMs: 7000,
        onConfirm: async () => {
          deleteSubMutation.mutate(id);
        },
        onUndo: () => {
          if (prevSubs) queryClient.setQueryData(subKey, prevSubs);
          else queryClient.invalidateQueries({ queryKey: ["subcategories"] });
          if (prevActive) queryClient.setQueryData(activeKey, prevActive);
          else queryClient.invalidateQueries({ queryKey: ["active-subcategories"] });
          toast.info(`${displayName} ${t("categories.restoredToast")}`);
        },
      });
    } else {
      const mainKey = ["main_categories", user?.id];
      const prevMain = queryClient.getQueryData<MainCategoryRow[]>(mainKey);

      queryClient.setQueryData<MainCategoryRow[]>(mainKey, (old) => (old ?? []).filter((c) => c.id !== id));

      scheduleUndoableDelete({
        message: `${displayName} ${t("categories.deletedToast")}`,
        durationMs: 7000,
        onConfirm: async () => {
          deleteMainMutation.mutate(id);
        },
        onUndo: () => {
          if (prevMain) queryClient.setQueryData(mainKey, prevMain);
          else queryClient.invalidateQueries({ queryKey: ["main_categories"] });
          toast.info(`${displayName} ${t("categories.restoredToast")}`);
        },
      });
    }
  };

  const handleSaveMain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const payload = {
      user_id: user.id,
      name: mainForm.name,
      color: mainForm.color,
      ...(editingMain
        ? {}
        : {
            sort_order: Math.max(-1, ...mainCategories.map((c) => c.sort_order ?? 0)) + 1,
            ...(householdId ? { household_id: householdId } : {}),
          }),
    };
    saveMainMutation.mutate({ id: editingMain?.id, payload });
  };

  const handleSaveSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const subs = subcategories.filter((s) => s.main_category_id === subForm.main_category_id);
    const parent = mainCategories.find((c) => c.id === subForm.main_category_id);
    const resolvedColor = subForm.color || parent?.color || "215 55% 52%";
    const payload = {
      user_id: user.id,
      name: subForm.name,
      icon: subForm.icon,
      main_category_id: subForm.main_category_id,
      is_active: subForm.is_active,
      color: resolvedColor,
      ...(editingSub
        ? {}
        : {
            sort_order: Math.max(-1, ...subs.map((s) => s.sort_order ?? 0)) + 1,
            ...(householdId ? { household_id: householdId } : {}),
          }),
    };
    if (parent && resolvedColor !== parent.color) {
      saveMainMutation.mutate({ id: parent.id, payload: { color: resolvedColor } });
    }
    saveSubMutation.mutate({ id: editingSub?.id, payload });
  };

  const openEditMain = (cat: MainCategoryRow) => {
    setEditingMain(cat);
    setMainForm({ name: cat.name, color: cat.color });
    setMainOpen(true);
  };

  const openAddSub = (mainCategoryId: string) => {
    const parent = mainCategories.find((c) => c.id === mainCategoryId);
    setEditingSub(null);
    setSubForm({ name: "", icon: "circle", main_category_id: mainCategoryId, is_active: true, color: parent?.color || "215 55% 52%" });
    setSubOpen(true);
  };

  const openEditSub = (sub: SubcategoryRow) => {
    const parent = mainCategories.find((c) => c.id === sub.main_category_id);
    setEditingSub(sub);
    setSubForm({
      name: sub.name,
      icon: sub.icon,
      main_category_id: sub.main_category_id,
      is_active: sub.is_active,
      color: parent?.color || sub.color || "215 55% 52%",
    });
    setSubOpen(true);
  };

  return (
    <div className={`space-y-6 w-full overflow-hidden ${isEmbedded ? "" : "max-w-4xl"}`}>
      {!isEmbedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("categories.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("categories.subtitle")}</p>
          </div>
          <Button onClick={() => { setEditingMain(null); setMainForm({ name: "", color: "215 55% 52%" }); setMainOpen(true); }} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> {t("categories.addCategory")}
          </Button>
        </div>
      )}

      {isEmbedded && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditingMain(null); setMainForm({ name: "", color: "215 55% 52%" }); setMainOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-2" /> {t("categories.addCategory")}
          </Button>
        </div>
      )}

      <div className="space-y-6">
        {[...mainCategories].sort(compareMainCategories).map((cat, catIndex, allMains) => {
          const subs = subcategories.filter((s) => s.main_category_id === cat.id).sort(compareSubcategories);
          const colorStyle = { backgroundColor: `hsl(${cat.color} / 0.12)`, color: `hsl(${cat.color})` };
          const targetPct = getBudgetTarget(cat.name);
          const displayName = translateCategory(cat.name);

          return (
            <Card key={cat.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" style={colorStyle}>
                      {displayName}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {targetPct !== undefined ? `${targetPct}% ${t("categories.targetHint")}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-wrap items-center">
                    <div className="flex items-center mr-1 bg-muted/40 rounded-md border border-border/50 p-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        disabled={catIndex === 0 || reorderMainMutation.isPending}
                        onClick={() => handleMoveMain(catIndex, -1)}
                        title={t("categories.moveUp")}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        disabled={catIndex === allMains.length - 1 || reorderMainMutation.isPending}
                        onClick={() => handleMoveMain(catIndex, 1)}
                        title={t("categories.moveDown")}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditMain(cat)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteConfirm({ type: "main", id: cat.id, name: cat.name })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openAddSub(cat.id)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t("categories.addSubcategory")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {subs.map((sub, subIndex) => (
                    <div
                      key={sub.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", sub.id);
                        setDraggedSubId(sub.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverSubId !== sub.id) setDragOverSubId(sub.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverSubId === sub.id) setDragOverSubId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropSub(cat.id, sub.id);
                      }}
                      onDragEnd={() => {
                        setDraggedSubId(null);
                        setDragOverSubId(null);
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all group ${
                        dragOverSubId === sub.id
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-border/80"
                      } ${sub.is_active ? "bg-card" : "bg-muted/50 opacity-50"}`}
                    >
                      <div
                        className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={colorStyle}>
                        <DynamicIcon name={sub.icon} className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{translateCategory(sub.name)}</p>
                        {!sub.is_active && <p className="text-xs text-muted-foreground">{t("common.inactive")}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={subIndex === 0 || reorderSubMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSub(cat.id, subIndex, -1);
                          }}
                          title={t("categories.moveUp")}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={subIndex === subs.length - 1 || reorderSubMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSub(cat.id, subIndex, 1);
                          }}
                          title={t("categories.moveDown")}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditSub(sub); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: "sub", id: sub.id, name: sub.name }); }}>
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
            <DialogTitle>{editingMain ? t("categories.editCategory") : t("categories.addCategory")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveMain}>
            <div className="space-y-2">
              <Label>{t("categories.categoryName")}</Label>
              <Input value={mainForm.name} onChange={(e) => setMainForm({ ...mainForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>{t("categories.color")}</Label>
              <ColorPicker value={mainForm.color} onChange={(c) => setMainForm({ ...mainForm, color: c })} />
            </div>
            <Button type="submit" className="w-full" disabled={saveMainMutation.isPending}>
              {editingMain ? t("common.save") : t("common.add")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Subcategory Dialog */}
      <Dialog open={subOpen} onOpenChange={(v) => { setSubOpen(v); if (!v) setEditingSub(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSub ? t("categories.editSubcategory") : t("categories.addSubcategory")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveSub}>
            <div className="space-y-2">
              <Label>{t("categories.subcategoryName")}</Label>
              <Input value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>{t("common.category")}</Label>
              <Select
                value={subForm.main_category_id}
                onValueChange={(v) => {
                  const newParent = mainCategories.find((c) => c.id === v);
                  setSubForm({
                    ...subForm,
                    main_category_id: v,
                    color: newParent?.color || subForm.color,
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder={t("quickAdd.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {mainCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {translateCategory(c.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("categories.icon")}</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {availableIcons.map((icon) => {
                  const isSelected = subForm.icon === icon;
                  return (
                    <button
                      key={icon}
                      type="button"
                      className={`p-2 rounded-lg border transition-colors ${isSelected ? "border-primary" : "border-border hover:bg-muted"}`}
                      style={
                        isSelected
                          ? { backgroundColor: `hsl(${subForm.color} / 0.15)`, color: `hsl(${subForm.color})`, borderColor: `hsl(${subForm.color})` }
                          : { color: `hsl(${subForm.color})` }
                      }
                      onClick={() => setSubForm({ ...subForm, icon })}
                    >
                      <DynamicIcon name={icon} className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("categories.color")}</Label>
              <ColorPicker value={subForm.color} onChange={(c) => setSubForm({ ...subForm, color: c })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("common.active")}</Label>
              <Switch checked={subForm.is_active} onCheckedChange={(v) => setSubForm({ ...subForm, is_active: v })} />
            </div>
            <Button type="submit" className="w-full" disabled={saveSubMutation.isPending}>
              {editingSub ? t("common.save") : t("common.add")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("categories.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground pt-1">
                <p>
                  {deleteConfirm?.type === "sub"
                    ? `${t("categories.deleteConfirm")} (${translateCategory(deleteConfirm?.name)}). ${t("categories.deleteSubWarning")}`
                    : `${t("categories.deleteConfirm")} (${translateCategory(deleteConfirm?.name)}). ${t("categories.deleteMainWarning")}`}
                </p>
                {deleteConfirm?.type === "sub" && (
                  <div className="text-xs bg-muted/60 p-3 rounded-lg border border-border/60 text-foreground space-y-1">
                    <p className="font-semibold text-primary">💡 {t("categories.deactivateHintTitle")}</p>
                    <p className="text-muted-foreground">
                      {t("categories.deactivateHintBody")}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground italic">
                  {t("transactions.undoWarning")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            {deleteConfirm?.type === "sub" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const sub = subcategories.find((s) => s.id === deleteConfirm.id);
                  if (sub && user) {
                    const parent = mainCategories.find((c) => c.id === sub.main_category_id);
                    saveSubMutation.mutate({
                      id: sub.id,
                      payload: {
                        user_id: user.id,
                        name: sub.name,
                        icon: sub.icon,
                        main_category_id: sub.main_category_id,
                        is_active: false,
                        color: parent?.color || sub.color,
                        sort_order: sub.sort_order,
                      },
                    });
                    toast.success(`${translateCategory(sub.name)} ${t("categories.deactivatedToast")}`);
                  }
                  setDeleteConfirm(null);
                }}
              >
                {t("categories.deactivateKeepHistory")}
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
