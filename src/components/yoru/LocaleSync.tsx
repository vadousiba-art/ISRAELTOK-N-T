"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { useIdentity } from "@/lib/client/gates";
import { isLocale } from "@/lib/i18n/locales";

// Keeps the interface language the same on every device: the language saved
// on the profile wins once at sign-in; later changes are saved from Settings.
export function LocaleSync() {
  const { data } = useIdentity();
  const { locale, setLocale } = useI18n();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !data) return;
    done.current = true;
    if (isLocale(data.locale) && data.locale !== locale) setLocale(data.locale);
  }, [data, locale, setLocale]);
  return null;
}
