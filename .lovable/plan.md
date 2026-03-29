

## Plan: Fix Chatbot Scrolling, Category Picker, and Dashboard Pie Chart

### Issues to Fix

1. **Chatbot category picker not scrollable** — The `PopoverContent` in the chatbot's `TransactionCard` has `max-h-60 overflow-y-auto` but lacks the scroll event isolation (`onWheel`/`onTouchMove` stopPropagation) used in the manual flow.

2. **Chatbot dialog not scrollable** — The `ScrollArea` component forwards `ref` to the Radix `Root` element, but scrolling actually happens on the inner `Viewport`. The `scrollRef` used for auto-scroll likely targets the wrong element. The dialog also needs proper flex layout to allow the scroll area to shrink.

3. **Manual flow category picker missing colored dots** — The manual `QuickAddTransaction` category picker doesn't show colored dots next to main category names like the chatbot does.

4. **Dashboard pie chart percentage denominator wrong** — Currently `totalExpenses` excludes Investments, so the pie chart percentages are calculated against Needs+Wants only. The pie chart should include all three (Needs, Wants, Investments) as 100%.

### Changes

#### File: `src/components/TransactionChatbot.tsx`

- **Fix chatbot scrollability**: Replace `ScrollArea` with a plain `div` using `overflow-y-auto` and proper flex sizing, or fix the ref to target the viewport. Simpler approach: use a regular `div` with `className="flex-1 min-h-0 overflow-y-auto"` and attach `scrollRef` directly.
- **Fix category picker scrollability**: Add `onWheel={(e) => e.stopPropagation()}` and `onTouchMove={(e) => e.stopPropagation()}` to the `PopoverContent` inner div, matching the manual flow pattern. Also add `overscroll-contain touch-pan-y`.
- **Add colored dots**: Already present in the chatbot (line 364). Keep as-is.

#### File: `src/components/QuickAddTransaction.tsx`

- **Add colored dots to manual flow category picker**: Fetch `main_categories` data (need a new query or join). Update the `CollapsibleTrigger` to include a colored dot `<div className="w-2 h-2 rounded-full" style={{ backgroundColor: \`hsl(\${color})\` }} />` next to each main category name, matching the chatbot style.

#### File: `src/pages/DashboardPage.tsx`

- **Fix pie chart denominator**: The pie chart's `categoryBreakdown` already includes all categories (Needs, Wants, Investments). The percentage label calculation on line 255 uses `totalExpenses` which excludes Investments. Change the denominator to `allExpenseLikeTotal` (sum of all `expenseLike` transactions including Investments) so the pie shows all three categories as 100%.
- Add a separate total for pie chart: `const allExpensesForChart = expenseLike.reduce((sum, t) => sum + t.amount, 0)` and use that in the label calculation.
- The summary cards remain unchanged (Expenses = Needs+Wants, Savings = Investments).

### Summary of Scope

| Area | What Changes |
|------|-------------|
| Chatbot scroll | Replace ScrollArea with plain overflow div |
| Chatbot category picker | Add scroll event isolation to PopoverContent |
| Manual flow category picker | Add colored dots next to main category names |
| Dashboard pie chart | Use all-inclusive expense total as denominator for % labels |

