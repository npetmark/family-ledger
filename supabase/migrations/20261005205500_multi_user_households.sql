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
ALTER TABLE public.pending_transactions ADD COLUMN household_id uuid REFERENCES public.households(id);
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
        UPDATE public.pending_transactions SET household_id = new_household_id WHERE user_id = user_rec.user_id;
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
ALTER TABLE public.pending_transactions ALTER COLUMN household_id SET NOT NULL;
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

-- Pending Transactions
DROP POLICY IF EXISTS "Users manage own pending_transactions" ON public.pending_transactions;
CREATE POLICY "Users manage household pending transactions" ON public.pending_transactions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = pending_transactions.household_id AND hm.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.household_members hm WHERE hm.household_id = household_id AND hm.user_id = auth.uid())
);

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
