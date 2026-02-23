
-- Add currency to accounts (default EUR)
ALTER TABLE public.accounts ADD COLUMN currency text NOT NULL DEFAULT 'EUR';

-- Add alert_threshold to budgets (percentage, e.g. 75, 90, 100)
ALTER TABLE public.budgets ADD COLUMN alert_threshold integer NOT NULL DEFAULT 90;
