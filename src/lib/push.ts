import { AWARD_INFO, REACTION_EMOJI } from "./jokes";
import type { AwardKind, ReactionKind } from "./types";

// How each YORU notification reads as a push on a lock screen. Pure (no keys,
// no network) so the wording is tested and shared by the server and the
// service worker's test notification.

export type PushItem = {
  id: string;
  kind: string;
  body: string;
  post_id: string | null;
  channel_id: string | null;
  actor: { name: string; username: string; avatar: string | null } | null;
  unread: number;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string; // where tapping it opens (same-origin path)
  tag: string; // newer pushes with the same tag replace older ones
  icon?: string; // absolute URL (the actor's avatar or YORU's mark)
  renotify?: boolean;
  unread: number; // for the app icon badge
};

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const quote = (s: string) => (s.trim() ? `: “${clip(s, 90)}”` : "");

const PHRASE: Record<string, (b: string) => string> = {
  // For likes, reactions and awards the body holds the kind, not text.
  like: () => "liked your post",
  reaction: (b) => `reacted ${REACTION_EMOJI[b as ReactionKind] ?? ""} to your post`.replace("  ", " "),
  comment: (b) => `commented${quote(b)}`,
  reply: (b) => `replied${quote(b)}`,
  mention: (b) => `mentioned you${quote(b)}`,
  repost: () => "reposted your post",
  award: (b) => (AWARD_INFO[b as AwardKind] ? `gave your post ${AWARD_INFO[b as AwardKind].emoji} ${AWARD_INFO[b as AwardKind].label}` : "gave your post an award"),
  message: (b) => clip(b, 140) || "sent you a message",
  friend_post: (b) => `posted${quote(b)}`,
  roast: (b) => `roasted you${quote(b)}`,
};

export function wordPush(n: PushItem, site: string): PushPayload {
  const abs = (u: string | null | undefined) => (!u ? undefined : u.startsWith("http") ? u : `${site}${u.startsWith("/") ? u : `/api/media/${u}`}`);
  const url = n.channel_id && (n.kind === "message" || !n.post_id)
    ? `/chat/${n.channel_id}`
    : n.post_id
      ? `/post/${n.post_id}`
      : n.kind === "moderation" || n.kind === "report_update"
        ? "/standing"
        : "/notifications";
  const icon = abs(n.actor?.avatar) ?? `${site}/brand/yoru/app-icon-512.png`;
  const base = { url, icon, unread: n.unread };

  if (n.kind === "level_up") return { ...base, title: "Level up 昇", body: `You reached level ${clip(n.body, 10)}. Keep the night going.`, tag: "level", icon: `${site}/brand/yoru/app-icon-512.png` };
  const phrase = PHRASE[n.kind];
  if (phrase && n.actor) {
    return {
      ...base,
      title: n.kind === "message" ? n.actor.name : `${n.actor.name}`,
      body: phrase(n.body),
      // Likes on one post collapse into one; each chat keeps one, re-alerting.
      tag: n.kind === "message" ? `chat-${n.channel_id}` : n.post_id && (n.kind === "like" || n.kind === "reaction") ? `likes-${n.post_id}` : n.id,
      renotify: n.kind === "message",
    };
  }
  // YORU's own notices (announcements, Night Watch, report updates, system).
  return { ...base, title: n.kind === "moderation" ? "YORU · Night Watch" : "YORU", body: clip(n.body, 180) || "You have a new notification.", tag: n.id, icon: `${site}/brand/yoru/app-icon-512.png` };
}
