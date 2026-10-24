import { describe, it, expect } from "vitest";
import { translateCategory, translateAccountType, transliterateBulgarianToLatin } from "@/lib/i18n/categories";
import { en } from "@/lib/i18n/translations/en";
import { bg } from "@/lib/i18n/translations/bg";

describe("i18n system tests", () => {
  describe("translateCategory", () => {
    it("translates system main categories between English and Bulgarian", () => {
      expect(translateCategory("Needs", "bg")).toBe("Нужди");
      expect(translateCategory("Нужди", "en")).toBe("Needs");
      expect(translateCategory("Wants", "bg")).toBe("Желания");
      expect(translateCategory("Желания", "en")).toBe("Wants");
      expect(translateCategory("Investments", "bg")).toBe("Инвестиции");
      expect(translateCategory("Income", "bg")).toBe("Приходи");
    });

    it("translates system subcategories between English and Bulgarian", () => {
      expect(translateCategory("Groceries", "bg")).toBe("Пазар");
      expect(translateCategory("Пазар", "en")).toBe("Groceries");
      expect(translateCategory("Rent", "bg")).toBe("Наем");
      expect(translateCategory("Dining Out", "bg")).toBe("Ресторанти");
      expect(translateCategory("Salary", "bg")).toBe("Заплата");
    });

    it("translates comprehensive Bulgarian subcategories to English", () => {
      // Food & Groceries
      expect(translateCategory("Храна", "en")).toBe("Food");
      expect(translateCategory("Хранителни стоки", "en")).toBe("Groceries");
      expect(translateCategory("Супермаркет", "en")).toBe("Supermarket");
      expect(translateCategory("Кафе", "en")).toBe("Coffee");

      // Home & Utilities
      expect(translateCategory("Ток", "en")).toBe("Electricity");
      expect(translateCategory("Вода", "en")).toBe("Water");
      expect(translateCategory("Парно", "en")).toBe("Heating");
      expect(translateCategory("Интернет", "en")).toBe("Internet");
      expect(translateCategory("Телефон", "en")).toBe("Phone");
      expect(translateCategory("Вход", "en")).toBe("Building Fee");
      expect(translateCategory("Ремонт", "en")).toBe("Renovation");

      // Transport
      expect(translateCategory("Кола", "en")).toBe("Car");
      expect(translateCategory("Гориво", "en")).toBe("Fuel");
      expect(translateCategory("Бензин", "en")).toBe("Petrol");
      expect(translateCategory("Автосервиз", "en")).toBe("Auto Repair");
      expect(translateCategory("Паркинг", "en")).toBe("Parking");

      // Health & Care
      expect(translateCategory("Аптека", "en")).toBe("Pharmacy");
      expect(translateCategory("Лекарства", "en")).toBe("Medications");
      expect(translateCategory("Зъболекар", "en")).toBe("Dentist");

      // Shopping & Leisure
      expect(translateCategory("Дрехи", "en")).toBe("Clothing");
      expect(translateCategory("Обувки", "en")).toBe("Shoes");
      expect(translateCategory("Подаръци", "en")).toBe("Gifts");
      expect(translateCategory("Кино", "en")).toBe("Cinema");
      expect(translateCategory("Спорт", "en")).toBe("Sports");
      expect(translateCategory("Почивка", "en")).toBe("Vacation");
      expect(translateCategory("Пътувания", "en")).toBe("Travel");

      // Family & Kids
      expect(translateCategory("Деца", "en")).toBe("Kids");
      expect(translateCategory("Училище", "en")).toBe("School");
      expect(translateCategory("Детска градина", "en")).toBe("Kindergarten");

      // Finance & Tax
      expect(translateCategory("Данъци", "en")).toBe("Taxes");
      expect(translateCategory("Кредити", "en")).toBe("Loans");
      expect(translateCategory("Банкови такси", "en")).toBe("Bank Fees");
      expect(translateCategory("Крипто", "en")).toBe("Crypto");

      // Income & Other
      expect(translateCategory("Бонус", "en")).toBe("Bonus");
      expect(translateCategory("Допълнителни доходи", "en")).toBe("Extra Income");
      expect(translateCategory("Други разходи", "en")).toBe("Other Expenses");
    });

    it("translates system shopping categories", () => {
      expect(translateCategory("Produce", "bg")).toBe("Плодове и зеленчуци");
      expect(translateCategory("Bakery", "bg")).toBe("Хляб и тестени");
      expect(translateCategory("Excess (not on list)", "bg")).toBe("Извън списъка (допълнителни)");
      expect(translateCategory("Other", "bg")).toBe("Други");
    });

    it("leaves custom user text untouched (language-agnostic)", () => {
      // User's specific example: UniCredit account name
      expect(translateCategory("UniCredit", "bg")).toBe("UniCredit");
      expect(translateCategory("UniCredit", "en")).toBe("UniCredit");

      // Custom user categories/accounts
      expect(translateCategory("My Custom Hobby", "bg")).toBe("My Custom Hobby");
      expect(translateCategory("Kaufland Trip", "bg")).toBe("Kaufland Trip");
      expect(translateCategory("DSK Bank EUR", "bg")).toBe("DSK Bank EUR");
      expect(translateCategory("Revolut Vault", "bg")).toBe("Revolut Vault");
    });

    it("transliterates personal names and custom Cyrillic words into Latin", () => {
      expect(translateCategory("Никола", "en")).toBe("Nikola");
      expect(translateCategory("Мария", "en")).toBe("Maria");
      expect(translateCategory("Иван", "en")).toBe("Ivan");
      expect(translateCategory("Георги", "en")).toBe("Georgi");
      expect(translateCategory("Александър", "en")).toBe("Aleksandar");
      expect(translateCategory("Цветелина", "en")).toBe("Tsvetelina");
      expect(translateCategory("Борис", "en")).toBe("Boris");
    });

    it("translates compound subcategories containing personal names or custom text", () => {
      expect(translateCategory("Дрехи - Никола", "en")).toBe("Clothing - Nikola");
      expect(translateCategory("Джобни Никола", "en")).toBe("Pocket Money Nikola");
      expect(translateCategory("Училище - Мария", "en")).toBe("School - Maria");
      expect(translateCategory("Детска градина - Борис", "en")).toBe("Kindergarten - Boris");
      expect(translateCategory("Курсове по плуване", "en")).toBe("Courses po Swimming");
    });

    it("guarantees NO Cyrillic remains in category names when English is selected", () => {
      const sampleBulgarianCategories = [
        "Никола",
        "Дрехи - Никола",
        "Джобни Никола",
        "Мария",
        "Иван",
        "ГТП",
        "Гражданска",
        "Такса смет",
        "Детегледачка",
        "Смяна на масло",
        "Вноска по лизинг",
        "Непозната категория",
        "Зъболекар Калоян",
        "Бебешки стоки - Стефан",
      ];

      for (const cat of sampleBulgarianCategories) {
        const enTranslated = translateCategory(cat, "en");
        expect(
          /[а-яА-ЯёЁ]/.test(enTranslated),
          `Expected no Cyrillic in "${cat}" -> "${enTranslated}"`
        ).toBe(false);
      }
    });

    it("handles null or empty gracefully", () => {
      expect(translateCategory(null, "bg")).toBe("");
      expect(translateCategory(undefined, "en")).toBe("");
      expect(translateCategory("", "bg")).toBe("");
    });
  });

  describe("transliterateBulgarianToLatin", () => {
    it("handles standard letter mappings and the terminal -ия rule", () => {
      expect(transliterateBulgarianToLatin("Никола")).toBe("Nikola");
      expect(transliterateBulgarianToLatin("Мария")).toBe("Maria"); // terminal -ия -> -ia
      expect(transliterateBulgarianToLatin("София")).toBe("Sofia");
      expect(transliterateBulgarianToLatin("България")).toBe("Balgaria");
      expect(transliterateBulgarianToLatin("приятел")).toBe("priyatel"); // non-terminal -ия- preserves "ya"
      expect(transliterateBulgarianToLatin("Чавдар")).toBe("Chavdar");
      expect(transliterateBulgarianToLatin("Щъркел")).toBe("Shtarkel");
      expect(transliterateBulgarianToLatin("Юлия")).toBe("Yulia");
      expect(transliterateBulgarianToLatin("Жоро")).toBe("Zhoro");
      expect(transliterateBulgarianToLatin("")).toBe("");
    });
  });

  describe("translateAccountType", () => {
    it("translates standard account types", () => {
      expect(translateAccountType("cash", "bg")).toBe("В брой");
      expect(translateAccountType("cash", "en")).toBe("Cash");
      expect(translateAccountType("bank", "bg")).toBe("Банкова сметка");
      expect(translateAccountType("bank", "en")).toBe("Bank Account");
      expect(translateAccountType("investment", "bg")).toBe("Инвестиция");
      expect(translateAccountType("investment", "en")).toBe("Investment");
      expect(translateAccountType("custom", "bg")).toBe("Друг");
      expect(translateAccountType("custom", "en")).toBe("Custom");
    });

    it("falls back to raw string for non-system types", () => {
      expect(translateAccountType("crypto_wallet", "bg")).toBe("crypto_wallet");
    });
  });

  describe("Translation dictionaries consistency", () => {
    it("ensures English and Bulgarian dictionaries have identical top-level keys", () => {
      const enKeys = Object.keys(en).sort();
      const bgKeys = Object.keys(bg).sort();
      expect(bgKeys).toEqual(enKeys);
    });

    it("ensures all sub-keys match across languages", () => {
      for (const section of Object.keys(en) as (keyof typeof en)[]) {
        const enSectionKeys = Object.keys(en[section]).sort();
        const bgSectionKeys = Object.keys(bg[section]).sort();
        expect(bgSectionKeys).toEqual(enSectionKeys);
      }
    });
  });
});
