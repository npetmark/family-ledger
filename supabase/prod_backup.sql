


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_account_balances"() RETURNS TABLE("account_id" "uuid", "name" "text", "currency" "text", "account_type" "text", "icon" "text", "is_visible" boolean, "sort_order" integer, "starting_balance" bigint, "balance" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH uid AS (SELECT auth.uid() AS id),
  agg AS (
    SELECT
      a.id AS account_id,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'income'   AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type = 'expense'  AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.account_id = a.id THEN t.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.transfer_to_account_id = a.id THEN t.amount ELSE 0 END), 0)
      AS delta
    FROM public.accounts a
    LEFT JOIN public.transactions t
      ON t.user_id = a.user_id
     AND (t.account_id = a.id OR t.transfer_to_account_id = a.id)
    WHERE a.user_id = (SELECT id FROM uid)
    GROUP BY a.id
  )
  SELECT
    a.id,
    a.name,
    a.currency,
    a.account_type,
    a.icon,
    a.is_visible,
    a.sort_order,
    a.starting_balance,
    (a.starting_balance + COALESCE(agg.delta, 0))::bigint AS balance
  FROM public.accounts a
  LEFT JOIN agg ON agg.account_id = a.id
  WHERE a.user_id = (SELECT id FROM uid)
  ORDER BY a.sort_order;
$$;


ALTER FUNCTION "public"."get_account_balances"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_accounts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.accounts (user_id, name, icon, account_type, sort_order, starting_balance, currency)
  VALUES
    (NEW.id, 'Cash', 'banknote', 'cash', 0, 0, 'EUR'),
    (NEW.id, 'Card', 'credit-card', 'bank', 1, 0, 'EUR'),
    (NEW.id, 'Bank Account', 'landmark', 'bank', 2, 0, 'EUR');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_default_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_categories"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  needs_id UUID;
  wants_id UUID;
  inv_id UUID;
BEGIN
  INSERT INTO public.main_categories (user_id, name, color, sort_order) VALUES (NEW.id, 'Needs', '215 55% 52%', 0) RETURNING id INTO needs_id;
  INSERT INTO public.main_categories (user_id, name, color, sort_order) VALUES (NEW.id, 'Wants', '280 45% 55%', 1) RETURNING id INTO wants_id;
  INSERT INTO public.main_categories (user_id, name, color, sort_order) VALUES (NEW.id, 'Investments', '145 45% 42%', 2) RETURNING id INTO inv_id;

  INSERT INTO public.subcategories (user_id, main_category_id, name, icon, color, sort_order) VALUES
    (NEW.id, needs_id, 'Housing', 'home', '215 55% 52%', 0),
    (NEW.id, needs_id, 'Groceries', 'shopping-cart', '215 45% 58%', 1),
    (NEW.id, needs_id, 'Utilities', 'zap', '215 40% 48%', 2),
    (NEW.id, needs_id, 'Transport', 'car', '215 50% 45%', 3),
    (NEW.id, needs_id, 'Insurance', 'shield', '215 35% 50%', 4),
    (NEW.id, wants_id, 'Eating Out', 'utensils', '280 45% 55%', 0),
    (NEW.id, wants_id, 'Entertainment', 'film', '280 40% 50%', 1),
    (NEW.id, wants_id, 'Shopping', 'shopping-bag', '280 50% 60%', 2),
    (NEW.id, wants_id, 'Hobbies', 'palette', '280 35% 52%', 3),
    (NEW.id, inv_id, 'Emergency Fund', 'piggy-bank', '145 45% 42%', 0),
    (NEW.id, inv_id, 'Stocks', 'trending-up', '145 40% 48%', 1),
    (NEW.id, inv_id, 'Savings', 'landmark', '145 50% 38%', 2);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_default_categories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_shopping_defaults"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  produce_id UUID; meat_id UUID; dairy_id UUID; bakery_id UUID;
  pantry_id UUID; frozen_id UUID; drinks_id UUID; snacks_id UUID;
  house_id UUID; care_id UUID; baby_id UUID; other_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shopping_categories WHERE user_id = _user_id) THEN
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Produce',        '🥦', '120 45% 45%', 0, true) RETURNING id INTO produce_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Meat & Fish',    '🥩', '0 55% 50%',   1, true) RETURNING id INTO meat_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Dairy & Eggs',   '🥚', '45 75% 55%',  2, true) RETURNING id INTO dairy_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Bakery',         '🍞', '30 60% 55%',  3, true) RETURNING id INTO bakery_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Pantry',         '🥫', '25 45% 50%',  4, true) RETURNING id INTO pantry_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Frozen',         '🧊', '200 60% 60%', 5, true) RETURNING id INTO frozen_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Drinks',         '🥤', '215 55% 55%', 6, true) RETURNING id INTO drinks_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Snacks',         '🍫', '300 40% 55%', 7, true) RETURNING id INTO snacks_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Household',      '🧻', '210 15% 55%', 8, true) RETURNING id INTO house_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Personal Care',  '🧼', '330 50% 65%', 9, true) RETURNING id INTO care_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Baby',           '🍼', '190 55% 70%', 10, true) RETURNING id INTO baby_id;
    INSERT INTO public.shopping_categories (user_id, name, emoji, color, sort_order, is_default) VALUES
      (_user_id, 'Other',          '🛒', '0 0% 60%',    11, true) RETURNING id INTO other_id;
  ELSE
    SELECT id INTO produce_id FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Produce' LIMIT 1;
    SELECT id INTO meat_id    FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Meat & Fish' LIMIT 1;
    SELECT id INTO dairy_id   FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Dairy & Eggs' LIMIT 1;
    SELECT id INTO bakery_id  FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Bakery' LIMIT 1;
    SELECT id INTO pantry_id  FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Pantry' LIMIT 1;
    SELECT id INTO frozen_id  FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Frozen' LIMIT 1;
    SELECT id INTO drinks_id  FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Drinks' LIMIT 1;
    SELECT id INTO snacks_id  FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Snacks' LIMIT 1;
    SELECT id INTO house_id   FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Household' LIMIT 1;
    SELECT id INTO care_id    FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Personal Care' LIMIT 1;
    SELECT id INTO baby_id    FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Baby' LIMIT 1;
    SELECT id INTO other_id   FROM public.shopping_categories WHERE user_id = _user_id AND name = 'Other' LIMIT 1;
  END IF;

  INSERT INTO public.shopping_item_dictionary (user_id, normalized_name, display_name, language, category_id, translation_key) VALUES
    -- Produce
    (_user_id, 'apple', 'Apple', 'en', produce_id, 'apple'),
    (_user_id, 'apples', 'Apples', 'en', produce_id, 'apples'),
    (_user_id, 'banana', 'Banana', 'en', produce_id, 'banana'),
    (_user_id, 'bananas', 'Bananas', 'en', produce_id, 'bananas'),
    (_user_id, 'orange', 'Orange', 'en', produce_id, 'orange'),
    (_user_id, 'lemon', 'Lemon', 'en', produce_id, 'lemon'),
    (_user_id, 'lime', 'Lime', 'en', produce_id, 'lime'),
    (_user_id, 'grape', 'Grapes', 'en', produce_id, 'grapes'),
    (_user_id, 'grapes', 'Grapes', 'en', produce_id, 'grapes'),
    (_user_id, 'strawberry', 'Strawberries', 'en', produce_id, 'strawberries'),
    (_user_id, 'strawberries', 'Strawberries', 'en', produce_id, 'strawberries'),
    (_user_id, 'blueberry', 'Blueberries', 'en', produce_id, 'blueberries'),
    (_user_id, 'watermelon', 'Watermelon', 'en', produce_id, 'watermelon'),
    (_user_id, 'tomato', 'Tomato', 'en', produce_id, 'tomato'),
    (_user_id, 'tomatoes', 'Tomatoes', 'en', produce_id, 'tomatoes'),
    (_user_id, 'cucumber', 'Cucumber', 'en', produce_id, 'cucumber'),
    (_user_id, 'pepper', 'Pepper', 'en', produce_id, 'pepper'),
    (_user_id, 'peppers', 'Peppers', 'en', produce_id, 'pepper'),
    (_user_id, 'onion', 'Onion', 'en', produce_id, 'onion'),
    (_user_id, 'garlic', 'Garlic', 'en', produce_id, 'garlic'),
    (_user_id, 'potato', 'Potato', 'en', produce_id, 'potato'),
    (_user_id, 'potatoes', 'Potatoes', 'en', produce_id, 'potatoes'),
    (_user_id, 'carrot', 'Carrot', 'en', produce_id, 'carrot'),
    (_user_id, 'carrots', 'Carrots', 'en', produce_id, 'carrots'),
    (_user_id, 'lettuce', 'Lettuce', 'en', produce_id, 'lettuce'),
    (_user_id, 'salad', 'Salad', 'en', produce_id, 'salad'),
    (_user_id, 'spinach', 'Spinach', 'en', produce_id, 'spinach'),
    (_user_id, 'broccoli', 'Broccoli', 'en', produce_id, 'broccoli'),
    (_user_id, 'mushroom', 'Mushrooms', 'en', produce_id, 'mushrooms'),
    (_user_id, 'mushrooms', 'Mushrooms', 'en', produce_id, 'mushrooms'),
    (_user_id, 'zucchini', 'Zucchini', 'en', produce_id, 'zucchini'),
    (_user_id, 'eggplant', 'Eggplant', 'en', produce_id, 'eggplant'),
    (_user_id, 'avocado', 'Avocado', 'en', produce_id, 'avocado'),
    (_user_id, 'ябълка', 'Ябълка', 'bg', produce_id, 'apple'),
    (_user_id, 'ябълки', 'Ябълки', 'bg', produce_id, 'apples'),
    (_user_id, 'банан', 'Банан', 'bg', produce_id, 'banana'),
    (_user_id, 'банани', 'Банани', 'bg', produce_id, 'bananas'),
    (_user_id, 'портокал', 'Портокал', 'bg', produce_id, 'orange'),
    (_user_id, 'лимон', 'Лимон', 'bg', produce_id, 'lemon'),
    (_user_id, 'грозде', 'Грозде', 'bg', produce_id, 'grapes'),
    (_user_id, 'ягоди', 'Ягоди', 'bg', produce_id, 'strawberries'),
    (_user_id, 'боровинки', 'Боровинки', 'bg', produce_id, 'blueberries'),
    (_user_id, 'диня', 'Диня', 'bg', produce_id, 'watermelon'),
    (_user_id, 'пъпеш', 'Пъпеш', 'bg', produce_id, 'melon'),
    (_user_id, 'домат', 'Домат', 'bg', produce_id, 'tomato'),
    (_user_id, 'домати', 'Домати', 'bg', produce_id, 'tomatoes'),
    (_user_id, 'краставица', 'Краставица', 'bg', produce_id, 'cucumber'),
    (_user_id, 'краставици', 'Краставици', 'bg', produce_id, 'cucumber'),
    (_user_id, 'чушка', 'Чушка', 'bg', produce_id, 'pepper'),
    (_user_id, 'чушки', 'Чушки', 'bg', produce_id, 'pepper'),
    (_user_id, 'пипер', 'Пипер', 'bg', produce_id, 'pepper'),
    (_user_id, 'лук', 'Лук', 'bg', produce_id, 'onion'),
    (_user_id, 'чесън', 'Чесън', 'bg', produce_id, 'garlic'),
    (_user_id, 'картоф', 'Картоф', 'bg', produce_id, 'potato'),
    (_user_id, 'картофи', 'Картофи', 'bg', produce_id, 'potatoes'),
    (_user_id, 'морков', 'Морков', 'bg', produce_id, 'carrot'),
    (_user_id, 'моркови', 'Моркови', 'bg', produce_id, 'carrots'),
    (_user_id, 'маруля', 'Маруля', 'bg', produce_id, 'lettuce'),
    (_user_id, 'салата', 'Салата', 'bg', produce_id, 'salad'),
    (_user_id, 'спанак', 'Спанак', 'bg', produce_id, 'spinach'),
    (_user_id, 'броколи', 'Броколи', 'bg', produce_id, 'broccoli'),
    (_user_id, 'гъби', 'Гъби', 'bg', produce_id, 'mushrooms'),
    (_user_id, 'тиквичка', 'Тиквичка', 'bg', produce_id, 'zucchini'),
    (_user_id, 'тиквички', 'Тиквички', 'bg', produce_id, 'zucchini'),
    (_user_id, 'патладжан', 'Патладжан', 'bg', produce_id, 'eggplant'),
    (_user_id, 'авокадо', 'Авокадо', 'bg', produce_id, 'avocado'),
    -- Meat & Fish
    (_user_id, 'chicken', 'Chicken', 'en', meat_id, 'chicken'),
    (_user_id, 'beef', 'Beef', 'en', meat_id, 'beef'),
    (_user_id, 'pork', 'Pork', 'en', meat_id, 'pork'),
    (_user_id, 'lamb', 'Lamb', 'en', meat_id, 'lamb'),
    (_user_id, 'turkey', 'Turkey', 'en', meat_id, 'turkey'),
    (_user_id, 'bacon', 'Bacon', 'en', meat_id, 'bacon'),
    (_user_id, 'sausage', 'Sausage', 'en', meat_id, 'sausage'),
    (_user_id, 'sausages', 'Sausages', 'en', meat_id, 'sausages'),
    (_user_id, 'ham', 'Ham', 'en', meat_id, 'ham'),
    (_user_id, 'salami', 'Salami', 'en', meat_id, 'salami'),
    (_user_id, 'fish', 'Fish', 'en', meat_id, 'fish'),
    (_user_id, 'salmon', 'Salmon', 'en', meat_id, 'salmon'),
    (_user_id, 'tuna', 'Tuna', 'en', meat_id, 'tuna'),
    (_user_id, 'shrimp', 'Shrimp', 'en', meat_id, 'shrimp'),
    (_user_id, 'mince', 'Mince', 'en', meat_id, 'mince'),
    (_user_id, 'пиле', 'Пиле', 'bg', meat_id, 'chicken'),
    (_user_id, 'пилешко', 'Пилешко', 'bg', meat_id, 'chicken'),
    (_user_id, 'телешко', 'Телешко', 'bg', meat_id, 'beef'),
    (_user_id, 'свинско', 'Свинско', 'bg', meat_id, 'pork'),
    (_user_id, 'агнешко', 'Агнешко', 'bg', meat_id, 'lamb'),
    (_user_id, 'пуйка', 'Пуйка', 'bg', meat_id, 'turkey'),
    (_user_id, 'бекон', 'Бекон', 'bg', meat_id, 'bacon'),
    (_user_id, 'наденица', 'Наденица', 'bg', meat_id, 'sausage'),
    (_user_id, 'кренвирши', 'Кренвирши', 'bg', meat_id, 'sausages'),
    (_user_id, 'шунка', 'Шунка', 'bg', meat_id, 'ham'),
    (_user_id, 'салам', 'Салам', 'bg', meat_id, 'salami'),
    (_user_id, 'луканка', 'Луканка', 'bg', meat_id, 'salami'),
    (_user_id, 'риба', 'Риба', 'bg', meat_id, 'fish'),
    (_user_id, 'сьомга', 'Сьомга', 'bg', meat_id, 'salmon'),
    (_user_id, 'тон', 'Тон', 'bg', meat_id, 'tuna'),
    (_user_id, 'скариди', 'Скариди', 'bg', meat_id, 'shrimp'),
    (_user_id, 'кайма', 'Кайма', 'bg', meat_id, 'mince'),
    -- Dairy & Eggs
    (_user_id, 'milk', 'Milk', 'en', dairy_id, 'milk'),
    (_user_id, 'egg', 'Eggs', 'en', dairy_id, 'eggs'),
    (_user_id, 'eggs', 'Eggs', 'en', dairy_id, 'eggs'),
    (_user_id, 'cheese', 'Cheese', 'en', dairy_id, 'cheese'),
    (_user_id, 'feta', 'Feta', 'en', dairy_id, 'feta'),
    (_user_id, 'yogurt', 'Yogurt', 'en', dairy_id, 'yogurt'),
    (_user_id, 'yoghurt', 'Yogurt', 'en', dairy_id, 'yogurt'),
    (_user_id, 'butter', 'Butter', 'en', dairy_id, 'butter'),
    (_user_id, 'cream', 'Cream', 'en', dairy_id, 'cream'),
    (_user_id, 'sour cream', 'Sour Cream', 'en', dairy_id, 'sour cream'),
    (_user_id, 'mozzarella', 'Mozzarella', 'en', dairy_id, 'mozzarella'),
    (_user_id, 'parmesan', 'Parmesan', 'en', dairy_id, 'parmesan'),
    (_user_id, 'мляко', 'Мляко', 'bg', dairy_id, 'milk'),
    (_user_id, 'кисело мляко', 'Кисело мляко', 'bg', dairy_id, 'yogurt'),
    (_user_id, 'яйце', 'Яйца', 'bg', dairy_id, 'eggs'),
    (_user_id, 'яйца', 'Яйца', 'bg', dairy_id, 'eggs'),
    (_user_id, 'сирене', 'Сирене', 'bg', dairy_id, 'cheese'),
    (_user_id, 'кашкавал', 'Кашкавал', 'bg', dairy_id, 'yellow cheese'),
    (_user_id, 'извара', 'Извара', 'bg', dairy_id, 'cottage cheese'),
    (_user_id, 'масло', 'Масло', 'bg', dairy_id, 'butter'),
    (_user_id, 'сметана', 'Сметана', 'bg', dairy_id, 'cream'),
    (_user_id, 'крема сирене', 'Крема сирене', 'bg', dairy_id, 'cream cheese'),
    (_user_id, 'моцарела', 'Моцарела', 'bg', dairy_id, 'mozzarella'),
    (_user_id, 'пармезан', 'Пармезан', 'bg', dairy_id, 'parmesan'),
    -- Bakery
    (_user_id, 'bread', 'Bread', 'en', bakery_id, 'bread'),
    (_user_id, 'baguette', 'Baguette', 'en', bakery_id, 'baguette'),
    (_user_id, 'bun', 'Buns', 'en', bakery_id, 'buns'),
    (_user_id, 'buns', 'Buns', 'en', bakery_id, 'buns'),
    (_user_id, 'roll', 'Rolls', 'en', bakery_id, 'rolls'),
    (_user_id, 'rolls', 'Rolls', 'en', bakery_id, 'rolls'),
    (_user_id, 'croissant', 'Croissant', 'en', bakery_id, 'croissant'),
    (_user_id, 'toast', 'Toast Bread', 'en', bakery_id, 'toast bread'),
    (_user_id, 'pita', 'Pita', 'en', bakery_id, 'pita'),
    (_user_id, 'хляб', 'Хляб', 'bg', bakery_id, 'bread'),
    (_user_id, 'питка', 'Питка', 'bg', bakery_id, 'pita'),
    (_user_id, 'багета', 'Багета', 'bg', bakery_id, 'baguette'),
    (_user_id, 'кифла', 'Кифла', 'bg', bakery_id, 'buns'),
    (_user_id, 'кифли', 'Кифли', 'bg', bakery_id, 'buns'),
    (_user_id, 'кроасан', 'Кроасан', 'bg', bakery_id, 'croissant'),
    (_user_id, 'тостер хляб', 'Тостер хляб', 'bg', bakery_id, 'toast bread'),
    (_user_id, 'банички', 'Банички', 'bg', bakery_id, 'banitsa'),
    (_user_id, 'баница', 'Баница', 'bg', bakery_id, 'banitsa'),
    -- Pantry
    (_user_id, 'rice', 'Rice', 'en', pantry_id, 'rice'),
    (_user_id, 'pasta', 'Pasta', 'en', pantry_id, 'pasta'),
    (_user_id, 'spaghetti', 'Spaghetti', 'en', pantry_id, 'spaghetti'),
    (_user_id, 'flour', 'Flour', 'en', pantry_id, 'flour'),
    (_user_id, 'sugar', 'Sugar', 'en', pantry_id, 'sugar'),
    (_user_id, 'salt', 'Salt', 'en', pantry_id, 'salt'),
    (_user_id, 'oil', 'Oil', 'en', pantry_id, 'oil'),
    (_user_id, 'olive oil', 'Olive Oil', 'en', pantry_id, 'olive oil'),
    (_user_id, 'vinegar', 'Vinegar', 'en', pantry_id, 'vinegar'),
    (_user_id, 'beans', 'Beans', 'en', pantry_id, 'beans'),
    (_user_id, 'lentils', 'Lentils', 'en', pantry_id, 'lentils'),
    (_user_id, 'oats', 'Oats', 'en', pantry_id, 'oats'),
    (_user_id, 'cereal', 'Cereal', 'en', pantry_id, 'cereal'),
    (_user_id, 'honey', 'Honey', 'en', pantry_id, 'honey'),
    (_user_id, 'jam', 'Jam', 'en', pantry_id, 'jam'),
    (_user_id, 'peanut butter', 'Peanut Butter', 'en', pantry_id, 'peanut butter'),
    (_user_id, 'ketchup', 'Ketchup', 'en', pantry_id, 'ketchup'),
    (_user_id, 'mustard', 'Mustard', 'en', pantry_id, 'mustard'),
    (_user_id, 'mayonnaise', 'Mayonnaise', 'en', pantry_id, 'mayonnaise'),
    (_user_id, 'mayo', 'Mayonnaise', 'en', pantry_id, 'mayonnaise'),
    (_user_id, 'tea', 'Tea', 'en', pantry_id, 'tea'),
    (_user_id, 'coffee', 'Coffee', 'en', pantry_id, 'coffee'),
    (_user_id, 'ориз', 'Ориз', 'bg', pantry_id, 'rice'),
    (_user_id, 'паста', 'Паста', 'bg', pantry_id, 'pasta'),
    (_user_id, 'макарони', 'Макарони', 'bg', pantry_id, 'pasta'),
    (_user_id, 'спагети', 'Спагети', 'bg', pantry_id, 'spaghetti'),
    (_user_id, 'брашно', 'Брашно', 'bg', pantry_id, 'flour'),
    (_user_id, 'захар', 'Захар', 'bg', pantry_id, 'sugar'),
    (_user_id, 'сол', 'Сол', 'bg', pantry_id, 'salt'),
    (_user_id, 'олио', 'Олио', 'bg', pantry_id, 'oil'),
    (_user_id, 'зехтин', 'Зехтин', 'bg', pantry_id, 'olive oil'),
    (_user_id, 'оцет', 'Оцет', 'bg', pantry_id, 'vinegar'),
    (_user_id, 'боб', 'Боб', 'bg', pantry_id, 'beans'),
    (_user_id, 'леща', 'Леща', 'bg', pantry_id, 'lentils'),
    (_user_id, 'овесени ядки', 'Овесени ядки', 'bg', pantry_id, 'oats'),
    (_user_id, 'мюсли', 'Мюсли', 'bg', pantry_id, 'cereal'),
    (_user_id, 'корнфлейкс', 'Корнфлейкс', 'bg', pantry_id, 'cereal'),
    (_user_id, 'мед', 'Мед', 'bg', pantry_id, 'honey'),
    (_user_id, 'конфитюр', 'Конфитюр', 'bg', pantry_id, 'jam'),
    (_user_id, 'фъстъчено масло', 'Фъстъчено масло', 'bg', pantry_id, 'peanut butter'),
    (_user_id, 'кетчуп', 'Кетчуп', 'bg', pantry_id, 'ketchup'),
    (_user_id, 'горчица', 'Горчица', 'bg', pantry_id, 'mustard'),
    (_user_id, 'майонеза', 'Майонеза', 'bg', pantry_id, 'mayonnaise'),
    (_user_id, 'чай', 'Чай', 'bg', pantry_id, 'tea'),
    (_user_id, 'кафе', 'Кафе', 'bg', pantry_id, 'coffee'),
    -- Frozen
    (_user_id, 'ice cream', 'Ice Cream', 'en', frozen_id, 'ice cream'),
    (_user_id, 'frozen pizza', 'Frozen Pizza', 'en', frozen_id, 'frozen pizza'),
    (_user_id, 'frozen vegetables', 'Frozen Vegetables', 'en', frozen_id, 'frozen vegetables'),
    (_user_id, 'frozen fries', 'Frozen Fries', 'en', frozen_id, 'frozen fries'),
    (_user_id, 'сладолед', 'Сладолед', 'bg', frozen_id, 'ice cream'),
    (_user_id, 'замразена пица', 'Замразена пица', 'bg', frozen_id, 'frozen pizza'),
    (_user_id, 'замразени зеленчуци', 'Замразени зеленчуци', 'bg', frozen_id, 'frozen vegetables'),
    (_user_id, 'пържени картофи', 'Пържени картофи', 'bg', frozen_id, 'frozen fries'),
    -- Drinks
    (_user_id, 'water', 'Water', 'en', drinks_id, 'water'),
    (_user_id, 'sparkling water', 'Sparkling Water', 'en', drinks_id, 'sparkling water'),
    (_user_id, 'juice', 'Juice', 'en', drinks_id, 'juice'),
    (_user_id, 'cola', 'Cola', 'en', drinks_id, 'cola'),
    (_user_id, 'coke', 'Cola', 'en', drinks_id, 'cola'),
    (_user_id, 'beer', 'Beer', 'en', drinks_id, 'beer'),
    (_user_id, 'wine', 'Wine', 'en', drinks_id, 'wine'),
    (_user_id, 'soda', 'Soda', 'en', drinks_id, 'soda'),
    (_user_id, 'вода', 'Вода', 'bg', drinks_id, 'water'),
    (_user_id, 'газирана вода', 'Газирана вода', 'bg', drinks_id, 'sparkling water'),
    (_user_id, 'минерална вода', 'Минерална вода', 'bg', drinks_id, 'sparkling water'),
    (_user_id, 'сок', 'Сок', 'bg', drinks_id, 'juice'),
    (_user_id, 'кола', 'Кола', 'bg', drinks_id, 'cola'),
    (_user_id, 'бира', 'Бира', 'bg', drinks_id, 'beer'),
    (_user_id, 'вино', 'Вино', 'bg', drinks_id, 'wine'),
    (_user_id, 'безалкохолно', 'Безалкохолно', 'bg', drinks_id, 'soda'),
    -- Snacks
    (_user_id, 'chocolate', 'Chocolate', 'en', snacks_id, 'chocolate'),
    (_user_id, 'chips', 'Chips', 'en', snacks_id, 'chips'),
    (_user_id, 'crisps', 'Crisps', 'en', snacks_id, 'chips'),
    (_user_id, 'cookies', 'Cookies', 'en', snacks_id, 'cookies'),
    (_user_id, 'biscuits', 'Biscuits', 'en', snacks_id, 'cookies'),
    (_user_id, 'candy', 'Candy', 'en', snacks_id, 'candy'),
    (_user_id, 'nuts', 'Nuts', 'en', snacks_id, 'nuts'),
    (_user_id, 'almonds', 'Almonds', 'en', snacks_id, 'almonds'),
    (_user_id, 'walnuts', 'Walnuts', 'en', snacks_id, 'walnuts'),
    (_user_id, 'popcorn', 'Popcorn', 'en', snacks_id, 'popcorn'),
    (_user_id, 'шоколад', 'Шоколад', 'bg', snacks_id, 'chocolate'),
    (_user_id, 'чипс', 'Чипс', 'bg', snacks_id, 'chips'),
    (_user_id, 'бисквити', 'Бисквити', 'bg', snacks_id, 'cookies'),
    (_user_id, 'вафла', 'Вафла', 'bg', snacks_id, 'wafers'),
    (_user_id, 'вафли', 'Вафли', 'bg', snacks_id, 'wafers'),
    (_user_id, 'бонбони', 'Бонбони', 'bg', snacks_id, 'candy'),
    (_user_id, 'ядки', 'Ядки', 'bg', snacks_id, 'nuts'),
    (_user_id, 'бадеми', 'Бадеми', 'bg', snacks_id, 'almonds'),
    (_user_id, 'орехи', 'Орехи', 'bg', snacks_id, 'walnuts'),
    (_user_id, 'фъстъци', 'Фъстъци', 'bg', snacks_id, 'peanuts'),
    (_user_id, 'пуканки', 'Пуканки', 'bg', snacks_id, 'popcorn'),
    -- Household
    (_user_id, 'toilet paper', 'Toilet Paper', 'en', house_id, 'toilet paper'),
    (_user_id, 'paper towels', 'Paper Towels', 'en', house_id, 'paper towels'),
    (_user_id, 'napkins', 'Napkins', 'en', house_id, 'napkins'),
    (_user_id, 'dish soap', 'Dish Soap', 'en', house_id, 'dish soap'),
    (_user_id, 'detergent', 'Detergent', 'en', house_id, 'detergent'),
    (_user_id, 'trash bags', 'Trash Bags', 'en', house_id, 'trash bags'),
    (_user_id, 'foil', 'Aluminium Foil', 'en', house_id, 'foil'),
    (_user_id, 'cling film', 'Cling Film', 'en', house_id, 'cling film'),
    (_user_id, 'sponge', 'Sponge', 'en', house_id, 'sponge'),
    (_user_id, 'тоалетна хартия', 'Тоалетна хартия', 'bg', house_id, 'toilet paper'),
    (_user_id, 'кухненска хартия', 'Кухненска хартия', 'bg', house_id, 'paper towels'),
    (_user_id, 'салфетки', 'Салфетки', 'bg', house_id, 'napkins'),
    (_user_id, 'препарат за съдове', 'Препарат за съдове', 'bg', house_id, 'dish soap'),
    (_user_id, 'прах за пране', 'Прах за пране', 'bg', house_id, 'detergent'),
    (_user_id, 'чували за боклук', 'Чували за боклук', 'bg', house_id, 'trash bags'),
    (_user_id, 'алуминиево фолио', 'Алуминиево фолио', 'bg', house_id, 'foil'),
    (_user_id, 'стреч фолио', 'Стреч фолио', 'bg', house_id, 'cling film'),
    (_user_id, 'гъба за съдове', 'Гъба за съдове', 'bg', house_id, 'sponge'),
    -- Personal Care
    (_user_id, 'shampoo', 'Shampoo', 'en', care_id, 'shampoo'),
    (_user_id, 'conditioner', 'Conditioner', 'en', care_id, 'conditioner'),
    (_user_id, 'soap', 'Soap', 'en', care_id, 'soap'),
    (_user_id, 'shower gel', 'Shower Gel', 'en', care_id, 'shower gel'),
    (_user_id, 'toothpaste', 'Toothpaste', 'en', care_id, 'toothpaste'),
    (_user_id, 'toothbrush', 'Toothbrush', 'en', care_id, 'toothbrush'),
    (_user_id, 'deodorant', 'Deodorant', 'en', care_id, 'deodorant'),
    (_user_id, 'razor', 'Razor', 'en', care_id, 'razor'),
    (_user_id, 'шампоан', 'Шампоан', 'bg', care_id, 'shampoo'),
    (_user_id, 'балсам', 'Балсам', 'bg', care_id, 'conditioner'),
    (_user_id, 'сапун', 'Сапун', 'bg', care_id, 'soap'),
    (_user_id, 'душ гел', 'Душ гел', 'bg', care_id, 'shower gel'),
    (_user_id, 'паста за зъби', 'Паста за зъби', 'bg', care_id, 'toothpaste'),
    (_user_id, 'четка за зъби', 'Четка за зъби', 'bg', care_id, 'toothbrush'),
    (_user_id, 'дезодорант', 'Дезодорант', 'bg', care_id, 'deodorant'),
    (_user_id, 'самобръсначка', 'Самобръсначка', 'bg', care_id, 'razor'),
    -- Baby
    (_user_id, 'diapers', 'Diapers', 'en', baby_id, 'diapers'),
    (_user_id, 'baby wipes', 'Baby Wipes', 'en', baby_id, 'baby wipes'),
    (_user_id, 'baby formula', 'Baby Formula', 'en', baby_id, 'baby formula'),
    (_user_id, 'пелени', 'Пелени', 'bg', baby_id, 'diapers'),
    (_user_id, 'мокри кърпи', 'Мокри кърпи', 'bg', baby_id, 'baby wipes'),
    (_user_id, 'адаптирано мляко', 'Адаптирано мляко', 'bg', baby_id, 'baby formula')
  ON CONFLICT (user_id, normalized_name) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_shopping_defaults"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_shopping_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.seed_shopping_defaults(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_shopping_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'wallet'::"text" NOT NULL,
    "account_type" "text" DEFAULT 'bank'::"text" NOT NULL,
    "starting_balance" bigint DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subcategory_id" "uuid" NOT NULL,
    "month_year" "text" NOT NULL,
    "amount" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "alert_threshold" integer DEFAULT 90 NOT NULL
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."main_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '215 55% 52%'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."main_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "raw_text" "text" DEFAULT ''::"text" NOT NULL,
    "parsed_amount" bigint,
    "parsed_note" "text" DEFAULT ''::"text",
    "account_id" "uuid",
    "subcategory_id" "uuid",
    "transaction_type" "text" DEFAULT 'expense'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "subcategory_id" "uuid",
    "transaction_type" "text" DEFAULT 'expense'::"text" NOT NULL,
    "amount" bigint NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "next_due_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text" DEFAULT ''::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "transfer_to_account_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recurring_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "emoji" "text" DEFAULT '🛒'::"text" NOT NULL,
    "color" "text" DEFAULT '145 30% 50%'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shopping_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_item_dictionary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "language" "text" DEFAULT 'other'::"text" NOT NULL,
    "category_id" "uuid",
    "usage_count" integer DEFAULT 0 NOT NULL,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "translation_key" "text",
    CONSTRAINT "shopping_item_dictionary_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'bg'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."shopping_item_dictionary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit" "text",
    "checked" boolean DEFAULT false NOT NULL,
    "price_cents" bigint,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "promo_stores" "text"[],
    "promo_price_cents" bigint,
    "promo_checked_at" timestamp with time zone,
    "promo_pack_size" integer,
    "promo_offers" "jsonb",
    "actual_price_cents" bigint,
    "is_excess" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."shopping_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_promotions_cache" (
    "id" integer DEFAULT 1 NOT NULL,
    "promos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "singleton" CHECK (("id" = 1))
);


ALTER TABLE "public"."shopping_promotions_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "total_cents" bigint,
    "receipt_path" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shopping_trips_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."shopping_trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "main_category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'circle'::"text" NOT NULL,
    "color" "text" DEFAULT '168 35% 38%'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "account_id" "uuid",
    "subcategory_id" "uuid",
    "transaction_type" "text" DEFAULT 'expense'::"text" NOT NULL,
    "amount" bigint,
    "note" "text" DEFAULT ''::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaction_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "subcategory_id" "uuid",
    "transaction_type" "text" DEFAULT 'expense'::"text" NOT NULL,
    "amount" bigint NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text" DEFAULT ''::"text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "transfer_to_account_id" "uuid",
    "recurring_transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_subcategory_id_month_year_key" UNIQUE ("user_id", "subcategory_id", "month_year");



ALTER TABLE ONLY "public"."main_categories"
    ADD CONSTRAINT "main_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_transactions"
    ADD CONSTRAINT "pending_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_categories"
    ADD CONSTRAINT "shopping_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_item_dictionary"
    ADD CONSTRAINT "shopping_item_dictionary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_item_dictionary"
    ADD CONSTRAINT "shopping_item_dictionary_user_id_normalized_name_key" UNIQUE ("user_id", "normalized_name");



ALTER TABLE ONLY "public"."shopping_items"
    ADD CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_promotions_cache"
    ADD CONSTRAINT "shopping_promotions_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_trips"
    ADD CONSTRAINT "shopping_trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_templates"
    ADD CONSTRAINT "transaction_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_shopping_categories_user" ON "public"."shopping_categories" USING "btree" ("user_id", "sort_order");



CREATE INDEX "idx_shopping_dict_user_name" ON "public"."shopping_item_dictionary" USING "btree" ("user_id", "normalized_name");



CREATE INDEX "idx_shopping_dict_user_usage" ON "public"."shopping_item_dictionary" USING "btree" ("user_id", "usage_count" DESC);



CREATE INDEX "idx_shopping_items_trip" ON "public"."shopping_items" USING "btree" ("trip_id", "checked", "sort_order");



CREATE INDEX "idx_shopping_trips_user_status" ON "public"."shopping_trips" USING "btree" ("user_id", "status", "started_at" DESC);



CREATE INDEX "idx_transactions_account" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("user_id", "date");



CREATE INDEX "idx_transactions_subcategory" ON "public"."transactions" USING "btree" ("subcategory_id");



CREATE INDEX "idx_transactions_user_account" ON "public"."transactions" USING "btree" ("user_id", "account_id");



CREATE INDEX "idx_transactions_user_transfer_to" ON "public"."transactions" USING "btree" ("user_id", "transfer_to_account_id") WHERE ("transfer_to_account_id" IS NOT NULL);



CREATE INDEX "shopping_item_dictionary_translation_key_idx" ON "public"."shopping_item_dictionary" USING "btree" ("user_id", "translation_key");



CREATE OR REPLACE TRIGGER "on_auth_user_created_seed_accounts" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."seed_default_accounts"();



CREATE OR REPLACE TRIGGER "trg_shopping_categories_updated" BEFORE UPDATE ON "public"."shopping_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shopping_dict_updated" BEFORE UPDATE ON "public"."shopping_item_dictionary" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shopping_items_updated" BEFORE UPDATE ON "public"."shopping_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_shopping_trips_updated" BEFORE UPDATE ON "public"."shopping_trips" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."main_categories"
    ADD CONSTRAINT "main_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_transactions"
    ADD CONSTRAINT "pending_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_transactions"
    ADD CONSTRAINT "pending_transactions_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_transfer_to_account_id_fkey" FOREIGN KEY ("transfer_to_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_categories"
    ADD CONSTRAINT "shopping_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_item_dictionary"
    ADD CONSTRAINT "shopping_item_dictionary_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."shopping_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopping_item_dictionary"
    ADD CONSTRAINT "shopping_item_dictionary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_items"
    ADD CONSTRAINT "shopping_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."shopping_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopping_items"
    ADD CONSTRAINT "shopping_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."shopping_trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_items"
    ADD CONSTRAINT "shopping_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_trips"
    ADD CONSTRAINT "shopping_trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_main_category_id_fkey" FOREIGN KEY ("main_category_id") REFERENCES "public"."main_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subcategories"
    ADD CONSTRAINT "subcategories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_templates"
    ADD CONSTRAINT "transaction_templates_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_templates"
    ADD CONSTRAINT "transaction_templates_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_templates"
    ADD CONSTRAINT "transaction_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_transfer_to_account_id_fkey" FOREIGN KEY ("transfer_to_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated can read promo cache" ON "public"."shopping_promotions_cache" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users manage own accounts" ON "public"."accounts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own budgets" ON "public"."budgets" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own main_categories" ON "public"."main_categories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own pending_transactions" ON "public"."pending_transactions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own recurring" ON "public"."recurring_transactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own shopping categories" ON "public"."shopping_categories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own shopping dictionary" ON "public"."shopping_item_dictionary" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own shopping items" ON "public"."shopping_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own shopping trips" ON "public"."shopping_trips" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own subcategories" ON "public"."subcategories" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own templates" ON "public"."transaction_templates" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own transactions" ON "public"."transactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."main_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_item_dictionary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_promotions_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subcategories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



















































































































































GRANT ALL ON FUNCTION "public"."get_account_balances"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_balances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_balances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_accounts"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_accounts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_categories"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_categories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_categories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_shopping_defaults"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_shopping_defaults"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_shopping_defaults"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_shopping_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_shopping_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_shopping_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";












GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."main_categories" TO "anon";
GRANT ALL ON TABLE "public"."main_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."main_categories" TO "service_role";



GRANT ALL ON TABLE "public"."pending_transactions" TO "anon";
GRANT ALL ON TABLE "public"."pending_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_transactions" TO "anon";
GRANT ALL ON TABLE "public"."recurring_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_categories" TO "anon";
GRANT ALL ON TABLE "public"."shopping_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_categories" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_item_dictionary" TO "anon";
GRANT ALL ON TABLE "public"."shopping_item_dictionary" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_item_dictionary" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_items" TO "anon";
GRANT ALL ON TABLE "public"."shopping_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_items" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_promotions_cache" TO "anon";
GRANT ALL ON TABLE "public"."shopping_promotions_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_promotions_cache" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_trips" TO "anon";
GRANT ALL ON TABLE "public"."shopping_trips" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_trips" TO "service_role";



GRANT ALL ON TABLE "public"."subcategories" TO "anon";
GRANT ALL ON TABLE "public"."subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_templates" TO "anon";
GRANT ALL ON TABLE "public"."transaction_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_templates" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































