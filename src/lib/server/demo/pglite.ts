import "server-only";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { demoDataDir } from "@/lib/config";
import { seedDemo } from "./seed";

// Demo mode runs the real Supabase migrations inside an embedded Postgres
// (PGlite), persisted to .data/pglite. One instance per server process.

type DemoState = {
  db: Promise<PGlite>;
  events: EventEmitter;
};

const g = globalThis as unknown as { __itnDemo?: DemoState };

async function open(): Promise<PGlite> {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), demoDataDir(), "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create({ dataDir: dir });

  await db.exec(fs.readFileSync(path.join(process.cwd(), "src", "lib", "server", "demo", "shim.sql"), "utf8"));
  await db.exec(
    "create table if not exists public._itn_migrations (name text primary key, applied_at timestamptz default now())",
  );
  const applied = new Set(
    (await db.query<{ name: string }>("select name from public._itn_migrations")).rows.map((r) => r.name),
  );
  const migDir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql") && !f.includes("storage"))
    .sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
    await db.query("insert into public._itn_migrations (name) values ($1)", [f]);
  }
  // demo uses superuser for "service role" calls; keep the realtime pipe open
  await db.listen("itn_changes", (payload) => {
    try {
      g.__itnDemo?.events.emit("change", JSON.parse(payload));
    } catch {
      /* oversized payloads are truncated; ignore */
    }
  });

  const humans = await db.query<{ n: number }>("select count(*)::int as n from public.profiles where not is_bot");
  if (humans.rows[0].n === 0) {
    await seedDemo(db);
  }
  return db;
}

function state(): DemoState {
  if (!g.__itnDemo) {
    const events = new EventEmitter();
    events.setMaxListeners(1000);
    g.__itnDemo = { db: open(), events };
    g.__itnDemo.db.catch((err) => {
      console.error("[itn] demo database failed to open", err);
      g.__itnDemo = undefined;
    });
  }
  return g.__itnDemo;
}

export const demoDb = () => state().db;
export const demoEvents = () => state().events;

const IDENT = /^[a-z_][a-z0-9_]*$/;

function toParam(v: unknown) {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
    return JSON.stringify(v);
  }
  return v;
}

// Call a public.* function. `uid` null = superuser (service role equivalent).
export async function demoRpc<T>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!IDENT.test(fn)) throw new Error("bad function name");
  const keys = Object.keys(args).filter((k) => args[k] !== undefined);
  for (const k of keys) if (!IDENT.test(k)) throw new Error("bad argument name");
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  const params = keys.map((k) => toParam(args[k]));
  const db = await demoDb();
  return db.transaction(async (tx) => {
    if (uid) {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: uid, role: "authenticated" }),
      ]);
      await tx.exec("set local role authenticated");
    }
    const res = await tx.query<{ r: T }>(sql, params);
    return res.rows[0]?.r as T;
  });
}
