import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Runs the real migrations in an in-memory PGlite and checks the security
// model end to end: invite gating, RLS, RPC authorization, privacy rules.

let db: PGlite;
const root = path.resolve(__dirname, "../..");
const ids: Record<string, string> = {};

async function as<T = unknown>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  return db.transaction(async (tx) => {
    if (uid) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await tx.exec("set local role authenticated");
    }
    const res = await tx.query<{ r: T }>(sql, keys.map((k) => (args[k] && typeof args[k] === "object" && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : args[k])));
    return res.rows[0]?.r as T;
  });
}

async function sqlAs<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    if (uid) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await tx.exec("set local role authenticated");
    } else {
      await tx.exec("set local role anon");
    }
    return (await tx.query<T>(sql, params)).rows;
  });
}

async function signup(username: string, invite?: string) {
  const r = await db.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [
    `${username.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.dev`,
    JSON.stringify({ username, display_name: username, invite_code: invite ?? null }),
  ]);
  return r.rows[0].id;
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(fs.readFileSync(path.join(root, "src/lib/server/demo/shim.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root, "supabase/migrations/0001_core.sql"), "utf8"));
  ids.owner = await signup("Owner");
  const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", { p_max_uses: 3 });
  ids.alice = await signup("Alice", inv.code);
  ids.bob = await signup("Bob", inv.code);
  ids.carol = await signup("Carol", inv.code);
});

describe("invites & sign-up", () => {
  it("makes the first human the owner and others members", async () => {
    expect((await as<{ role: string }>(ids.owner, "get_me")).role).toBe("owner");
    expect((await as<{ role: string }>(ids.alice, "get_me")).role).toBe("member");
  });

  it("rejects sign-ups without a valid invite and enforces max uses", async () => {
    await expect(signup("Mallory")).rejects.toThrow(/INVALID_INVITE/);
    await expect(signup("Mallory", "nope")).rejects.toThrow(/INVALID_INVITE/);
    const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", { p_max_uses: 1 });
    await signup("Dave", inv.code);
    await expect(signup("Eve", inv.code)).rejects.toThrow(/INVALID_INVITE/);
  });

  it("rejects revoked invites and duplicate usernames (case-insensitive)", async () => {
    const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", { p_max_uses: 5 });
    await expect(signup("alice", inv.code)).rejects.toThrow(/USERNAME_TAKEN/);
    await as(ids.owner, "admin_revoke_invite", { p_code: inv.code });
    await expect(signup("Frank", inv.code)).rejects.toThrow(/INVALID_INVITE/);
  });

  it("only admins can create invites", async () => {
    await expect(as(ids.alice, "admin_create_invite", {})).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("lockdown", () => {
  it("denies anonymous reads and direct table writes", async () => {
    await expect(sqlAs(null, "select * from public.posts")).rejects.toThrow(/permission denied/);
    await expect(sqlAs(ids.alice, "insert into public.posts (author_id, body) values ($1, 'x')", [ids.alice])).rejects.toThrow(/permission denied/);
    await expect(sqlAs(ids.alice, "update public.profiles set role = 'owner' where id = $1", [ids.alice])).rejects.toThrow(/permission denied/);
    await expect(sqlAs(ids.alice, "select * from public.rate_limits")).rejects.toThrow(/permission denied/);
  });

  it("keeps bot functions server-only", async () => {
    await expect(as(ids.alice, "bot_create_post", { p_body: "fake roast" })).rejects.toThrow(/permission denied/);
    await expect(as(ids.alice, "check_invite", { p_code: "x" })).rejects.toThrow(/permission denied/);
  });

  it("blocks banned users entirely", async () => {
    const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", {});
    const troll = await signup("Troll", inv.code);
    await as(ids.owner, "admin_set_banned", { p_user_id: troll, p_banned: true });
    await expect(as(troll, "get_feed")).rejects.toThrow(/NOT_MEMBER/);
    await expect(as(troll, "create_post", { p_body: "let me in" })).rejects.toThrow(/NOT_MEMBER/);
    const rows = await sqlAs(troll, "select count(*)::int as n from public.posts");
    expect(rows[0].n).toBe(0);
  });

  it("does not let members ban the owner or change roles", async () => {
    await expect(as(ids.alice, "admin_set_banned", { p_user_id: ids.owner, p_banned: true })).rejects.toThrow(/FORBIDDEN/);
    await expect(as(ids.alice, "admin_set_role", { p_user_id: ids.alice, p_role: "admin" })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("posting, reactions, comments", () => {
  let postId: string;

  it("creates posts with hashtags + mentions and notifies", async () => {
    postId = await as<string>(ids.alice, "create_post", { p_body: "hello @Bob #Chaos #שלום" });
    const post = await as<{ hashtags: string[]; author: { username: string } }>(ids.bob, "get_post", { p_id: postId });
    expect(post.hashtags.sort()).toEqual(["chaos", "שלום"].sort());
    const notes = await as<{ kind: string }[]>(ids.bob, "get_notifications");
    expect(notes.map((n) => n.kind)).toContain("mention");
  });

  it("rejects attaching someone else's upload", async () => {
    await expect(
      as(ids.alice, "create_post", { p_body: "x", p_media_url: `u/${ids.bob}/11111111-1111-4111-8111-111111111111.png`, p_media_type: "image" }),
    ).rejects.toThrow(/INVALID/);
  });

  it("toggles reactions and counts them", async () => {
    await as(ids.bob, "toggle_reaction", { p_post_id: postId, p_kind: "heart" });
    await as(ids.carol, "toggle_reaction", { p_post_id: postId, p_kind: "heart" });
    await as(ids.carol, "toggle_reaction", { p_post_id: postId, p_kind: "skull" });
    let post = await as<{ counts: { likes: number }; reactions: Record<string, number>; my_reactions: string[] }>(ids.carol, "get_post", { p_id: postId });
    expect(post.counts.likes).toBe(2);
    expect(post.reactions.skull).toBe(1);
    expect(post.my_reactions.sort()).toEqual(["heart", "skull"]);
    await as(ids.carol, "toggle_reaction", { p_post_id: postId, p_kind: "heart" });
    post = await as(ids.carol, "get_post", { p_id: postId });
    expect(post.counts.likes).toBe(1);
  });

  it("supports threaded comments and validates parents", async () => {
    const c1 = await as<{ id: string }>(ids.bob, "add_comment", { p_post_id: postId, p_body: "first" });
    await as(ids.alice, "add_comment", { p_post_id: postId, p_body: "reply", p_parent_id: c1.id });
    const other = await as<string>(ids.carol, "create_post", { p_body: "other post" });
    await expect(as(ids.alice, "add_comment", { p_post_id: other, p_body: "x", p_parent_id: c1.id })).rejects.toThrow(/ghost/);
    const comments = await as<{ parent_id: string | null }[]>(ids.carol, "get_comments", { p_post_id: postId });
    expect(comments).toHaveLength(2);
    expect(comments[1].parent_id).toBe(c1.id);
    const notes = await as<{ kind: string }[]>(ids.bob, "get_notifications");
    expect(notes.map((n) => n.kind)).toContain("reply");
  });

  it("respects notification preferences", async () => {
    await as(ids.alice, "update_my_profile", { p: { notification_prefs: { likes: false } } });
    const p = await as<string>(ids.alice, "create_post", { p_body: "quiet please" });
    await as(ids.bob, "toggle_reaction", { p_post_id: p, p_kind: "heart" });
    const notes = await as<{ kind: string; post_id: string }[]>(ids.alice, "get_notifications");
    expect(notes.some((n) => n.post_id === p && n.kind === "like")).toBe(false);
  });

  it("allows one poll vote per user (changeable)", async () => {
    const poll = await as<string>(ids.alice, "create_post", { p_body: "best?", p_poll_options: ["A", "B"] });
    const post = await as<{ poll: { options: { id: string }[] } }>(ids.bob, "get_post", { p_id: poll });
    const [a, b] = post.poll.options;
    await as(ids.bob, "vote_poll", { p_post_id: poll, p_option_id: a.id });
    const after = await as<{ poll: { total: number; my_vote: string } }>(ids.bob, "vote_poll", { p_post_id: poll, p_option_id: b.id });
    expect(after.poll.total).toBe(1);
    expect(after.poll.my_vote).toBe(b.id);
  });

  it("toggles reposts and hides plain reposts from the home feed", async () => {
    const r = await as<{ reposted: boolean }>(ids.carol, "toggle_repost", { p_post_id: postId });
    expect(r.reposted).toBe(true);
    const feed = await as<{ kind: string }[]>(ids.alice, "get_feed", { p_mode: "latest" });
    expect(feed.some((p) => p.kind === "repost")).toBe(false);
    const prof = await as<{ kind: string }[]>(ids.alice, "get_feed", { p_mode: "user", p_arg: "carol" });
    expect(prof.some((p) => p.kind === "repost")).toBe(true);
    expect((await as<{ reposted: boolean }>(ids.carol, "toggle_repost", { p_post_id: postId })).reposted).toBe(false);
  });

  it("stops self-awards and lets only authors/admins delete", async () => {
    await expect(as(ids.alice, "give_award", { p_post_id: postId, p_kind: "menace" })).rejects.toThrow(/yourself/);
    await as(ids.bob, "give_award", { p_post_id: postId, p_kind: "menace" });
    await expect(as(ids.bob, "delete_post", { p_id: postId })).rejects.toThrow(/FORBIDDEN/);
    const mine = await as<string>(ids.bob, "create_post", { p_body: "delete me" });
    await as(ids.owner, "delete_post", { p_id: mine });
    await expect(as(ids.bob, "get_post", { p_id: mine })).rejects.toThrow(/NOT_FOUND/);
  });

  it("rate limits posting", async () => {
    const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", {});
    const spammer = await signup("Spammer", inv.code);
    for (let i = 0; i < 20; i++) await as(spammer, "create_post", { p_body: `spam ${i}` });
    await expect(as(spammer, "create_post", { p_body: "one more" })).rejects.toThrow(/RATE_LIMIT/);
  });
});

describe("blocking & privacy", () => {
  it("hides blocked users' posts both ways and prevents DMs", async () => {
    const p = await as<string>(ids.carol, "create_post", { p_body: "carol speaks" });
    await as(ids.bob, "toggle_block", { p_user_id: ids.carol });
    const bobFeed = await as<{ id: string }[]>(ids.bob, "get_feed", { p_limit: 50 });
    expect(bobFeed.some((x) => x.id === p)).toBe(false);
    await expect(as(ids.carol, "start_dm", { p_user_id: ids.bob })).rejects.toThrow(/FORBIDDEN/);
    await as(ids.bob, "toggle_block", { p_user_id: ids.carol });
  });

  it("keeps private channels and DMs private", async () => {
    const ch = await as<string>(ids.alice, "create_channel", { p_name: "secret", p_is_private: true, p_member_ids: [ids.bob] });
    await as(ids.alice, "send_message", { p_channel_id: ch, p_body: "top secret" });
    expect((await as<{ body: string }[]>(ids.bob, "get_messages", { p_channel_id: ch }))[0].body).toBe("top secret");
    await expect(as(ids.carol, "get_messages", { p_channel_id: ch })).rejects.toThrow(/FORBIDDEN/);
    await expect(as(ids.carol, "send_message", { p_channel_id: ch, p_body: "let me in" })).rejects.toThrow(/FORBIDDEN/);
    await expect(as(ids.carol, "join_channel", { p_channel_id: ch })).rejects.toThrow(/FORBIDDEN/);
    const direct = await sqlAs(ids.carol, "select count(*)::int as n from public.messages where channel_id = $1", [ch]);
    expect(direct[0].n).toBe(0);
    const channels = await as<{ id: string }[]>(ids.carol, "get_channels");
    expect(channels.some((c) => c.id === ch)).toBe(false);
  });

  it("counts unread messages and DMs create notifications", async () => {
    const dm = await as<string>(ids.alice, "start_dm", { p_user_id: ids.carol });
    expect(await as<string>(ids.carol, "start_dm", { p_user_id: ids.alice })).toBe(dm);
    await as(ids.alice, "send_message", { p_channel_id: dm, p_body: "psst" });
    const me = await as<{ unread_messages: number }>(ids.carol, "get_me");
    expect(me.unread_messages).toBeGreaterThan(0);
    const notes = await as<{ kind: string }[]>(ids.carol, "get_notifications");
    expect(notes.map((n) => n.kind)).toContain("message");
  });

  it("only shares AI context the user opted into", async () => {
    await as(ids.bob, "update_my_profile", { p: { bio: "secret bio", roast_opt_in: false, ai_context_opt_in: true } });
    const ctx = await as<Record<string, unknown>>(ids.alice, "get_ai_context", { p_user_id: ids.bob });
    expect(ctx.roast_opt_in).toBe(false);
    expect(ctx.bio).toBeUndefined();
    await as(ids.bob, "update_my_profile", { p: { roast_opt_in: true, ai_context_opt_in: false } });
    const ctx2 = await as<Record<string, unknown>>(ids.alice, "get_ai_context", { p_user_id: ids.bob });
    expect(ctx2.roast_opt_in).toBe(true);
    expect(ctx2.bio).toBeNull();
    expect(ctx2.recent_posts).toBeNull();
  });

  it("lets admins resolve reports by deleting content", async () => {
    const p = await as<string>(ids.carol, "create_post", { p_body: "reportable" });
    await as(ids.bob, "create_report", { p_target_type: "post", p_target_id: p, p_reason: "spam" });
    const overview = await as<{ reports: { id: string; target_id: string }[] }>(ids.owner, "admin_overview");
    const report = overview.reports.find((r) => r.target_id === p)!;
    await as(ids.owner, "admin_resolve_report", { p_report_id: report.id, p_action: "delete" });
    await expect(as(ids.bob, "get_post", { p_id: p })).rejects.toThrow(/NOT_FOUND/);
  });
});
