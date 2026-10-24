import type { Accent, CurrentlyKind } from "./types";

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

export const ACCENT_COLORS: Record<Accent, { brand: string; brand2: string; label: string; jp: string }> = {
  crimson: { brand: "#f20d2f", brand2: "#ff3550", label: "Crimson", jp: "紅" },
  sakura: { brand: "#ff5fa2", brand2: "#ff86b9", label: "Sakura", jp: "桜" },
  violet: { brand: "#8b5cf6", brand2: "#a78bfa", label: "Violet", jp: "菫" },
  ice: { brand: "#38bdf8", brand2: "#7dd3fc", label: "Ice", jp: "氷" },
  gold: { brand: "#f5b301", brand2: "#fcd34d", label: "Gold", jp: "金" },
  jade: { brand: "#10b981", brand2: "#34d399", label: "Jade", jp: "翠" },
};

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
