import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Migration 0004: open sign-ups, social-login usernames, support inbox and
// account deletion, on top of 0001 + 0003.

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

async function signup(email: string, meta: Record<string, unknown>) {
  const r = await db.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [email, JSON.stringify(meta)]);
  return r.rows[0].id;
}
const profile = async (id: string) =>
  (await db.query<{ username: string; display_name: string; avatar_url: string | null }>("select username, display_name, avatar_url from public.profiles where id = $1", [id])).rows[0];

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(fs.readFileSync(path.join(root, "src/lib/server/demo/shim.sql"), "utf8"));
  for (const f of ["0001_core.sql", "0003_yoru_features.sql", "0004_open_signup.sql", "0004_open_signup.sql"]) {
    await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
  }
  ids.owner = await signup("owner@test.dev", { username: "Owner", display_name: "Owner" });
});

describe("open sign-ups", () => {
  it("lets anyone join without an invite while sign-ups are open", async () => {
    expect(await as(null, "check_invite", { p_code: "_" })).toMatchObject({ valid: true, open: true });
    ids.anna = await signup("anna@test.dev", { username: "Anna", display_name: "Anna" });
    expect((await as<{ role: string }>(ids.anna, "get_me")).role).toBe("member");
  });

  it("generates unique usernames for social logins and keeps their name and photo", async () => {
    const a = await signup("night.owl@gmail.com", { full_name: "Night Owl", picture: "https://example.com/a.png" });
    const b = await signup("night.owl@yahoo.com", { name: "Another Owl" });
    expect((await profile(a)).username).toBe("nightowl");
    expect((await profile(a)).display_name).toBe("Night Owl");
    expect((await profile(a)).avatar_url).toBe("https://example.com/a.png");
    expect((await profile(b)).username).toMatch(/^nightowl[0-9a-f]{4}$/);
    await expect(signup("x@test.dev", { username: "anna" })).rejects.toThrow(/USERNAME_TAKEN/);
  });

  it("goes back to invite-only when an admin switches it off", async () => {
    await expect(as(ids.anna, "admin_update_site", { p: { open_signup: false } })).rejects.toThrow(/FORBIDDEN/);
    await as(ids.owner, "admin_update_site", { p: { open_signup: false } });
    expect(await as(null, "check_invite", { p_code: "_" })).toMatchObject({ valid: false, open: false });
    await expect(signup("nope@test.dev", { username: "Nope" })).rejects.toThrow(/INVALID_INVITE/);
    const inv = await as<{ code: string }>(ids.owner, "admin_create_invite", { p_max_uses: 1 });
    expect(await as(null, "check_invite", { p_code: inv.code })).toMatchObject({ valid: true, inviter: "Owner" });
    await signup("invited@test.dev", { username: "Invited", invite_code: inv.code });
    await expect(signup("late@test.dev", { username: "Late", invite_code: inv.code })).rejects.toThrow(/INVALID_INVITE/);
    expect((await as<{ open_signup: boolean }>(ids.anna, "get_site")).open_signup).toBe(false);
    await as(ids.owner, "admin_update_site", { p: { open_signup: true } });
  });
});

describe("support inbox", () => {
  it("only the server can submit; only admins can read", async () => {
    await as(null, "submit_support", { p_user: ids.anna, p_email: "Anna@Test.dev", p_topic: "deletion", p_message: "Please delete my data" });
    await expect(as(ids.anna, "submit_support", { p_user: ids.anna, p_email: null, p_topic: "general", p_message: "hi" })).rejects.toThrow(/permission denied/);
    await expect(as(ids.anna, "admin_support_inbox")).rejects.toThrow(/FORBIDDEN/);
    const inbox = await as<{ id: string; email: string; topic: string }[]>(ids.owner, "admin_support_inbox");
    expect(inbox[0]).toMatchObject({ email: "anna@test.dev", topic: "deletion" });
    await as(ids.owner, "admin_close_support", { p_id: inbox[0].id });
    expect((await as<{ status: string }[]>(ids.owner, "admin_support_inbox"))[0].status).toBe("closed");
  });
});

describe("account deletion", () => {
  it("removes the person and everything they made, but never the owner", async () => {
    ids.del = await signup("del@test.dev", { username: "Leaving", display_name: "Leaving" });
    const postId = await as<string>(ids.del, "create_post", { p_body: "goodbye" });
    await as(ids.anna, "add_comment", { p_post_id: postId, p_body: "noo" });
    await as(ids.anna, "toggle_reaction", { p_post_id: postId, p_kind: "heart" });
    await expect(as(ids.del, "delete_account", { p_user: ids.del })).rejects.toThrow(/permission denied/);
    await as(null, "delete_account", { p_user: ids.del });
    const left = await db.query(
      "select (select count(*) from public.profiles where id = $1)::int p, (select count(*) from public.posts where author_id = $1)::int posts, (select count(*) from public.comments where post_id = $2)::int c",
      [ids.del, postId],
    );
    expect(left.rows[0]).toEqual({ p: 0, posts: 0, c: 0 });
    await expect(as(null, "delete_account", { p_user: ids.owner })).rejects.toThrow(/FORBIDDEN/);
  });
});
