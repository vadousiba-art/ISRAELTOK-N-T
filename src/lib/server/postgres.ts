import "server-only";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool, waitUntil } from "@vercel/functions";
import { databaseUrl } from "@/lib/config";
import type { SqlConn } from "@/lib/database/migrations";
import { AppError, isTransientDbError } from "./errors";
import { parseCaptured, routeChanges, type RoutingLookup } from "./realtime/routing";
import { publish } from "./realtime/publish";

// Primary database on Neon (or any Postgres): a small pooled connection per
// server instance. Each request runs one transaction that sets the caller's
// identity and switches to the `authenticated` role, so the same RLS policies
// and function checks apply as on Supabase. Service calls run as the database
// owner, like the Supabase service role.
//
// Use Neon's *pooled* connection string (host contains "-pooler") for
// DATABASE_URL: everything here is transaction-scoped (SET LOCAL,
// set_config(..., true)), which is safe behind PgBouncer transaction pooling.

const g = globalThis as unknown as { __yoruPg?: Pool };

const POOL_MAX = Math.max(1, Math.min(20, Number(process.env.PG_POOL_MAX ?? 5) || 5));
const STATEMENT_TIMEOUT_MS = Math.max(1000, Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000) || 15_000);

export function pgPool(): Pool {
  if (!g.__yoruPg) {
    const connectionString = databaseUrl();
    if (!connectionString) {
      throw new AppError("NOT_CONFIGURED", "DATABASE_URL is missing on the server. See the setup page.", 503);
    }
    const pool = new Pool({
      connectionString,
      max: POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      application_name: "yoru",
    });
    // An idle client can drop (e.g. Neon scaled to zero); the pool replaces it.
    pool.on("error", (err) => console.warn("[yoru] idle database connection closed:", err.message));
    // On Vercel Fluid compute: close idle connections before the instance is
    // suspended. No-op elsewhere.
    attachDatabasePool(pool);
    g.__yoruPg = pool;
  }
  return g.__yoruPg;
}

// Connecting is the only step that is always safe to retry: nothing has run.
// A suspended Neon compute takes a moment to wake, so back off briefly.
async function connect(): Promise<PoolClient> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pgPool().connect();
    } catch (err) {
      last = err;
      if (!isTransientDbError(err)) break;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
  throw last;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function toParam(v: unknown) {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

export function rpcSql(fn: string, args: Record<string, unknown>) {
  if (!IDENT.test(fn)) throw new AppError("INVALID", "Bad function name.", 400);
  const keys = Object.keys(args).filter((k) => args[k] !== undefined);
  for (const k of keys) if (!IDENT.test(k)) throw new AppError("INVALID", "Bad argument name.", 400);
  return {
    sql: `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`,
    params: keys.map((k) => toParam(args[k])),
  };
}

// Call a public.* function. `uid` null = server privileges (service calls).
// Never retried after the transaction starts: a write may have committed.
export async function pgRpc<T>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { sql, params } = rpcSql(fn, args);
  const client = await connect();
  let broken = false;
  let result: T;
  let captured: string | null = null;
  let overflow = false;
  try {
    await client.query("begin");
    await client.query(
      "select set_config('request.jwt.claims', $1, true), set_config('statement_timeout', $2, true), set_config('yoru.capture', 'on', true)",
      [uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : JSON.stringify({ role: "service_role" }), String(STATEMENT_TIMEOUT_MS)],
    );
    if (uid) await client.query("set local role authenticated");
    result = (await client.query<{ r: T }>(sql, params)).rows[0]?.r as T;
    const cap = await client.query<{ c: string | null; o: string | null }>(
      "select current_setting('yoru.changes', true) as c, current_setting('yoru.changes_overflow', true) as o",
    );
    captured = cap.rows[0]?.c ?? null;
    overflow = cap.rows[0]?.o === "1";
    await client.query("commit");
  } catch (err) {
    broken = isTransientDbError(err);
    if (!broken) await client.query("rollback").catch(() => (broken = true));
    throw err;
  } finally {
    client.release(broken);
  }
  if (captured || overflow) relay(captured, overflow);
  return result;
}

// Server-privileged query (owner role). Only for fixed, parameterized SQL in
// server code: identity mirror, demo login, realtime routing, health.
export async function pgQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  const client = await connect();
  let broken = false;
  try {
    return await client.query<T & object>(sql, params) as unknown as { rows: T[] };
  } catch (err) {
    broken = isTransientDbError(err);
    throw err;
  } finally {
    client.release(broken);
  }
}

// Several statements on one connection inside one transaction.
export async function pgTransaction<T>(fn: (conn: SqlConn) => Promise<T>): Promise<T> {
  const client = await connect();
  let broken = false;
  try {
    await client.query("begin");
    const out = await fn({
      query: async <R,>(s: string, p?: unknown[]) => (await client.query(s, p)) as unknown as { rows: R[] },
      exec: (s: string) => client.query(s),
    });
    await client.query("commit");
    return out;
  } catch (err) {
    broken = isTransientDbError(err);
    if (!broken) await client.query("rollback").catch(() => (broken = true));
    throw err;
  } finally {
    client.release(broken);
  }
}

export const pgLookup: RoutingLookup = {
  channels: async (ids) =>
    (await pgQuery<{ id: string; kind: string; is_private: boolean }>(
      "select id::text, kind, is_private from public.channels where id = any($1::uuid[])",
      [ids],
    )).rows,
  members: async (ids) =>
    (await pgQuery<{ channel_id: string; user_id: string }>(
      "select channel_id::text, user_id::text from public.channel_members where channel_id = any($1::uuid[])",
      [ids],
    )).rows,
  messageChannels: async (ids) =>
    (await pgQuery<{ id: string; channel_id: string }>(
      "select id::text, channel_id::text from public.messages where id = any($1::uuid[])",
      [ids],
    )).rows,
};

// After COMMIT: route the captured changes and send them. Kept alive past the
// response on Vercel with waitUntil, so the caller does not wait for it.
function relay(captured: string | null, overflow: boolean) {
  const job = routeChanges(parseCaptured(captured), overflow, pgLookup)
    .then(publish)
    .catch((err) => console.warn("[yoru] realtime relay failed:", (err as Error).message));
  try {
    waitUntil(job);
  } catch {
    /* outside a request context the promise simply runs */
  }
}

export async function pgHealth() {
  const started = Date.now();
  const client = await connect();
  let broken = false;
  try {
    const info = await client.query<{ version: string; migrated: boolean }>(
      "select current_setting('server_version') as version, to_regclass('public._itn_migrations') is not null as migrated",
    );
    const { version, migrated } = info.rows[0];
    const migrations = migrated
      ? (await client.query<{ name: string }>("select name from public._itn_migrations order by name")).rows.map((r) => r.name)
      : [];
    // The adapter must be able to switch to the RLS role for every request.
    let canSwitchRole = true;
    await client.query("begin");
    try {
      await client.query("set local role authenticated");
    } catch {
      canSwitchRole = false;
    }
    await client.query("rollback");
    return { latency_ms: Date.now() - started, version, migrations, can_switch_role: canSwitchRole };
  } catch (err) {
    broken = isTransientDbError(err);
    throw err;
  } finally {
    client.release(broken);
  }
}
