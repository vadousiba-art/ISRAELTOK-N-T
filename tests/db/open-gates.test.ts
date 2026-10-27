import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { applyMigrations } from "@/lib/database/migrations";

// Open Gates (migration 0007): every rule is checked from the database's
// point of view, including what must be refused.

let db: PGlite;
const root = path.resolve(__dirname, "../..");
const u: Record<string, string> = {};

async function as<T = unknown>(uid: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    const params = keys.map((k) => (args[k] !== null && typeof args[k] === "object" && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : args[k]));
    return (await tx.query<{ r: T }>(sql, params)).rows[0]?.r as T;
  });
}
async function sqlAs(uid: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    return (await tx.query<Record<string, unknown>>(sql, params)).rows;
  });
}
async function signup(name: string) {
  const r = await db.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [
    `${name}@gates.test`,
    JSON.stringify({ username: name, display_name: name }),
  ]);
  return r.rows[0].id;
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pg_trgm } });
  await applyMigrations(db, { root });
  u.owner = await signup("gate_owner"); // first account = owner
  u.ann = await signup("gate_ann");
  u.ben = await signup("gate_ben");
  u.cy = await signup("gate_cy");
});

describe("version probe", () => {
  it("reports Open Gates release 1", async () => {
    expect(await as(u.ann, "open_gates_version")).toBe(1);
  });
});

describe("Ghost Mode", () => {
  it("stops recording last-seen time, so nobody can see it", async () => {
    await as(u.ann, "touch_presence");
    expect((await db.query<{ t: string | null }>("select last_seen_at as t from public.profiles where id = $1", [u.ann])).rows[0].t).not.toBeNull();
    await as(u.ann, "update_my_identity", { p: { ghost_mode: true } });
    await as(u.ann, "touch_presence");
    const row = (await sqlAs(u.ben, "select last_seen_at from public.profiles where id = $1", [u.ann]))[0];
    expect(row.last_seen_at).toBeNull(); // not even a direct table read shows it
    const members = await as<{ id: string; online: boolean }[]>(u.ben, "get_members");
    expect(members.find((m) => m.id === u.ann)?.online).toBe(false);
    await as(u.ann, "update_my_identity", { p: { ghost_mode: false } });
    await as(u.ann, "touch_presence");
    const back = await as<{ id: string; online: boolean }[]>(u.ben, "get_members");
    expect(back.find((m) => m.id === u.ann)?.online).toBe(true);
  });
});

describe("identity and Pro entitlements", () => {
  it("keeps only known interests, at most 8", async () => {
    const r = await as<{ interests: string[] }>(u.ann, "update_my_identity", { p: { interests: ["anime", "manga", "bogus", "anime"] } });
    expect(r.interests.sort()).toEqual(["anime", "manga"]);
    await expect(as(u.ann, "update_my_identity", { p: { creator_category: "artist" } })).rejects.toThrow(/Unknown profile field/);
  });

  it("refuses Pro cosmetics without Pro, and only admins can grant Pro", async () => {
    await expect(as(u.ann, "update_my_identity", { p: { banner_style: "crimson_moon" } })).rejects.toThrow(/YORU Pro/);
    await expect(as(u.ann, "admin_grant_pro", { p_user: u.ann, p_days: 30 })).rejects.toThrow(/FORBIDDEN|admin/i);
    await expect(sqlAs(u.ann, "insert into public.entitlements (user_id, source) values ($1, 'comp')", [u.ann])).rejects.toThrow(/permission denied/);
    await as(u.owner, "admin_grant_pro", { p_user: u.ann, p_days: 30, p_note: "tester" });
    const me = await as<{ pro: boolean; theme_slots: number }>(u.ann, "update_my_identity", { p: { banner_style: "crimson_moon", avatar_frame: "neon" } });
    expect(me.pro).toBe(true);
    expect(me.theme_slots).toBe(12);
    const audit = await db.query("select 1 from public.audit_log where action = 'pro.grant' and target_user_id = $1", [u.ann]);
    expect(audit.rows.length).toBe(1);
    // Members cannot read each other's entitlements.
    expect(await sqlAs(u.ben, "select * from public.entitlements where user_id = $1", [u.ann])).toEqual([]);
  });

  it("shows the free banner and frame once Pro ends, and brings the choice back on renewal", async () => {
    type Look = { banner_style: string; avatar_frame: string };
    await as(u.owner, "admin_revoke_pro", { p_user: u.ann });
    const mine = await as<Look>(u.ann, "get_my_identity");
    expect([mine.banner_style, mine.avatar_frame]).toEqual(["aurora", "none"]);
    const seen = await as<Look>(u.ben, "get_profile_identity", { p_username: "gate_ann" });
    expect([seen.banner_style, seen.avatar_frame]).toEqual(["aurora", "none"]);
    await as(u.owner, "admin_grant_pro", { p_user: u.ann, p_days: 30 });
    const back = await as<Look>(u.ann, "get_my_identity");
    expect([back.banner_style, back.avatar_frame]).toEqual(["crimson_moon", "neon"]);
  });
});

describe("Theme Forge+", () => {
  it("gives free members 3 saved themes", async () => {
    for (let i = 0; i < 3; i++) await as(u.ben, "save_theme", { p_name: `Look ${i}`, p_accent_hue: 10 * i });
    await expect(as(u.ben, "save_theme", { p_name: "one too many", p_accent_hue: 200 })).rejects.toThrow(/3 theme slots/);
    expect(await sqlAs(u.ann, "select * from public.saved_themes where owner_id = $1", [u.ben])).toEqual([]);
  });
});

describe("Collections+", () => {
  it("keeps private collections private and lets only the owner change them", async () => {
    const post = await as<string>(u.cy, "create_post", { p_body: "collect me" });
    const priv = await as<{ id: string }>(u.ann, "save_collection", { p_name: "Secret stash" });
    const pub = await as<{ id: string }>(u.ann, "save_collection", { p_name: "Best of", p_visibility: "members" });
    await as(u.ann, "set_collection_item", { p_collection_id: pub.id, p_post_id: post, p_in: true });
    await as(u.ann, "set_collection_item", { p_collection_id: pub.id, p_post_id: post, p_in: true }); // idempotent
    const seen = await as<{ count: number; posts: unknown[] }>(u.ben, "get_collection", { p_id: pub.id });
    expect(seen.count).toBe(1);
    await expect(as(u.ben, "get_collection", { p_id: priv.id })).rejects.toThrow(/private/);
    await expect(as(u.ben, "set_collection_item", { p_collection_id: pub.id, p_post_id: post })).rejects.toThrow(/not yours/);
    await expect(as(u.ben, "delete_collection", { p_id: pub.id })).rejects.toThrow(/not yours/);
    expect(await sqlAs(u.ben, "select id from public.collections where id = $1", [priv.id])).toEqual([]);
    const ident = await as<{ collections: { id: string }[] }>(u.ben, "get_profile_identity", { p_username: "gate_ann" });
    expect(ident.collections.map((c) => c.id)).toEqual([pub.id]);
  });
});

describe("discovery", () => {
  it("suggests by shared interests and leaves out undiscoverable and blocked people", async () => {
    await as(u.ben, "update_my_identity", { p: { interests: ["anime", "manga"] } });
    await as(u.cy, "update_my_identity", { p: { interests: ["anime"] } });
    let list = await as<{ id: string; shared: string[] }[]>(u.ann, "get_discover");
    expect(list[0].id).toBe(u.ben);
    expect(list[0].shared.sort()).toEqual(["anime", "manga"]);
    await as(u.ben, "update_my_identity", { p: { discoverable: false } });
    await as(u.ann, "toggle_block", { p_user_id: u.cy });
    list = await as(u.ann, "get_discover");
    expect(list.map((x) => x.id)).not.toContain(u.ben);
    expect(list.map((x) => x.id)).not.toContain(u.cy);
    await as(u.ann, "toggle_block", { p_user_id: u.cy });
  });
});

describe("Creator Showcase", () => {
  it("runs applications through admin review only", async () => {
    const app = await as<{ application: { id: string; status: string } }>(u.cy, "apply_creator", {
      p_category: "artist",
      p_portfolio_url: "https://example.com/cy",
      p_statement: "I draw manga-style fan art every week.",
    });
    expect(app.application.status).toBe("pending");
    await expect(
      as(u.cy, "apply_creator", { p_category: "artist", p_portfolio_url: "https://example.com", p_statement: "again again again again" }),
    ).rejects.toThrow(/already waiting/);
    await expect(as(u.cy, "admin_review_creator", { p_application_id: app.application.id, p_approve: true })).rejects.toThrow(/FORBIDDEN|admin/i);
    await expect(sqlAs(u.cy, "update public.profiles set creator_category = 'artist' where id = $1", [u.cy])).rejects.toThrow(/permission denied/);
    await as(u.owner, "admin_review_creator", { p_application_id: app.application.id, p_approve: true, p_note: "" });
    const mine = await as<{ creator_category: string }>(u.cy, "get_my_creator_application");
    expect(mine.creator_category).toBe("artist");
    const creators = await as<{ id: string }[]>(u.owner, "get_discover", { p_creators_only: true });
    expect(creators.map((c) => c.id)).toEqual([u.cy]);
    const note = await db.query("select 1 from public.notifications where user_id = $1 and kind = 'system'", [u.cy]);
    expect(note.rows.length).toBe(1);
  });
});

describe("Night Pass streak shield", () => {
  it("keeps a Pro member's streak over one missed night, once a week", async () => {
    await db.query("update public.profiles set streak = 5, last_checkin = current_date - 2, streak_shield_on = null where id = $1", [u.ann]);
    const r = await as<{ streak: number; shielded: boolean }>(u.ann, "daily_checkin", { p_offset_minutes: 0 });
    expect(r).toMatchObject({ streak: 6, shielded: true });
    await db.query("update public.profiles set last_checkin = current_date - 2 where id = $1", [u.ann]);
    const again = await as<{ streak: number; shielded: boolean }>(u.ann, "daily_checkin", { p_offset_minutes: 0 });
    expect(again).toMatchObject({ streak: 1, shielded: false }); // shield used this week
    await db.query("update public.profiles set streak = 5, last_checkin = current_date - 2 where id = $1", [u.ben]);
    const free = await as<{ streak: number }>(u.ben, "daily_checkin", { p_offset_minutes: 0 });
    expect(free.streak).toBe(1);
  });
});

describe("reports", () => {
  it("stores a category and escalates when three different members report the same post", async () => {
    const post = await as<string>(u.owner, "create_post", { p_body: "spammy" });
    await as(u.ann, "create_report", { p_target_type: "post", p_target_id: post, p_reason: "Spam", p_category: "spam" });
    await as(u.ben, "create_report", { p_target_type: "post", p_target_id: post, p_reason: "Spam", p_category: "spam" });
    let flags = await as<Record<string, { escalated: boolean; category: string }>>(u.owner, "admin_report_flags");
    expect(Object.values(flags).every((f) => !f.escalated && f.category === "spam")).toBe(true);
    await as(u.cy, "create_report", { p_target_type: "post", p_target_id: post, p_reason: "Spam" });
    flags = await as(u.owner, "admin_report_flags");
    expect(Object.values(flags).filter((f) => f.escalated).length).toBe(3);
    await expect(as(u.ann, "admin_report_flags")).rejects.toThrow(/FORBIDDEN|admin/i);
    // The old three-argument call still works.
    await as(u.ann, "create_report", { p_target_type: "user", p_target_id: u.owner, p_reason: "test" });
  });
});
