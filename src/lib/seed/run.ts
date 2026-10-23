import {
  SEED_USERS,
  SEED_POSTS,
  SEED_STORIES,
  SEED_CHANNEL_MESSAGES,
  SEED_UNREAD_FOR_YOU,
  SEED_DMS,
  SEED_UNREAD_NOTIFICATIONS,
  type SeedComment,
  type SeedUser,
} from "./data";

export const BOT = "00000000-0000-4000-8000-00000000a1e7";
export const CHANNEL_IDS: Record<string, string> = {
  "the-boys": "00000000-0000-4000-8000-0000000c0001",
  "war-room": "00000000-0000-4000-8000-0000000c0002",
  "meme-dump": "00000000-0000-4000-8000-0000000c0003",
};

// Storage-agnostic seeding. Demo mode implements this with raw SQL against
// PGlite; the Supabase seed script implements it with the admin API.
export interface SeedAdapter {
  createUser(u: SeedUser, inviteCode: string | null): Promise<string>;
  insert(table: string, row: Record<string, unknown>): Promise<string | undefined>;
  update(table: string, match: Record<string, unknown>, values: Record<string, unknown>): Promise<void>;
  finalize?(ids: Record<string, string>): Promise<void>;
  log?(msg: string): void;
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export async function runSeed(a: SeedAdapter) {
  const ids: Record<string, string> = { bot: BOT };
  const log = a.log ?? (() => {});

  // 1. Users. The first one becomes owner on an empty database; everyone else
  //    goes through a real invite (which is revoked afterwards).
  const inviteCode = `seed-${Math.random().toString(36).slice(2, 10)}`;
  let invited = false;
  for (const u of SEED_USERS) {
    if (!invited && Object.keys(ids).length > 1) {
      await a.insert("invites", { code: inviteCode, created_by: ids[SEED_USERS[0].key], max_uses: 500, note: "seed" });
      invited = true;
    }
    ids[u.key] = await a.createUser(u, Object.keys(ids).length > 1 ? inviteCode : null);
    await a.update(
      "profiles",
      { id: ids[u.key] },
      {
        bio: u.bio ?? "",
        status: u.status ?? "",
        badge: u.badge ?? "",
        verified: u.verified ?? false,
        roast_opt_in: u.roast_opt_in ?? false,
        roast_intensity: u.roast_intensity ?? 2,
        ai_context_opt_in: u.ai_context_opt_in ?? false,
        leaderboard_opt_in: u.leaderboard_opt_in ?? true,
        inside_jokes: u.inside_jokes ?? [],
        chaos_points: u.chaos_points ?? 0,
        last_seen_at: u.key.startsWith("npc") ? ago(600) : ago(1),
      },
    );
  }
  if (invited) await a.update("invites", { code: inviteCode }, { revoked: true });
  log(`seeded ${SEED_USERS.length} users`);

  // 2. Posts and everything hanging off them.
  for (const p of [...SEED_POSTS].reverse()) {
    const postId = await a.insert("posts", {
      author_id: ids[p.author],
      kind: p.kind ?? "post",
      body: p.body,
      media_url: p.media_url ?? null,
      media_type: p.media_type ?? null,
      link_url: p.link_url ?? null,
      roast: p.roast ?? null,
      roast_label: p.roast_label ?? null,
      target_user_id: p.target ? ids[p.target] : null,
      created_at: ago(p.minutesAgo),
    });
    if (!postId) throw new Error("post insert returned no id");
    let t = p.minutesAgo;
    const tick = () => ago(Math.max((t -= 0.5), 0.1));

    for (const [i, opt] of (p.poll ?? []).entries()) {
      const optId = await a.insert("poll_options", { post_id: postId, label: opt.label, position: i });
      for (const voter of opt.voters) {
        await a.insert("poll_votes", { post_id: postId, option_id: optId, user_id: ids[voter], created_at: tick() });
      }
    }
    for (const u of p.likes) {
      await a.insert("reactions", { post_id: postId, user_id: ids[u], kind: "heart", created_at: tick() });
    }
    for (const r of p.reactions ?? []) {
      for (const u of r.users) {
        await a.insert("reactions", { post_id: postId, user_id: ids[u], kind: r.kind, created_at: tick() });
      }
    }
    const addComments = async (list: SeedComment[], parent: string | null) => {
      for (const c of list) {
        const cid = await a.insert("comments", {
          post_id: postId,
          parent_id: parent,
          author_id: ids[c.author],
          body: c.body,
          is_ai: c.ai ?? false,
          created_at: ago(c.minutesAgo),
        });
        if (c.replies) await addComments(c.replies, cid ?? null);
      }
    };
    await addComments(p.comments ?? [], null);
    for (const u of p.reposts ?? []) {
      await a.insert("posts", { author_id: ids[u], kind: "repost", body: "", repost_of: postId, created_at: tick() });
    }
    for (const aw of p.awards ?? []) {
      await a.insert("awards", { post_id: postId, giver_id: ids[aw.giver], kind: aw.kind, created_at: tick() });
    }
  }
  log(`seeded ${SEED_POSTS.length} posts`);

  // 3. Stories.
  for (const s of [...SEED_STORIES].reverse()) {
    await a.insert("stories", {
      author_id: ids[s.author],
      channel_id: s.channel ? CHANNEL_IDS[s.channel] : null,
      media_url: s.media_url ?? null,
      media_type: s.media_url ? "image" : null,
      text: s.text ?? "",
      bg: s.bg ?? "lime",
      created_at: ago(s.minutesAgo),
      expires_at: new Date(Date.now() + (24 * 60 - s.minutesAgo) * 60_000).toISOString(),
    });
  }

  // 4. Chats.
  const allMessageTimes: Record<string, number[]> = {};
  for (const [slug, msgs] of Object.entries(SEED_CHANNEL_MESSAGES)) {
    const ch = CHANNEL_IDS[slug];
    allMessageTimes[slug] = msgs.map((m) => m.minutesAgo);
    for (const m of msgs) {
      const mid = await a.insert("messages", { channel_id: ch, author_id: ids[m.author], body: m.body, created_at: ago(m.minutesAgo) });
      for (const [emoji, users] of m.reactions ?? []) {
        for (const u of users) await a.insert("message_reactions", { message_id: mid, user_id: ids[u], emoji });
      }
    }
    // Everyone has read everything except the configured unread tail for "you".
    const unread = SEED_UNREAD_FOR_YOU[slug] ?? 0;
    const sorted = [...msgs].sort((x, y) => y.minutesAgo - x.minutesAgo);
    const lastReadIdx = sorted.length - unread - 1;
    const youReadAt = lastReadIdx >= 0 ? ago(sorted[lastReadIdx].minutesAgo - 0.1) : ago(100000);
    for (const u of SEED_USERS) {
      await a.update(
        "channel_members",
        { channel_id: ch, user_id: ids[u.key] },
        { last_read_at: u.key === "you" ? youReadAt : new Date().toISOString() },
      );
    }
  }
  for (const dm of SEED_DMS) {
    const ch = await a.insert("channels", { kind: "dm", is_private: true, emoji: "✉️", created_by: ids.you });
    await a.insert("channel_members", { channel_id: ch, user_id: ids.you, last_read_at: new Date().toISOString() });
    await a.insert("channel_members", { channel_id: ch, user_id: ids[dm.with], last_read_at: new Date().toISOString() });
    for (const m of dm.messages) {
      await a.insert("messages", { channel_id: ch, author_id: ids[m.author], body: m.body, created_at: ago(m.minutesAgo) });
    }
  }
  log("seeded chats + stories");

  await a.finalize?.(ids);
  return { ids, unreadNotifications: SEED_UNREAD_NOTIFICATIONS };
}
