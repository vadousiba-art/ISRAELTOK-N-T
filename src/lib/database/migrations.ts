import fs from "node:fs";
import path from "node:path";

// Applies supabase/migrations/*.sql to a plain Postgres database (PGlite in
// demo mode, Neon in production). Used by the demo server, `npm run db:migrate`
// and the tests, so every environment runs the exact same schema.
//
// No "server-only" import here: the migration scripts run outside Next.

export interface SqlConn {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  // Runs a script that may hold several statements and no parameters.
  exec(sql: string): Promise<unknown>;
}

export const MIGRATIONS_TABLE = "public._itn_migrations";

// 0002 creates the Supabase Storage bucket and policy; it only makes sense on
// a Supabase database.
const SUPABASE_ONLY = (file: string) => file.includes("storage");

export function migrationsDir(root = process.cwd()) {
  return path.join(/*turbopackIgnore: true*/ root, "supabase", "migrations");
}

export function shimSql(root = process.cwd()) {
  return fs.readFileSync(path.join(/*turbopackIgnore: true*/ root, "src", "lib", "database", "postgres-shim.sql"), "utf8");
}

export function migrationFiles(root = process.cwd()) {
  return fs
    .readdirSync(migrationsDir(root))
    .filter((f) => f.endsWith(".sql") && !SUPABASE_ONLY(f))
    .sort();
}

export async function appliedMigrations(conn: SqlConn): Promise<string[]> {
  const exists = await conn.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [MIGRATIONS_TABLE]);
  if (!exists.rows[0]?.ok) return [];
  return (await conn.query<{ name: string }>(`select name from ${MIGRATIONS_TABLE} order by name`)).rows.map((r) => r.name);
}

export async function pendingMigrations(conn: SqlConn, root = process.cwd()) {
  const done = new Set(await appliedMigrations(conn));
  return migrationFiles(root).filter((f) => !done.has(f));
}

// Each migration runs in its own transaction and is recorded in the same
// transaction, so a failure leaves the database at the previous version.
export async function applyMigrations(
  conn: SqlConn,
  opts: { root?: string; log?: (msg: string) => void; dryRun?: boolean } = {},
): Promise<string[]> {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? (() => {});
  const pending = await pendingMigrations(conn, root);
  if (opts.dryRun) return pending;

  await conn.exec(shimSql(root));
  await conn.exec(`create table if not exists ${MIGRATIONS_TABLE} (name text primary key, applied_at timestamptz default now())`);
  for (const f of pending) {
    log(`applying ${f}`);
    const sql = fs.readFileSync(path.join(migrationsDir(root), f), "utf8");
    await conn.exec("begin");
    try {
      await conn.exec(sql);
      await conn.query(`insert into ${MIGRATIONS_TABLE} (name) values ($1)`, [f]);
      await conn.exec("commit");
    } catch (err) {
      await conn.exec("rollback").catch(() => {});
      throw new Error(`migration ${f} failed: ${(err as Error).message}`);
    }
  }
  return pending;
}
