# Antigravity Reference

## Stack
* **Frontend**: React (v18), TypeScript, Vite
* **Styling**: Tailwind CSS, Shadcn UI
* **Backend**: Supabase (PostgreSQL, Edge Functions)
* **Testing**: Vitest, React Testing Library

## Commands
* **Development**: `npm run dev`
* **Build**: `npm run build`
* **Lint**: `npm run lint`
* **Test**: `npm run test`
* **Database**: Managed via `supabase` CLI (migrations in `supabase/migrations/`)

## Conventions
* Use standard React functional components with Hooks.
* Styling via Tailwind CSS utility classes and Shadcn components.
* Money is represented in cents to avoid floating-point inaccuracies.

## Standing Rules
* Work on a branch, never on main. One logical change per PR. Never mix refactoring and new features.
* Run tests, lint, and build before declaring anything done; show results.
* Do not change money-calculation logic without explicit instruction; if a change touches it, stop and flag it.
* Never touch production data or the production Supabase project. Schema changes only as versioned migration files, run locally first. Every table has RLS enabled. The service-role key never appears in client code or the repo.
* Never read, print, or commit secrets or `.env` files.
* Existing behavior for current users stays intact until cutover is approved.
* If something is ambiguous or has real trade-offs, ask instead of guessing.
* If an attempt goes wrong, revert and retry rather than layering patches.
* Keep `PLAN.md` current so a fresh session can resume.
