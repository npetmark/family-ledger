ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS actual_price_cents BIGINT,
  ADD COLUMN IF NOT EXISTS is_excess BOOLEAN NOT NULL DEFAULT false;