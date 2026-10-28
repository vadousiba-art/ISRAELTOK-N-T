import { describe, expect, it } from "vitest";
import { BY_CATEGORY, CATALOG, ITEM_BY_ID, chats, owns, themes, milestones, plannerTemplates } from "@/lib/pro/catalog";
import { CATEGORIES, MILESTONES, RARITIES } from "@/lib/pro/types";
import { SETS, SET_BY_ID } from "@/lib/pro/sets";

// WCAG relative luminance contrast.
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("Pro catalog", () => {
  it("has 20 categories of exactly 20 items: 400 in total", () => {
    expect(Object.keys(BY_CATEGORY).sort()).toEqual([...CATEGORIES].sort());
    for (const c of CATEGORIES) expect(BY_CATEGORY[c], c).toHaveLength(20);
    expect(CATALOG).toHaveLength(400);
  });

  it("gives every item a unique, stable id, a name, a description and valid metadata", () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(400);
    for (const i of CATALOG) {
      expect(i.id).toMatch(/^[a-z]+\.[a-z0-9_]+$/);
      expect(i.id.startsWith(`${i.cat}.`)).toBe(true);
      expect(i.name.length).toBeGreaterThan(2);
      expect(i.desc.length).toBeGreaterThan(5);
      expect(RARITIES).toContain(i.rarity);
      expect(SET_BY_ID[i.set], i.id).toBeTruthy();
      expect(i.unlock === "free" || i.unlock === "pro" || MILESTONES.some((m) => i.unlock === `milestone:${m}`), i.id).toBe(true);
    }
    // Names are unique inside a category.
    for (const c of CATEGORIES) expect(new Set(BY_CATEGORY[c].map((i) => i.name)).size, c).toBe(20);
  });

  it("keeps a free option in every category, so nobody is left with nothing", () => {
    for (const c of CATEGORIES) {
      if (c === "milestone") continue;
      expect(BY_CATEGORY[c].some((i) => i.unlock === "free"), c).toBe(true);
    }
  });

  it("only unlocks milestones by earning them", () => {
    expect(milestones.map((m) => m.p.key)).toEqual([...MILESTONES]);
    for (const m of milestones) expect(m.unlock).toBe(`milestone:${m.p.key}`);
  });

  it("signature looks point at real items of the right category", () => {
    for (const s of SETS) {
      if (!s.look) continue;
      for (const [slot, id] of Object.entries(s.look)) {
        expect(ITEM_BY_ID[id], `${s.id} ${id}`).toBeTruthy();
        expect(ITEM_BY_ID[id].cat).toBe(slot);
      }
    }
    expect(SETS.filter((s) => s.look)).toHaveLength(10);
  });

  it("every theme is readable (body ≥ 7:1, secondary ≥ 4.5:1 on cards)", () => {
    for (const t of themes) {
      expect(contrast(t.p.ink, t.p.bg), t.id).toBeGreaterThanOrEqual(7);
      expect(contrast(t.p.ink, t.p.card), t.id).toBeGreaterThanOrEqual(7);
      expect(contrast(t.p.muted, t.p.card), t.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every chat theme keeps message text readable (≥ 4.5:1)", () => {
    for (const c of chats) {
      expect(contrast(c.p.meInk, c.p.me), c.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.p.themInk, c.p.them), c.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("planner templates only use draft templates that exist", () => {
    for (const p of plannerTemplates) for (const s of p.p.slots) expect(ITEM_BY_ID[s.draft], `${p.id} ${s.draft}`).toBeTruthy();
  });

  it("rarity is a label, never a scarcity or price claim", () => {
    const text = JSON.stringify(CATALOG) + JSON.stringify(SETS);
    expect(text).not.toMatch(/limited|only \d+ left|exclusive drop|\$\d|price|sale|expires/i);
  });

  it("ownership: free for all, Pro for members, milestones only when earned", () => {
    const free = ITEM_BY_ID["ring.void_halo"];
    const pro = ITEM_BY_ID["ring.crimson_eclipse"];
    const earned = ITEM_BY_ID["ring.celestial_orbit"];
    expect(owns(free, null)).toBe(true);
    expect(owns(pro, { pro: false, milestones: [] })).toBe(false);
    expect(owns(pro, { pro: true, milestones: [] })).toBe(true);
    expect(owns(earned, { pro: true, milestones: [] })).toBe(false);
    expect(owns(earned, { pro: false, milestones: ["first_night"] })).toBe(true);
    expect(owns(earned, { pro: true, milestones: [], tester: true })).toBe(true);
    expect(owns(ITEM_BY_ID["milestone.first_night"], { pro: true, milestones: [], tester: true })).toBe(false);
  });
});
