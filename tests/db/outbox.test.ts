import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { applyMigrations } from "@/lib/database/migrations";

// Migration 0006: the realtime outbox that feeds the extra Supabase projects,
// and media paths stored in another project. Runs every migration in PGlite.

let db: PGlite;
const root = path.resolve(__dirname, "../..");
const ids: Record<string, string> = {};

async function as<T = unknown>(uid: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    return (await tx.query<{ r: T }>(sql, keys.map((k) => args[k]))).rows[0]?.r as T;
  });
}

type Drained = {
  events: { t: string; op: string; id?: string; channel_id?: string; body?: string | null }[];
  channels: { id: string; kind: string; is_private: boolean }[];
  members: { channel_id: string; user_id: string }[];
};
const drain = async (limit = 300) => (await db.query<{ r: Drained }>("select public.drain_realtime_outbox($1) as r", [limit])).rows[0].r;
const outboxCount = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.realtime_outbox")).rows[0].n;

async function signup(name: string) {
  const r = await db.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [
    `${name}@outbox.test`,
    JSON.stringify({ username: name, display_name: name }),
  ]);
  return r.rows[0].id;
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pg_trgm } });
  await applyMigrations(db, { root });
  ids.a = await signup("outbox_a");
  ids.b = await signup("outbox_b");
  ids.c = await signup("outbox_c");
});

describe("realtime outbox", () => {
  it("writes nothing while no server is draining it", async () => {
    await as(ids.a, "create_post", { p_body: "before anyone drains" });
    expect(await outboxCount()).toBe(0);
  });

  it("collects changes once a server drains, with routing info and no message text", async () => {
    await drain(); // switches the outbox on
    const post = await as<string>(ids.a, "create_post", { p_body: "hello outbox" });
    const dm = await as<string>(ids.a, "start_dm", { p_user_id: ids.b });
    await as(ids.a, "send_message", { p_channel_id: dm, p_body: "top secret dm text" });
    const d = await drain();
    expect(d.events.some((e) => e.t === "posts" && e.id === post)).toBe(true);
    expect(d.events.some((e) => e.t === "messages" && e.channel_id === dm)).toBe(true);
    expect(d.events.some((e) => e.t === "notifications")).toBe(true); // Bob's DM notification
    expect(d.channels).toContainEqual({ id: dm, kind: "dm", is_private: expect.any(Boolean) });
    expect(d.members.map((m) => m.user_id).sort()).toEqual([ids.a, ids.b].sort());
    expect(JSON.stringify(d.events.filter((e) => e.t === "messages"))).not.toContain("top secret");
    expect(await outboxCount()).toBe(0); // each change is handed out once
  });

  it("replaces bulk writes with a single resync", async () => {
    await db.transaction(async (tx) => {
      await tx.query("insert into public.notifications (user_id, kind, body) select $1, 'system', 'bulk ' || g from generate_series(1, 320) g", [ids.c]);
    });
    const d = await drain(1000);
    expect(d.events.length).toBe(301);
    expect(d.events.at(-1)?.t).toBe("resync");
  });

  it("switches itself off when nobody drains for 15 minutes, and drops stale rows", async () => {
    await db.query("insert into public.realtime_outbox (payload, created_at) values ('{}', now() - interval '20 minutes')");
    await db.query("update public.realtime_outbox_state set last_drained_at = now() - interval '16 minutes'");
    await as(ids.b, "create_post", { p_body: "nobody listening" });
    expect(await outboxCount()).toBe(1); // only the stale row; nothing new
    const d = await drain();
    expect(d.events).toEqual([]);
    expect(await outboxCount()).toBe(0);
  });

  it("is invisible to signed-in users", async () => {
    await expect(as(ids.a, "drain_realtime_outbox", { p_limit: 10 })).rejects.toThrow(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        return tx.query("select * from public.realtime_outbox");
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("media stored in another project", () => {
  it("accepts the owner's s<n>/ paths and nothing else", async () => {
    const f = "88888888-8888-4888-8888-888888888888.jpg";
    const ok = async (p: string, u: string) =>
      (await db.query<{ ok: boolean }>("select public.valid_media_path($1, $2) as ok", [p, u])).rows[0].ok;
    expect(await ok(`u/${ids.a}/${f}`, ids.a)).toBe(true);
    expect(await ok(`s3/u/${ids.a}/${f}`, ids.a)).toBe(true);
    expect(await ok(`s3/u/${ids.b}/${f}`, ids.a)).toBe(false);
    expect(await ok(`s9/u/${ids.a}/${f}`, ids.a)).toBe(false);
    const post = await as<string>(ids.a, "create_post", { p_body: "pic", p_media_url: `s2/u/${ids.a}/${f}`, p_media_type: "image" });
    expect(post).toMatch(/^[0-9a-f-]{36}$/);
    await expect(as(ids.a, "create_post", { p_body: "x", p_media_url: `s2/u/${ids.b}/${f}`, p_media_type: "image" })).rejects.toBeTruthy();
  });
});
