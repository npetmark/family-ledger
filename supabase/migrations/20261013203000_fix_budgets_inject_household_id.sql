-- Fix missing household_id injection triggers for budgets, recurring_transactions, shopping_trips, transaction_templates
-- and ensure budgets unique constraint is scoped to household.

CREATE OR REPLACE FUNCTION public.inject_household_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    SELECT household_id INTO NEW.household_id
    FROM public.household_members
    WHERE user_id = COALESCE(NEW.user_id, auth.uid())
    LIMIT 1;
  END IF;

  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Budgets
DROP TRIGGER IF EXISTS inject_household_id_budgets ON public.budgets;
CREATE TRIGGER inject_household_id_budgets
  BEFORE INSERT ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

-- Recurring Transactions
DROP TRIGGER IF EXISTS inject_household_id_recurring_transactions ON public.recurring_transactions;
CREATE TRIGGER inject_household_id_recurring_transactions
  BEFORE INSERT ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

-- Shopping Trips
DROP TRIGGER IF EXISTS inject_household_id_shopping_trips ON public.shopping_trips;
CREATE TRIGGER inject_household_id_shopping_trips
  BEFORE INSERT ON public.shopping_trips
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

-- Transaction Templates
DROP TRIGGER IF EXISTS inject_household_id_transaction_templates ON public.transaction_templates;
CREATE TRIGGER inject_household_id_transaction_templates
  BEFORE INSERT ON public.transaction_templates
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

-- Scope budgets uniqueness to (household_id, subcategory_id, month_year)
ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_user_id_subcategory_id_month_year_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budgets_household_id_subcategory_id_month_year_key'
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_household_id_subcategory_id_month_year_key
      UNIQUE (household_id, subcategory_id, month_year);
  END IF;
END $$;
