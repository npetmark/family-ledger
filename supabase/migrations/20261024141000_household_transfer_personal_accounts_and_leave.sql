-- Migration: Transfer personal accounts on household join/leave and allow leaving household

-- Helper function to seed default categories for a household
CREATE OR REPLACE FUNCTION public.seed_household_categories_for_user(p_user_id uuid, p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needs_id UUID;
  wants_id UUID;
  inv_id UUID;
BEGIN
  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) 
  VALUES (p_user_id, p_household_id, 'Needs', '215 55% 52%', 0) 
  RETURNING id INTO needs_id;

  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) 
  VALUES (p_user_id, p_household_id, 'Wants', '280 45% 55%', 1) 
  RETURNING id INTO wants_id;

  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) 
  VALUES (p_user_id, p_household_id, 'Investments', '145 45% 42%', 2) 
  RETURNING id INTO inv_id;

  INSERT INTO public.subcategories (user_id, household_id, main_category_id, name, icon, color, sort_order) VALUES
    (p_user_id, p_household_id, needs_id, 'Housing', 'home', '215 55% 52%', 0),
    (p_user_id, p_household_id, needs_id, 'Groceries', 'shopping-cart', '215 45% 58%', 1),
    (p_user_id, p_household_id, needs_id, 'Utilities', 'zap', '215 40% 48%', 2),
    (p_user_id, p_household_id, needs_id, 'Transport', 'car', '215 50% 45%', 3),
    (p_user_id, p_household_id, needs_id, 'Insurance', 'shield', '215 35% 50%', 4),
    (p_user_id, p_household_id, wants_id, 'Eating Out', 'utensils', '280 45% 55%', 0),
    (p_user_id, p_household_id, wants_id, 'Entertainment', 'film', '280 40% 50%', 1),
    (p_user_id, p_household_id, wants_id, 'Shopping', 'shopping-bag', '280 50% 60%', 2),
    (p_user_id, p_household_id, wants_id, 'Hobbies', 'palette', '280 35% 52%', 3),
    (p_user_id, p_household_id, inv_id, 'Emergency Fund', 'piggy-bank', '145 45% 42%', 0),
    (p_user_id, p_household_id, inv_id, 'Stocks', 'trending-up', '145 40% 48%', 1),
    (p_user_id, p_household_id, inv_id, 'Savings', 'landmark', '145 50% 38%', 2);

  INSERT INTO public.shopping_categories (user_id, household_id, name, sort_order)
  VALUES 
    (p_user_id, p_household_id, 'Produce', 0),
    (p_user_id, p_household_id, 'Dairy', 1),
    (p_user_id, p_household_id, 'Meat', 2),
    (p_user_id, p_household_id, 'Pantry', 3),
    (p_user_id, p_household_id, 'Household', 4);
END;
$$;

-- Helper function to safely delete an empty/abandoned household and its child rows
CREATE OR REPLACE FUNCTION public.delete_household_and_data(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.transactions WHERE household_id = p_household_id;
  DELETE FROM public.recurring_transactions WHERE household_id = p_household_id;
  DELETE FROM public.accounts WHERE household_id = p_household_id;
  DELETE FROM public.subcategories WHERE household_id = p_household_id;
  DELETE FROM public.main_categories WHERE household_id = p_household_id;
  DELETE FROM public.budgets WHERE household_id = p_household_id;
  DELETE FROM public.transaction_templates WHERE household_id = p_household_id;
  DELETE FROM public.shopping_trips WHERE household_id = p_household_id;
  DELETE FROM public.shopping_item_dictionary WHERE household_id = p_household_id;
  DELETE FROM public.shopping_categories WHERE household_id = p_household_id;
  DELETE FROM public.household_members WHERE household_id = p_household_id;
  DELETE FROM public.households WHERE id = p_household_id;
END;
$$;

-- Enhanced join_household: transfers personal accounts and cleans up old orphaned household
CREATE OR REPLACE FUNCTION public.join_household(p_invite_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_household_id uuid;
  v_user_id uuid := auth.uid();
  v_old_household_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find household by invite code
  SELECT id INTO v_target_household_id FROM public.households WHERE invite_code = p_invite_code;
  
  IF v_target_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  -- If already in target household, do nothing
  IF EXISTS (SELECT 1 FROM public.household_members WHERE household_id = v_target_household_id AND user_id = v_user_id) THEN
    RETURN;
  END IF;

  -- Clean up prior households and transfer personal accounts
  FOR v_old_household_id IN 
    SELECT household_id FROM public.household_members WHERE user_id = v_user_id AND household_id <> v_target_household_id
  LOOP
    -- 1. Transfer personal accounts to target household
    UPDATE public.accounts
    SET household_id = v_target_household_id
    WHERE household_id = v_old_household_id AND owner_user_id = v_user_id;

    -- Also transfer recurring transactions for these accounts
    UPDATE public.recurring_transactions
    SET household_id = v_target_household_id
    WHERE household_id = v_old_household_id
      AND account_id IN (
        SELECT id FROM public.accounts WHERE household_id = v_target_household_id AND owner_user_id = v_user_id
      );

    -- 2. Remove user from old household
    DELETE FROM public.household_members WHERE household_id = v_old_household_id AND user_id = v_user_id;

    -- 3. Delete old household if empty
    IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = v_old_household_id) THEN
      PERFORM public.delete_household_and_data(v_old_household_id);
    END IF;
  END LOOP;

  -- 4. Add user as member to target household
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_target_household_id, v_user_id, 'member')
  ON CONFLICT (household_id, user_id) DO UPDATE SET role = 'member';
END;
$$;

-- Function for a user to leave a household:
-- Creates a new household, transfers personal accounts, and seeds default accounts and categories
CREATE OR REPLACE FUNCTION public.leave_household(p_household_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_household_id uuid;
  v_new_household_id uuid;
  v_user_id uuid := auth.uid();
  v_role text;
  v_other_member_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_household_id IS NOT NULL THEN
    v_old_household_id := p_household_id;
  ELSE
    SELECT household_id INTO v_old_household_id
    FROM public.household_members
    WHERE user_id = v_user_id
    ORDER BY joined_at DESC
    LIMIT 1;
  END IF;

  IF v_old_household_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any household';
  END IF;

  SELECT role INTO v_role FROM public.household_members
  WHERE household_id = v_old_household_id AND user_id = v_user_id;

  SELECT count(*) INTO v_other_member_count
  FROM public.household_members
  WHERE household_id = v_old_household_id AND user_id <> v_user_id;

  IF v_role = 'owner' AND v_other_member_count > 0 THEN
    RAISE EXCEPTION 'Household owner cannot leave while other members are in the household. Remove other members first.';
  END IF;

  -- 1. Create a brand new household for the user
  INSERT INTO public.households DEFAULT VALUES RETURNING id INTO v_new_household_id;

  -- 2. Add user as owner of the new household
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_new_household_id, v_user_id, 'owner');

  -- 3. Transfer personal accounts owned by user to the new household
  UPDATE public.accounts
  SET household_id = v_new_household_id
  WHERE household_id = v_old_household_id
    AND owner_user_id = v_user_id;

  UPDATE public.recurring_transactions
  SET household_id = v_new_household_id
  WHERE household_id = v_old_household_id
    AND account_id IN (
      SELECT id FROM public.accounts WHERE household_id = v_new_household_id
    );

  -- 4. Seed default accounts (Cash, Card, Bank Account) for the new household
  INSERT INTO public.accounts (user_id, household_id, name, icon, account_type, sort_order, starting_balance, currency)
  VALUES
    (v_user_id, v_new_household_id, 'Cash', 'banknote', 'cash', 0, 0, 'EUR'),
    (v_user_id, v_new_household_id, 'Card', 'credit-card', 'bank', 1, 0, 'EUR'),
    (v_user_id, v_new_household_id, 'Bank Account', 'landmark', 'bank', 2, 0, 'EUR');

  -- 5. Seed default categories & shopping categories for the new household
  PERFORM public.seed_household_categories_for_user(v_user_id, v_new_household_id);

  -- 6. Remove user from the old household
  DELETE FROM public.household_members
  WHERE household_id = v_old_household_id AND user_id = v_user_id;

  -- 7. If old household now has 0 members, delete it
  IF v_other_member_count = 0 THEN
    PERFORM public.delete_household_and_data(v_old_household_id);
  END IF;

  RETURN v_new_household_id;
END;
$$;

-- Function for a household owner to remove a member:
-- Creates a new household for the removed member, transfers their personal accounts, and seeds defaults
CREATE OR REPLACE FUNCTION public.remove_household_member(p_household_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_household_id uuid;
  v_caller_role text;
BEGIN
  -- Caller must be household owner
  SELECT role INTO v_caller_role
  FROM public.household_members
  WHERE household_id = p_household_id AND user_id = auth.uid();

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only household owners can remove members';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Owners cannot remove themselves with this function';
  END IF;

  -- 1. Create a brand new household for the removed user
  INSERT INTO public.households DEFAULT VALUES RETURNING id INTO v_new_household_id;

  -- 2. Add removed user as owner of their new household
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_new_household_id, p_user_id, 'owner');

  -- 3. Transfer personal accounts owned by the removed user to their new household
  UPDATE public.accounts
  SET household_id = v_new_household_id
  WHERE household_id = p_household_id
    AND owner_user_id = p_user_id;

  UPDATE public.recurring_transactions
  SET household_id = v_new_household_id
  WHERE household_id = p_household_id
    AND account_id IN (
      SELECT id FROM public.accounts WHERE household_id = v_new_household_id
    );

  -- 4. Seed default accounts (Cash, Card, Bank Account) for the new household
  INSERT INTO public.accounts (user_id, household_id, name, icon, account_type, sort_order, starting_balance, currency)
  VALUES
    (p_user_id, v_new_household_id, 'Cash', 'banknote', 'cash', 0, 0, 'EUR'),
    (p_user_id, v_new_household_id, 'Card', 'credit-card', 'bank', 1, 0, 'EUR'),
    (p_user_id, v_new_household_id, 'Bank Account', 'landmark', 'bank', 2, 0, 'EUR');

  -- 5. Seed default categories & shopping categories for the new household
  PERFORM public.seed_household_categories_for_user(p_user_id, v_new_household_id);

  -- 6. Remove user from the old household
  DELETE FROM public.household_members
  WHERE household_id = p_household_id AND user_id = p_user_id;

  RETURN v_new_household_id;
END;
$$;

-- Cleanup existing duplicate household_members rows in the database
DO $$
DECLARE
  rec RECORD;
  v_primary_household_id uuid;
  v_old_household_id uuid;
BEGIN
  FOR rec IN
    SELECT user_id, count(*) FROM public.household_members GROUP BY user_id HAVING count(*) > 1
  LOOP
    -- Pick household with most members or latest joined_at
    SELECT hm.household_id INTO v_primary_household_id
    FROM public.household_members hm
    JOIN (
      SELECT household_id, count(*) as member_count
      FROM public.household_members
      GROUP BY household_id
    ) counts ON counts.household_id = hm.household_id
    WHERE hm.user_id = rec.user_id
    ORDER BY counts.member_count DESC, hm.joined_at DESC
    LIMIT 1;

    FOR v_old_household_id IN
      SELECT household_id FROM public.household_members WHERE user_id = rec.user_id AND household_id <> v_primary_household_id
    LOOP
      -- Move any personal accounts to primary household
      UPDATE public.accounts
      SET household_id = v_primary_household_id
      WHERE household_id = v_old_household_id AND owner_user_id = rec.user_id;

      UPDATE public.recurring_transactions
      SET household_id = v_primary_household_id
      WHERE household_id = v_old_household_id
        AND account_id IN (
          SELECT id FROM public.accounts WHERE household_id = v_primary_household_id AND owner_user_id = rec.user_id
        );

      -- Delete old membership
      DELETE FROM public.household_members WHERE household_id = v_old_household_id AND user_id = rec.user_id;

      -- If empty, delete old household
      IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = v_old_household_id) THEN
        PERFORM public.delete_household_and_data(v_old_household_id);
      END IF;
    END LOOP;
  END LOOP;
END $$;
