import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Migration 0003 (YORU features) on top of 0001: progression, site rules,
// admin tools, audit log, and that the new tables stay locked down.

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
    const res = await tx.query<{ r: T }>(sql, keys.map((k) => (args[k] && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
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
    `${username.toLowerCase()}@test.dev`,
    JSON.stringify({ username, display_name: username, invite_code: invite ?? null }),
  ]);
  return r.rows[0].id;
}

const mkPost = async (uid: string, args: Record<string, unknown>) => ({ id: await as<string>(uid, "create_post", args) });
const xpOf = async (uid: string) => (await db.query<{ xp: number }>("select xp from public.profiles where id = $1", [uid])).rows[0].xp;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(fs.readFileSync(path.join(root, "src/lib/server/demo/shim.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root, "supabase/migrations/0001_core.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(root, "supabase/migrations/0003_yoru_features.sql"), "utf8"));
  // Running it twice must be harmless (idempotent migration).
  await db.exec(fs.readFileSync(path.join(root, "supabase/migrations/0003_yoru_features.sql"), "utf8"));
  ids.owner = await signup("Owner");
  const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", { p_max_uses: 5 });
  ids.alice = await signup("Alice", inv.code);
  ids.bob = await signup("Bob", inv.code);
  ids.admin = await signup("Mod", inv.code);
  await as(ids.owner, "admin_set_role", { p_user_id: ids.admin, p_role: "admin" });
});

describe("progression", () => {
  it("awards XP for posts, comments and received likes, and takes likes back", async () => {
    const post = await mkPost(ids.alice, { p_body: "first night on YORU" });
    expect(await xpOf(ids.alice)).toBe(10);
    await as(ids.bob, "add_comment", { p_post_id: post.id, p_body: "welcome" });
    expect(await xpOf(ids.bob)).toBe(4);
    await as(ids.bob, "toggle_reaction", { p_post_id: post.id, p_kind: "heart" });
    expect(await xpOf(ids.alice)).toBe(12);
    await as(ids.bob, "toggle_reaction", { p_post_id: post.id, p_kind: "heart" });
    expect(await xpOf(ids.alice)).toBe(10);
    // Liking your own post gives nothing.
    await as(ids.alice, "toggle_reaction", { p_post_id: post.id, p_kind: "heart" });
    expect(await xpOf(ids.alice)).toBe(10);
  });

  it("checks in once per night and grows the streak", async () => {
    const first = await as<{ already: boolean; streak: number; gained: number }>(ids.bob, "daily_checkin", { p_offset_minutes: 0 });
    expect(first).toMatchObject({ already: false, streak: 1, gained: 20 });
    const again = await as<{ already: boolean; gained: number }>(ids.bob, "daily_checkin", { p_offset_minutes: 0 });
    expect(again).toMatchObject({ already: true, gained: 0 });
    // Pretend the last check-in was yesterday.
    await db.query("update public.profiles set last_checkin = current_date - 1 where id = $1", [ids.bob]);
    const next = await as<{ streak: number; gained: number }>(ids.bob, "daily_checkin", { p_offset_minutes: 0 });
    expect(next).toMatchObject({ streak: 2, gained: 25 });
    const progress = await as<{ checked_in_today: boolean; streak: number; level: number }>(ids.bob, "get_my_progress", { p_offset_minutes: 0 });
    expect(progress.checked_in_today).toBe(true);
    expect(progress.streak).toBe(2);
    expect(progress.level).toBe(2); // 4 + 20 + 25 = 49 XP
  });

  it("sends a level-up notification and exposes level on profile_lite", async () => {
    const n = await db.query<{ body: string }>("select body from public.notifications where user_id = $1 and kind = 'level_up'", [ids.bob]);
    expect(n.rows.map((r) => r.body)).toContain("2");
    const me = await as<{ level: number; accent: string }>(ids.bob, "get_me");
    expect(me.level).toBe(2);
    expect(me.accent).toBe("crimson");
  });

  it("validates style updates and pins only your own posts", async () => {
    await as(ids.alice, "update_my_style", { p: { accent: "sakura", currently_kind: "watching", currently_title: "Frieren" } });
    const ex = await as<{ accent: string; currently_title: string }>(ids.bob, "get_profile_extras", { p_username: "alice" });
    expect(ex).toMatchObject({ accent: "sakura", currently_title: "Frieren" });
    await expect(as(ids.alice, "update_my_style", { p: { accent: "neon" } })).rejects.toThrow();
    await expect(as(ids.alice, "update_my_style", { p: { role: "owner" } })).rejects.toThrow(/INVALID/);

    const bobPost = await mkPost(ids.bob, { p_body: "bob's post" });
    await expect(as(ids.alice, "pin_post", { p_post_id: bobPost.id })).rejects.toThrow(/FORBIDDEN/);
    const mine = await mkPost(ids.alice, { p_body: "pin me" });
    await as(ids.alice, "pin_post", { p_post_id: mine.id });
    const ex2 = await as<{ pinned: { id: string } }>(ids.bob, "get_profile_extras", { p_username: "Alice" });
    expect(ex2.pinned.id).toBe(mine.id);
  });
});

describe("site controls", () => {
  it("only admins can change settings, and members see the public part", async () => {
    await expect(as(ids.alice, "admin_update_site", { p: { lockdown: true } })).rejects.toThrow(/FORBIDDEN/);
    await as(ids.admin, "admin_update_site", { p: { announcement: { text: "Movie night Friday", tone: "event" }, nightly_prompt: "Best opening of 2026?" } });
    const site = await as<{ announcement: { text: string; tone: string; id: string }; nightly_prompt: string; word_filter?: unknown }>(ids.alice, "get_site");
    expect(site.announcement).toMatchObject({ text: "Movie night Friday", tone: "event" });
    expect(site.announcement.id).toBeTruthy();
    expect(site.nightly_prompt).toBe("Best opening of 2026?");
    expect(site.word_filter).toBeUndefined();
    await expect(as(ids.alice, "admin_get_site")).rejects.toThrow(/FORBIDDEN/);
  });

  it("masks filtered words in posts, comments and messages", async () => {
    await as(ids.admin, "admin_update_site", { p: { word_filter: ["Spoiler", "cringe"] } });
    const p = await mkPost(ids.alice, { p_body: "no SPOILERS but the ending was cringe" });
    expect((await as<{ body: string }>(ids.bob, "get_post", { p_id: p.id })).body).toBe("no SPOILERS but the ending was ✱✱✱✱✱✱");
    await expect(as(ids.admin, "admin_update_site", { p: { word_filter: ["two words"] } })).rejects.toThrow(/INVALID/);
    await as(ids.admin, "admin_update_site", { p: { word_filter: [] } });
  });

  it("quiet mode blocks member posts and comments but not chat or admins", async () => {
    await as(ids.admin, "admin_update_site", { p: { lockdown: true } });
    await expect(as(ids.alice, "create_post", { p_body: "hello?" })).rejects.toThrow(/LOCKDOWN/);
    await as(ids.admin, "create_post", { p_body: "admins can still post" });
    const ch = await db.query<{ id: string }>("select id from public.channels where kind = 'group' limit 1");
    await as(ids.alice, "join_channel", { p_channel_id: ch.rows[0].id }).catch(() => null);
    await as(ids.alice, "send_message", { p_channel_id: ch.rows[0].id, p_body: "chat still works" });
    await as(ids.admin, "admin_update_site", { p: { lockdown: false } });
    await as(ids.alice, "create_post", { p_body: "back" });
  });

  it("slow mode spaces out posts", async () => {
    await as(ids.admin, "admin_update_site", { p: { slow_mode: 60 } });
    await as(ids.bob, "create_post", { p_body: "one" }).catch(() => null);
    await expect(as(ids.bob, "create_post", { p_body: "two" })).rejects.toThrow(/SLOW_MODE/);
    await as(ids.admin, "admin_update_site", { p: { slow_mode: 0 } });
  });

  it("broadcasts reach every member", async () => {
    const n = await as<number>(ids.admin, "admin_broadcast", { p_body: "Server maintenance at 2am" });
    expect(n).toBe(3);
    const r = await db.query("select 1 from public.notifications where user_id = $1 and kind = 'announcement'", [ids.alice]);
    expect(r.rows.length).toBe(1);
  });
});

describe("moderation", () => {
  it("mutes members, with the same hierarchy rules as bans", async () => {
    await as(ids.admin, "admin_mute", { p_user_id: ids.bob, p_minutes: 30 });
    await expect(as(ids.bob, "create_post", { p_body: "let me speak" })).rejects.toThrow(/MUTED/);
    await expect(as(ids.admin, "admin_mute", { p_user_id: ids.owner, p_minutes: 30 })).rejects.toThrow(/FORBIDDEN/);
    await expect(as(ids.alice, "admin_mute", { p_user_id: ids.bob, p_minutes: 30 })).rejects.toThrow(/FORBIDDEN/);
    await as(ids.admin, "admin_mute", { p_user_id: ids.bob, p_minutes: 0 });
    await as(ids.bob, "create_post", { p_body: "free again" });
  });

  it("features posts, sets flair, grants XP and records it all in the audit log", async () => {
    const p = await mkPost(ids.alice, { p_body: "feature-worthy" });
    await as(ids.admin, "admin_feature_post", { p_post_id: p.id, p_featured: true });
    const featured = await as<{ id: string }[]>(ids.bob, "get_featured");
    expect(featured.map((f) => f.id)).toContain(p.id);
    await as(ids.admin, "admin_set_flair", { p_user_id: ids.alice, p_flair: "Night Owl" });
    const xp = await as<number>(ids.admin, "admin_grant_xp", { p_user_id: ids.alice, p_amount: 100 });
    expect(xp).toBeGreaterThanOrEqual(100);
    await expect(as(ids.alice, "admin_grant_xp", { p_user_id: ids.alice, p_amount: 100 })).rejects.toThrow(/FORBIDDEN/);

    const log = await as<{ action: string }[]>(ids.admin, "admin_audit", { p_limit: 100 });
    const actions = log.map((l) => l.action);
    for (const a of ["member.role", "post.feature", "member.flair", "member.xp", "member.mute", "member.unmute", "site.lockdown", "site.broadcast", "invite.create"]) {
      expect(actions).toContain(a);
    }
  });

  it("recalculates XP without ever lowering it", async () => {
    const before = await xpOf(ids.alice);
    await as(ids.admin, "admin_recalculate_xp");
    expect(await xpOf(ids.alice)).toBeGreaterThanOrEqual(before);
  });

  it("returns stats for admins only", async () => {
    const s = await as<{ totals: { members: number }; daily: unknown[] }>(ids.admin, "admin_stats");
    expect(s.totals.members).toBe(4);
    expect(s.daily).toHaveLength(14);
    await expect(as(ids.bob, "admin_stats")).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("lockdown of new tables and helpers", () => {
  it("hides settings and the audit log from members and anon", async () => {
    expect(await sqlAs(ids.alice, "select * from public.audit_log")).toHaveLength(0);
    expect(await sqlAs(ids.alice, "select * from public.app_settings")).toHaveLength(0);
    expect((await sqlAs(ids.admin, "select * from public.audit_log")).length).toBeGreaterThan(0);
    await expect(sqlAs(null, "select * from public.audit_log")).rejects.toThrow(/permission denied/);
  });

  it("blocks direct writes and internal helpers", async () => {
    await expect(sqlAs(ids.admin, "insert into public.app_settings (key, value) values ('lockdown', 'true')")).rejects.toThrow(/permission denied/);
    await expect(sqlAs(ids.alice, "update public.profiles set xp = 99999 where id = auth.uid()")).rejects.toThrow(/permission denied/);
    await expect(sqlAs(ids.alice, `select public.add_xp('${ids.alice}', 5000)`)).rejects.toThrow(/permission denied/);
    await expect(sqlAs(ids.alice, "select public.audit('x', null, null)")).rejects.toThrow(/permission denied/);
    await expect(sqlAs(null, "select public.get_site()")).rejects.toThrow(/permission denied/);
  });
});
