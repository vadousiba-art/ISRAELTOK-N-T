// Interface languages. User-generated content is never translated or altered
// by this; it keeps its own language (rendered with dir="auto").
export const LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ja", name: "日本語", dir: "ltr" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "pt", name: "Português", dir: "ltr" },
  { code: "de", name: "Deutsch", dir: "ltr" },
  { code: "ko", name: "한국어", dir: "ltr" },
  { code: "zh-Hans", name: "简体中文", dir: "ltr" },
  { code: "zh-Hant", name: "繁體中文", dir: "ltr" },
  { code: "id", name: "Bahasa Indonesia", dir: "ltr" },
  { code: "th", name: "ไทย", dir: "ltr" },
  { code: "vi", name: "Tiếng Việt", dir: "ltr" },
  { code: "it", name: "Italiano", dir: "ltr" },
  { code: "nl", name: "Nederlands", dir: "ltr" },
  { code: "ru", name: "Русский", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "yoru-locale";

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);
export const dirOf = (l: Locale) => LOCALES.find((x) => x.code === l)?.dir ?? "ltr";
