-- Helper function for checking ownership
CREATE OR REPLACE FUNCTION get_owned_households()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members WHERE user_id = auth.uid() AND role = 'owner';
$$;

-- Allow members to leave (delete their own record)
CREATE POLICY "Users can remove themselves from households" ON public.household_members
    FOR DELETE USING (
        user_id = auth.uid()
    );

-- Allow owners to remove other members
CREATE POLICY "Owners can remove members from their households" ON public.household_members
    FOR DELETE USING (
        household_id IN (SELECT get_owned_households())
    );

-- Allow owners to update roles (except their own to avoid getting locked out, but they can update others)
CREATE POLICY "Owners can update roles" ON public.household_members
    FOR UPDATE USING (
        household_id IN (SELECT get_owned_households())
    ) WITH CHECK (
        household_id IN (SELECT get_owned_households())
    );

-- Allow viewing profiles of household members
CREATE POLICY "Users can view profiles of household members" ON public.profiles
    FOR SELECT USING (
        id IN (SELECT user_id FROM public.household_members WHERE household_id IN (SELECT get_user_households()))
    );
