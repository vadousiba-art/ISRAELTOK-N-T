"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, dirOf, isLocale, type Locale } from "@/lib/i18n/locales";
import { loaders, translate, type Messages } from "@/lib/i18n/translate";
import type { MessageKey } from "@/lib/i18n/messages/en";

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  formatDate: (d: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (n: number) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

function applyToDocument(l: Locale) {
  document.documentElement.lang = l;
  document.documentElement.dir = dirOf(l);
}

// The server always renders English; the saved language (set on <html> by the
// boot script before paint) is applied right after hydration.
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<Messages | undefined>(undefined);

  const load = useCallback(async (l: Locale) => {
    applyToDocument(l);
    if (l === "en") {
      setMessages(undefined);
      setLocaleState(l);
      return;
    }
    try {
      const m = await loaders[l]();
      setMessages(m.default);
      setLocaleState(l);
    } catch {
      // Offline or chunk missing: keep the current language.
      applyToDocument(locale);
    }
  }, [locale]);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLocale(saved) && saved !== "en") load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (l: Locale) => {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, l);
      } catch {
        /* storage blocked */
      }
      load(l);
    },
    [load],
  );

  const value = useMemo<I18nCtx>(() => {
    const intl = locale;
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(messages, key, vars),
      formatDate: (d, opts) => new Intl.DateTimeFormat(intl, opts ?? { dateStyle: "medium" }).format(new Date(d)),
      formatNumber: (n) => new Intl.NumberFormat(intl).format(n),
    };
  }, [locale, messages, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

export const useT = () => useI18n().t;
