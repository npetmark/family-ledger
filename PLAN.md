# Migration Plan: Multi-User Households

We are currently executing a phased migration to support multi-user households with their own logins and accounts, maintaining shared visibility. 

## Current Status
- **Phase 1: Map and pin behavior** is **COMPLETE**.
- **Phase 2: Design** is **COMPLETE**.
- **Phase 3: Refactor** is **COMPLETE**.
- **Phase 4: Schema + Auth + RLS Migration** is **PENDING**.

---

## Phases

### 1. Map and pin behavior (COMPLETE)
- [x] Explore the repo (tech stack, commands, data flow).
- [x] Document CURRENT Supabase setup (`docs/CURRENT_SCHEMA.md`).
- [x] Write `docs/ARCHITECTURE.md`.
- [x] Add GitHub Actions workflow for CI/CD on PRs and main.
- [x] Add characterization tests pinning CURRENT behavior of money-related logic.
- [x] Create `ANTIGRAVITY.md` and `PLAN.md`.

### 2. Design (WAITING FOR APPROVAL)
- [x] Output an ADR in `docs/adr/0001-multi-user-households.md` and wait for approval. Must cover:
  - **Data model**: `households`, `household_members` (role), `accounts` (with `household_id` and nullable `owner_user_id` where null = joint), `transactions` (with `created_by`), household-level budgets/categories, `device_tokens` for push.
  - **Permission model**: Both members can view everything; edit/create/delete limited to owned accounts (or both for joint); enforced in RLS. *Pending questions: transfers between members' accounts, editing the other member's records, who can change account ownership, invitation flow.*
  - **UI behavior**: Logged-in user's accounts shown first; add-record account picker lists writable accounts only.
  - **Migration plan**: Expand -> backfill -> contract. Explicit account->owner mapping supplied by user; historical `created_by` defaults to account owner (legacy). Rehearsal on local DB/branch DB. Cutover/rollback strategies.

### 3. Refactor (No New Features)
- Separate UI from data access behind a repository interface.
- Small steps, tests green after each.

### 4. Schema + Auth + RLS Migration
- Implement schema changes via versioned migration files.
- Add tests proving users cannot read/write outside their household or write to the other member's accounts.
- Run data migration on a copy first.

### 5. Features
- Introduce multi-user UI features, one small branch each.

### 6. Notifications
- Firebase Cloud Messaging web push (service worker on GitHub Pages, iOS install requirement).
- Server-side sending via Supabase Edge Function or DB webhook (no Firebase server credentials in client).
