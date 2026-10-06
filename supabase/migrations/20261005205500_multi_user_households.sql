-- 1. Create Households tables
CREATE TABLE public.households (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.household_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    household_id uuid REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role text NOT NULL DEFAULT 'owner',
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (household_id, user_id)
);

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, token)
);

-- 2. Add columns to existing tables
ALTER TABLE public.accounts ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.accounts ADD COLUMN owner_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.transactions ADD COLUMN created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.main_categories ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.subcategories ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.budgets ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.recurring_transactions ADD COLUMN household_id uuid REFERENCES public.households(id);
-- ALTER TABLE public.pending_transactions ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.transaction_templates ADD COLUMN household_id uuid REFERENCES public.households(id);

ALTER TABLE public.shopping_trips ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.shopping_categories ADD COLUMN household_id uuid REFERENCES public.households(id);
ALTER TABLE public.shopping_item_dictionary ADD COLUMN household_id uuid REFERENCES public.households(id);

-- 3. Data Migration (Backfill)
DO $$
DECLARE
    user_rec record;
    new_household_id uuid;
BEGIN
    FOR user_rec IN 
        SELECT DISTINCT user_id FROM public.accounts 
        UNION 
        SELECT DISTINCT user_id FROM public.transactions
        UNION
        SELECT DISTINCT user_id FROM public.main_categories
    LOOP
        -- Create a household for this user
        INSERT INTO public.households DEFAULT VALUES RETURNING id INTO new_household_id;
        
        -- Add the user to the household as owner
        INSERT INTO public.household_members (household_id, user_id, role)
        VALUES (new_household_id, user_rec.user_id, 'owner');
        
        -- Backfill household_id and owner_user_id
        UPDATE public.accounts SET household_id = new_household_id, owner_user_id = user_id WHERE user_id = user_rec.user_id;
        UPDATE public.transactions SET created_by = user_id WHERE user_id = user_rec.user_id;
        
        UPDATE public.main_categories SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        UPDATE public.subcategories SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        UPDATE public.budgets SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        UPDATE public.recurring_transactions SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        -- UPDATE public.pending_transactions SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        UPDATE public.transaction_templates SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        
        UPDATE public.shopping_trips SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        UPDATE public.shopping_categories SET household_id = new_household_id WHERE user_id = user_rec.user_id;
        UPDATE public.shopping_item_dictionary SET household_id = new_household_id WHERE user_id = user_rec.user_id;
    END LOOP;
END $$;

-- 4. Make household_id NOT NULL on backfilled tables
ALTER TABLE public.accounts ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.main_categories ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.subcategories ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.budgets ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.recurring_transactions ALTER COLUMN household_id SET NOT NULL;
-- ALTER TABLE public.pending_transactions ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.transaction_templates ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.shopping_trips ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.shopping_categories ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE public.shopping_item_dictionary ALTER COLUMN household_id SET NOT NULL;


-- 5. Enable RLS and Create Policies for New Tables
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own households" ON public.households
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.household_members 
            WHERE household_members.household_id = households.id 
            AND household_members.user_id = auth.uid()
        )
    );

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view members of their households" ON public.household_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.household_members hm
            WHERE hm.household_id = household_members.household_id 
            AND hm.user_id = auth.uid()
        )
    );

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own device tokens" ON public.device_tokens
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Replace old policies with household-aware policies

-- Accounts
DROP POLICY IF EXISTS "Users manage own accounts" ON public.accounts;
CREATE POLICY "Users view household accounts" ON public.accounts FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = accounts.household_id AND hm.user_id = auth.uid())
);
CREATE POLICY "Users insert household accounts" ON public.accounts FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);
CREATE POLICY "Users update owned or joint accounts" ON public.accounts FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = accounts.household_id AND hm.user_id = auth.uid())
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = accounts.household_id AND hm.user_id = auth.uid())
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
);
CREATE POLICY "Users delete owned or joint accounts" ON public.accounts FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = accounts.household_id AND hm.user_id = auth.uid())
    AND (owner_user_id = auth.uid() OR owner_user_id IS NULL)
);

-- Transactions
DROP POLICY IF EXISTS "Users manage own transactions" ON public.transactions;
CREATE POLICY "Users view household transactions" ON public.transactions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.accounts a 
        JOIN public.household_members hm ON hm.household_id = a.household_id 
        WHERE a.id = transactions.account_id AND hm.user_id = auth.uid()
    )
);
CREATE POLICY "Users manage transactions for accessible accounts" ON public.transactions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.accounts a 
        JOIN public.household_members hm ON hm.household_id = a.household_id 
        WHERE a.id = transactions.account_id AND hm.user_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.accounts a 
        JOIN public.household_members hm ON hm.household_id = a.household_id 
        WHERE a.id = account_id AND hm.user_id = auth.uid()
    )
);

-- Pending Transactions (Does not exist)
-- DROP POLICY IF EXISTS "Users manage own pending_transactions" ON public.pending_transactions;
-- CREATE POLICY "Users manage household pending transactions" ON public.pending_transactions FOR ALL USING (
--     EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = pending_transactions.household_id AND hm.user_id = auth.uid())
-- ) WITH CHECK (
--     EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
-- );

-- Transaction Templates
DROP POLICY IF EXISTS "Users manage own templates" ON public.transaction_templates;
CREATE POLICY "Users manage household templates" ON public.transaction_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = transaction_templates.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Budgets
DROP POLICY IF EXISTS "Users manage own budgets" ON public.budgets;
CREATE POLICY "Users manage household budgets" ON public.budgets FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = budgets.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Main Categories
DROP POLICY IF EXISTS "Users manage own main_categories" ON public.main_categories;
CREATE POLICY "Users manage household main_categories" ON public.main_categories FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = main_categories.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Subcategories
DROP POLICY IF EXISTS "Users manage own subcategories" ON public.subcategories;
CREATE POLICY "Users manage household subcategories" ON public.subcategories FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = subcategories.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Recurring Transactions
DROP POLICY IF EXISTS "Users manage own recurring" ON public.recurring_transactions;
CREATE POLICY "Users manage household recurring" ON public.recurring_transactions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = recurring_transactions.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Shopping Trips
DROP POLICY IF EXISTS "Users manage own shopping trips" ON public.shopping_trips;
CREATE POLICY "Users manage household shopping trips" ON public.shopping_trips FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = shopping_trips.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Shopping Items (these belong to trips, no direct household_id, but we must fix RLS)
DROP POLICY IF EXISTS "Users manage own shopping items" ON public.shopping_items;
CREATE POLICY "Users manage household shopping items" ON public.shopping_items FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.shopping_trips st 
        JOIN public.household_members hm ON hm.household_id = st.household_id 
        WHERE st.id = shopping_items.trip_id AND hm.user_id = auth.uid()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.shopping_trips st 
        JOIN public.household_members hm ON hm.household_id = st.household_id 
        WHERE st.id = trip_id AND hm.user_id = auth.uid()
    )
);

-- Shopping Categories
DROP POLICY IF EXISTS "Users manage own shopping categories" ON public.shopping_categories;
CREATE POLICY "Users manage household shopping categories" ON public.shopping_categories FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = shopping_categories.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- Shopping Dictionary
DROP POLICY IF EXISTS "Users manage own shopping dictionary" ON public.shopping_item_dictionary;
CREATE POLICY "Users manage household shopping dictionary" ON public.shopping_item_dictionary FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = shopping_item_dictionary.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

-- 6. Rewrite Seeding Triggers to handle household_id
CREATE OR REPLACE FUNCTION public.seed_default_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_household_id uuid;
BEGIN
  -- We assume handle_new_user() or another trigger created a household for this user, OR we create one if not exists
  SELECT household_id INTO v_household_id FROM public.household_members WHERE user_id = NEW.id LIMIT 1;
  IF v_household_id IS NULL THEN
    INSERT INTO public.households DEFAULT VALUES RETURNING id INTO v_household_id;
    INSERT INTO public.household_members (household_id, user_id, role) VALUES (v_household_id, NEW.id, 'owner');
  END IF;

  INSERT INTO public.accounts (user_id, household_id, name, icon, account_type, sort_order, starting_balance, currency)
  VALUES
    (NEW.id, v_household_id, 'Cash', 'banknote', 'cash', 0, 0, 'EUR'),
    (NEW.id, v_household_id, 'Card', 'credit-card', 'bank', 1, 0, 'EUR'),
    (NEW.id, v_household_id, 'Bank Account', 'landmark', 'bank', 2, 0, 'EUR');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER AS $$
DECLARE
  needs_id UUID;
  wants_id UUID;
  inv_id UUID;
  v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM public.household_members WHERE user_id = NEW.id LIMIT 1;
  
  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) VALUES (NEW.id, v_household_id, 'Needs', '215 55% 52%', 0) RETURNING id INTO needs_id;
  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) VALUES (NEW.id, v_household_id, 'Wants', '280 45% 55%', 1) RETURNING id INTO wants_id;
  INSERT INTO public.main_categories (user_id, household_id, name, color, sort_order) VALUES (NEW.id, v_household_id, 'Investments', '145 45% 42%', 2) RETURNING id INTO inv_id;

  INSERT INTO public.subcategories (user_id, household_id, main_category_id, name, icon, color, sort_order) VALUES
    (NEW.id, v_household_id, needs_id, 'Housing', 'home', '215 55% 52%', 0),
    (NEW.id, v_household_id, needs_id, 'Groceries', 'shopping-cart', '215 45% 58%', 1),
    (NEW.id, v_household_id, needs_id, 'Utilities', 'zap', '215 40% 48%', 2),
    (NEW.id, v_household_id, needs_id, 'Transport', 'car', '215 50% 45%', 3),
    (NEW.id, v_household_id, needs_id, 'Insurance', 'shield', '215 35% 50%', 4),
    (NEW.id, v_household_id, wants_id, 'Eating Out', 'utensils', '280 45% 55%', 0),
    (NEW.id, v_household_id, wants_id, 'Entertainment', 'film', '280 40% 50%', 1),
    (NEW.id, v_household_id, wants_id, 'Shopping', 'shopping-bag', '280 50% 60%', 2),
    (NEW.id, v_household_id, wants_id, 'Hobbies', 'palette', '280 35% 52%', 3),
    (NEW.id, v_household_id, inv_id, 'Emergency Fund', 'piggy-bank', '145 45% 42%', 0),
    (NEW.id, v_household_id, inv_id, 'Stocks', 'trending-up', '145 40% 48%', 1),
    (NEW.id, v_household_id, inv_id, 'Savings', 'landmark', '145 50% 38%', 2);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.seed_shopping_categories()
RETURNS TRIGGER AS $$
DECLARE
  v_household_id uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM public.household_members WHERE user_id = NEW.id LIMIT 1;
  
  INSERT INTO public.shopping_categories (user_id, household_id, name, sort_order)
  VALUES 
    (NEW.id, v_household_id, 'Produce', 0),
    (NEW.id, v_household_id, 'Dairy', 1),
    (NEW.id, v_household_id, 'Meat', 2),
    (NEW.id, v_household_id, 'Pantry', 3),
    (NEW.id, v_household_id, 'Household', 4);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Add BEFORE INSERT triggers to magically inject household_id for legacy seed functions
CREATE OR REPLACE FUNCTION public.inject_household_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.household_id IS NULL THEN
    SELECT household_id INTO NEW.household_id FROM public.household_members WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER inject_household_id_shopping_categories
  BEFORE INSERT ON public.shopping_categories
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

CREATE TRIGGER inject_household_id_shopping_item_dictionary
  BEFORE INSERT ON public.shopping_item_dictionary
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

CREATE TRIGGER inject_household_id_accounts
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

CREATE TRIGGER inject_household_id_main_categories
  BEFORE INSERT ON public.main_categories
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();

CREATE TRIGGER inject_household_id_subcategories
  BEFORE INSERT ON public.subcategories
  FOR EACH ROW EXECUTE FUNCTION public.inject_household_id();
