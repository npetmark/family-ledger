import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronDown, ChevronRight, Plus, Receipt, Check, Trash2,
  History, Paperclip, X, Pencil, Tag, RefreshCw, ShoppingBag,
  ScanLine, Loader2, Link2, Undo2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { computeLineTotalCents, detectLanguage, normalizeName, parseShoppingEntry, rankStoresByDeals, scheduleUndoableDelete, triggerPromoLookup } from "@/lib/shopping";
import { formatCurrency, parseCurrencyToCents } from "@/lib/financial";

type Category = {
  id: string; name: string; emoji: string; color: string; sort_order: number;
};
type Trip = {
  id: string; name: string; status: "active" | "completed" | "archived";
  started_at: string; completed_at: string | null;
  total_cents: number | null; receipt_path: string | null; notes: string | null;
};
type PromoOffer = {
  store: string;
  price_cents: number;
  pack_size: number | null;
  title: string;
  unit?: "kg" | "g" | "l" | "ml" | "piece" | null;
};

type Item = {
  id: string; trip_id: string; category_id: string | null; name: string;
  normalized_name: string; quantity: number; unit: string | null;
  checked: boolean; price_cents: number | null; sort_order: number;
  created_at: string;
  promo_stores: string[] | null;
  promo_price_cents: number | null;
  promo_pack_size: number | null;
  promo_offers: PromoOffer[] | null;
  promo_checked_at: string | null;
  actual_price_cents: number | null;
  is_excess: boolean;
};

type ReceiptMatch = { item_id: string; actual_price_cents: number; receipt_name: string };
type ReceiptUnmatched = { name: string; quantity: number; unit: string | null; actual_price_cents: number };
type ReceiptResult = { matched: ReceiptMatch[]; unmatched: ReceiptUnmatched[]; currency_hint: string | null };

type DictEntry = {
  id: string; normalized_name: string; display_name: string;
  language: string; category_id: string | null; usage_count: number;
};

export default function ShoppingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [refreshingPromos, setRefreshingPromos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoPackRefreshed = useRef<Set<string>>(new Set());
  const [parsingReceipt, setParsingReceipt] = useState(false);
  const [receiptResult, setReceiptResult] = useState<ReceiptResult | null>(null);
  const [receiptExcessSelection, setReceiptExcessSelection] = useState<Record<number, boolean>>({});
  const [applyingReceipt, setApplyingReceipt] = useState(false);
  const [matchExcessFor, setMatchExcessFor] = useState<Item | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  // Snapshots of recent excess→item links so the user can undo even after the toast is gone.
  // Keyed by the target item id; cleared when the trip changes or after an undo.
  const [recentLinks, setRecentLinks] = useState<Record<string, { excess: Item; prevTarget: { actual_price_cents: number | null; checked: boolean } }>>({});
  // Receipt viewer
  const [viewReceiptOpen, setViewReceiptOpen] = useState(false);
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(null);
  // Complete-trip dialog form
  const [completeForm, setCompleteForm] = useState({ store: "", account_id: "", amount: "" });


  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch a fresh signed URL for the active trip's receipt whenever it changes.

  // -------- queries
  const { data: categories = [] } = useQuery({
    queryKey: ["shopping-categories", user?.id],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("shopping_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, name").order("sort_order");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!user,
  });

  const { data: groceriesSubcategoryId } = useQuery({
    queryKey: ["groceries-subcategory", user?.id],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("subcategories")
        .select("id, name")
        .in("name", ["Пазар", "Groceries"]);
      if (error) throw error;
      const pick = data?.find((s) => s.name === "Пазар") ?? data?.[0];
      return pick?.id ?? null;
    },
    enabled: !!user,
  });

  const { data: activeTrip } = useQuery({
    queryKey: ["shopping-active-trip", user?.id],
    queryFn: async (): Promise<Trip | null> => {
      const { data, error } = await supabase
        .from("shopping_trips")
        .select("*")
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as any;
      // Auto-create
      const name = `Shopping — ${format(new Date(), "EEE d MMM")}`;
      const { data: created, error: cErr } = await supabase
        .from("shopping_trips")
        .insert({ user_id: user!.id, name })
        .select()
        .single();
      if (cErr) throw cErr;
      return created as any;
    },
    enabled: !!user,
  });

  // Fetch a fresh signed URL whenever the active trip's receipt changes.
  useEffect(() => {
    setActiveReceiptUrl(null);
    if (!activeTrip?.receipt_path) return;
    let cancelled = false;
    supabase.storage
      .from("shopping-receipts")
      .createSignedUrl(activeTrip.receipt_path, 600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setActiveReceiptUrl(data.signedUrl);
      });
    return () => { cancelled = true; };
  }, [activeTrip?.receipt_path]);



  const { data: items = [] } = useQuery({
    queryKey: ["shopping-items", activeTrip?.id],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("trip_id", activeTrip!.id)
        .order("created_at");
      if (error) throw error;
      return data as any;
    },
    enabled: !!activeTrip?.id,
  });

  // Auto-refresh promo data for items that were matched before pack-size parsing existed.
  // Targets items with a matched promo store but no pack_size — refreshed once per item per session.
  useEffect(() => {
    if (!items.length) return;
    const stale = items.filter(
      (i) =>
        i.promo_stores && i.promo_stores.length > 0 &&
        ((i.promo_pack_size === null || i.promo_pack_size === undefined) ||
         !i.promo_offers || i.promo_offers.length === 0) &&
        !autoPackRefreshed.current.has(i.id)

    );
    if (!stale.length) return;
    stale.forEach((i) => autoPackRefreshed.current.add(i.id));
    triggerPromoLookup(stale.map((i) => i.id))
      .then(() => queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip?.id] }))
      .catch((e) => console.warn("auto pack refresh failed", e));
  }, [items, activeTrip?.id, queryClient]);


  const { data: suggestions = [] } = useQuery({
    queryKey: ["shopping-suggestions", user?.id, debounced],
    queryFn: async (): Promise<DictEntry[]> => {
      if (debounced.length < 1) return [];
      const norm = normalizeName(debounced);
      const { data, error } = await supabase
        .from("shopping_item_dictionary")
        .select("*")
        .ilike("normalized_name", `${norm}%`)
        .order("usage_count", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data as any;
    },
    enabled: !!user && debounced.length > 0,
  });

  const { data: topSuggested = [] } = useQuery({
    queryKey: ["shopping-top-suggested", user?.id],
    queryFn: async (): Promise<DictEntry[]> => {
      const { data, error } = await supabase
        .from("shopping_item_dictionary")
        .select("*")
        .gt("usage_count", 0)
        .order("usage_count", { ascending: false })
        .order("last_used_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  const { data: pastTrips = [] } = useQuery({
    queryKey: ["shopping-past-trips", user?.id],
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await supabase
        .from("shopping_trips")
        .select("*")
        .neq("status", "active")
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any;
    },
    enabled: !!user && pastOpen,
  });

  // -------- mutations
  const addItem = useMutation({
    mutationFn: async (payload: { name: string; categoryId: string | null; dictEntry?: DictEntry }) => {
      if (!activeTrip || !user) return;
      const raw = payload.name.trim();
      if (!raw) return;

      // If the user picked a suggestion, trust it verbatim; otherwise parse out qty/unit.
      const fromSuggestion = !!payload.dictEntry;
      const parsed = fromSuggestion
        ? { name: raw, quantity: 1, unit: null as string | null }
        : parseShoppingEntry(raw);
      const display = parsed.name;
      if (!display) return;
      const norm = normalizeName(display);
      const lang = detectLanguage(display);

      // Look up category if not provided
      let categoryId = payload.categoryId;
      let dictId: string | null = payload.dictEntry?.id ?? null;
      if (!categoryId) {
        // Prefer the user's own learned mapping; fall back to any shared entry.
        const { data: own } = await supabase
          .from("shopping_item_dictionary")
          .select("id, category_id")
          .eq("user_id", user.id)
          .eq("normalized_name", norm)
          .maybeSingle();
        const existing = own ?? (await supabase
          .from("shopping_item_dictionary")
          .select("id, category_id")
          .eq("normalized_name", norm)
          .limit(1)
          .maybeSingle()).data;
        if (existing) {
          categoryId = existing.category_id;
          dictId = existing.id;
        }
      }
      if (!categoryId) {
        const other = categories.find((c) => c.name === "Other");
        categoryId = other?.id ?? null;
      }

      // Look up last known price for this item (across all this user's trips)
      let defaultPriceCents: number | null = null;
      {
        const { data: lastPriced } = await supabase
          .from("shopping_items")
          .select("price_cents")
          .eq("user_id", user.id)
          .eq("normalized_name", norm)
          .not("price_cents", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastPriced?.price_cents != null) defaultPriceCents = lastPriced.price_cents;
      }

      const { data: inserted, error } = await supabase.from("shopping_items").insert({
        user_id: user.id,
        trip_id: activeTrip.id,
        category_id: categoryId,
        name: display,
        normalized_name: norm,
        quantity: parsed.quantity,
        unit: parsed.unit,
        price_cents: defaultPriceCents,
        sort_order: items.length,
      }).select("id").single();
      if (error) throw error;

      // Fire-and-forget promo lookup
      if (inserted?.id) {
        triggerPromoLookup([inserted.id])
          .then(() => queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip.id] }))
          .catch((e) => console.warn("promo lookup failed", e));
      }

      // Upsert dictionary entry + bump usage
      if (dictId) {
        await supabase
          .from("shopping_item_dictionary")
          .update({ usage_count: (payload.dictEntry?.usage_count ?? 0) + 1, last_used_at: new Date().toISOString(), category_id: categoryId })
          .eq("id", dictId);
      } else {
        await supabase
          .from("shopping_item_dictionary")
          .insert({
            user_id: user.id,
            normalized_name: norm,
            display_name: display,
            language: lang,
            category_id: categoryId,
            usage_count: 1,
            last_used_at: new Date().toISOString(),
            translation_key: norm,
          })
          .select()
          .maybeSingle();
      }

      // If we had no learned mapping (the item landed in "Other" with a fresh
      // dictionary entry), ask the AI to translate it to English and pick the
      // best category. Fire-and-forget — never block the add.
      const landedInOther = !fromSuggestion && !dictId &&
        categoryId === categories.find((c) => c.name === "Other")?.id;
      if (landedInOther && inserted?.id && categories.length > 0) {
        const insertedId = inserted.id;
        (async () => {
          try {
            const { data, error: aiErr } = await supabase.functions.invoke("categorize-shopping-item", {
              body: {
                name: display,
                categories: categories.map((c) => ({ id: c.id, name: c.name })),
              },
            });
            if (aiErr || !data) return;
            const englishName: string = (data.english_name ?? "").trim() || display;
            const newCategoryId: string | null = data.category_id ?? null;
            const englishNorm = normalizeName(englishName);
            const displayLang = detectLanguage(display);
            const englishLang = detectLanguage(englishName);

            // Update the item: only rewrite the visible name when the input
            // was non-English (otherwise we just re-categorize).
            const itemPatch: Record<string, any> = {};
            if (newCategoryId) itemPatch.category_id = newCategoryId;
            if (displayLang === "bg" && englishName.toLowerCase() !== display.toLowerCase()) {
              itemPatch.name = englishName;
              itemPatch.normalized_name = englishNorm;
            }
            if (Object.keys(itemPatch).length > 0) {
              await supabase.from("shopping_items").update(itemPatch).eq("id", insertedId);
            }

            // Decide the shared translation_key: English normalized name when
            // we have one, otherwise the user's input normalized.
            const translationKey = englishLang === "en" ? englishNorm : norm;

            // Update the original dictionary entry (the one we just inserted)
            // with the right category + translation key.
            await supabase
              .from("shopping_item_dictionary")
              .update({
                category_id: newCategoryId ?? categoryId,
                translation_key: translationKey,
              })
              .eq("user_id", user.id)
              .eq("normalized_name", norm);

            // Upsert the English counterpart so the next time the user types
            // either language, they get the right category.
            if (englishNorm && englishNorm !== norm) {
              const { data: counterpart } = await supabase
                .from("shopping_item_dictionary")
                .select("id")
                .eq("user_id", user.id)
                .eq("normalized_name", englishNorm)
                .maybeSingle();
              if (counterpart) {
                await supabase
                  .from("shopping_item_dictionary")
                  .update({
                    category_id: newCategoryId ?? categoryId,
                    translation_key: translationKey,
                  })
                  .eq("id", counterpart.id);
              } else {
                await supabase
                  .from("shopping_item_dictionary")
                  .insert({
                    user_id: user.id,
                    normalized_name: englishNorm,
                    display_name: englishName,
                    language: englishLang,
                    category_id: newCategoryId ?? categoryId,
                    translation_key: translationKey,
                  });
              }
            }

            queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip.id] });
            queryClient.invalidateQueries({ queryKey: ["shopping-top-suggested", user.id] });
          } catch (e) {
            console.warn("AI categorize failed", e);
          }
        })();
      }
    },
    onSuccess: () => {
      setQuery("");
      setShowSuggest(false);
      queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip?.id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-top-suggested", user?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add item"),
  });

  const toggleChecked = useMutation({
    mutationFn: async (it: Item) => {
      const { error } = await supabase
        .from("shopping_items")
        .update({ checked: !it.checked })
        .eq("id", it.id);
      if (error) throw error;
    },
    onMutate: async (it) => {
      await queryClient.cancelQueries({ queryKey: ["shopping-items", activeTrip?.id] });
      const prev = queryClient.getQueryData<Item[]>(["shopping-items", activeTrip?.id]);
      queryClient.setQueryData<Item[]>(["shopping-items", activeTrip?.id], (old) =>
        (old ?? []).map((x) => (x.id === it.id ? { ...x, checked: !x.checked } : x))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["shopping-items", activeTrip?.id], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip?.id] });
    },
  });

  const updateItem = useMutation({
    mutationFn: async (
      patch: Partial<Item> & {
        id: string;
        _prevCategoryId?: string | null;
        _translation?: string | null;
      },
    ) => {
      const { id, _prevCategoryId, _translation, ...fields } = patch;
      const { error } = await supabase.from("shopping_items").update(fields).eq("id", id);
      if (error) throw error;

      if (!user) return;

      const newCategoryId = (fields.category_id ?? null) as string | null;
      const norm = fields.normalized_name as string | undefined;
      const display = (fields.name as string | undefined)?.trim() || norm || "";
      const translationDisplay = _translation?.trim() || null;
      const translationNorm = translationDisplay ? normalizeName(translationDisplay) : null;

      const categoryChanged = !!newCategoryId && newCategoryId !== _prevCategoryId;
      // Run the dictionary sync whenever the user explicitly set a category OR
      // typed a translation — both are signals the user is teaching the app.
      if (!norm || (!categoryChanged && !translationNorm)) return;

      // Look up the current entry for this normalized name (if any)
      const { data: self } = await supabase
        .from("shopping_item_dictionary")
        .select("id, translation_key, language, category_id")
        .eq("user_id", user.id)
        .eq("normalized_name", norm)
        .maybeSingle();

      // Decide the translation_key:
      // - reuse the self entry's key if it exists
      // - otherwise reuse the translation counterpart's key if it exists
      // - otherwise fall back to the EN-side normalized name when possible
      let translationKey: string | null = self?.translation_key ?? null;

      if (!translationKey && translationNorm) {
        const { data: counterpart } = await supabase
          .from("shopping_item_dictionary")
          .select("id, translation_key")
          .eq("user_id", user.id)
          .eq("normalized_name", translationNorm)
          .maybeSingle();
        translationKey = counterpart?.translation_key ?? null;
      }

      if (!translationKey) {
        const selfLang = detectLanguage(display);
        const translationLang = translationNorm ? detectLanguage(translationDisplay!) : null;
        if (selfLang === "en") translationKey = norm;
        else if (translationLang === "en" && translationNorm) translationKey = translationNorm;
        else translationKey = norm;
      }

      const effectiveCategoryId = newCategoryId ?? self?.category_id ?? null;

      // Upsert the self entry
      if (!self) {
        await supabase.from("shopping_item_dictionary").insert({
          user_id: user.id,
          normalized_name: norm,
          display_name: display,
          language: detectLanguage(display),
          category_id: effectiveCategoryId,
          translation_key: translationKey,
        });
      } else {
        const update: Record<string, any> = { translation_key: translationKey };
        if (categoryChanged) update.category_id = effectiveCategoryId;
        await supabase.from("shopping_item_dictionary").update(update).eq("id", self.id);
      }

      // Upsert the translation counterpart if the user provided one
      if (translationNorm && translationDisplay) {
        const { data: counterpart } = await supabase
          .from("shopping_item_dictionary")
          .select("id")
          .eq("user_id", user.id)
          .eq("normalized_name", translationNorm)
          .maybeSingle();
        if (!counterpart) {
          await supabase.from("shopping_item_dictionary").insert({
            user_id: user.id,
            normalized_name: translationNorm,
            display_name: translationDisplay,
            language: detectLanguage(translationDisplay),
            category_id: effectiveCategoryId,
            translation_key: translationKey,
          });
        } else {
          await supabase
            .from("shopping_item_dictionary")
            .update({
              translation_key: translationKey,
              ...(effectiveCategoryId ? { category_id: effectiveCategoryId } : {}),
            })
            .eq("id", counterpart.id);
        }
      }

      // Propagate the category to every entry sharing this translation_key
      if (categoryChanged && translationKey && effectiveCategoryId) {
        await supabase
          .from("shopping_item_dictionary")
          .update({ category_id: effectiveCategoryId })
          .eq("user_id", user.id)
          .eq("translation_key", translationKey);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip?.id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-suggestions", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-top-suggested", user?.id] });
      setEditingItem(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update item"),
  });

  const completeTrip = useMutation({
    mutationFn: async (opts: { store: string; accountId: string; amountCents: number }) => {
      if (!activeTrip || !user) return;
      const totalForTrip = opts.amountCents > 0
        ? opts.amountCents
        : items.reduce((s, i) => s + (i.price_cents ?? 0), 0);

      // 1. Create the "Пазар" expense transaction for this shop
      if (opts.amountCents > 0 && opts.accountId) {
        const note = opts.store.trim()
          ? `${opts.store.trim()} · ${activeTrip.name}`
          : activeTrip.name;
        const { error: txErr } = await supabase.from("transactions").insert({
          user_id: user.id,
          account_id: opts.accountId,
          subcategory_id: groceriesSubcategoryId ?? null,
          transaction_type: "expense",
          amount: opts.amountCents,
          date: format(new Date(), "yyyy-MM-dd"),
          note,
        });
        if (txErr) throw txErr;
      }

      // 2. Complete the trip
      const { error } = await supabase
        .from("shopping_trips")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_cents: totalForTrip || null,
        })
        .eq("id", activeTrip.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-active-trip", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["shopping-past-trips", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions-for-balance"] });
      setConfirmCompleteOpen(false);
      setCompleteForm({ store: "", account_id: "", amount: "" });
      toast.success("Trip completed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to complete trip"),
  });

  const renameTrip = useMutation({
    mutationFn: async (name: string) => {
      if (!activeTrip) return;
      const { error } = await supabase.from("shopping_trips").update({ name }).eq("id", activeTrip.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shopping-active-trip", user?.id] }),
  });

  const clearSuggestions = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("shopping_item_dictionary")
        .update({ usage_count: 0, last_used_at: null })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-top-suggested", user?.id] });
      toast.success("Suggestions cleared");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to clear suggestions"),
  });

  // -------- delete with confirmation + undo
  const requestDelete = (id: string) => setPendingDeleteId(id);
  const confirmDelete = () => {
    if (!pendingDeleteId || !activeTrip) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);

    // Optimistically hide
    const key = ["shopping-items", activeTrip.id];
    const prev = queryClient.getQueryData<Item[]>(key);
    queryClient.setQueryData<Item[]>(key, (old) => (old ?? []).filter((x) => x.id !== id));

    scheduleUndoableDelete({
      message: "Item deleted",
      onConfirm: async () => {
        const { error } = await supabase.from("shopping_items").delete().eq("id", id);
        if (error) throw error;
      },
      onUndo: () => {
        if (prev) queryClient.setQueryData(key, prev);
        else queryClient.invalidateQueries({ queryKey: key });
      },
    });
  };

  // -------- receipt upload
  const uploadReceipt = async (file: File) => {
    if (!activeTrip || !user) return;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${activeTrip.id}/receipt-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("shopping-receipts").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    await supabase.from("shopping_trips").update({ receipt_path: path }).eq("id", activeTrip.id);
    queryClient.invalidateQueries({ queryKey: ["shopping-active-trip", user?.id] });
    toast.success("Receipt attached");
  };

  // -------- AI receipt parse
  const parseReceipt = async (file: File) => {
    if (!activeTrip) return;
    setParsingReceipt(true);
    try {
      // Read file as base64 data URL
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      // Also store the receipt on the trip
      uploadReceipt(file).catch(() => {});

      const { data, error } = await supabase.functions.invoke("parse-receipt", {
        body: { image: dataUrl, trip_id: activeTrip.id },
      });
      if (error) throw error;
      const result = data as ReceiptResult;
      setReceiptResult(result);
      // Pre-select all unmatched items for adding as excess
      const sel: Record<number, boolean> = {};
      result.unmatched.forEach((_, idx) => { sel[idx] = true; });
      setReceiptExcessSelection(sel);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to parse receipt");
    } finally {
      setParsingReceipt(false);
    }
  };

  const confirmReceiptResult = async () => {
    if (!receiptResult || !activeTrip || !user) return;
    if (applyingReceipt) return; // guard against double-clicks
    setApplyingReceipt(true);
    // Snapshot + close immediately so a second click can't fire again
    const snapshot = receiptResult;
    const selection = receiptExcessSelection;
    setReceiptResult(null);
    try {
      // Update matched items with actual prices, mark as checked
      for (const m of snapshot.matched) {
        await supabase
          .from("shopping_items")
          .update({ actual_price_cents: m.actual_price_cents, checked: true })
          .eq("id", m.item_id);
      }
      // Insert selected unmatched as excess — dedupe within this batch by
      // (normalized_name, actual_price_cents) so the same line can't land
      // multiple times even if the AI returned it twice.
      const seen = new Set<string>();
      const toInsert = snapshot.unmatched
        .map((u, idx) => ({ u, idx }))
        .filter(({ idx }) => selection[idx])
        .map(({ u }) => {
          const norm = normalizeName(u.name);
          return {
            user_id: user.id,
            trip_id: activeTrip.id,
            category_id: null,
            name: u.name,
            normalized_name: norm,
            quantity: u.quantity || 1,
            unit: u.unit,
            actual_price_cents: u.actual_price_cents,
            is_excess: true,
            checked: true,
            sort_order: items.length + 1000,
          };
        })
        .filter((row) => {
          const key = `${row.normalized_name}::${row.actual_price_cents}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if (toInsert.length > 0) {
        // Skip any (name, price) combo that already exists on this trip as excess.
        const { data: existingExcess } = await supabase
          .from("shopping_items")
          .select("name, actual_price_cents")
          .eq("trip_id", activeTrip.id)
          .eq("is_excess", true);
        const existingKeys = new Set(
          (existingExcess ?? []).map((r: any) => `${normalizeName(r.name)}::${r.actual_price_cents}`),
        );
        const filtered = toInsert.filter(
          (r) => !existingKeys.has(`${r.normalized_name}::${r.actual_price_cents}`),
        );
        if (filtered.length > 0) {
          const { error } = await supabase.from("shopping_items").insert(filtered);
          if (error) throw error;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip.id] });
      toast.success(`Receipt applied · ${snapshot.matched.length} matched, ${toInsert.length} excess`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to apply receipt");
    } finally {
      setApplyingReceipt(false);
    }
  };

  // -------- manual match: link an excess line to an existing list item.
  // Copies the excess's paid price onto the target item, marks it checked,
  // then removes the excess line so the trip totals stay correct.
  const undoLink = async (targetId: string) => {
    const snap = recentLinks[targetId];
    if (!snap || !activeTrip) return;
    const { excess, prevTarget } = snap;
    try {
      const { error: revertErr } = await supabase
        .from("shopping_items")
        .update(prevTarget)
        .eq("id", targetId);
      if (revertErr) throw revertErr;
      const { error: insErr } = await supabase.from("shopping_items").insert({
        id: excess.id,
        trip_id: excess.trip_id,
        user_id: user!.id,
        category_id: excess.category_id,
        name: excess.name,
        normalized_name: excess.normalized_name,
        quantity: excess.quantity,
        unit: excess.unit,
        checked: excess.checked,
        price_cents: excess.price_cents,
        sort_order: excess.sort_order,
        actual_price_cents: excess.actual_price_cents,
        is_excess: true,
      });
      if (insErr) throw insErr;
      setRecentLinks((m) => { const n = { ...m }; delete n[targetId]; return n; });
      await queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip.id] });
      toast.success("Link undone");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to undo link");
    }
  };

  const linkExcessToItem = async (excess: Item, targetId: string) => {
    if (!activeTrip) return;
    const target = items.find((i) => i.id === targetId);
    if (!target) return;
    const prevTarget = { actual_price_cents: target.actual_price_cents, checked: target.checked };
    try {
      const { error: upErr } = await supabase
        .from("shopping_items")
        .update({ actual_price_cents: excess.actual_price_cents, checked: true })
        .eq("id", targetId);
      if (upErr) throw upErr;
      const { error: delErr } = await supabase.from("shopping_items").delete().eq("id", excess.id);
      if (delErr) throw delErr;
      setRecentLinks((m) => ({ ...m, [targetId]: { excess, prevTarget } }));
      await queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip.id] });
      setMatchExcessFor(null);
      setMatchQuery("");
      toast.success(`Linked to ${target.name}`, {
        action: { label: "Undo", onClick: () => undoLink(targetId) },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to link item");
    }
  };


  // -------- grouped items (excess goes to its own group)
  const grouped = useMemo(() => {
    const otherCat = categories.find((c) => c.name === "Other");
    const byCat = new Map<string, Item[]>();
    const excess: Item[] = [];
    for (const it of items) {
      if (it.is_excess) { excess.push(it); continue; }
      // Items with no category fall into "Other" when it exists.
      const key = it.category_id ?? otherCat?.id ?? "uncat";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(it);
    }
    const visible = categories
      .map((c) => ({ category: c, items: (byCat.get(c.id) ?? []).slice().sort((a, b) =>
        Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)
      ) }))
      .filter((g) => g.items.length > 0);
    const uncat = (byCat.get("uncat") ?? []).slice().sort((a, b) =>
      Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)
    );
    if (uncat.length > 0) {
      visible.push({
        category: { id: "uncat", name: "Other", emoji: "🛒", color: "0 0% 60%", sort_order: 999 } as Category,
        items: uncat,
      });
    }
    if (excess.length > 0) {
      visible.push({
        category: { id: "excess", name: "Excess (not on list)", emoji: "➕", color: "30 80% 55%", sort_order: 1000 } as Category,
        items: excess.slice().sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    return visible;
  }, [items, categories]);

  const existingNorms = useMemo(() => new Set(items.map((i) => i.normalized_name)), [items]);
  const chipSuggestions = topSuggested.filter((s) => !existingNorms.has(s.normalized_name)).slice(0, 10);

  const totalChecked = items.filter((i) => !i.is_excess && i.checked).length;
  const totalItems = items.filter((i) => !i.is_excess).length;

  // Expected cost for a single line.
  // Priority: live promo computation (so quantity changes are reflected) →
  // manually entered price_cents → null. Per-weight/volume offers (kg/L/g/ml)
  // multiply qty directly without pack rounding.
  const expectedFor = (i: Item): number | null => {
    const cheapest = i.promo_offers && i.promo_offers.length > 0 ? i.promo_offers[0] : null;
    if (cheapest) {
      const isMeasure = cheapest.unit === "kg" || cheapest.unit === "l" || cheapest.unit === "g" || cheapest.unit === "ml";
      return computeLineTotalCents({
        promo_price_cents: cheapest.price_cents,
        quantity: i.quantity ?? 1,
        pack_size: isMeasure ? null : cheapest.pack_size,
      });
    }
    if (i.promo_price_cents != null) {
      const isMeasure = i.unit === "kg" || i.unit === "l" || i.unit === "g" || i.unit === "ml";
      return computeLineTotalCents({
        promo_price_cents: i.promo_price_cents,
        quantity: i.quantity ?? 1,
        pack_size: isMeasure ? null : i.promo_pack_size,
      });
    }
    if (i.price_cents != null) return i.price_cents;
    return null;
  };

  const expectedTotal = items.reduce((s, i) => {
    if (i.is_excess) return s;
    return s + (expectedFor(i) ?? 0);
  }, 0);
  const actualTotal = items.reduce(
    (s, i) => s + (i.actual_price_cents ?? 0),
    0,
  );
  const hasAnyActual = items.some((i) => i.actual_price_cents != null);
  const delta = actualTotal - expectedTotal;
  // Header total: actual once any actual is recorded, otherwise expected.
  const headerTotal = hasAnyActual ? actualTotal : expectedTotal;

  const storeRanking = useMemo(
    () => rankStoresByDeals(items.filter((i) => !i.is_excess).map((i) => ({ ...i, pack_size: i.promo_pack_size }))),
    [items],
  );

  const topStore = storeRanking.ranked[0];

  const refreshPromos = async () => {
    if (!activeTrip || items.length === 0) return;
    setRefreshingPromos(true);
    try {
      await triggerPromoLookup(items.filter((i) => !i.is_excess).map((i) => i.id));
      await queryClient.invalidateQueries({ queryKey: ["shopping-items", activeTrip.id] });
      toast.success("Promotions refreshed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to refresh promotions");
    } finally {
      setRefreshingPromos(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Shopping</h1>
        <Button variant="outline" size="sm" onClick={() => setPastOpen(true)}>
          <History className="h-4 w-4 mr-2" /> Past trips
        </Button>
      </div>

      {/* Active trip card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <TripNameEditor
                key={activeTrip?.id}
                value={activeTrip?.name ?? "Loading…"}
                onSave={(name) => renameTrip.mutate(name)}
              />
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span>{activeTrip ? format(new Date(activeTrip.started_at), "PPP") : ""}</span>
                <span>·</span>
                <span>{totalChecked} / {totalItems} checked</span>
                {headerTotal > 0 && (<><span>·</span><span className="font-mono-numbers" title={hasAnyActual ? "Actual paid so far" : "Expected total"}>{formatCurrency(headerTotal)}{!hasAnyActual && <span className="text-muted-foreground ml-1">expected</span>}</span></>)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); e.target.value = ""; }} />
              <input ref={receiptInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseReceipt(f); e.target.value = ""; }} />
              <Button
                variant="outline"
                size="sm"
                disabled={refreshingPromos || items.length === 0}
                onClick={refreshPromos}
                title="Re-check znamcenite.bg for discounts on every item"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshingPromos ? "animate-spin" : ""}`} />
                Refresh promos
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={parsingReceipt || !activeTrip}
                onClick={() => receiptInputRef.current?.click()}
                title="Upload a photo of the receipt and auto-fill actual prices"
              >
                {parsingReceipt ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanLine className="h-4 w-4 mr-2" />}
                Parse receipt
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-2" />
                {activeTrip?.receipt_path ? "Replace receipt" : "Attach receipt"}
              </Button>
              {activeTrip?.receipt_path && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewReceiptOpen(true)}
                  title="View the attached receipt"
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  View receipt
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setCompleteForm({
                    store: "",
                    account_id: accounts[0]?.id ?? "",
                    amount: actualTotal > 0 ? (actualTotal / 100).toFixed(2) : "",
                  });
                  setConfirmCompleteOpen(true);
                }}
                disabled={!totalItems}
              >
                <Check className="h-4 w-4 mr-2" /> Complete trip
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add bar with autocomplete */}
          <div className="relative">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!query.trim()) return;
                addItem.mutate({ name: query, categoryId: null });
              }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                placeholder="Add an item…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                autoComplete="off"
              />
              <Button type="submit" disabled={!query.trim() || addItem.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-md shadow-md overflow-hidden">
                {suggestions.map((s) => {
                  const cat = categories.find((c) => c.id === s.category_id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addItem.mutate({ name: s.display_name, categoryId: s.category_id, dictEntry: s })}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span>{cat?.emoji ?? "🛒"}</span>
                        <span className="truncate">{s.display_name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{cat?.name ?? "Other"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Suggested chips */}
          {chipSuggestions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Suggested</div>
                <button
                  type="button"
                  onClick={() => clearSuggestions.mutate()}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear suggestions
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {chipSuggestions.map((s) => {
                  const cat = categories.find((c) => c.id === s.category_id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => addItem.mutate({ name: s.display_name, categoryId: s.category_id, dictEntry: s })}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70 text-xs"
                    >
                      <span>{cat?.emoji ?? "🛒"}</span>
                      <span>{s.display_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Your list is empty. Add something above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <Card key={g.category.id} className="overflow-hidden">
              <div
                className="px-4 py-2 flex items-center justify-between border-l-4"
                style={{ borderLeftColor: `hsl(${g.category.color})` }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-lg leading-none">{g.category.emoji}</span>
                  <span>{g.category.name}</span>
                  <Badge variant="secondary" className="ml-1 text-xs">{g.items.length}</Badge>
                </div>
              </div>
              <div className="divide-y divide-border">
                {g.items.map((it) => (
                  <div key={it.id} className="flex items-start gap-3 px-4 py-2 group">
                    <Checkbox
                      checked={it.checked}
                      onCheckedChange={() => toggleChecked.mutate(it)}
                      className="mt-1"
                    />
                    <button
                      onClick={() => setEditingItem(it)}
                      className={`flex-1 text-left text-sm min-w-0 ${it.checked ? "line-through text-muted-foreground" : ""}`}
                    >
                      <div className="truncate">
                        {it.name}
                        {(it.quantity != null && it.quantity !== 1) || it.unit ? (
                          <span className="text-muted-foreground text-xs ml-2">
                            {it.unit ? `${it.quantity} ${it.unit}` : `×${it.quantity}`}
                          </span>
                        ) : null}
                      </div>
                      {it.promo_stores && it.promo_stores.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {it.promo_stores.map((store) => (
                            <Badge
                              key={store}
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 h-4 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            >
                              <Tag className="h-2.5 w-2.5 mr-0.5" />
                              {store}
                            </Badge>
                          ))}
                          {it.promo_price_cents != null && (() => {
                            const pack = it.promo_pack_size && it.promo_pack_size > 0 ? it.promo_pack_size : null;
                            const lineTotal = computeLineTotalCents({
                              promo_price_cents: it.promo_price_cents,
                              quantity: it.quantity,
                              pack_size: pack,
                            });
                            const unitLabel = pack ? `/pack of ${pack}` : it.unit ? `/${it.unit}` : "";
                            const showTotal = (it.quantity ?? 1) > 1 || (pack != null && (it.quantity ?? 0) !== pack);
                            return (
                              <span className="text-xs font-mono-numbers font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                {showTotal
                                  ? `${formatCurrency(it.promo_price_cents)}${unitLabel} · ${formatCurrency(lineTotal)}`
                                  : `from ${formatCurrency(it.promo_price_cents)}${unitLabel}`}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </button>
                    {(() => {
                      const exp = expectedFor(it);
                      const actual = it.actual_price_cents;
                      return (
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          {actual != null ? (
                            <span className="text-sm font-mono-numbers font-semibold text-foreground whitespace-nowrap">
                              {formatCurrency(actual)}
                            </span>
                          ) : exp != null ? (
                            <span
                              className="text-sm font-mono-numbers text-muted-foreground whitespace-nowrap"
                              title="Expected price"
                            >
                              {formatCurrency(exp)}
                            </span>
                          ) : null}
                          {actual != null && exp != null && actual !== exp && (
                            <span className={`text-[10px] font-mono-numbers whitespace-nowrap ${actual > exp ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                              exp {formatCurrency(exp)}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {!it.is_excess && recentLinks[it.id] && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => undoLink(it.id)}
                        title="Undo link from excess"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {it.is_excess && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => { setMatchExcessFor(it); setMatchQuery(""); }}
                        title="Link to an existing item on the list"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingItem(it)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => requestDelete(it.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <Card>
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expected</span>
                <span className="font-mono-numbers">{formatCurrency(expectedTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Actual paid</span>
                <span className="font-mono-numbers font-semibold">{formatCurrency(actualTotal)}</span>
              </div>
              {hasAnyActual && (
                <div className={`flex items-center justify-between text-sm pt-1.5 border-t ${delta > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  <span className="font-medium">Delta</span>
                  <span className="font-mono-numbers font-semibold">
                    {delta > 0 ? "+" : ""}{formatCurrency(delta)}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Promo footnote */}
      {storeRanking.promoItemCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/30">
          <ShoppingBag className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="text-foreground">
            Best store <span className="font-semibold">{topStore.store}</span>.{" "}
            {topStore.count} out of {storeRanking.promoItemCount} promo items for{" "}
            <span className="font-mono-numbers font-semibold">{formatCurrency(topStore.total)}</span>.{" "}
            <span className="text-muted-foreground">
              Multi-store best deal: <span className="font-mono-numbers font-semibold">{formatCurrency(storeRanking.bestPossibleTotal)}</span>.
            </span>
          </span>
        </div>
      ) : items.length > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <ShoppingBag className="h-3.5 w-3.5" />
          No promotions matched yet. Tap "Refresh promos" to check znamcenite.bg.
        </div>
      ) : null}

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(v) => !v && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>You'll have 5 seconds to undo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete confirm */}
      <AlertDialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this trip?</AlertDialogTitle>
            <AlertDialogDescription>The list will be archived and a new active trip will start.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => completeTrip.mutate()}>Complete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Item edit */}
      <ItemEditDialog
        item={editingItem}
        categories={categories}
        onClose={() => setEditingItem(null)}
        onSave={(patch) => updateItem.mutate(patch)}
      />

      {/* Receipt result preview */}
      <Dialog open={!!receiptResult} onOpenChange={(v) => !v && setReceiptResult(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receipt parsed</DialogTitle>
          </DialogHeader>
          {receiptResult && (
            <div className="max-h-[60vh] overflow-auto space-y-4">
              <section>
                <h3 className="text-sm font-medium mb-2">
                  Matched items ({receiptResult.matched.length})
                </h3>
                {receiptResult.matched.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items from your list were matched.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {receiptResult.matched.map((m) => {
                      const it = items.find((i) => i.id === m.item_id);
                      const expected = it?.price_cents ?? (it?.promo_price_cents != null ? computeLineTotalCents({
                        promo_price_cents: it.promo_price_cents, quantity: it.quantity, pack_size: it.promo_pack_size,
                      }) : null);
                      const diff = expected != null ? m.actual_price_cents - expected : null;
                      return (
                        <li key={m.item_id} className="flex items-center justify-between gap-2 border-b pb-1">
                          <span className="truncate">
                            <span className="font-medium">{it?.name ?? m.receipt_name}</span>
                            {m.receipt_name && it?.name && m.receipt_name !== it.name && (
                              <span className="text-xs text-muted-foreground"> · "{m.receipt_name}"</span>
                            )}
                          </span>
                          <span className="font-mono-numbers text-sm whitespace-nowrap">
                            {formatCurrency(m.actual_price_cents)}
                            {diff != null && diff !== 0 && (
                              <span className={`ml-1 text-xs ${diff > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                                ({diff > 0 ? "+" : ""}{formatCurrency(diff)})
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-sm font-medium mb-2">
                  Excess items ({receiptResult.unmatched.length})
                </h3>
                {receiptResult.unmatched.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing extra on the receipt.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {receiptResult.unmatched.map((u, idx) => (
                      <li key={idx} className="flex items-center gap-2 border-b pb-1">
                        <Checkbox
                          checked={!!receiptExcessSelection[idx]}
                          onCheckedChange={(v) =>
                            setReceiptExcessSelection((s) => ({ ...s, [idx]: !!v }))
                          }
                        />
                        <span className="flex-1 truncate">
                          {u.name}
                          {u.quantity !== 1 || u.unit ? (
                            <span className="text-xs text-muted-foreground ml-1">
                              {u.unit ? `${u.quantity} ${u.unit}` : `×${u.quantity}`}
                            </span>
                          ) : null}
                        </span>
                        <span className="font-mono-numbers text-sm whitespace-nowrap">
                          {formatCurrency(u.actual_price_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiptResult(null)}>Cancel</Button>
            <Button onClick={confirmReceiptResult} disabled={applyingReceipt}>
              {applyingReceipt ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying…</>) : "Apply receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Manually link an excess line to an existing list item */}
      <Dialog open={!!matchExcessFor} onOpenChange={(v) => { if (!v) { setMatchExcessFor(null); setMatchQuery(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link to an existing item</DialogTitle>
          </DialogHeader>
          {matchExcessFor && (
            <div className="space-y-3">
              <div className="text-sm border rounded-md px-3 py-2 bg-muted/30">
                <div className="font-medium truncate">{matchExcessFor.name}</div>
                <div className="text-xs text-muted-foreground">
                  Paid {formatCurrency(matchExcessFor.actual_price_cents ?? 0)} — pick the planned item it belongs to.
                </div>
              </div>
              <Input
                autoFocus
                placeholder="Search your list…"
                value={matchQuery}
                onChange={(e) => setMatchQuery(e.target.value)}
              />
              <div className="max-h-80 overflow-auto divide-y border rounded-md">
                {(() => {
                  const q = normalizeName(matchQuery);
                  const candidates = items
                    .filter((i) => !i.is_excess && i.id !== matchExcessFor.id)
                    .filter((i) => !q || i.normalized_name.includes(q) || i.name.toLowerCase().includes(q))
                    .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name))
                    .slice(0, 50);
                  if (candidates.length === 0) {
                    return <div className="px-3 py-4 text-center text-sm text-muted-foreground">No items match.</div>;
                  }
                  return candidates.map((c) => {
                    const cat = categories.find((x) => x.id === c.category_id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => linkExcessToItem(matchExcessFor, c.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        <span>{cat?.emoji ?? "🛒"}</span>
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.actual_price_cents != null && (
                          <span className="text-xs text-muted-foreground font-mono-numbers">
                            paid {formatCurrency(c.actual_price_cents)}
                          </span>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMatchExcessFor(null); setMatchQuery(""); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Past trips drawer */}
      <Dialog open={pastOpen} onOpenChange={setPastOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Past trips</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto space-y-2">
            {pastTrips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No completed trips yet.</p>
            ) : pastTrips.map((t) => (
              <PastTripRow key={t.id} trip={t} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------- subcomponents

function TripNameEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-lg font-semibold hover:underline text-left">
        {value}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (val.trim() && val !== value) onSave(val.trim()); setEditing(false); }}
      className="flex items-center gap-2"
    >
      <Input value={val} onChange={(e) => setVal(e.target.value)} autoFocus className="h-8" />
      <Button type="submit" size="sm" variant="secondary">Save</Button>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setVal(value); setEditing(false); }}>
        <X className="h-4 w-4" />
      </Button>
    </form>
  );
}

function ItemEditDialog({
  item, categories, onClose, onSave,
}: {
  item: Item | null;
  categories: Category[];
  onClose: () => void;
  onSave: (patch: Partial<Item> & { id: string; _prevCategoryId?: string | null; _translation?: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [actualPrice, setActualPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [translation, setTranslation] = useState("");

  // Live estimate from the cheapest matched deal (recomputed as qty changes).
  const estimatedExpectedCents = useMemo(() => {
    if (!item || !item.promo_offers || item.promo_offers.length === 0) return null;
    const cheapest = item.promo_offers[0];
    const isMeasure = cheapest.unit === "kg" || cheapest.unit === "l" || cheapest.unit === "g" || cheapest.unit === "ml";
    return computeLineTotalCents({
      promo_price_cents: cheapest.price_cents,
      quantity: parseFloat(qty) || item.quantity || 1,
      pack_size: isMeasure ? null : cheapest.pack_size,
    });
  }, [item, qty]);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setQty(String(item.quantity ?? 1));
      setUnit(item.unit ?? "");
      // Only pre-fill with the user's own manual override. The cheapest-deal
      // estimate is shown as a placeholder so we never silently persist a
      // stale value when quantity or deals change.
      setPrice(item.price_cents != null ? (item.price_cents / 100).toFixed(2) : "");
      setActualPrice(item.actual_price_cents != null ? (item.actual_price_cents / 100).toFixed(2) : "");
      setCategoryId(item.category_id ?? "");
      setTranslation("");
    }
  }, [item]);

  if (!item) return null;
  const lang = detectLanguage(name);
  const translationLabel =
    lang === "bg" ? "English name (optional)" :
    lang === "en" ? "Bulgarian name (optional)" :
    "Translation (optional)";

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity" type="number" step="0.01" />
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (kg, l…)" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Expected price (override)</label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={estimatedExpectedCents != null ? `~${(estimatedExpectedCents / 100).toFixed(2)} from deal` : "Optional"}
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Actual paid</label>
              <Input value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} placeholder="Optional" type="number" step="0.01" />
            </div>
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder={translationLabel}
            />
            <p className="text-xs text-muted-foreground">
              Add the other-language name to teach the app — both sides share the same category in suggestions.
            </p>
          </div>
          {item.promo_offers && item.promo_offers.length > 0 && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Matched deals · cheapest first
              </p>
              <ul className="space-y-1">
                {item.promo_offers.map((o) => {
                  const qtyNum = parseFloat(qty) || 1;
                  // Per-weight/volume promos quote a unit price and don't use
                  // pack rounding — fold pack_size to null so the qty multiplies directly.
                  const isMeasure = o.unit === "kg" || o.unit === "l" || o.unit === "g" || o.unit === "ml";
                  const effectivePack = isMeasure ? null : o.pack_size;
                  const lineTotal = computeLineTotalCents({
                    promo_price_cents: o.price_cents,
                    quantity: qtyNum,
                    pack_size: effectivePack,
                  });
                  const unitLabel =
                    o.unit === "kg" ? "/kg" :
                    o.unit === "l"  ? "/L" :
                    o.unit === "g"  ? "/g" :
                    o.unit === "ml" ? "/ml" :
                    (effectivePack && effectivePack > 1) ? `/pack of ${effectivePack}` :
                    o.unit === "piece" ? "/piece" : "";
                  return (
                    <li key={o.store} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium truncate">{o.store}</span>
                      <span className="font-mono-numbers text-right shrink-0">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {formatCurrency(o.price_cents)}
                        </span>
                        {unitLabel && (
                          <span className="text-muted-foreground">{" "}{unitLabel}</span>
                        )}
                        <span className="text-muted-foreground"> · total {formatCurrency(lineTotal)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({
            id: item.id,
            name: name.trim() || item.name,
            normalized_name: normalizeName(name),
            quantity: parseFloat(qty) || 1,
            unit: unit.trim() || null,
            price_cents: price.trim() ? parseCurrencyToCents(price) : null,
            actual_price_cents: actualPrice.trim() ? parseCurrencyToCents(actualPrice) : null,
            category_id: categoryId || null,
            _prevCategoryId: item.category_id,
            _translation: translation.trim() || null,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PastTripRow({ trip }: { trip: Trip }) {
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: ["shopping-items", trip.id],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("shopping_items")
        .select("*")
        .eq("trip_id", trip.id)
        .order("created_at");
      if (error) throw error;
      return data as any;
    },
    enabled: open,
  });
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  useEffect(() => {
    if (open && trip.receipt_path && !receiptUrl) {
      supabase.storage.from("shopping-receipts").createSignedUrl(trip.receipt_path, 300).then(({ data }) => {
        if (data?.signedUrl) setReceiptUrl(data.signedUrl);
      });
    }
  }, [open, trip.receipt_path, receiptUrl]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-muted/30">
            <div className="text-left">
              <p className="text-sm font-medium">{trip.name}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(trip.started_at), "PPP")}
                {trip.total_cents ? ` · ${formatCurrency(trip.total_cents)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              {trip.receipt_path && <Receipt className="h-4 w-4" />}
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 space-y-1">
            {items.map((it) => (
              <div key={it.id} className="text-sm flex items-center justify-between">
                <span className={it.checked ? "line-through text-muted-foreground" : ""}>{it.name}</span>
                {it.price_cents != null && (
                  <span className="text-xs font-mono-numbers text-muted-foreground">{formatCurrency(it.price_cents)}</span>
                )}
              </div>
            ))}
            {receiptUrl && (
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-primary hover:underline mt-2">
                <Receipt className="h-3.5 w-3.5" /> View receipt
              </a>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
