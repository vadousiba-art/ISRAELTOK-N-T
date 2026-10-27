import type { LiveEvent } from "@/lib/types";

// Turns committed row changes into live events and decides who may receive
// each one. Shared by every transport that is not Supabase postgres_changes:
// the demo SSE stream and the Neon -> Supabase Broadcast relay.
//
// Topics:
//   yoru:u:<user id>  private to that user (Realtime Authorization policy)
//   yoru:all          every signed-in member: new posts and stories, and
//                     activity in public group chats, which every member joins
// Events only carry ids; clients refetch through the RPCs, which re-check
// access, so a topic never reveals content.

export type CapturedChange = {
  t: string;
  op: string;
  id?: string | null;
  channel_id?: string | null;
  message_id?: string | null;
  user_id?: string | null;
  author_id?: string | null;
  kind?: string | null;
  body?: string | null;
};

export type Delivery = { topic: string; event: LiveEvent };

export const ALL_TOPIC = "yoru:all";
export const userTopic = (userId: string) => `yoru:u:${userId}`;

// Read-only lookups the router needs, run with server privileges.
export interface RoutingLookup {
  channels(ids: string[]): Promise<{ id: string; kind: string; is_private: boolean }[]>;
  members(channelIds: string[]): Promise<{ channel_id: string; user_id: string }[]>;
  messageChannels(messageIds: string[]): Promise<{ id: string; channel_id: string }[]>;
}

const UUID = /^[0-9a-f-]{36}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// yoru.changes is newline-separated JSON written by emit_change().
export function parseCaptured(text: string | null | undefined): CapturedChange[] {
  if (!text) return [];
  const out: CapturedChange[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* a truncated line cannot be routed; clients still refresh on their own */
    }
  }
  return out;
}

// The demo database's pg_notify payload carries the whole row.
export function fromNotify(p: { table: string; op: string; row: Record<string, unknown> }): CapturedChange {
  const r = p.row ?? {};
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    t: p.table,
    op: p.op,
    id: s("id"),
    channel_id: s("channel_id"),
    message_id: s("message_id"),
    user_id: s("user_id"),
    author_id: s("author_id"),
    kind: s("kind"),
    body: p.table === "notifications" ? (s("body") ?? "").slice(0, 200) : null,
  };
}

export async function routeChanges(changes: CapturedChange[], overflow: boolean, lookup: RoutingLookup): Promise<Delivery[]> {
  const out: Delivery[] = [];
  const seen = new Set<string>();
  const push = (topic: string, event: LiveEvent) => {
    const key = `${topic}|${JSON.stringify(event)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ topic, event });
    }
  };

  // Chat events need the channel; reactions only know their message.
  const reactionMsgIds = changes.filter((c) => c.t === "message_reactions" && isId(c.message_id)).map((c) => c.message_id!);
  const msgChannel = new Map<string, string>();
  if (reactionMsgIds.length) {
    for (const m of await lookup.messageChannels([...new Set(reactionMsgIds)])) msgChannel.set(m.id, m.channel_id);
  }
  const chatEvents: { channel_id: string; id: string; op: string }[] = [];
  for (const c of changes) {
    if (c.t === "messages" && isId(c.channel_id) && isId(c.id)) {
      chatEvents.push({ channel_id: c.channel_id, id: c.id, op: c.op });
    } else if (c.t === "message_reactions" && isId(c.message_id) && msgChannel.has(c.message_id)) {
      chatEvents.push({ channel_id: msgChannel.get(c.message_id)!, id: c.message_id, op: "UPDATE" });
    }
  }
  if (chatEvents.length) {
    const ids = [...new Set(chatEvents.map((e) => e.channel_id))];
    const chans = new Map((await lookup.channels(ids)).map((ch) => [ch.id, ch]));
    const closed = ids.filter((id) => {
      const ch = chans.get(id);
      return ch && (ch.kind === "dm" || ch.is_private);
    });
    const members = new Map<string, string[]>();
    if (closed.length) {
      for (const m of await lookup.members(closed)) {
        members.set(m.channel_id, [...(members.get(m.channel_id) ?? []), m.user_id]);
      }
    }
    for (const e of chatEvents) {
      const ch = chans.get(e.channel_id);
      if (!ch) continue;
      const event: LiveEvent = { type: "message", channel_id: e.channel_id, id: e.id, op: e.op };
      if (ch.kind === "dm" || ch.is_private) {
        for (const uid of members.get(e.channel_id) ?? []) push(userTopic(uid), event);
      } else {
        push(ALL_TOPIC, event);
      }
    }
  }

  for (const c of changes) {
    if (c.t === "notifications" && c.op === "INSERT" && isId(c.user_id) && isId(c.id)) {
      push(userTopic(c.user_id), { type: "notification", id: c.id, kind: c.kind ?? undefined, body: c.body ?? "" });
    } else if (c.t === "posts" && c.op === "INSERT" && c.kind !== "repost" && isId(c.id) && isId(c.author_id)) {
      push(ALL_TOPIC, { type: "post", id: c.id, author_id: c.author_id });
    } else if (c.t === "stories" && c.op === "INSERT" && isId(c.id)) {
      push(ALL_TOPIC, { type: "story", id: c.id });
    }
  }
  if (overflow) push(ALL_TOPIC, { type: "resync" });
  return out;
}

// Groups deliveries per topic so each topic gets one message.
export function byTopic(deliveries: Delivery[]): Map<string, LiveEvent[]> {
  const m = new Map<string, LiveEvent[]>();
  for (const d of deliveries) m.set(d.topic, [...(m.get(d.topic) ?? []), d.event]);
  return m;
}
