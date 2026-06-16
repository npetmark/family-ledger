
ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS promo_stores text[],
  ADD COLUMN IF NOT EXISTS promo_price_cents bigint,
  ADD COLUMN IF NOT EXISTS promo_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.shopping_promotions_cache (
  id int PRIMARY KEY DEFAULT 1,
  promos jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

GRANT SELECT ON public.shopping_promotions_cache TO authenticated;
GRANT ALL ON public.shopping_promotions_cache TO service_role;

ALTER TABLE public.shopping_promotions_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read promo cache" ON public.shopping_promotions_cache;
CREATE POLICY "Authenticated can read promo cache"
  ON public.shopping_promotions_cache
  FOR SELECT
  TO authenticated
  USING (true);
