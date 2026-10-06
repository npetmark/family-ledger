-- Create a SECURITY DEFINER function to bypass RLS when checking membership
CREATE OR REPLACE FUNCTION get_user_households()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid();
$$;

-- Fix households policy
DROP POLICY IF EXISTS "Users can view their own households" ON public.households;
CREATE POLICY "Users can view their own households" ON public.households
    FOR SELECT USING (
        id IN (SELECT get_user_households())
    );

-- Fix household_members policy
DROP POLICY IF EXISTS "Users can view members of their households" ON public.household_members;
CREATE POLICY "Users can view members of their households" ON public.household_members
    FOR SELECT USING (
        household_id IN (SELECT get_user_households())
    );

-- Re-apply Accounts policy to use the helper function for better performance
DROP POLICY IF EXISTS "Users view household accounts" ON public.accounts;
CREATE POLICY "Users view household accounts" ON public.accounts FOR SELECT USING (
    household_id IN (SELECT get_user_households())
);
DROP POLICY IF EXISTS "Users update owned or joint accounts" ON public.accounts;
CREATE POLICY "Users update owned or joint accounts" ON public.accounts FOR UPDATE USING (
    household_id IN (SELECT get_user_households())
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
) WITH CHECK (
    household_id IN (SELECT get_user_households())
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
);
DROP POLICY IF EXISTS "Users delete owned or joint accounts" ON public.accounts;
CREATE POLICY "Users delete owned or joint accounts" ON public.accounts FOR DELETE USING (
    household_id IN (SELECT get_user_households())
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
);

-- Note: Other tables can still use EXISTS(SELECT 1 FROM household_members) because
-- household_members RLS no longer recurses. However, using the helper function is faster.
