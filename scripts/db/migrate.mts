/**
 * Apply supabase/migrations/*.sql to the primary Postgres database (Neon).
 *
 *   npm run db:migrate              # applies pending migrations
 *   npm run db:migrate -- --dry-run # lists what would run
 *
 * Uses DATABASE_URL_DIRECT (Neon's direct, non-pooled connection string) when
 * set, otherwise DATABASE_URL. Migrations are additive and recorded in
 * public._itn_migrations; each one runs in its own transaction.
 * Never point this at the Supabase database: Supabase migrations are applied
 * with the Supabase CLI or SQL editor (see docs/database-migration.md).
 */
import { applyMigrations, appliedMigrations, pendingMigrations } from "../../src/lib/database/migrations";
import { asConn, connect, describeUrl, env, flag } from "./lib.mjs";

const url = env("DATABASE_URL_DIRECT") ?? env("DATABASE_URL");
if (!url) {
  console.error("Missing DATABASE_URL_DIRECT or DATABASE_URL. See docs/environment-setup.md.");
  process.exit(1);
}
if (/supabase\.(co|com)/.test(url) && !flag("--allow-supabase")) {
  console.error("That connection string points at Supabase. This script is for the Neon database.");
  process.exit(1);
}

const client = await connect(url, "migrate");
try {
  const conn = asConn(client);
  console.log(`database: ${describeUrl(url)}`);
  console.log(`already applied: ${(await appliedMigrations(conn)).join(", ") || "none"}`);
  if (flag("--dry-run")) {
    console.log(`pending: ${(await pendingMigrations(conn)).join(", ") || "none"}`);
  } else {
    const done = await applyMigrations(conn, { log: (m) => console.log(m) });
    console.log(done.length ? `applied ${done.length} migration(s)` : "schema is up to date");
  }
} finally {
  await client.end();
}
