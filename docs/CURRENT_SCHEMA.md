# Current Supabase Schema

## Versioning
The schema is currently versioned in the repository under `supabase/migrations/`. There are 14 migration files that set up the schema, functions, triggers, and RLS policies.

## Tables & Columns

### Core Ledger
* **`profiles`**: `id` (PK, refs auth.users), `display_name`, `currency`, `created_at`, `updated_at`
* **`accounts`**: `id` (PK), `name`, `account_type`, `currency`, `starting_balance`, `user_id`, `is_visible`, `sort_order`, `icon`, `created_at`, `updated_at`
* **`main_categories`**: `id` (PK), `name`, `color`, `sort_order`, `user_id`, `created_at`
* **`subcategories`**: `id` (PK), `name`, `main_category_id` (FK), `icon`, `color`, `is_active`, `sort_order`, `user_id`, `created_at`
* **`budgets`**: `id` (PK), `subcategory_id` (FK), `amount`, `month_year`, `alert_threshold`, `user_id`, `created_at`
* **`transactions`**: `id` (PK), `account_id` (FK), `amount` (cents), `date`, `transaction_type`, `subcategory_id` (FK), `note`, `recurring_transaction_id` (FK), `transfer_to_account_id` (FK), `tags`, `user_id`, `created_at`, `updated_at`
* **`pending_transactions`**: `id` (PK), `account_id` (FK), `raw_text`, `status`, `parsed_amount`, `parsed_note`, `transaction_type`, `subcategory_id` (FK), `user_id`, `created_at`
* **`recurring_transactions`**: `id` (PK), `account_id` (FK), `amount`, `start_date`, `end_date`, `frequency`, `next_due_date`, `is_active`, `transaction_type`, `subcategory_id` (FK), `note`, `transfer_to_account_id` (FK), `tags`, `user_id`, `created_at`
* **`transaction_templates`**: `id` (PK), `name`, `account_id` (FK), `amount`, `transaction_type`, `subcategory_id` (FK), `note`, `tags`, `user_id`, `created_at`

### Shopping / Lists (Unverified detailed usage)
* **`shopping_categories`**: `id`, `name`, `color`, `emoji`, `is_default`, `sort_order`, `user_id`
* **`shopping_trips`**: `id`, `name`, `started_at`, `completed_at`, `total_cents`, `status`, `receipt_path`, `notes`, `user_id`
* **`shopping_items`**: `id`, `trip_id` (FK), `category_id` (FK), `name`, `normalized_name`, `quantity`, `unit`, `checked`, `price_cents`, `actual_price_cents`, `is_excess`, `promo_*`, `user_id`
* **`shopping_item_dictionary`**: `id`, `display_name`, `normalized_name`, `category_id`, `language`, `usage_count`, `last_used_at`, `user_id`
* **`shopping_promotions_cache`**: `id`, `promos`, `updated_at`

## Relationships
- `profiles.id` is implicitly joined with `auth.users.id`.
- `accounts`, `transactions`, `main_categories`, `subcategories`, `budgets`, etc. all belong to a user via `user_id`.
- `transactions` belong to an `account_id` and optionally link to `subcategory_id`, `recurring_transaction_id`, and `transfer_to_account_id`.
- `subcategories` belong to `main_categories` via `main_category_id`.
- Shopping items belong to `shopping_trips` and `shopping_categories`.

## RLS Policies
All tables have Row Level Security enabled. 
The current authorization model is single-user focused:
- **`profiles`**: Select/Update/Insert where `auth.uid() = id`.
- **Ledger Tables** (accounts, transactions, categories, budgets, etc.): All operations permitted where `auth.uid() = user_id`.
- **Shopping Tables**: "Users manage own ..." policies similarly restricting to `user_id` ownership.
- **Storage**: Policies for `storage.objects` ensuring "Users [read/upload/update/delete] own shopping receipts".

## Functions & Triggers
### Triggers
- `on_auth_user_created`: Fires on new `auth.users` to create a `profiles` record.
- `on_auth_user_created_seed_accounts`: Seeds default accounts for a new user.
- `on_new_user_seed_categories`: Seeds default categories for a new user.
- `trg_seed_shopping_on_signup`: Seeds default shopping categories.
- `update_*_updated_at`: Standard `BEFORE UPDATE` triggers to keep `updated_at` timestamps current on `profiles`, `accounts`, `transactions`, etc.

### Functions
- `get_account_balances()`: Returns calculated account balances for the current user.
- `seed_shopping_defaults(user_id)`: Called via trigger to populate default shopping dict.

## Auth Configuration
- Uses Supabase Auth (likely Email/Password given standard setup, exact providers unverified).
- Single-login structure currently assumed (app accessed by a shared login).

## Note for Multi-User Migration
The widespread use of `auth.uid() = user_id` in RLS and `user_id` columns in all tables is the primary blocker for multi-user households. Phase 2 must replace `user_id` based tenancy with `household_id` based tenancy.
