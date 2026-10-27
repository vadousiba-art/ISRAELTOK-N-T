import en, { type MessageKey } from "./messages/en";
import type { Locale } from "./locales";

export type Messages = Partial<Record<MessageKey, string>>;

// Missing keys fall back to English, then to the key itself, so a gap in a
// translation never breaks a screen. {name} placeholders are filled from vars.
export function translate(messages: Messages | undefined, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = messages?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Only the dictionaries actually chosen are downloaded.
export const loaders: Record<Exclude<Locale, "en">, () => Promise<{ default: Messages }>> = {
  ja: () => import("./messages/ja"),
  fr: () => import("./messages/fr"),
  es: () => import("./messages/es"),
  pt: () => import("./messages/pt"),
  de: () => import("./messages/de"),
  ko: () => import("./messages/ko"),
  "zh-Hans": () => import("./messages/zh-Hans"),
  "zh-Hant": () => import("./messages/zh-Hant"),
  id: () => import("./messages/id"),
  th: () => import("./messages/th"),
  vi: () => import("./messages/vi"),
  it: () => import("./messages/it"),
  nl: () => import("./messages/nl"),
  ru: () => import("./messages/ru"),
  ar: () => import("./messages/ar"),
};

export function coverage(messages: Messages): number {
  const keys = Object.keys(en) as MessageKey[];
  return keys.filter((k) => typeof messages[k] === "string" && messages[k]!.length > 0).length / keys.length;
}
