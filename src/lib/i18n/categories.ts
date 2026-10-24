import { Language } from "./types";

/**
 * System default main categories and subcategories mapping.
 * Each entry maps between English (UK) and Bulgarian.
 */
interface DefaultNameMap {
  en: string;
  bg: string;
}

const DEFAULT_MAIN_CATEGORIES: DefaultNameMap[] = [
  { en: "Needs", bg: "Нужди" },
  { en: "Wants", bg: "Желания" },
  { en: "Investments", bg: "Инвестиции" },
  { en: "Income", bg: "Приходи" },
  { en: "Expenses", bg: "Разходи" },
  { en: "Savings", bg: "Спестявания" },
  { en: "Transfers", bg: "Преводи" },
  { en: "Uncategorized", bg: "Без категория" },
];

const DEFAULT_SUBCATEGORIES: DefaultNameMap[] = [
  // ----------------------------------------------------
  // Housing, Home & Utilities
  // ----------------------------------------------------
  { en: "Housing", bg: "Жилище" },
  { en: "Home", bg: "Дом" },
  { en: "Rent", bg: "Наем" },
  { en: "Mortgage", bg: "Ипотека" },
  { en: "Mortgage Loan", bg: "Ипотечен кредит" },
  { en: "Home Maintenance", bg: "Поддръжка на дома" },
  { en: "Maintenance", bg: "Поддръжка" },
  { en: "Renovation", bg: "Ремонт" },
  { en: "Repairs", bg: "Ремонти" },
  { en: "Furniture", bg: "Мебели" },
  { en: "Furnishing", bg: "Обзавеждане" },
  { en: "Household Goods", bg: "Домашни потреби" },
  { en: "Household Supplies", bg: "Битова химия" },
  { en: "Utilities", bg: "Сметки" },
  { en: "Utility Bills", bg: "Битови сметки" },
  { en: "Bills", bg: "Сметки" },
  { en: "Electricity", bg: "Ток" },
  { en: "Electricity", bg: "Електроенергия" },
  { en: "Water", bg: "Вода" },
  { en: "Heating", bg: "Отопление" },
  { en: "Heating", bg: "Парно" },
  { en: "Gas", bg: "Газ" },
  { en: "Internet", bg: "Интернет" },
  { en: "TV", bg: "Телевизия" },
  { en: "Cable", bg: "Кабелна" },
  { en: "Cable TV", bg: "Кабелна телевизия" },
  { en: "Internet & TV", bg: "Интернет и телевизия" },
  { en: "TV & Internet", bg: "Телевизия и интернет" },
  { en: "Phone", bg: "Телефон" },
  { en: "Mobile Phone", bg: "Мобилен телефон" },
  { en: "Mobile", bg: "Мобилен" },
  { en: "Building Fee", bg: "Вход" },
  { en: "Building Maintenance", bg: "Такса вход" },
  { en: "Building Maintenance", bg: "Етажна собственост" },

  // ----------------------------------------------------
  // Food, Groceries & Dining
  // ----------------------------------------------------
  { en: "Groceries", bg: "Пазар" },
  { en: "Food", bg: "Храна" },
  { en: "Food & Drinks", bg: "Храна и напитки" },
  { en: "Groceries", bg: "Хранителни стоки" },
  { en: "Supermarket", bg: "Супермаркет" },
  { en: "Eating Out", bg: "Хранене навън" },
  { en: "Dining Out", bg: "Ресторанти" },
  { en: "Restaurants", bg: "Ресторанти" },
  { en: "Dining", bg: "Заведения" },
  { en: "Cafes", bg: "Кафенета" },
  { en: "Coffee", bg: "Кафе" },
  { en: "Fast Food", bg: "Бързо хранене" },
  { en: "Food Delivery", bg: "Доставка на храна" },
  { en: "Lunch", bg: "Обяд" },
  { en: "Dinner", bg: "Вечеря" },
  { en: "Breakfast", bg: "Закуска" },
  { en: "Bakery", bg: "Хляб и тестени" },
  { en: "Bakery", bg: "Пекарна" },
  { en: "Meat", bg: "Месо" },
  { en: "Fish", bg: "Риба" },
  { en: "Meat & Fish", bg: "Месо и риба" },
  { en: "Dairy", bg: "Млечни" },
  { en: "Dairy Products", bg: "Млечни продукти" },
  { en: "Dairy & Eggs", bg: "Млечни и яйца" },
  { en: "Produce", bg: "Плодове и зеленчуци" },
  { en: "Fruits & Vegetables", bg: "Плодове и зеленчуци" },
  { en: "Fruits", bg: "Плодове" },
  { en: "Vegetables", bg: "Зеленчуци" },
  { en: "Drinks", bg: "Напитки" },
  { en: "Beverages", bg: "Напитки" },
  { en: "Alcohol", bg: "Алкохол" },
  { en: "Snacks", bg: "Закуски" },
  { en: "Sweets & Snacks", bg: "Закуски и сладки" },
  { en: "Sweets", bg: "Сладки" },
  { en: "Desserts", bg: "Десерти" },

  // ----------------------------------------------------
  // Transport & Auto
  // ----------------------------------------------------
  { en: "Transport", bg: "Транспорт" },
  { en: "Transportation", bg: "Транспорт" },
  { en: "Public Transport", bg: "Градски транспорт" },
  { en: "Car", bg: "Автомобил" },
  { en: "Car", bg: "Кола" },
  { en: "Auto", bg: "Авто" },
  { en: "Vehicle", bg: "Превозно средство" },
  { en: "Fuel", bg: "Гориво" },
  { en: "Petrol", bg: "Бензин" },
  { en: "Diesel", bg: "Дизел" },
  { en: "Gas (Fuel)", bg: "Автогаз" },
  { en: "Car Maintenance", bg: "Поддръжка на автомобил" },
  { en: "Auto Repair", bg: "Автосервиз" },
  { en: "Car Repair", bg: "Ремонт на кола" },
  { en: "Car Insurance", bg: "Гражданска отговорност" },
  { en: "Casco", bg: "Каско" },
  { en: "Comprehensive Insurance", bg: "Каско" },
  { en: "Vignette", bg: "Винетка" },
  { en: "Parking", bg: "Паркинг" },
  { en: "Taxi", bg: "Такси" },
  { en: "Car Wash", bg: "Автомивка" },
  { en: "Tires", bg: "Гуми" },
  { en: "Technical Inspection", bg: "Технически преглед" },
  { en: "Vehicle Inspection", bg: "Технически преглед" },

  // ----------------------------------------------------
  // Health, Wellness & Personal Care
  // ----------------------------------------------------
  { en: "Healthcare", bg: "Здраве" },
  { en: "Health", bg: "Здраве" },
  { en: "Healthcare", bg: "Здравеопазване" },
  { en: "Medications", bg: "Лекарства" },
  { en: "Medicine", bg: "Лекарства" },
  { en: "Pharmacy", bg: "Аптека" },
  { en: "Doctor", bg: "Лекар" },
  { en: "Medical Visits", bg: "Прегледи" },
  { en: "Medical Visit", bg: "Преглед" },
  { en: "Dentist", bg: "Зъболекар" },
  { en: "Dental", bg: "Стоматолог" },
  { en: "Optics", bg: "Оптика" },
  { en: "Glasses", bg: "Очила" },
  { en: "Lab Tests", bg: "Изследвания" },
  { en: "Therapy", bg: "Терапия" },
  { en: "Personal Care", bg: "Лична грижа" },
  { en: "Hygiene", bg: "Хигиена" },
  { en: "Cosmetics", bg: "Козметика" },
  { en: "Beauty", bg: "Красота" },
  { en: "Hairdresser", bg: "Фризьор" },
  { en: "Beauty Salon", bg: "Салон за красота" },
  { en: "Manicure", bg: "Маникюр" },
  { en: "Massage", bg: "Масаж" },

  // ----------------------------------------------------
  // Shopping & Lifestyle
  // ----------------------------------------------------
  { en: "Shopping", bg: "Пазаруване" },
  { en: "Clothing", bg: "Дрехи" },
  { en: "Clothes", bg: "Дрехи" },
  { en: "Shoes", bg: "Обувки" },
  { en: "Clothes & Shoes", bg: "Дрехи и обувки" },
  { en: "Accessories", bg: "Аксесоари" },
  { en: "Electronics", bg: "Електроника" },
  { en: "Tech", bg: "Техника" },
  { en: "Appliances", bg: "Уреди" },
  { en: "Books", bg: "Книги" },
  { en: "Gifts", bg: "Подаръци" },
  { en: "Gift", bg: "Подарък" },
  { en: "Hobbies", bg: "Хобита" },
  { en: "Hobby", bg: "Хоби" },
  { en: "Pets", bg: "Домашни любимци" },
  { en: "Pet Supplies", bg: "Зоомагазин" },
  { en: "Pet Food", bg: "Храна за домашни любимци" },

  // ----------------------------------------------------
  // Entertainment & Travel
  // ----------------------------------------------------
  { en: "Entertainment", bg: "Забавления" },
  { en: "Cinema", bg: "Кино" },
  { en: "Movies", bg: "Кино" },
  { en: "Theater", bg: "Театър" },
  { en: "Concerts", bg: "Концерти" },
  { en: "Travel", bg: "Пътувания" },
  { en: "Travel", bg: "Пътуване" },
  { en: "Trips", bg: "Екскурзии" },
  { en: "Vacation", bg: "Почивка" },
  { en: "Vacations", bg: "Почивки" },
  { en: "Vacation", bg: "Ваканция" },
  { en: "Holidays", bg: "Почивки" },
  { en: "Hotels", bg: "Хотели" },
  { en: "Gaming", bg: "Игри" },
  { en: "Games", bg: "Игри" },
  { en: "Subscriptions", bg: "Абонаменти" },
  { en: "Streaming", bg: "Стрийминг" },
  { en: "Sports", bg: "Спорт" },
  { en: "Fitness", bg: "Фитнес" },
  { en: "Gym", bg: "Фитнес" },
  { en: "Nightlife", bg: "Нощен живот" },
  { en: "Bars & Clubs", bg: "Барове и клубове" },
  { en: "Bars", bg: "Барове" },

  // ----------------------------------------------------
  // Family & Kids
  // ----------------------------------------------------
  { en: "Kids", bg: "Деца" },
  { en: "Children", bg: "Деца" },
  { en: "Child", bg: "Дете" },
  { en: "Baby", bg: "Бебе" },
  { en: "Baby Supplies", bg: "Бебешки стоки" },
  { en: "Kindergarten", bg: "Детска градина" },
  { en: "Nursery", bg: "Ясла" },
  { en: "School", bg: "Училище" },
  { en: "Education", bg: "Образование" },
  { en: "Courses", bg: "Курсове" },
  { en: "Lessons", bg: "Уроци" },
  { en: "Tutoring", bg: "Частни уроци" },
  { en: "Toys", bg: "Играчки" },
  { en: "Kids Clothes", bg: "Детски дрехи" },
  { en: "Pocket Money", bg: "Джобни" },

  // ----------------------------------------------------
  // Investments, Savings & Finance
  // ----------------------------------------------------
  { en: "Emergency Fund", bg: "Авариен фонд" },
  { en: "Savings", bg: "Спестявания" },
  { en: "Investments", bg: "Инвестиции" },
  { en: "Stocks", bg: "Акции" },
  { en: "Bonds", bg: "Облигации" },
  { en: "Real Estate", bg: "Недвижими имоти" },
  { en: "Gold", bg: "Злато" },
  { en: "Crypto", bg: "Крипто" },
  { en: "Cryptocurrencies", bg: "Криптовалути" },
  { en: "Pension Fund", bg: "Пенсионен фонд" },
  { en: "Pension Insurance", bg: "Пенсионно осигуряване" },
  { en: "Deposit", bg: "Депозит" },
  { en: "Deposits", bg: "Депозити" },
  { en: "Mutual Funds", bg: "Взаимни фондове" },
  { en: "ETFs", bg: "ETF" },
  { en: "Insurance", bg: "Застраховки" },
  { en: "Life Insurance", bg: "Животозастраховане" },
  { en: "Health Insurance", bg: "Здравна застраховка" },
  { en: "Property Insurance", bg: "Имуществена застраховка" },
  { en: "Taxes", bg: "Данъци" },
  { en: "Property Tax", bg: "Данък сгради" },
  { en: "Income Tax", bg: "Данък общ доход" },
  { en: "Bank Fees", bg: "Банкови такси" },
  { en: "Fees", bg: "Такси" },
  { en: "Interest", bg: "Лихви" },
  { en: "Loans", bg: "Кредити" },
  { en: "Loan", bg: "Кредит" },
  { en: "Loan Payment", bg: "Вноска по кредит" },
  { en: "Credit Card", bg: "Кредитна карта" },
  { en: "Fines", bg: "Глоби" },
  { en: "Penalties", bg: "Санкции" },

  // ----------------------------------------------------
  // Income
  // ----------------------------------------------------
  { en: "Salary", bg: "Заплата" },
  { en: "Bonus", bg: "Бонус" },
  { en: "Bonuses", bg: "Бонуси" },
  { en: "Extra Income", bg: "Допълнителни доходи" },
  { en: "Additional Income", bg: "Допълнителен доход" },
  { en: "Freelance", bg: "Хонорар" },
  { en: "Freelance", bg: "Хонорари" },
  { en: "Dividends", bg: "Дивиденти" },
  { en: "Rental Income", bg: "Доход от наем" },
  { en: "Pension", bg: "Пенсия" },
  { en: "Scholarship", bg: "Стипендия" },
  { en: "Sale", bg: "Продажба" },
  { en: "Sales", bg: "Продажби" },
  { en: "Cashback", bg: "Кешбек" },
  { en: "Other Income", bg: "Други приходи" },
  { en: "Advance", bg: "Аванс" },
  { en: "Maternity", bg: "Майчинство" },
  { en: "Benefits", bg: "Обезщетения" },
  { en: "Benefit", bg: "Обезщетение" },
  { en: "Child Allowance", bg: "Детски надбавки" },
  { en: "Child Benefits", bg: "Детски надбавки" },

  // ----------------------------------------------------
  // Other / General / Miscellaneous
  // ----------------------------------------------------
  { en: "Other", bg: "Други" },
  { en: "Other Expenses", bg: "Други разходи" },
  { en: "Miscellaneous", bg: "Разни" },
  { en: "Unexpected", bg: "Непредвидени" },
  { en: "Unexpected Expenses", bg: "Непредвидени разходи" },
  { en: "Donations", bg: "Дарения" },
  { en: "Charity", bg: "Благотворителност" },
  { en: "Birthday", bg: "Рожден ден" },
  { en: "Name Day", bg: "Имен ден" },
  { en: "Wedding", bg: "Сватба" },
  { en: "Celebrations", bg: "Празници" },
  { en: "Christmas", bg: "Коледа" },
  { en: "Flowers", bg: "Цветя" },
  { en: "Garden", bg: "Градина" },
  { en: "Plants", bg: "Растения" },
  { en: "Swimming", bg: "Плуване" },
  { en: "Tennis", bg: "Тенис" },
  { en: "Ski", bg: "Ски" },
  { en: "Football", bg: "Футбол" },
  { en: "Hiking", bg: "Планина" },
  { en: "Software", bg: "Софтуер" },
  { en: "Hosting", bg: "Хостинг" },
  { en: "Domain", bg: "Домейн" },
  { en: "Accountant", bg: "Счетоводител" },
  { en: "Lawyer", bg: "Адвокат" },
  { en: "Notary", bg: "Нотариус" },
  { en: "Legal Services", bg: "Правни услуги" },
  { en: "Installment", bg: "Вноска" },
  { en: "Leasing", bg: "Лизинг" },
  { en: "Consumer Loan", bg: "Потребителски кредит" },
  { en: "Overdraft", bg: "Овърдрафт" },
  { en: "Babysitter", bg: "Детегледачка" },
  { en: "Pocket Money", bg: "Джобни пари" },
  { en: "Baby Food", bg: "Детска кухня" },
  { en: "School Supplies", bg: "Ученически пособия" },
  { en: "School Supplies", bg: "Учебници и помагала" },
  { en: "Veterinarian", bg: "Ветеринар" },
  { en: "Pet Grooming", bg: "Груминг" },
  { en: "Vitamins", bg: "Витамини" },
  { en: "Supplements", bg: "Хранителни добавки" },
  { en: "Supplements", bg: "Добавки" },
  { en: "Hospital", bg: "Болница" },
  { en: "Laboratory", bg: "Лаборатория" },
  { en: "Orthodontist", bg: "Ортодонт" },
  { en: "Psychologist", bg: "Психолог" },
  { en: "Barber", bg: "Бръснар" },
  { en: "Cosmetician", bg: "Козметик" },
  { en: "Spa", bg: "Спа" },
  { en: "Vehicle Tax", bg: "Данък МПС" },
  { en: "Vehicle Tax", bg: "Данък кола" },
  { en: "Technical Inspection", bg: "ГТП" },
  { en: "Third Party Insurance", bg: "Гражданска" },
  { en: "Third Party Insurance", bg: "ГО" },
  { en: "Toll", bg: "Тол такси" },
  { en: "Toll", bg: "Тол" },
  { en: "Road Tax", bg: "Пътни такси" },
  { en: "Oil Change", bg: "Смяна на масло" },
  { en: "Auto Parts", bg: "Авточасти" },
  { en: "Flights", bg: "Самолетни билети" },
  { en: "Train", bg: "Влак" },
  { en: "Bus", bg: "Автобус" },
  { en: "Heating", bg: "ТЕЦ" },
  { en: "Waste Tax", bg: "Такса смет" },
  { en: "Home Insurance", bg: "Застраховка дом" },
  { en: "Home Insurance", bg: "Застраховка имущество" },
  { en: "Security", bg: "СОТ" },
  { en: "Security", bg: "Охрана" },
  { en: "Cleaning", bg: "Почистване" },
];

const DEFAULT_SHOPPING_CATEGORIES: DefaultNameMap[] = [
  { en: "Produce", bg: "Плодове и зеленчуци" },
  { en: "Meat & Fish", bg: "Месо и риба" },
  { en: "Dairy & Eggs", bg: "Млечни и яйца" },
  { en: "Bakery", bg: "Хляб и тестени" },
  { en: "Pantry", bg: "Бакалия" },
  { en: "Frozen", bg: "Замразени" },
  { en: "Drinks", bg: "Напитки" },
  { en: "Snacks", bg: "Закуски и сладки" },
  { en: "Household", bg: "За дома" },
  { en: "Personal Care", bg: "Лична грижа" },
  { en: "Baby", bg: "Бебешки" },
  { en: "Other", bg: "Други" },
  { en: "Excess (not on list)", bg: "Извън списъка (допълнителни)" },
  { en: "Excess", bg: "Извън списъка" },
];

const ACCOUNT_TYPE_CODES: Record<string, { en: string; bg: string }> = {
  cash: { en: "Cash", bg: "В брой" },
  card: { en: "Card", bg: "Карта" },
  bank: { en: "Bank Account", bg: "Банкова сметка" },
  checking: { en: "Checking Account", bg: "Разплащателна сметка" },
  savings: { en: "Savings Account", bg: "Спестовна сметка" },
  credit: { en: "Credit Card", bg: "Кредитна карта" },
  credit_card: { en: "Credit Card", bg: "Кредитна карта" },
  investment: { en: "Investment", bg: "Инвестиция" },
  crypto: { en: "Crypto Wallet", bg: "Крипто портфейл" },
  wallet: { en: "Wallet", bg: "Портфейл" },
  custom: { en: "Custom", bg: "Друг" },
};

const DEFAULT_ACCOUNT_TYPES: DefaultNameMap[] = [
  { en: "Cash", bg: "В брой" },
  { en: "Card", bg: "Карта" },
  { en: "Bank Account", bg: "Банкова сметка" },
  { en: "Checking Account", bg: "Разплащателна сметка" },
  { en: "Savings Account", bg: "Спестовна сметка" },
  { en: "Credit Card", bg: "Кредитна карта" },
  { en: "Investment", bg: "Инвестиция" },
  { en: "Crypto Wallet", bg: "Крипто портфейл" },
  { en: "Custom", bg: "Друг" },
];

const ALL_SYSTEM_NAMES: DefaultNameMap[] = [
  ...DEFAULT_MAIN_CATEGORIES,
  ...DEFAULT_SUBCATEGORIES,
  ...DEFAULT_SHOPPING_CATEGORIES,
  ...DEFAULT_ACCOUNT_TYPES,
];

// Pre-indexed lookup maps for fast case-insensitive translation
const bgToEnMap = new Map<string, string>();
const enToBgMap = new Map<string, string>();

for (const item of ALL_SYSTEM_NAMES) {
  const enLower = item.en.toLowerCase();
  const bgLower = item.bg.toLowerCase();

  if (!bgToEnMap.has(bgLower)) {
    bgToEnMap.set(bgLower, item.en);
  }
  if (!enToBgMap.has(enLower)) {
    enToBgMap.set(enLower, item.bg);
  }
}

// Pre-sorted list of Bulgarian phrases (longest first) to replace known words in compound names
const sortedBgEntries: [string, string][] = Array.from(bgToEnMap.entries()).sort(
  (a, b) => b[0].length - a[0].length
);

/**
 * Official Bulgarian transliteration standard (Streamlined system).
 * Transliterates Cyrillic characters to Latin.
 */
export function transliterateBulgarianToLatin(text: string): string {
  if (!text) return "";

  // Special rule (Transliteration Act): "ия" at the end of a word is transliterated as "ia"
  // Note: Standard \b is ASCII-only in JS, so we use explicit boundary matching for Cyrillic
  const wordEnd = "(?=[^а-яА-ЯёЁa-zA-Z0-9]|$)";
  const result = text
    .replace(new RegExp(`ия${wordEnd}`, "g"), "ia")
    .replace(new RegExp(`Ия${wordEnd}`, "g"), "Ia")
    .replace(new RegExp(`ИЯ${wordEnd}`, "g"), "IA")
    .replace(new RegExp(`иЯ${wordEnd}`, "g"), "iA");

  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
    ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
    А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ж: "Zh", З: "Z",
    И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P",
    Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "Ts", Ч: "Ch",
    Ш: "Sh", Щ: "Sht", Ъ: "A", Ь: "Y", Ю: "Yu", Я: "Ya",
  };

  return result
    .split("")
    .map((char) => map[char] ?? char)
    .join("");
}

/**
 * Translates a system category/subcategory name into the active language.
 * When translating to English:
 * 1. Checks exact match in system dictionary.
 * 2. Replaces known phrases in compound categories.
 * 3. Transliterates any remaining Cyrillic (names or custom text) into Latin so
 *    that NO Cyrillic remains when English is selected.
 */
export function translateCategory(name?: string | null, lang: Language = "en"): string {
  if (!name) return "";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  if (lang === "en") {
    // 1. Direct exact match in dictionary
    const enMatch = bgToEnMap.get(lower);
    if (enMatch) {
      return enMatch;
    }
    // 2. Already a known English category name
    if (enToBgMap.has(lower)) {
      return trimmed;
    }
    // 3. If there are NO Cyrillic characters, it's pure Latin/English custom text (e.g. "UniCredit", "Hobby") -> leave as is
    if (!/[а-яА-ЯёЁ]/.test(trimmed)) {
      return trimmed;
    }

    // 4. Has Cyrillic: translate any embedded known dictionary phrases/words (longest first)
    let processed = trimmed;
    for (const [bgPhrase, enTranslation] of sortedBgEntries) {
      // Only match phrases with at least 3 letters to avoid false positive substring matches
      if (bgPhrase.length < 3) continue;
      const escaped = bgPhrase.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&");
      const regex = new RegExp(`(^|[^а-яА-ЯёЁa-zA-Z0-9])${escaped}(?=[^а-яА-ЯёЁa-zA-Z0-9]|$)`, "gi");
      processed = processed.replace(regex, (match, prefix) => `${prefix}${enTranslation}`);
    }

    // 5. Transliterate any remaining Cyrillic text to Latin alphabet
    // Ensures NO Cyrillic remains when English is selected
    return transliterateBulgarianToLatin(processed);
  }

  // Translating to Bulgarian (lang === "bg"): check if input is a known English category
  const bgMatch = enToBgMap.get(lower);
  if (bgMatch) {
    return bgMatch;
  }
  // If it's already a known Bulgarian category, preserve or canonicalize
  if (bgToEnMap.has(lower)) {
    return trimmed;
  }

  // Language agnostic custom user input: preserve as-is
  return trimmed;
}

export function translateAccountType(type?: string | null, lang: Language = "en"): string {
  if (!type) return "";
  const lower = type.trim().toLowerCase();
  if (ACCOUNT_TYPE_CODES[lower]) {
    return ACCOUNT_TYPE_CODES[lower][lang];
  }
  return translateCategory(type, lang);
}
