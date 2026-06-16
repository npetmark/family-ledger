# Shopping list + safer transaction delete

## Part 1 — Shopping list

### Data model (new tables, RLS by `auth.uid()`, BIGINT cents)

- **shopping_categories** — `id, user_id, name, emoji, color, sort_order`. User-editable.
- **shopping_trips** — `id, user_id, name, status ('active'|'completed'|'archived'), started_at, completed_at, total_cents, receipt_path, notes`. One trip = one shopping run.
- **shopping_items** — `id, user_id, trip_id, name, category_id, quantity numeric(10,2) default 1, unit, checked bool, price_cents bigint null, sort_order`.
- **shopping_item_dictionary** — `id, user_id, normalized_name (citext), display_name, language ('en'|'bg'|'other'), category_id, usage_count int default 0, last_used_at`. Drives both autocomplete and auto-categorization, learns from every item you add.

Seed triggers on new user:
- ~12 default categories with emojis: Produce 🥦, Meat & Fish 🥩, Dairy & Eggs 🥚, Bakery 🍞, Pantry 🥫, Frozen 🧊, Drinks 🥤, Snacks 🍫, Household 🧻, Personal Care 🧼, Baby 🍼, Other 🛒.
- Bilingual dictionary (~120 common items, EN + BG) pre-mapped to those categories (eggs/яйца → Dairy & Eggs, chicken/пиле → Meat & Fish, etc.). Existing users get backfilled in the same migration.

Storage bucket `shopping-receipts` (private, RLS by user folder) for receipt photos/PDFs attached to a trip.

### Page (`/shopping`, new sidebar entry between Recurring and Analytics)

Layout matches existing app (DM Sans, sage/teal tokens, card surfaces, responsive grid):

- **Active trip card** — name (editable, defaults to `Shopping — Mon 16 Jun`), date, item count, completion progress. Buttons: Complete trip, Archive, Attach receipt.
- **Add bar** — single text input with debounced autocomplete dropdown that searches the bilingual dictionary (BG + EN) ordered by `usage_count`. Enter or pick a suggestion adds the item. Optional qty/unit chips.
- **Auto-categorization** — on add we look up `normalized_name` in the dictionary; if found, the item lands in that category. If unknown, it goes to the last-used category for that word (per-user learning) or Other, with an inline category picker so a one-click correction teaches the dictionary (insert into `shopping_item_dictionary` with the chosen category).
- **List** — grouped by category (emoji + name headers, color stripe), items sorted unchecked-first then alphabetically. Tap to check; long-press / kebab to edit name, qty, category, price. Swipe / trash button to remove with the same 5-second undo toast pattern below.
- **Suggested items** — horizontal chip row above the list with the top 10 items from the dictionary by `usage_count` that are not already in the active trip. Tap to add instantly.
- **Past trips drawer** — list of completed trips with date, item count, total, receipt thumbnail. Tap to reopen read-only or duplicate as a new trip.

### Files

- migration: tables, grants, RLS, seed triggers, bilingual dictionary backfill, storage bucket + policies.
- `src/pages/ShoppingPage.tsx` — page shell, trip selector, receipt upload.
- `src/components/shopping/AddItemBar.tsx` — input + autocomplete.
- `src/components/shopping/ShoppingList.tsx` — grouped list, check/edit/delete.
- `src/components/shopping/SuggestedItems.tsx` — chip row.
- `src/components/shopping/PastTrips.tsx` — drawer.
- `src/lib/shopping.ts` — normalize (lowercase, strip diacritics, trim), category lookup, mutations.
- Route + sidebar entry in `App.tsx` / `AppSidebar.tsx`.

## Part 2 — Safer transaction delete

Both in `src/pages/TransactionsPage.tsx` and `src/components/dashboard/RecentTransactions.tsx`:

1. Trash button opens an `AlertDialog` "Delete this transaction?" with Cancel / Delete.
2. On confirm: optimistically remove from cache, show a Sonner toast `Transaction deleted` with an **Undo** action and 5 s duration. The actual `supabase.delete` runs only after 5 s if undo wasn't clicked; undo restores the cache and cancels the delete. Pattern reused for shopping item delete.

## Technical notes

- Autocomplete query: server-side `ilike` on `normalized_name` with `limit 8`, debounced 150 ms, also matches the start of any word (split on space).
- Normalization handles Cyrillic and Latin (lowercase, NFKD strip combining marks, collapse whitespace).
- Receipts upload to `shopping-receipts/{user_id}/{trip_id}/...`; signed URLs for display.
- No money math in floats: prices stored as cents; totals summed in SQL.
