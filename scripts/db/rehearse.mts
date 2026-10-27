/**
 * Full migration rehearsal on local throwaway databases (no cloud accounts):
 *
 *   bash scripts/db/local-postgres.sh
 *   npx tsx scripts/db/rehearse.mts
 *
 * 1. Builds a Supabase stand-in (yoru_source): Supabase-shaped auth.users
 *    (with a password-hash column that must NOT be copied), all migrations,
 *    the demo content, plus edge cases (pinned posts, replies, reposts,
 *    message replies, an edited default channel, a non-ASCII bio).
 * 2. Migrates the Neon stand-in (yoru_target) as the non-superuser owner.
 * 3. Copies, changes and deletes data on the source, then runs the final copy
 *    with --mirror-deletes; both copies must verify identical.
 * Refuses to run against anything but 127.0.0.1 / localhost.
 */
import { spawnSync } from "node:child_process";
import { applyMigrations } from "../../src/lib/database/migrations";
import { seedDemo } from "../../src/lib/server/demo/seed";
import { asConn, connect } from "./lib.mjs";

const PORT = process.env.PGPORT_LOCAL ?? "54329";
const SOURCE = `postgres://postgres@127.0.0.1:${PORT}/yoru_source`;
const TARGET = `postgres://neondb_owner@127.0.0.1:${PORT}/yoru_target`;
for (const u of [SOURCE, TARGET]) if (!/@(127\.0\.0\.1|localhost):/.test(u)) throw new Error("local databases only");

const fresh = await connect(`postgres://postgres@127.0.0.1:${PORT}/postgres`, "rehearse");
for (const [db, owner] of [["yoru_source", "postgres"], ["yoru_target", "neondb_owner"]]) {
  await fresh.query(`drop database if exists ${db} with (force)`);
  await fresh.query(`create database ${db} owner ${owner}`);
}
await fresh.end();
const tgtAdmin = await connect(`postgres://postgres@127.0.0.1:${PORT}/yoru_target`, "rehearse");
await tgtAdmin.query("alter schema public owner to neondb_owner");
await tgtAdmin.end();

// 1. Supabase stand-in
const src = await connect(SOURCE, "rehearse-source");
const conn = asConn(src);
await src.query("create schema if not exists auth");
await src.query(`create table auth.users (
  id uuid primary key default gen_random_uuid(), email text unique,
  encrypted_password text, confirmation_token text, last_sign_in_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb, raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now())`);
await applyMigrations(conn);
await seedDemo(conn);
await src.query("update auth.users set encrypted_password = '$2a$10$fakefakefakefakefakefakefake', confirmation_token = 'tok-' || id");
await src.query(`update public.profiles p set pinned_post_id = (select id from public.posts where author_id = p.id order by created_at limit 1)
  where exists (select 1 from public.posts where author_id = p.id)`);
await src.query(`update public.profiles set bio = '夜は、まだ終わらない。 🌙 "quotes" \\ backslash' where id = (select id from public.profiles where not is_bot order by created_at limit 1)`);
// A row the migrations also create on the target: the copy must overwrite it.
await src.query("update public.channels set description = 'Edited on the source after launch' where id = '00000000-0000-4000-8000-0000000c0001'");
const stats = await src.query(`select
  (select count(*) from auth.users) as users, (select count(*) from public.posts) as posts,
  (select count(*) from public.comments where parent_id is not null) as replies,
  (select count(*) from public.posts where repost_of is not null) as reposts,
  (select count(*) from public.profiles where pinned_post_id is not null) as pinned`);
console.log("source ready:", stats.rows[0]);
await src.end();

// 2-3. migrate target, copy twice, verify
const run = (args: string[], env: Record<string, string>) => {
  const r = spawnSync("npx", ["tsx", ...args], { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${args.join(" ")} failed`);
};
const envs = { SOURCE_DATABASE_URL: SOURCE, DATABASE_URL_DIRECT: TARGET, DATABASE_URL: TARGET };
run(["scripts/db/migrate.mts"], envs);
run(["scripts/db/copy-to-neon.mts", "--dry-run"], envs);
run(["scripts/db/copy-to-neon.mts", "--yes"], envs);

// Activity on the source after the first copy (as between a rehearsal and the
// final copy): an edit, a new post, a deleted post and a removed reaction.
// The final copy with --mirror-deletes must end identical to the source.
const later = await connect(SOURCE, "rehearse-source");
await later.query("update public.profiles set status = 'changed after first copy' where id = (select id from public.profiles where not is_bot order by created_at limit 1)");
await later.query("delete from public.posts where id = (select id from public.posts where kind = 'post' and repost_of is null order by created_at limit 1)");
// Backdated and aimed at the oldest content, so the end-to-end flows that run
// on this database afterwards still see the seeded feed they expect.
await later.query("insert into public.posts (author_id, body, created_at) select id, 'posted after first copy', now() - interval '30 days' from public.profiles where not is_bot order by created_at limit 1");
await later.query(`delete from public.reactions where ctid = (select r.ctid from public.reactions r join public.posts p on p.id = r.post_id
  where p.deleted_at is null order by p.created_at, r.created_at limit 1)`);
await later.end();
run(["scripts/db/copy-to-neon.mts", "--mirror-deletes", "--dry-run"], envs);
run(["scripts/db/copy-to-neon.mts", "--mirror-deletes", "--yes"], envs);

// Passwords and tokens must not exist on the target at all.
const tgt = await connect(TARGET, "rehearse-target");
const cols = await tgt.query("select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users' order by 1");
console.log("target auth.users columns:", cols.rows.map((r) => r.column_name).join(", "));
if (cols.rows.some((r) => /password|token/.test(r.column_name))) throw new Error("credential columns on target");
await tgt.end();
console.log("\nrehearsal passed");
