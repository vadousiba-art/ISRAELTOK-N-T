import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests for the Neon/Postgres adapter (src/lib/server/postgres.ts)
// against a REAL Postgres server, not PGlite. Skipped unless TEST_DATABASE_URL
// points at a disposable database, e.g. a local Postgres 16 whose owner is a
// non-superuser role like Neon's neondb_owner (see docs/database-migration.md).
// Never point it at production: it creates users and posts.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

type Pg = typeof import("@/lib/server/postgres");
type Delivery = import("@/lib/server/realtime/routing").Delivery;

suite("Postgres adapter (real server)", () => {
  let pg: Pg;
  let deliveries: Delivery[] = [];
  const run = Math.random().toString(36).slice(2, 7);
  const ids: Record<string, string> = {};

  async function signup(name: string) {
    const r = await pg.pgQuery<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [`${name}-${run}@test.dev`, JSON.stringify({ username: `${name}_${run}`, display_name: name })],
    );
    return r.rows[0].id;
  }
  const settle = () => new Promise((r) => setTimeout(r, 150));
  // Runs statements in a transaction that is always rolled back.
  async function rolledBack<T>(fn: (q: <R>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
    const client = await pg.pgPool().connect();
    try {
      await client.query("begin");
      return await fn(async (sql, params) => (await client.query(sql, params)).rows);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DATA_BACKEND = "neon";
    const { applyMigrations } = await import("@/lib/database/migrations");
    pg = await import("@/lib/server/postgres");
    // applyMigrations manages its own transactions: give it a plain connection.
    const client = await pg.pgPool().connect();
    try {
      await applyMigrations({ query: (s, p) => client.query(s, p) as never, exec: (s) => client.query(s) });
    } finally {
      client.release();
    }
    const { liveBus } = await import("@/lib/server/realtime/bus");
    liveBus().on("delivery", (d: Delivery) => deliveries.push(d));
    ids.a = await signup("alice");
    ids.b = await signup("bob");
    ids.c = await signup("carol");
  });

  afterAll(async () => {
    await pg?.pgPool().end();
  });

  it("connects, is migrated and can switch to the RLS role", async () => {
    const h = await pg.pgHealth();
    expect(h.can_switch_role).toBe(true);
    expect(h.migrations).toContain("0005_neon_ready.sql");
    expect(Number(h.version.split(".")[0])).toBeGreaterThanOrEqual(14);
  });

  it("runs RPCs as the signed-in user and enforces authorization", async () => {
    const me = await pg.pgRpc<{ id: string; username: string }>(ids.a, "get_me");
    expect(me.id).toBe(ids.a);
    // Server-only function: not executable by signed-in users.
    await expect(pg.pgRpc(ids.a, "check_invite", { p_code: "x" })).rejects.toThrow(/permission denied/);
    // Tables are read-only for users; writes only through checked functions.
    await expect(
      pg.pgRpc(ids.a, "update_my_profile", { p: { display_name: "x".repeat(41) } }),
    ).rejects.toBeTruthy();
    // A stranger id (no profile) is not a member.
    await expect(pg.pgRpc("00000000-0000-4000-8000-000000000999", "get_me")).rejects.toThrow(/NOT_MEMBER|UNAUTH/);
  });

  it("writes, reads and paginates the feed", async () => {
    const made: string[] = [];
    for (let i = 0; i < 4; i++) {
      made.push(await pg.pgRpc<string>(ids.a, "create_post", { p_body: `adapter test ${run} #${i}` }));
      await new Promise((r) => setTimeout(r, 5));
    }
    const page1 = await pg.pgRpc<{ id: string; created_at: string }[]>(ids.b, "get_feed", { p_mode: "user", p_arg: `alice_${run}`, p_limit: 2 });
    expect(page1.map((p) => p.id)).toEqual([made[3], made[2]]);
    const page2 = await pg.pgRpc<{ id: string }[]>(ids.b, "get_feed", {
      p_mode: "user",
      p_arg: `alice_${run}`,
      p_limit: 2,
      p_before: page1[1].created_at,
    });
    expect(page2.map((p) => p.id)).toEqual([made[1], made[0]]);
    const search = await pg.pgRpc<{ id: string }[]>(ids.b, "get_feed", { p_mode: "search", p_arg: `test ${run} #3` });
    expect(search.map((p) => p.id)).toEqual([made[3]]);
    ids.post = made[3];
  });

  it("is safe against duplicate and concurrent submissions", async () => {
    await Promise.all(Array.from({ length: 8 }, () => pg.pgRpc(ids.b, "toggle_bookmark", { p_post_id: ids.post }).catch(() => null)));
    const n = await pg.pgQuery<{ n: number }>("select count(*)::int as n from public.bookmarks where user_id = $1 and post_id = $2", [ids.b, ids.post]);
    expect(n.rows[0].n).toBeLessThanOrEqual(1);
    // The heart is a toggle: two sequential presses leave no reaction and the
    // counter never goes negative.
    await pg.pgRpc(ids.c, "toggle_reaction", { p_post_id: ids.post, p_kind: "heart" });
    await pg.pgRpc(ids.c, "toggle_reaction", { p_post_id: ids.post, p_kind: "heart" });
    const r = await pg.pgQuery<{ n: number }>("select count(*)::int as n from public.reactions where user_id = $1 and post_id = $2", [ids.c, ids.post]);
    expect(r.rows[0].n).toBe(0);
  });

  it("rolls back a failed request completely", async () => {
    const before = await pg.pgQuery<{ n: number }>("select count(*)::int as n from public.posts where author_id = $1", [ids.c]);
    await expect(pg.pgRpc(ids.c, "create_post", { p_body: "x".repeat(2001) })).rejects.toBeTruthy();
    const after = await pg.pgQuery<{ n: number }>("select count(*)::int as n from public.posts where author_id = $1", [ids.c]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("captures committed changes and routes them to the right people only", async () => {
    deliveries = [];
    const post = await pg.pgRpc<string>(ids.c, "create_post", { p_body: `hello @alice_${run}` });
    await settle();
    expect(deliveries).toContainEqual({ topic: "yoru:all", event: { type: "post", id: post, author_id: ids.c } });
    // The @mention notification goes to Alice's private topic only.
    expect(deliveries.filter((d) => d.event.type === "notification").map((d) => d.topic)).toEqual([`yoru:u:${ids.a}`]);

    deliveries = [];
    const dm = await pg.pgRpc<string>(ids.a, "start_dm", { p_user_id: ids.b });
    await pg.pgRpc(ids.a, "send_message", { p_channel_id: dm, p_body: "secret plans" });
    await settle();
    const topics = deliveries.filter((d) => d.event.type === "message").map((d) => d.topic).sort();
    expect(topics).toEqual([`yoru:u:${ids.a}`, `yoru:u:${ids.b}`].sort());
    expect(topics).not.toContain(`yoru:u:${ids.c}`);
    expect(topics).not.toContain("yoru:all");
    // Chat events carry ids only. The text appears solely in Bob's own DM
    // notification preview, on his private topic (as Supabase does today).
    expect(JSON.stringify(deliveries.filter((d) => d.event.type === "message"))).not.toContain("secret plans");
    const leaks = deliveries.filter((d) => JSON.stringify(d).includes("secret plans")).map((d) => d.topic);
    expect(leaks).toEqual([`yoru:u:${ids.b}`]);
    // The DM notification goes to Bob's topic only.
    expect(deliveries.some((d) => d.topic === `yoru:u:${ids.b}` && d.event.type === "notification")).toBe(true);
  });

  it("flags bulk writes as overflow instead of capturing everything", async () => {
    const r = await rolledBack(async (q) => {
      await q("select set_config('yoru.capture', 'on', true)");
      await q("insert into public.notifications (user_id, kind, body) select $1, 'system', 'bulk ' || g from generate_series(1, 305) g", [ids.c]);
      return (await q<{ n: string; o: string }>(
        "select current_setting('yoru.changes_n', true) as n, current_setting('yoru.changes_overflow', true) as o",
      ))[0];
    });
    expect(r.n).toBe("300");
    expect(r.o).toBe("1");
  });

  it("leaves capture off for other clients (Supabase behaviour unchanged)", async () => {
    const r = await rolledBack(async (q) => {
      await q("insert into public.notifications (user_id, kind, body) values ($1, 'system', 'plain')", [ids.c]);
      return (await q<{ c: string | null }>("select current_setting('yoru.changes', true) as c"))[0];
    });
    expect(r.c ?? "").toBe("");
  });

  it("mirrors identities: the sign-up trigger creates the profile and rejects taken usernames", async () => {
    const p = await pg.pgQuery<{ username: string; role: string }>("select username, role from public.profiles where id = $1", [ids.b]);
    expect(p.rows[0]).toEqual({ username: `bob_${run}`, role: expect.stringMatching(/member|owner/) });
    await expect(
      pg.pgQuery("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [
        `bob2-${run}@test.dev`,
        JSON.stringify({ username: `BOB_${run}`, display_name: "Bob 2" }),
      ]),
    ).rejects.toThrow(/USERNAME_TAKEN/);
  });
});
