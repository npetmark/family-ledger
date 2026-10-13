-- Fix signup for new users ("Database error saving new user").
--
-- The household-aware seed functions and inject_household_id triggers were
-- added to 20261005205500_multi_user_households.sql after that migration had
-- already been applied, so they never reached the database. The old
-- seed_default_accounts() inserted accounts without household_id, and a
-- brand-new user has no household_members row for inject_household_id to
-- look up, so accounts.household_id was NULL and the signup transaction failed.
--
-- Re-apply those definitions idempotently.

CREATE OR REPLACE FUNCTION public.seed_default_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM public.household_members WHERE user_id = NEW.id LIMIT 1;
  IF v_household_id IS NULL THEN
    INSERT INTO public.households DEFAULT VALUES RETURNING id INTO v_household_id;
    INSERT INTO public.household_members (household_id, user_id, role) VALUES (v_household_id, NEW.id, 'owner');
  END IF;

  INSERT INTO public.accounts (user_id, household_id, name, icon, account_type, sort_order, starting_balance, currency)
  VALUES
    (NEW.id, v_household_id, 'Cash', 'banknote', 'cash', 0, 0, 'EUR'),
    (NEW.id, v_household_id, 'Card', 'credit-card', 'bank', 1, 0, 'EUR'),
    (NEW.id, v_household_id, 'Bank Account', 'landmark', 'bank', 2, 0, 'EUR');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER AS $$
DECLARE
  needs_id UUID;
  wants_id UUID;
  inv_id UUID;
  v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM public.household_members WHERE user_id = NEW.id LIMIT 1;

  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) VALUES (NEW.id, v_household_id, 'Needs', '215 55% 52%', 0) RETURNING id INTO needs_id;
  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) VALUES (NEW.id, v_household_id, 'Wants', '280 45% 55%', 1) RETURNING id INTO wants_id;
  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) VALUES (NEW.id, v_household_id, 'Investments', '145 45% 42%', 2) RETURNING id INTO inv_id;

  INSERT INTO public.subcategories (user_id, household_id, main_category_id, name, icon, color, sort_order) VALUES
    (NEW.id, v_household_id, needs_id, 'Housing', 'home', '215 55% 52%', 0),
    (NEW.id, v_household_id, needs_id, 'Groceries', 'shopping-cart', '215 45% 58%', 1),
    (NEW.id, v_household_id, needs_id, 'Utilities', 'zap', '215 40% 48%', 2),
    (NEW.id, v_household_id, needs_id, 'Transport', 'car', '215 50% 45%', 3),
    (NEW.id, v_household_id, needs_id, 'Insurance', 'shield', '215 35% 50%', 4),
    (NEW.id, v_household_id, wants_id, 'Eating Out', 'utensils', '280 45% 55%', 0),
    (NEW.id, v_household_id, wants_id, 'Entertainment', 'film', '280 40% 50%', 1),
    (NEW.id, v_household_id, wants_id, 'Shopping', 'shopping-bag', '280 50% 60%', 2),
    (NEW.id, v_household_id, wants_id, 'Hobbies', 'palette', '280 35% 52%', 3),
    (NEW.id, v_household_id, inv_id, 'Emergency Fund', 'piggy-bank', '145 45% 42%', 0),
    (NEW.id, v_household_id, inv_id, 'Stocks', 'trending-up', '145 40% 48%', 1),
    (NEW.id, v_household_id, inv_id, 'Savings', 'landmark', '145 50% 38%', 2);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fallback for seed code that still inserts without household_id
-- (seed_shopping_defaults inserts shopping_categories / dictionary rows this way).
CREATE OR REPLACE FUNCTION public.inject_household_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    SELECT household_id INTO NEW.household_id FROM public.household_members WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS inject_household_id_shopping_categories ON public.shopping_categories;
CREATE TRIGGER inject_household_id_shopping_categories
  BEFORE INSERT ON public.shopping_categories
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

DROP TRIGGER IF EXISTS inject_household_id_shopping_item_dictionary ON public.shopping_item_dictionary;
CREATE TRIGGER inject_household_id_shopping_item_dictionary
  BEFORE INSERT ON public.shopping_item_dictionary
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

DROP TRIGGER IF EXISTS inject_household_id_accounts ON public.accounts;
CREATE TRIGGER inject_household_id_accounts
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

DROP TRIGGER IF EXISTS inject_household_id_main_categories ON public.main_categories;
CREATE TRIGGER inject_household_id_main_categories
  BEFORE INSERT ON public.main_categories
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

DROP TRIGGER IF EXISTS inject_household_id_subcategories ON public.subcategories;
CREATE TRIGGER inject_household_id_subcategories
  BEFORE INSERT ON public.subcategories
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();
