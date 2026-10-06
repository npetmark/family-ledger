-- =====================================================================
-- 1. Allow household owners to reassign account ownership
-- =====================================================================

-- SECURITY DEFINER helper (bypasses RLS on household_members, avoids recursion)
CREATE OR REPLACE FUNCTION public.is_household_owner(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- Household owners may update any account in their household (needed to
-- reassign a personal account). Members may still update joint accounts and
-- their own personal accounts.
DROP POLICY IF EXISTS "Users update owned or joint accounts" ON public.accounts;
CREATE POLICY "Users update owned or joint accounts" ON public.accounts FOR UPDATE USING (
    household_id IN (SELECT get_user_households())
    AND (
        owner_user_id = auth.uid()
        OR owner_user_id IS NULL
        OR public.is_household_owner(household_id)
    )
) WITH CHECK (
    household_id IN (SELECT get_user_households())
    AND (
        owner_user_id = auth.uid()
        OR owner_user_id IS NULL
        OR public.is_household_owner(household_id)
    )
);

-- Fix insert policy: the original compared hm.household_id to itself
-- (unqualified "household_id"), so it effectively allowed any household.
DROP POLICY IF EXISTS "Users insert household accounts" ON public.accounts;
CREATE POLICY "Users insert household accounts" ON public.accounts FOR INSERT WITH CHECK (
    household_id IN (SELECT get_user_households())
    AND (
        owner_user_id = auth.uid()
        OR owner_user_id IS NULL
        OR public.is_household_owner(household_id)
    )
);

-- Guard: only household owners may change ownership, and the new owner must
-- belong to the same household. Skipped for service-role / SQL editor calls.
CREATE OR REPLACE FUNCTION public.guard_account_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT public.is_household_owner(OLD.household_id) THEN
    RAISE EXCEPTION 'Only the household owner can change account ownership';
  END IF;

  IF NEW.owner_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = NEW.household_id AND user_id = NEW.owner_user_id
  ) THEN
    RAISE EXCEPTION 'Account owner must be a member of the household';
  END IF;

  RETURN NEW;
END;
$$;

-- "z_" prefix: triggers fire alphabetically and this must run after
-- inject_household_id_accounts has populated household_id on INSERT.
DROP TRIGGER IF EXISTS z_guard_account_owner_change ON public.accounts;
CREATE TRIGGER z_guard_account_owner_change
  BEFORE INSERT OR UPDATE OF owner_user_id ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_owner_change();

-- =====================================================================
-- 2. First / last name on profiles
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name  text NOT NULL DEFAULT '';

-- Backfill from existing display_name ("First Rest Of Name")
UPDATE public.profiles
SET first_name = split_part(btrim(display_name), ' ', 1),
    last_name  = btrim(substr(btrim(display_name), length(split_part(btrim(display_name), ' ', 1)) + 1))
WHERE first_name = '' AND btrim(display_name) <> '';

-- Keep display_name (full name) in sync for any code still reading it
CREATE OR REPLACE FUNCTION public.sync_profile_display_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF btrim(NEW.first_name) <> '' OR btrim(NEW.last_name) <> '' THEN
    NEW.display_name := btrim(btrim(NEW.first_name) || ' ' || btrim(NEW.last_name));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_display_name ON public.profiles;
CREATE TRIGGER sync_profile_display_name
  BEFORE INSERT OR UPDATE OF first_name, last_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_display_name();
