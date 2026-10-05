# ADR 0001: Multi-User Households Architecture

## Status
Proposed

## Context
The application currently operates on a single shared login where `user_id` strictly correlates to `auth.uid()`. To support multi-user households (starting with two members who have separate logins but shared visibility of accounts), we need to redesign the data and permission model. 

## Decisions

### 1. Data Model Additions & Changes
To represent households and shared ownership, the following schema expansions will be made:
- **`households`**: Represents a shared ledger space (e.g., `id`, `name`, `created_at`).
- **`household_members`**: Join table tracking who belongs to which household (e.g., `id`, `household_id`, `user_id`, `role`).
- **`accounts`**: 
  - Add `household_id` (FK to households).
  - Modify ownership: add `owner_user_id` (nullable). If `null`, the account is considered **joint**. If set to a specific user, it is an **individual** account.
- **`transactions`**:
  - Add `created_by` (FK to users) to track the author of the transaction.
- **`main_categories`, `subcategories`, `budgets`**: 
  - Migrate ownership from `user_id` to `household_id` to make these shared at the household level.
- **`device_tokens`**: New table to support push notifications (`id`, `user_id`, `token`, `platform`).

### 2. Permission Model (Enforced via RLS)
- **Visibility**: Both household members can view *everything* (all accounts, transactions, budgets) within the household.
- **Creation & Editing**: 
  - A member can create/edit/delete records only on accounts they own. 
  - For **joint accounts** (`owner_user_id` is null), **both members have full create/edit/delete rights** on all records.
- **Transfers**: A transfer between any two accounts is modeled as a single joint transaction that is fully editable by both members.
- **Ownership Toggles**: Only the account owner can change the ownership of an account (e.g., from individual to joint). Changing a joint account to an individual account requires agreement/action from both.
- **Invitations**: Linking members into a household will be done via a simple passcode/share code generated within the app.

### 3. UI Behavior
- **Account Sorting**: The logged-in user's accounts (individual) and joint accounts will be shown first in lists, followed by the other member's individual accounts.
- **Data Entry**: The account picker for adding or editing a record will only list accounts the logged-in user has write access to (their individual accounts and joint accounts).

### 4. Migration Plan (Expand -> Backfill -> Contract)
We will follow a non-destructive migration pattern:
1. **Expand**: Deploy the schema additions (`households`, `household_members`, new columns) without breaking the existing `user_id` based queries.
2. **Backfill**: 
   - Create the single household and map both the old shared login and the new logins to it.
   - Run a backfill script applying an explicit `account -> owner` mapping (to be supplied by the user).
   - Backfill historical `transactions.created_by` to default to the account owner (flagged as legacy/migrated if necessary).
3. **Rehearsal & Backup**: 
   - Perform a rehearsal migration locally using a DB dump or a Supabase branch DB.
   - Take a full production DB backup immediately before cutover.
4. **Contract / Cutover**:
   - Update RLS policies and application queries to strictly use `household_id`.
   - Retire the old shared login.
5. **Rollback**: If issues arise post-cutover, immediately revert the client application to the pre-cutover deployment (which still respects `user_id`) and disable the new logins while the backfilled columns are reviewed.

## Consequences
- Requires decoupling the UI data fetching from assumptions about `user_id` ownership (Phase 3).
- Ensures strict data segregation in RLS based on `household_id`, avoiding accidental leaks to other households.
- Will require careful orchestration during the data migration to prevent downtime or data loss for the currently active users.
