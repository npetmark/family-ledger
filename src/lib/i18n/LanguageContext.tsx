import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { Language, TranslationDictionary } from "./types";
import { en } from "./translations/en";
import { bg } from "./translations/bg";
import { translateCategory as translateCategoryHelper, translateAccountType as translateAccountTypeHelper } from "./categories";
import { supabase } from "@/integrations/supabase/client";
import { enGB, bg as bgLocale } from "date-fns/locale";
import { format as formatFns } from "date-fns";

const STORAGE_KEY = "family_ledger_language";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (path: string, params?: Record<string, string | number>) => string;
  translateCategory: (name?: string | null) => string;
  translateAccountType: (type?: string | null) => string;
  locale: "en-GB" | "bg-BG";
  dateLocale: typeof enGB | typeof bgLocale;
  formatDate: (date: Date | string | number, formatPattern?: string) => string;
  translations: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "bg") return saved;

  const navLang = navigator.language.toLowerCase();
  if (navLang.startsWith("bg")) return "bg";

  return "en";
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  // Sync with document element
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Load language preference from auth profile if available on startup
  useEffect(() => {
    const fetchUserLang = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userLang = user?.user_metadata?.language;
        if (userLang === "en" || userLang === "bg") {
          setLanguageState((prev) => {
            if (prev !== userLang) {
              localStorage.setItem(STORAGE_KEY, userLang);
              return userLang;
            }
            return prev;
          });
        }
      } catch {
        // Silently continue with localStorage / default
      }
    };
    fetchUserLang();
  }, []);

  const setLanguage = useCallback(async (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
      // Persist in supabase user_metadata asynchronously
      await supabase.auth.updateUser({
        data: { language: newLang },
      });
    } catch {
      // Non-blocking: localStorage already saved
    }
  }, []);

  const translations = useMemo(() => {
    return language === "bg" ? bg : en;
  }, [language]);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const keys = path.split(".");
      let current: any = translations;
      let fallback: any = en;

      for (const key of keys) {
        if (current && typeof current === "object" && key in current) {
          current = current[key];
        } else {
          current = undefined;
        }

        if (fallback && typeof fallback === "object" && key in fallback) {
          fallback = fallback[key];
        } else {
          fallback = undefined;
        }
      }

      let result = typeof current === "string" ? current : typeof fallback === "string" ? fallback : path;

      if (params) {
        Object.entries(params).forEach(([paramKey, val]) => {
          result = result.replace(new RegExp(`{${paramKey}}`, "g"), String(val));
        });
      }

      return result;
    },
    [translations]
  );

  const translateCategory = useCallback(
    (name?: string | null): string => {
      return translateCategoryHelper(name, language);
    },
    [language]
  );

  const translateAccountType = useCallback(
    (type?: string | null): string => {
      if (!type) return "";
      return translateAccountTypeHelper(type, language);
    },
    [language]
  );

  const locale = useMemo<"en-GB" | "bg-BG">(() => (language === "bg" ? "bg-BG" : "en-GB"), [language]);
  const dateLocale = useMemo(() => (language === "bg" ? bgLocale : enGB), [language]);

  const formatDate = useCallback(
    (date: Date | string | number, formatPattern = "dd MMM yyyy"): string => {
      const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
      if (isNaN(d.getTime())) return "";
      return formatFns(d, formatPattern, { locale: dateLocale });
    },
    [dateLocale]
  );

  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      t,
      translateCategory,
      translateAccountType,
      locale,
      dateLocale,
      formatDate,
      translations,
    }),
    [language, setLanguage, t, translateCategory, translateAccountType, locale, dateLocale, formatDate, translations]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
