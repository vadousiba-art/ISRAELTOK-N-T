import type { CurrentlyKind } from "./types";

// Mirrors public.level_for() in supabase/migrations/0003_yoru_features.sql.
export const levelFor = (xp: number) => Math.floor(Math.sqrt(Math.max(xp, 0) / 40)) + 1;
export const xpForLevel = (level: number) => 40 * (level - 1) * (level - 1);

const TITLES: [number, string, string][] = [
  [20, "Night Sovereign", "夜の王"],
  [16, "Legend", "伝説"],
  [12, "Sensei", "師匠"],
  [8, "Senpai", "先輩"],
  [5, "Regular", "常連"],
  [3, "Night Owl", "夜更かし"],
  [1, "Newcomer", "新人"],
];

export function levelTitle(level: number) {
  const [, en, jp] = TITLES.find(([min]) => level >= min) ?? TITLES[TITLES.length - 1];
  return { en, jp };
}

export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, floor, next, pct: Math.min(1, (xp - floor) / Math.max(next - floor, 1)) };
}

// Personal color. Everything accent-colored is generated from one hue
// (see --accent-h in globals.css). 351 is YORU red, #F20D2F.
export const DEFAULT_HUE = 351;
export const HUE_STORAGE_KEY = "yoru-hue";

export const HUE_PRESETS: { hue: number; label: string; jp: string }[] = [
  { hue: 351, label: "YORU red", jp: "紅" },
  { hue: 330, label: "Sakura", jp: "桜" },
  { hue: 268, label: "Violet", jp: "菫" },
  { hue: 205, label: "Ice", jp: "氷" },
  { hue: 160, label: "Jade", jp: "翠" },
  { hue: 43, label: "Gold", jp: "金" },
  { hue: 20, label: "Ember", jp: "炎" },
];

// The brand color for a hue, matching --brand in dark mode.
export const hueColor = (hue: number | null | undefined, lightness = 50) =>
  hue == null || hue === DEFAULT_HUE ? `hsl(351.4, 90%, ${lightness}%)` : `hsl(${hue}, 90%, ${lightness}%)`;

export function hueName(hue: number) {
  const exact = HUE_PRESETS.find((p) => Math.abs(p.hue - hue) <= 4);
  if (exact) return exact.label;
  const names: [number, string][] = [[15, "Red"], [40, "Orange"], [65, "Gold"], [90, "Lime"], [150, "Green"], [185, "Teal"], [215, "Sky"], [250, "Blue"], [285, "Violet"], [320, "Magenta"], [345, "Pink"], [360, "Red"]];
  return names.find(([max]) => hue < max)?.[1] ?? "Red";
}

// Recolors the whole interface. Remembered locally so the next visit paints
// in the right color before the profile loads.
export function applyHue(hue: number | null | undefined) {
  const root = document.documentElement;
  if (hue == null || hue === DEFAULT_HUE) root.style.removeProperty("--accent-h");
  else root.style.setProperty("--accent-h", String(hue));
  try {
    if (hue == null || hue === DEFAULT_HUE) localStorage.removeItem(HUE_STORAGE_KEY);
    else localStorage.setItem(HUE_STORAGE_KEY, String(hue));
  } catch {
    /* storage unavailable */
  }
}

export const CURRENTLY: Record<CurrentlyKind, { verb: string; emoji: string }> = {
  watching: { verb: "Watching", emoji: "📺" },
  reading: { verb: "Reading", emoji: "📖" },
  listening: { verb: "Listening to", emoji: "🎧" },
  playing: { verb: "Playing", emoji: "🎮" },
};

// Minutes to add to UTC to get the viewer's local time (for nightly check-ins).
export const tzOffsetMinutes = () => -new Date().getTimezoneOffset();

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return { jp: "おはよう", en: "Good morning" };
  if (h >= 11 && h < 17) return { jp: "こんにちは", en: "Good afternoon" };
  return { jp: "こんばんは", en: "Good evening" };
}

// App-wide custom events for celebrations.
export const LEVEL_UP_EVENT = "yoru:levelup";
export const NIGHT_MODE_EVENT = "yoru:night";
export const PALETTE_EVENT = "yoru:palette";

export function celebrateLevelUp(level: number) {
  window.dispatchEvent(new CustomEvent(LEVEL_UP_EVENT, { detail: { level } }));
}

export function prefersReducedMotion() {
  const pref = document.documentElement.dataset.motion;
  if (pref === "reduce") return true;
  if (pref === "full") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
