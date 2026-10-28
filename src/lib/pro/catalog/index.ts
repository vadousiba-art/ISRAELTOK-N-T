import type { Category, Item, MilestoneKey, Unlock } from "../types";
import { banners, effects, nameplates, rings, themes } from "./cosmetics-a";
import { badges, chats, layouts, milestones, reactions } from "./cosmetics-b";
import { collectionTemplates, dashboards, draftTemplates, feedPresets, hubViews, hubs, insightLayouts, labs, plannerTemplates, soundPacks } from "./tools";

export * from "./cosmetics-a";
export * from "./cosmetics-b";
export * from "./tools";

// Bump when items are added; the database stores the same version (0009).
export const CATALOG_VERSION = 1;

export const BY_CATEGORY: Record<Category, Item[]> = {
  ring: rings,
  banner: banners,
  nameplate: nameplates,
  theme: themes,
  effect: effects,
  badge: badges,
  layout: layouts,
  collection: collectionTemplates,
  draft: draftTemplates,
  dashboard: dashboards,
  feed: feedPresets,
  hub: hubs,
  reaction: reactions,
  insight: insightLayouts,
  chat: chats,
  sound: soundPacks,
  planner: plannerTemplates,
  milestone: milestones,
  lab: labs,
  hubview: hubViews,
};

export const CATALOG: Item[] = Object.values(BY_CATEGORY).flat();
export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(CATALOG.map((i) => [i.id, i]));
export const item = <P = Record<string, unknown>>(id: string | null | undefined) => (id ? (ITEM_BY_ID[id] as Item<P> | undefined) : undefined);

export function milestoneOf(u: Unlock): MilestoneKey | null {
  return u.startsWith("milestone:") ? (u.slice(10) as MilestoneKey) : null;
}

// What a member can use. The server makes the same decision (pro_owns in 0009)
// and is the one that counts; this only decides what the UI shows as locked.
// Testers (complimentary Pro from an admin) also get milestone-unlocked
// cosmetics; milestones themselves stay earned-only.
export function owns(i: Item, me: { pro: boolean; milestones: readonly string[]; tester?: boolean } | null | undefined): boolean {
  if (i.unlock === "free") return true;
  if (!me) return false;
  if (i.unlock === "pro") return me.pro;
  if (me.tester && i.cat !== "milestone") return true;
  return me.milestones.includes(milestoneOf(i.unlock)!);
}
