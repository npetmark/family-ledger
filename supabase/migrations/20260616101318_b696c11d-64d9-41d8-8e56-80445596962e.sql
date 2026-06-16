
-- 1. Add translation_key to link EN/BG dictionary entries
ALTER TABLE public.shopping_item_dictionary
  ADD COLUMN IF NOT EXISTS translation_key text;

CREATE INDEX IF NOT EXISTS shopping_item_dictionary_translation_key_idx
  ON public.shopping_item_dictionary (user_id, translation_key);

-- 2. Backfill translation_key for existing rows using known EN/BG pairs.
-- The key is the EN normalized_name (or canonical identifier when no EN form).
WITH pairs(key, names) AS (
  VALUES
    -- Produce
    ('apple', ARRAY['apple','ябълка']),
    ('apples', ARRAY['apples','ябълки']),
    ('banana', ARRAY['banana','банан']),
    ('bananas', ARRAY['bananas','банани']),
    ('orange', ARRAY['orange','портокал']),
    ('lemon', ARRAY['lemon','лимон']),
    ('grapes', ARRAY['grape','grapes','грозде']),
    ('strawberries', ARRAY['strawberry','strawberries','ягоди']),
    ('blueberries', ARRAY['blueberry','боровинки']),
    ('watermelon', ARRAY['watermelon','диня']),
    ('melon', ARRAY['пъпеш']),
    ('tomato', ARRAY['tomato','домат']),
    ('tomatoes', ARRAY['tomatoes','домати']),
    ('cucumber', ARRAY['cucumber','краставица','краставици']),
    ('pepper', ARRAY['pepper','peppers','пипер','чушка','чушки']),
    ('onion', ARRAY['onion','лук']),
    ('garlic', ARRAY['garlic','чесън']),
    ('potato', ARRAY['potato','картоф']),
    ('potatoes', ARRAY['potatoes','картофи']),
    ('carrot', ARRAY['carrot','морков']),
    ('carrots', ARRAY['carrots','моркови']),
    ('lettuce', ARRAY['lettuce','маруля']),
    ('salad', ARRAY['salad','салата']),
    ('spinach', ARRAY['spinach','спанак']),
    ('broccoli', ARRAY['broccoli','броколи']),
    ('mushrooms', ARRAY['mushroom','mushrooms','гъби']),
    ('zucchini', ARRAY['zucchini','тиквичка','тиквички']),
    ('eggplant', ARRAY['eggplant','патладжан']),
    ('avocado', ARRAY['avocado','авокадо']),
    -- Meat & Fish
    ('chicken', ARRAY['chicken','пиле','пилешко']),
    ('beef', ARRAY['beef','телешко']),
    ('pork', ARRAY['pork','свинско']),
    ('lamb', ARRAY['lamb','агнешко']),
    ('turkey', ARRAY['turkey','пуйка']),
    ('bacon', ARRAY['bacon','бекон']),
    ('sausage', ARRAY['sausage','наденица']),
    ('sausages', ARRAY['sausages','кренвирши']),
    ('ham', ARRAY['ham','шунка']),
    ('salami', ARRAY['salami','салам','луканка']),
    ('fish', ARRAY['fish','риба']),
    ('salmon', ARRAY['salmon','сьомга']),
    ('tuna', ARRAY['tuna','тон']),
    ('shrimp', ARRAY['shrimp','скариди']),
    ('mince', ARRAY['mince','кайма']),
    -- Dairy & Eggs
    ('milk', ARRAY['milk','мляко']),
    ('yogurt', ARRAY['yogurt','yoghurt','кисело мляко']),
    ('eggs', ARRAY['egg','eggs','яйце','яйца']),
    ('cheese', ARRAY['cheese','сирене']),
    ('yellow cheese', ARRAY['кашкавал']),
    ('cottage cheese', ARRAY['извара']),
    ('butter', ARRAY['butter','масло']),
    ('cream', ARRAY['cream','сметана']),
    ('cream cheese', ARRAY['крема сирене']),
    ('mozzarella', ARRAY['mozzarella','моцарела']),
    ('parmesan', ARRAY['parmesan','пармезан']),
    -- Bakery
    ('bread', ARRAY['bread','хляб']),
    ('baguette', ARRAY['baguette','багета']),
    ('buns', ARRAY['bun','buns','кифла','кифли']),
    ('croissant', ARRAY['croissant','кроасан']),
    ('toast bread', ARRAY['toast','тостер хляб']),
    ('pita', ARRAY['pita','питка']),
    ('banitsa', ARRAY['баница','банички']),
    -- Pantry
    ('rice', ARRAY['rice','ориз']),
    ('pasta', ARRAY['pasta','паста','макарони']),
    ('spaghetti', ARRAY['spaghetti','спагети']),
    ('flour', ARRAY['flour','брашно']),
    ('sugar', ARRAY['sugar','захар']),
    ('salt', ARRAY['salt','сол']),
    ('oil', ARRAY['oil','олио']),
    ('olive oil', ARRAY['olive oil','зехтин']),
    ('vinegar', ARRAY['vinegar','оцет']),
    ('beans', ARRAY['beans','боб']),
    ('lentils', ARRAY['lentils','леща']),
    ('oats', ARRAY['oats','овесени ядки']),
    ('cereal', ARRAY['cereal','мюсли','корнфлейкс']),
    ('honey', ARRAY['honey','мед']),
    ('jam', ARRAY['jam','конфитюр']),
    ('peanut butter', ARRAY['peanut butter','фъстъчено масло']),
    ('ketchup', ARRAY['ketchup','кетчуп']),
    ('mustard', ARRAY['mustard','горчица']),
    ('mayonnaise', ARRAY['mayonnaise','mayo','майонеза']),
    ('tea', ARRAY['tea','чай']),
    ('coffee', ARRAY['coffee','кафе']),
    -- Frozen
    ('ice cream', ARRAY['ice cream','сладолед']),
    ('frozen pizza', ARRAY['frozen pizza','замразена пица']),
    ('frozen vegetables', ARRAY['frozen vegetables','замразени зеленчуци']),
    ('frozen fries', ARRAY['frozen fries','пържени картофи']),
    -- Drinks
    ('water', ARRAY['water','вода']),
    ('sparkling water', ARRAY['sparkling water','газирана вода','минерална вода']),
    ('juice', ARRAY['juice','сок']),
    ('cola', ARRAY['cola','coke','кола']),
    ('beer', ARRAY['beer','бира']),
    ('wine', ARRAY['wine','вино']),
    ('soda', ARRAY['soda','безалкохолно']),
    -- Snacks
    ('chocolate', ARRAY['chocolate','шоколад']),
    ('chips', ARRAY['chips','crisps','чипс']),
    ('cookies', ARRAY['cookies','biscuits','бисквити']),
    ('wafers', ARRAY['вафла','вафли']),
    ('candy', ARRAY['candy','бонбони']),
    ('nuts', ARRAY['nuts','ядки']),
    ('almonds', ARRAY['almonds','бадеми']),
    ('walnuts', ARRAY['walnuts','орехи']),
    ('peanuts', ARRAY['фъстъци']),
    ('popcorn', ARRAY['popcorn','пуканки']),
    -- Household
    ('toilet paper', ARRAY['toilet paper','тоалетна хартия']),
    ('paper towels', ARRAY['paper towels','кухненска хартия']),
    ('napkins', ARRAY['napkins','салфетки']),
    ('dish soap', ARRAY['dish soap','препарат за съдове']),
    ('detergent', ARRAY['detergent','прах за пране']),
    ('trash bags', ARRAY['trash bags','чували за боклук']),
    ('foil', ARRAY['foil','алуминиево фолио']),
    ('cling film', ARRAY['cling film','стреч фолио']),
    ('sponge', ARRAY['sponge','гъба за съдове']),
    -- Personal Care
    ('shampoo', ARRAY['shampoo','шампоан']),
    ('conditioner', ARRAY['conditioner','балсам']),
    ('soap', ARRAY['soap','сапун']),
    ('shower gel', ARRAY['shower gel','душ гел']),
    ('toothpaste', ARRAY['toothpaste','паста за зъби']),
    ('toothbrush', ARRAY['toothbrush','четка за зъби']),
    ('deodorant', ARRAY['deodorant','дезодорант']),
    ('razor', ARRAY['razor','самобръсначка']),
    -- Baby
    ('diapers', ARRAY['diapers','пелени']),
    ('baby wipes', ARRAY['baby wipes','мокри кърпи']),
    ('baby formula', ARRAY['baby formula','адаптирано мляко'])
),
expanded AS (
  SELECT key, unnest(names) AS norm FROM pairs
)
UPDATE public.shopping_item_dictionary d
SET translation_key = e.key
FROM expanded e
WHERE d.normalized_name = e.norm
  AND (d.translation_key IS NULL OR d.translation_key <> e.key);

-- 3. For any remaining rows without a translation_key, default to their normalized name
--    so future category-learning updates at least propagate within the same language.
UPDATE public.shopping_item_dictionary
SET translation_key = normalized_name
WHERE translation_key IS NULL;

-- 4. Update the seed function to write translation_key for new users going forward.
CREATE OR REPLACE FUNCTION public.seed_shopping_defaults(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
