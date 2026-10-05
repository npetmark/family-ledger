# Architecture & Current State

## Tech Stack
* **Frontend**: React (v18), TypeScript, Vite
* **Routing**: React Router (v6)
* **Styling**: Tailwind CSS, Shadcn UI components, Lucide icons
* **State Management**: React Query (TanStack Query v5)
* **Backend / Database**: Supabase (PostgreSQL, Auth, Edge Functions/Storage unverified usage outside receipts)
* **Testing**: Vitest, React Testing Library
* **Mobile / App**: Capacitor (configuration present for iOS/Android wrapping)

## Modules & Data Flow
1. **App Initialization**: Vite bundles the app; React Router handles navigation.
2. **Data Fetching**: The frontend uses Supabase JS client to query the database. Data is cached and managed via React Query (`@tanstack/react-query`).
3. **State Management**: React Query handles server state. Local UI state is managed with React `useState`/`useContext`. 
4. **Calculations**: Money calculations (totals, parsing) happen in the frontend (e.g. `src/lib/financial.ts`). Values are stored as cents (`integer` in DB) to avoid floating-point errors.
5. **Deployment**: Currently deployed to GitHub Pages via a GitHub Actions workflow (`.github/workflows/deploy.yml`) on pushes to `main`.

## Current State & Risks
- **Single User Model**: The app heavily relies on a single `user_id` matching `auth.uid()` for all data segregation. 
- **Shared Login Risk**: The users currently share a login. Moving to separate logins requires a data migration (backfilling owners) and schema expansion to support households.
- **Money Calculations**: Logic resides in `src/lib/financial.ts` and potentially inside components. Changes here must be heavily guarded by characterization tests. Cents-based math is mostly robust, but percentage calculations and currency formatting need to be preserved exactly.
- **Client-Side Balancing**: The database has a `get_account_balances` function, but some logic may be evaluated client-side. We need to verify where totals are derived.
- **UI/Data Coupling**: The UI components currently fetch data directly (likely using React Query hooks that call Supabase directly). Refactoring (Phase 3) will decouple this behind a repository interface.
- **Offline / PWA**: There is `vite-plugin-pwa` in `package.json`, suggesting potential offline/caching behavior that we shouldn't break.
