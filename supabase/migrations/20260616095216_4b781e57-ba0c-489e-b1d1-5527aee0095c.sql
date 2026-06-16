
-- ============ SHOPPING LIST SCHEMA ============

CREATE TABLE public.shopping_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🛒',
  color TEXT NOT NULL DEFAULT '145 30% 50%',
  sort_order INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_categories TO authenticated;
GRANT ALL ON public.shopping_categories TO service_role;
ALTER TABLE public.shopping_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shopping categories" ON public.shopping_categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_shopping_categories_updated BEFORE UPDATE ON public.shopping_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX idx_shopping_categories_user ON public.shopping_categories(user_id, sort_order);

CREATE TABLE public.shopping_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_cents BIGINT,
  receipt_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_trips TO authenticated;
GRANT ALL ON public.shopping_trips TO service_role;
ALTER TABLE public.shopping_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shopping trips" ON public.shopping_trips
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_shopping_trips_updated BEFORE UPDATE ON public.shopping_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX idx_shopping_trips_user_status ON public.shopping_trips(user_id, status, started_at DESC);

CREATE TABLE public.shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.shopping_trips(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.shopping_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit TEXT,
  checked BOOLEAN NOT NULL DEFAULT false,
  price_cents BIGINT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shopping items" ON public.shopping_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_shopping_items_updated BEFORE UPDATE ON public.shopping_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX idx_shopping_items_trip ON public.shopping_items(trip_id, checked, sort_order);

CREATE TABLE public.shopping_item_dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'other' CHECK (language IN ('en','bg','other')),
  category_id UUID REFERENCES public.shopping_categories(id) ON DELETE SET NULL,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, normalized_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_item_dictionary TO authenticated;
GRANT ALL ON public.shopping_item_dictionary TO service_role;
ALTER TABLE public.shopping_item_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shopping dictionary" ON public.shopping_item_dictionary
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_shopping_dict_updated BEFORE UPDATE ON public.shopping_item_dictionary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX idx_shopping_dict_user_name ON public.shopping_item_dictionary(user_id, normalized_name);
CREATE INDEX idx_shopping_dict_user_usage ON public.shopping_item_dictionary(user_id, usage_count DESC);

-- ============ SEEDING ============

CREATE OR REPLACE FUNCTION public.seed_shopping_defaults(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  produce_id UUID; meat_id UUID; dairy_id UUID; bakery_id UUID;
  pantry_id UUID; frozen_id UUID; drinks_id UUID; snacks_id UUID;
  house_id UUID; care_id UUID; baby_id UUID; other_id UUID;
BEGIN
  -- Categories
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

  -- Dictionary (bilingual). Upsert so it's idempotent.
  INSERT INTO public.shopping_item_dictionary (user_id, normalized_name, display_name, language, category_id) VALUES
    -- Produce EN
    (_user_id, 'apple', 'Apple', 'en', produce_id),
    (_user_id, 'apples', 'Apples', 'en', produce_id),
    (_user_id, 'banana', 'Banana', 'en', produce_id),
    (_user_id, 'bananas', 'Bananas', 'en', produce_id),
    (_user_id, 'orange', 'Orange', 'en', produce_id),
    (_user_id, 'lemon', 'Lemon', 'en', produce_id),
    (_user_id, 'lime', 'Lime', 'en', produce_id),
    (_user_id, 'grape', 'Grapes', 'en', produce_id),
    (_user_id, 'grapes', 'Grapes', 'en', produce_id),
    (_user_id, 'strawberry', 'Strawberries', 'en', produce_id),
    (_user_id, 'strawberries', 'Strawberries', 'en', produce_id),
    (_user_id, 'blueberry', 'Blueberries', 'en', produce_id),
    (_user_id, 'watermelon', 'Watermelon', 'en', produce_id),
    (_user_id, 'tomato', 'Tomato', 'en', produce_id),
    (_user_id, 'tomatoes', 'Tomatoes', 'en', produce_id),
    (_user_id, 'cucumber', 'Cucumber', 'en', produce_id),
    (_user_id, 'pepper', 'Pepper', 'en', produce_id),
    (_user_id, 'peppers', 'Peppers', 'en', produce_id),
    (_user_id, 'onion', 'Onion', 'en', produce_id),
    (_user_id, 'garlic', 'Garlic', 'en', produce_id),
    (_user_id, 'potato', 'Potato', 'en', produce_id),
    (_user_id, 'potatoes', 'Potatoes', 'en', produce_id),
    (_user_id, 'carrot', 'Carrot', 'en', produce_id),
    (_user_id, 'carrots', 'Carrots', 'en', produce_id),
    (_user_id, 'lettuce', 'Lettuce', 'en', produce_id),
    (_user_id, 'salad', 'Salad', 'en', produce_id),
    (_user_id, 'spinach', 'Spinach', 'en', produce_id),
    (_user_id, 'broccoli', 'Broccoli', 'en', produce_id),
    (_user_id, 'mushroom', 'Mushrooms', 'en', produce_id),
    (_user_id, 'mushrooms', 'Mushrooms', 'en', produce_id),
    (_user_id, 'zucchini', 'Zucchini', 'en', produce_id),
    (_user_id, 'eggplant', 'Eggplant', 'en', produce_id),
    (_user_id, 'avocado', 'Avocado', 'en', produce_id),
    -- Produce BG
    (_user_id, 'ябълка', 'Ябълка', 'bg', produce_id),
    (_user_id, 'ябълки', 'Ябълки', 'bg', produce_id),
    (_user_id, 'банан', 'Банан', 'bg', produce_id),
    (_user_id, 'банани', 'Банани', 'bg', produce_id),
    (_user_id, 'портокал', 'Портокал', 'bg', produce_id),
    (_user_id, 'лимон', 'Лимон', 'bg', produce_id),
    (_user_id, 'грозде', 'Грозде', 'bg', produce_id),
    (_user_id, 'ягоди', 'Ягоди', 'bg', produce_id),
    (_user_id, 'боровинки', 'Боровинки', 'bg', produce_id),
    (_user_id, 'диня', 'Диня', 'bg', produce_id),
    (_user_id, 'пъпеш', 'Пъпеш', 'bg', produce_id),
    (_user_id, 'домат', 'Домат', 'bg', produce_id),
    (_user_id, 'домати', 'Домати', 'bg', produce_id),
    (_user_id, 'краставица', 'Краставица', 'bg', produce_id),
    (_user_id, 'краставици', 'Краставици', 'bg', produce_id),
    (_user_id, 'чушка', 'Чушка', 'bg', produce_id),
    (_user_id, 'чушки', 'Чушки', 'bg', produce_id),
    (_user_id, 'пипер', 'Пипер', 'bg', produce_id),
    (_user_id, 'лук', 'Лук', 'bg', produce_id),
    (_user_id, 'чесън', 'Чесън', 'bg', produce_id),
    (_user_id, 'картоф', 'Картоф', 'bg', produce_id),
    (_user_id, 'картофи', 'Картофи', 'bg', produce_id),
    (_user_id, 'морков', 'Морков', 'bg', produce_id),
    (_user_id, 'моркови', 'Моркови', 'bg', produce_id),
    (_user_id, 'маруля', 'Маруля', 'bg', produce_id),
    (_user_id, 'салата', 'Салата', 'bg', produce_id),
    (_user_id, 'спанак', 'Спанак', 'bg', produce_id),
    (_user_id, 'броколи', 'Броколи', 'bg', produce_id),
    (_user_id, 'гъби', 'Гъби', 'bg', produce_id),
    (_user_id, 'тиквичка', 'Тиквичка', 'bg', produce_id),
    (_user_id, 'тиквички', 'Тиквички', 'bg', produce_id),
    (_user_id, 'патладжан', 'Патладжан', 'bg', produce_id),
    (_user_id, 'авокадо', 'Авокадо', 'bg', produce_id),
    -- Meat & Fish EN
    (_user_id, 'chicken', 'Chicken', 'en', meat_id),
    (_user_id, 'beef', 'Beef', 'en', meat_id),
    (_user_id, 'pork', 'Pork', 'en', meat_id),
    (_user_id, 'lamb', 'Lamb', 'en', meat_id),
    (_user_id, 'turkey', 'Turkey', 'en', meat_id),
    (_user_id, 'bacon', 'Bacon', 'en', meat_id),
    (_user_id, 'sausage', 'Sausage', 'en', meat_id),
    (_user_id, 'sausages', 'Sausages', 'en', meat_id),
    (_user_id, 'ham', 'Ham', 'en', meat_id),
    (_user_id, 'salami', 'Salami', 'en', meat_id),
    (_user_id, 'fish', 'Fish', 'en', meat_id),
    (_user_id, 'salmon', 'Salmon', 'en', meat_id),
    (_user_id, 'tuna', 'Tuna', 'en', meat_id),
    (_user_id, 'shrimp', 'Shrimp', 'en', meat_id),
    (_user_id, 'mince', 'Mince', 'en', meat_id),
    -- Meat & Fish BG
    (_user_id, 'пиле', 'Пиле', 'bg', meat_id),
    (_user_id, 'пилешко', 'Пилешко', 'bg', meat_id),
    (_user_id, 'телешко', 'Телешко', 'bg', meat_id),
    (_user_id, 'свинско', 'Свинско', 'bg', meat_id),
    (_user_id, 'агнешко', 'Агнешко', 'bg', meat_id),
    (_user_id, 'пуйка', 'Пуйка', 'bg', meat_id),
    (_user_id, 'бекон', 'Бекон', 'bg', meat_id),
    (_user_id, 'наденица', 'Наденица', 'bg', meat_id),
    (_user_id, 'кренвирши', 'Кренвирши', 'bg', meat_id),
    (_user_id, 'шунка', 'Шунка', 'bg', meat_id),
    (_user_id, 'салам', 'Салам', 'bg', meat_id),
    (_user_id, 'луканка', 'Луканка', 'bg', meat_id),
    (_user_id, 'риба', 'Риба', 'bg', meat_id),
    (_user_id, 'сьомга', 'Сьомга', 'bg', meat_id),
    (_user_id, 'тон', 'Тон', 'bg', meat_id),
    (_user_id, 'скариди', 'Скариди', 'bg', meat_id),
    (_user_id, 'кайма', 'Кайма', 'bg', meat_id),
    -- Dairy & Eggs EN
    (_user_id, 'milk', 'Milk', 'en', dairy_id),
    (_user_id, 'egg', 'Eggs', 'en', dairy_id),
    (_user_id, 'eggs', 'Eggs', 'en', dairy_id),
    (_user_id, 'cheese', 'Cheese', 'en', dairy_id),
    (_user_id, 'feta', 'Feta', 'en', dairy_id),
    (_user_id, 'yogurt', 'Yogurt', 'en', dairy_id),
    (_user_id, 'yoghurt', 'Yogurt', 'en', dairy_id),
    (_user_id, 'butter', 'Butter', 'en', dairy_id),
    (_user_id, 'cream', 'Cream', 'en', dairy_id),
    (_user_id, 'sour cream', 'Sour Cream', 'en', dairy_id),
    (_user_id, 'mozzarella', 'Mozzarella', 'en', dairy_id),
    (_user_id, 'parmesan', 'Parmesan', 'en', dairy_id),
    -- Dairy & Eggs BG
    (_user_id, 'мляко', 'Мляко', 'bg', dairy_id),
    (_user_id, 'кисело мляко', 'Кисело мляко', 'bg', dairy_id),
    (_user_id, 'яйце', 'Яйца', 'bg', dairy_id),
    (_user_id, 'яйца', 'Яйца', 'bg', dairy_id),
    (_user_id, 'сирене', 'Сирене', 'bg', dairy_id),
    (_user_id, 'кашкавал', 'Кашкавал', 'bg', dairy_id),
    (_user_id, 'извара', 'Извара', 'bg', dairy_id),
    (_user_id, 'масло', 'Масло', 'bg', dairy_id),
    (_user_id, 'сметана', 'Сметана', 'bg', dairy_id),
    (_user_id, 'крема сирене', 'Крема сирене', 'bg', dairy_id),
    (_user_id, 'моцарела', 'Моцарела', 'bg', dairy_id),
    (_user_id, 'пармезан', 'Пармезан', 'bg', dairy_id),
    -- Bakery EN
    (_user_id, 'bread', 'Bread', 'en', bakery_id),
    (_user_id, 'baguette', 'Baguette', 'en', bakery_id),
    (_user_id, 'bun', 'Buns', 'en', bakery_id),
    (_user_id, 'buns', 'Buns', 'en', bakery_id),
    (_user_id, 'roll', 'Rolls', 'en', bakery_id),
    (_user_id, 'rolls', 'Rolls', 'en', bakery_id),
    (_user_id, 'croissant', 'Croissant', 'en', bakery_id),
    (_user_id, 'toast', 'Toast Bread', 'en', bakery_id),
    (_user_id, 'pita', 'Pita', 'en', bakery_id),
    -- Bakery BG
    (_user_id, 'хляб', 'Хляб', 'bg', bakery_id),
    (_user_id, 'питка', 'Питка', 'bg', bakery_id),
    (_user_id, 'багета', 'Багета', 'bg', bakery_id),
    (_user_id, 'кифла', 'Кифла', 'bg', bakery_id),
    (_user_id, 'кифли', 'Кифли', 'bg', bakery_id),
    (_user_id, 'кроасан', 'Кроасан', 'bg', bakery_id),
    (_user_id, 'тостер хляб', 'Тостер хляб', 'bg', bakery_id),
    (_user_id, 'банички', 'Банички', 'bg', bakery_id),
    (_user_id, 'баница', 'Баница', 'bg', bakery_id),
    -- Pantry EN
    (_user_id, 'rice', 'Rice', 'en', pantry_id),
    (_user_id, 'pasta', 'Pasta', 'en', pantry_id),
    (_user_id, 'spaghetti', 'Spaghetti', 'en', pantry_id),
    (_user_id, 'flour', 'Flour', 'en', pantry_id),
    (_user_id, 'sugar', 'Sugar', 'en', pantry_id),
    (_user_id, 'salt', 'Salt', 'en', pantry_id),
    (_user_id, 'oil', 'Oil', 'en', pantry_id),
    (_user_id, 'olive oil', 'Olive Oil', 'en', pantry_id),
    (_user_id, 'vinegar', 'Vinegar', 'en', pantry_id),
    (_user_id, 'beans', 'Beans', 'en', pantry_id),
    (_user_id, 'lentils', 'Lentils', 'en', pantry_id),
    (_user_id, 'oats', 'Oats', 'en', pantry_id),
    (_user_id, 'cereal', 'Cereal', 'en', pantry_id),
    (_user_id, 'honey', 'Honey', 'en', pantry_id),
    (_user_id, 'jam', 'Jam', 'en', pantry_id),
    (_user_id, 'peanut butter', 'Peanut Butter', 'en', pantry_id),
    (_user_id, 'ketchup', 'Ketchup', 'en', pantry_id),
    (_user_id, 'mustard', 'Mustard', 'en', pantry_id),
    (_user_id, 'mayonnaise', 'Mayonnaise', 'en', pantry_id),
    (_user_id, 'mayo', 'Mayonnaise', 'en', pantry_id),
    (_user_id, 'tea', 'Tea', 'en', pantry_id),
    (_user_id, 'coffee', 'Coffee', 'en', pantry_id),
    -- Pantry BG
    (_user_id, 'ориз', 'Ориз', 'bg', pantry_id),
    (_user_id, 'паста', 'Паста', 'bg', pantry_id),
    (_user_id, 'макарони', 'Макарони', 'bg', pantry_id),
    (_user_id, 'спагети', 'Спагети', 'bg', pantry_id),
    (_user_id, 'брашно', 'Брашно', 'bg', pantry_id),
    (_user_id, 'захар', 'Захар', 'bg', pantry_id),
    (_user_id, 'сол', 'Сол', 'bg', pantry_id),
    (_user_id, 'олио', 'Олио', 'bg', pantry_id),
    (_user_id, 'зехтин', 'Зехтин', 'bg', pantry_id),
    (_user_id, 'оцет', 'Оцет', 'bg', pantry_id),
    (_user_id, 'боб', 'Боб', 'bg', pantry_id),
    (_user_id, 'леща', 'Леща', 'bg', pantry_id),
    (_user_id, 'овесени ядки', 'Овесени ядки', 'bg', pantry_id),
    (_user_id, 'мюсли', 'Мюсли', 'bg', pantry_id),
    (_user_id, 'корнфлейкс', 'Корнфлейкс', 'bg', pantry_id),
    (_user_id, 'мед', 'Мед', 'bg', pantry_id),
    (_user_id, 'конфитюр', 'Конфитюр', 'bg', pantry_id),
    (_user_id, 'фъстъчено масло', 'Фъстъчено масло', 'bg', pantry_id),
    (_user_id, 'кетчуп', 'Кетчуп', 'bg', pantry_id),
    (_user_id, 'горчица', 'Горчица', 'bg', pantry_id),
    (_user_id, 'майонеза', 'Майонеза', 'bg', pantry_id),
    (_user_id, 'чай', 'Чай', 'bg', pantry_id),
    (_user_id, 'кафе', 'Кафе', 'bg', pantry_id),
    -- Frozen
    (_user_id, 'ice cream', 'Ice Cream', 'en', frozen_id),
    (_user_id, 'frozen pizza', 'Frozen Pizza', 'en', frozen_id),
    (_user_id, 'frozen vegetables', 'Frozen Vegetables', 'en', frozen_id),
    (_user_id, 'frozen fries', 'Frozen Fries', 'en', frozen_id),
    (_user_id, 'сладолед', 'Сладолед', 'bg', frozen_id),
    (_user_id, 'замразена пица', 'Замразена пица', 'bg', frozen_id),
    (_user_id, 'замразени зеленчуци', 'Замразени зеленчуци', 'bg', frozen_id),
    (_user_id, 'пържени картофи', 'Пържени картофи', 'bg', frozen_id),
    -- Drinks EN
    (_user_id, 'water', 'Water', 'en', drinks_id),
    (_user_id, 'sparkling water', 'Sparkling Water', 'en', drinks_id),
    (_user_id, 'juice', 'Juice', 'en', drinks_id),
    (_user_id, 'cola', 'Cola', 'en', drinks_id),
    (_user_id, 'coke', 'Cola', 'en', drinks_id),
    (_user_id, 'beer', 'Beer', 'en', drinks_id),
    (_user_id, 'wine', 'Wine', 'en', drinks_id),
    (_user_id, 'soda', 'Soda', 'en', drinks_id),
    -- Drinks BG
    (_user_id, 'вода', 'Вода', 'bg', drinks_id),
    (_user_id, 'газирана вода', 'Газирана вода', 'bg', drinks_id),
    (_user_id, 'минерална вода', 'Минерална вода', 'bg', drinks_id),
    (_user_id, 'сок', 'Сок', 'bg', drinks_id),
    (_user_id, 'кола', 'Кола', 'bg', drinks_id),
    (_user_id, 'бира', 'Бира', 'bg', drinks_id),
    (_user_id, 'вино', 'Вино', 'bg', drinks_id),
    (_user_id, 'безалкохолно', 'Безалкохолно', 'bg', drinks_id),
    -- Snacks EN
    (_user_id, 'chocolate', 'Chocolate', 'en', snacks_id),
    (_user_id, 'chips', 'Chips', 'en', snacks_id),
    (_user_id, 'crisps', 'Crisps', 'en', snacks_id),
    (_user_id, 'cookies', 'Cookies', 'en', snacks_id),
    (_user_id, 'biscuits', 'Biscuits', 'en', snacks_id),
    (_user_id, 'candy', 'Candy', 'en', snacks_id),
    (_user_id, 'nuts', 'Nuts', 'en', snacks_id),
    (_user_id, 'almonds', 'Almonds', 'en', snacks_id),
    (_user_id, 'walnuts', 'Walnuts', 'en', snacks_id),
    (_user_id, 'popcorn', 'Popcorn', 'en', snacks_id),
    -- Snacks BG
    (_user_id, 'шоколад', 'Шоколад', 'bg', snacks_id),
    (_user_id, 'чипс', 'Чипс', 'bg', snacks_id),
    (_user_id, 'бисквити', 'Бисквити', 'bg', snacks_id),
    (_user_id, 'вафла', 'Вафла', 'bg', snacks_id),
    (_user_id, 'вафли', 'Вафли', 'bg', snacks_id),
    (_user_id, 'бонбони', 'Бонбони', 'bg', snacks_id),
    (_user_id, 'ядки', 'Ядки', 'bg', snacks_id),
    (_user_id, 'бадеми', 'Бадеми', 'bg', snacks_id),
    (_user_id, 'орехи', 'Орехи', 'bg', snacks_id),
    (_user_id, 'фъстъци', 'Фъстъци', 'bg', snacks_id),
    (_user_id, 'пуканки', 'Пуканки', 'bg', snacks_id),
    -- Household EN
    (_user_id, 'toilet paper', 'Toilet Paper', 'en', house_id),
    (_user_id, 'paper towels', 'Paper Towels', 'en', house_id),
    (_user_id, 'napkins', 'Napkins', 'en', house_id),
    (_user_id, 'dish soap', 'Dish Soap', 'en', house_id),
    (_user_id, 'detergent', 'Detergent', 'en', house_id),
    (_user_id, 'trash bags', 'Trash Bags', 'en', house_id),
    (_user_id, 'foil', 'Aluminium Foil', 'en', house_id),
    (_user_id, 'cling film', 'Cling Film', 'en', house_id),
    (_user_id, 'sponge', 'Sponge', 'en', house_id),
    -- Household BG
    (_user_id, 'тоалетна хартия', 'Тоалетна хартия', 'bg', house_id),
    (_user_id, 'кухненска хартия', 'Кухненска хартия', 'bg', house_id),
    (_user_id, 'салфетки', 'Салфетки', 'bg', house_id),
    (_user_id, 'препарат за съдове', 'Препарат за съдове', 'bg', house_id),
    (_user_id, 'прах за пране', 'Прах за пране', 'bg', house_id),
    (_user_id, 'чували за боклук', 'Чували за боклук', 'bg', house_id),
    (_user_id, 'алуминиево фолио', 'Алуминиево фолио', 'bg', house_id),
    (_user_id, 'стреч фолио', 'Стреч фолио', 'bg', house_id),
    (_user_id, 'гъба за съдове', 'Гъба за съдове', 'bg', house_id),
    -- Personal Care EN
    (_user_id, 'shampoo', 'Shampoo', 'en', care_id),
    (_user_id, 'conditioner', 'Conditioner', 'en', care_id),
    (_user_id, 'soap', 'Soap', 'en', care_id),
    (_user_id, 'shower gel', 'Shower Gel', 'en', care_id),
    (_user_id, 'toothpaste', 'Toothpaste', 'en', care_id),
    (_user_id, 'toothbrush', 'Toothbrush', 'en', care_id),
    (_user_id, 'deodorant', 'Deodorant', 'en', care_id),
    (_user_id, 'razor', 'Razor', 'en', care_id),
    -- Personal Care BG
    (_user_id, 'шампоан', 'Шампоан', 'bg', care_id),
    (_user_id, 'балсам', 'Балсам', 'bg', care_id),
    (_user_id, 'сапун', 'Сапун', 'bg', care_id),
    (_user_id, 'душ гел', 'Душ гел', 'bg', care_id),
    (_user_id, 'паста за зъби', 'Паста за зъби', 'bg', care_id),
    (_user_id, 'четка за зъби', 'Четка за зъби', 'bg', care_id),
    (_user_id, 'дезодорант', 'Дезодорант', 'bg', care_id),
    (_user_id, 'самобръсначка', 'Самобръсначка', 'bg', care_id),
    -- Baby
    (_user_id, 'diapers', 'Diapers', 'en', baby_id),
    (_user_id, 'baby wipes', 'Baby Wipes', 'en', baby_id),
    (_user_id, 'baby formula', 'Baby Formula', 'en', baby_id),
    (_user_id, 'пелени', 'Пелени', 'bg', baby_id),
    (_user_id, 'мокри кърпи', 'Мокри кърпи', 'bg', baby_id),
    (_user_id, 'адаптирано мляко', 'Адаптирано мляко', 'bg', baby_id)
  ON CONFLICT (user_id, normalized_name) DO NOTHING;
END;
$$;

-- New-user trigger
CREATE OR REPLACE FUNCTION public.seed_shopping_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_shopping_defaults(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_shopping_on_signup ON auth.users;
CREATE TRIGGER trg_seed_shopping_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_shopping_on_signup();

-- Backfill existing users
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_shopping_defaults(u.id);
  END LOOP;
END $$;
