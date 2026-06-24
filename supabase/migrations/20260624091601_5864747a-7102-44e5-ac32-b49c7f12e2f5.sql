DELETE FROM public.shopping_items a
USING public.shopping_items b
WHERE a.is_excess = true
  AND b.is_excess = true
  AND a.trip_id = b.trip_id
  AND a.name = b.name
  AND a.actual_price_cents IS NOT DISTINCT FROM b.actual_price_cents
  AND a.created_at > b.created_at;