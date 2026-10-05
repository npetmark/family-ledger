# Known Issues

1. **Currency Parsing Silently Modifies Input (`src/lib/financial.ts`)**
   The `parseCurrencyToCents` function strips all non-numeric characters (except `.` and `-`) before parsing. 
   - Example: A user typing `10abc50` will have `abc` removed, leaving `1050`. The system then multiplies by 100, treating it as `105000` cents ($1050.00).
   - *Risk*: This can lead to unintentionally large entries if users accidentally type letters without noticing, rather than throwing a validation error or gracefully preserving intended decimals.

2. **Single-User Bias**
   - Widespread hardcoding of `auth.uid() = user_id` in RLS policies means any attempt to show the other user's records in the UI will fail at the database level until Phase 4 (where we migrate to `household_id`).

3. **Client-Side Currency / Percentage Formatting**
   - `percentage(1, 3)` rounds to exactly one decimal place (`33.3`), but doing so with basic `Math.round` can occasionally hit JS precision quirks, though characterization tests show it's currently stable for typical usage.
