import { mk } from "./mk";
import type { BannerP, EffectP, NameplateP, RingP, ThemeP } from "./cosmetics-a";
import type { BadgeP, ChatP, ReactionP } from "./cosmetics-b";
import type { Unlock } from "../types";

// Staff cosmetics: the most elaborate pieces in YORU, reserved for the people
// who run it. "staff:owner" = the founder, "staff:admin" = admins (and the
// founder). The database checks the account's role before they can be worn,
// and they disappear on their own if the role is removed.
const O: Unlock = "staff:owner";
const A: Unlock = "staff:admin";

export const staffRings = mk<RingP>("ring", [
  ["Founder's Eclipse", "Gold light rays, a turning ring of runes that spell YORU, a crimson moon in orbit and a crowned crest.", "L", "founders_throne", O, { style: "founder", a: "#e0b54f", b: "#e5102f", anim: "spin" }],
  ["Sentinel", "A radar sweep, rotating shield plates and a watch-pulse that rings outward. For YORU admins.", "L", "night_watch", A, { style: "sentinel", a: "#2ee6ff", b: "#0b2a3a", anim: "spin" }],
]);
export const staffBanners = mk<BannerP>("banner", [
  ["Throne of Night", "A crimson-gold moon behind the founder's throne, searchlights crossing the sky, curtains swaying, embers rising.", "L", "founders_throne", O, { scene: "throne", anim: true }],
  ["The Night Watch", "A watchtower over the city, its radar sweeping, a beacon blinking and patrol lights crossing the grid.", "L", "night_watch", A, { scene: "watch", anim: true }],
]);
export const staffNameplates = mk<NameplateP>("nameplate", [
  ["Founder", "Gilded FOUNDER lettering with a turning crown and a slow light sweep.", "L", "founders_throne", O, { title: "Founder · 創設者", font: "display", fx: "founder", a: "#f3e2a9", b: "#e5102f", emblem: "♛", border: "double" }],
  ["YORU Staff", "A cyan staff plate with a scanning line and a shield.", "L", "night_watch", A, { title: "YORU Staff · 管理", font: "mono", fx: "staff", a: "#2ee6ff", b: "#e9f8ff", emblem: "⛨", border: "line" }],
]);
export const staffBadges = mk<BadgeP>("badge", [
  ["Founder's Seal", "A gold crest stamped 創, the founder's mark.", "L", "founders_throne", O, { shape: "crest", glyph: "創", a: "#f3e2a9", b: "#3a0710" }],
  ["Staff Shield", "A cyan shield stamped 守, for the people who keep YORU safe.", "L", "night_watch", A, { shape: "shield", glyph: "守", a: "#2ee6ff", b: "#062a30" }],
]);
export const staffThemes = mk<ThemeP>("theme", [
  ["Founder's Night", "Black lacquer and gold, with a crimson accent.", "L", "founders_throne", O, { mode: "dark", bg: "#050403", bg2: "#090705", card: "#110d08", card2: "#1a140c", line: "#3a2c14", ink: "#fbf3df", ink2: "#e6d6b0", muted: "#b3a27a", hue: 42 }],
  ["Watchtower", "Deep navy with a watchful cyan.", "L", "night_watch", A, { mode: "dark", bg: "#03080d", bg2: "#050d14", card: "#0a151e", card2: "#0f1e2a", line: "#1d3445", ink: "#eaf9ff", ink2: "#c9e6f2", muted: "#8db0c2", hue: 188 }],
]);
export const staffEffects = mk<EffectP>("effect", [
  ["Founder's Aura", "Gold embers and slow stars rising at the edges of the screen.", "L", "founders_throne", O, { kind: "particles", shape: "spark", colors: ["#e0b54f", "#fff1c9", "#e5102f"], count: 30, speed: 0.5, dir: "up" }],
  ["Watch Scan", "A soft cyan scan line sweeping the screen now and then.", "L", "night_watch", A, { kind: "particles", shape: "line", colors: ["#2ee6ff", "#9ff3ff"], count: 3, speed: 0.4, dir: "down" }],
]);
export const staffReactions = mk<ReactionP>("reaction", [
  ["Founder's Crown", "Gold stars and a crimson burst.", "L", "founders_throne", O, { burst: "stars", colors: ["#e0b54f", "#fff1c9", "#e5102f"], count: 14 }],
  ["Sentinel Pulse", "Cyan rings pulsing outward.", "L", "night_watch", A, { burst: "ripple", colors: ["#2ee6ff", "#9ff3ff"], count: 3 }],
]);
export const staffChats = mk<ChatP>("chat", [
  ["Founder's Hall", "Black and gold, with stars.", "L", "founders_throne", O, { bg: "#050403", pattern: "stars", me: "#8a6a1c", meInk: "#ffffff", them: "#1a140c", themInk: "#fbf3df", accent: "#e0b54f" }],
  ["Watchtower Channel", "Navy with a faint scan grid.", "L", "night_watch", A, { bg: "#03080d", pattern: "grid", me: "#0b6f82", meInk: "#ffffff", them: "#0f1e2a", themInk: "#eaf9ff", accent: "#2ee6ff" }],
]);

export const STAFF = [...staffRings, ...staffBanners, ...staffNameplates, ...staffBadges, ...staffThemes, ...staffEffects, ...staffReactions, ...staffChats];
