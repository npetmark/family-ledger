-- Migration: Add is_default column to shopping_trips table
ALTER TABLE public.shopping_trips
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Designate the earliest active trip per household as the default list
WITH earliest_active AS (
  SELECT DISTINCT ON (household_id) id
  FROM public.shopping_trips
  WHERE status = 'active'
  ORDER BY household_id, created_at ASC
)
UPDATE public.shopping_trips
SET is_default = true
WHERE id IN (SELECT id FROM earliest_active);

-- If a household has trips but none is currently active, mark the earliest trip as default
WITH earliest_any AS (
  SELECT DISTINCT ON (household_id) id
  FROM public.shopping_trips
  ORDER BY household_id, created_at ASC
)
UPDATE public.shopping_trips
SET is_default = true
WHERE household_id NOT IN (
  SELECT household_id FROM public.shopping_trips WHERE is_default = true
)
AND id IN (SELECT id FROM earliest_any);
