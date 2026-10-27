/**
 * Copy YORU's data from the Supabase database to Neon, then verify it.
 *
 *   npm run db:copy -- --dry-run   # plan + row counts, writes nothing
 *   npm run db:copy -- --yes       # copy (all-or-nothing), then verify
 *   npm run db:copy -- --verify    # compare source and target only
 *
 * SOURCE_DATABASE_URL  Supabase connection string (Project Settings -> Database,
 *                      "Session pooler" or direct). Only read, inside one
 *                      read-only REPEATABLE READ snapshot.
 * DATABASE_URL_DIRECT  Neon direct (non-pooled) connection string (or
 *                      DATABASE_URL). Run `npm run db:migrate` on it first.
 *
 * What it does:
 *   - auth.users: copies ONLY id, email, raw_user_meta_data and created_at
 *     into Neon's identity mirror. Password hashes, tokens and sessions are
 *     never read; logins keep working through Supabase Auth.
 *   - every public table except rate_limits (short-lived counters): upserts
 *     every row by primary key, preserving ids, timestamps and values, so a
 *     re-run converges on the source. Default rows the migrations created
 *     (channels, settings) are overwritten with the source's values.
 *   - foreign keys that form cycles (profiles.pinned_post_id) or point into
 *     the same table (comments.parent_id, posts.repost_of, messages.reply_to)
 *     are filled in a second pass.
 *   - user triggers are disabled during the copy so no notifications, XP or
 *     sign-up logic fire; constraints stay enforced. Everything runs in one
 *     transaction: any error leaves Neon exactly as it was.
 *   - verification compares row counts and an md5 checksum of every row
 *     (common columns, UTC) per table, and fails loudly on any difference.
 *   --mirror-deletes   also delete target rows that no longer exist on the
 *                      source (deleted accounts, posts, un-likes since an
 *                      earlier copy). Needed for a final copy after a
 *                      rehearsal and for rollback, so deleted data never comes
 *                      back. --dry-run shows how many rows it would remove.
 *   --skip-identities  leave auth.users alone (rollback copies back into
 *                      Supabase, whose auth.users is managed by Supabase Auth)
 * Never writes to the source. Never deletes rows on the target.
 */
import type pg from "pg";
import { appliedMigrations, migrationFiles } from "../../src/lib/database/migrations";
import { asConn, connect, describeUrl, env, flag } from "./lib.mjs";

const SKIP = new Set(["_itn_migrations", "rate_limits"]);
const BATCH = 500;

type Col = { name: string; nullable: boolean };
type Fk = { table: string; cols: string[]; ref: string };
type Table = { schema: string; name: string; cols: Col[]; pk: string[]; deferred: string[] };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const fq = (t: { schema: string; name: string }) => `${q(t.schema)}.${q(t.name)}`;

const sourceUrl = env("SOURCE_DATABASE_URL");
const targetUrl = env("DATABASE_URL_DIRECT") ?? env("DATABASE_URL");
if (!sourceUrl || !targetUrl) {
  console.error("Set SOURCE_DATABASE_URL (Supabase) and DATABASE_URL_DIRECT (Neon). See docs/database-migration.md.");
  process.exit(1);
}
if (sourceUrl === targetUrl) {
  console.error("Source and target are the same database. Refusing.");
  process.exit(1);
}
const mode = flag("--verify") ? "verify" : flag("--yes") ? "copy" : "dry-run";
const withIdentities = !flag("--skip-identities");
const mirrorDeletes = flag("--mirror-deletes");
const IDENT_TABLE = { schema: "auth", name: "users" };

const src = await connect(sourceUrl, "copy-source");
const dst = await connect(targetUrl, "copy-target");
let failed = false;
try {
  console.log(`source: ${describeUrl(sourceUrl)}\ntarget: ${describeUrl(targetUrl)}\nmode:   ${mode}\n`);
  for (const c of [src, dst]) await c.query("set timezone = 'UTC'; set datestyle = 'ISO, YMD'; set intervalstyle = 'iso_8601'");

  // The target schema must be fully migrated (Neon gets the same SQL).
  const applied = new Set(await appliedMigrations(asConn(dst)));
  const missing = migrationFiles().filter((f) => !applied.has(f));
  if (missing.length) throw new Error(`target is missing migrations: ${missing.join(", ")}. Run npm run db:migrate first.`);

  const tables = await plan();
  if (mode === "copy") await copy(tables);
  if (mode !== "dry-run") failed = !(await verify(tables));
} catch (err) {
  failed = true;
  console.error(`\nFAILED: ${(err as Error).message}`);
} finally {
  await src.end().catch(() => {});
  await dst.end().catch(() => {});
}
process.exit(failed ? 1 : 0);

// ---------------------------------------------------------------------------

async function columns(c: pg.Client, schema: string, table: string): Promise<Col[]> {
  const r = await c.query<{ name: string; nullable: boolean }>(
    `select column_name as name, is_nullable = 'YES' as nullable
     from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'
     order by ordinal_position`,
    [schema, table],
  );
  return r.rows;
}

async function plan(): Promise<Table[]> {
  const names = (
    await dst.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
    )
  ).rows
    .map((r) => r.name)
    .filter((n) => !SKIP.has(n));

  const pks = new Map<string, string[]>();
  for (const r of (
    await dst.query<{ t: string; cols: string[] }>(
      `select c.relname::text as t, array_agg(a.attname::text order by array_position(i.indkey, a.attnum)) as cols
       from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = any (i.indkey)
       where i.indisprimary and n.nspname = 'public' group by c.relname`,
    )
  ).rows)
    pks.set(r.t, r.cols);

  const fks: Fk[] = (
    await dst.query<Fk>(
      `select c.relname::text as table, array_agg(a.attname::text order by k.ord) as cols, rc.relname::text as ref
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
       where con.contype = 'f' and n.nspname = 'public'
       group by con.oid, c.relname, rc.relname`,
    )
  ).rows;

  const cols = new Map<string, Col[]>();
  for (const n of names) {
    const tc = await columns(dst, "public", n);
    const sc = await columns(src, "public", n);
    if (!sc.length) throw new Error(`source has no table public.${n}. Is SOURCE_DATABASE_URL the YORU Supabase database?`);
    const sourceNames = new Set(sc.map((c) => c.name));
    const notInSource = tc.filter((c) => !sourceNames.has(c.name));
    // Columns added on the target by a newer migration must have defaults;
    // jsonb_populate_recordset would otherwise insert null.
    for (const c of notInSource) {
      if (!c.nullable) throw new Error(`public.${n}.${c.name} is NOT NULL on the target but missing on the source. Apply the same migrations to Supabase first.`);
    }
    const extra = sc.filter((c) => !tc.some((t) => t.name === c.name)).map((c) => c.name);
    if (extra.length) throw new Error(`public.${n} has columns on the source that the target lacks: ${extra.join(", ")}. Add a migration first.`);
    cols.set(n, tc.filter((c) => sourceNames.has(c.name)));
  }

  // Order tables so required (NOT NULL) references are loaded first. Nullable
  // references to a table that is not loaded yet (or to itself) are deferred.
  const order: string[] = [];
  const pending = new Set(names);
  const requiredDeps = (t: string) =>
    fks
      .filter((f) => f.table === t && f.ref !== t && names.includes(f.ref))
      .filter((f) => f.cols.some((c) => !cols.get(t)!.find((x) => x.name === c)?.nullable))
      .map((f) => f.ref);
  while (pending.size) {
    const ready = [...pending].filter((t) => requiredDeps(t).every((d) => !pending.has(d)));
    if (!ready.length) throw new Error(`cannot order tables (required foreign-key cycle among ${[...pending].join(", ")})`);
    for (const t of ready.sort()) {
      order.push(t);
      pending.delete(t);
    }
  }
  const tables: Table[] = order.map((name) => {
    const pos = order.indexOf(name);
    const deferred = fks
      .filter((f) => f.table === name && names.includes(f.ref) && order.indexOf(f.ref) >= pos)
      .flatMap((f) => f.cols);
    const pk = pks.get(name);
    if (!pk?.length) throw new Error(`public.${name} has no primary key; cannot copy idempotently.`);
    return { schema: "public", name, cols: cols.get(name)!, pk, deferred: [...new Set(deferred)] };
  });

  console.log("table".padEnd(28), "source rows".padStart(12), "target rows".padStart(12), "  second pass");
  for (const t of [...(withIdentities ? [IDENT_TABLE] : []), ...tables]) {
    const s = await src.query<{ n: string }>(`select count(*) as n from ${fq(t)}`);
    const d = await dst.query<{ n: string }>(`select count(*) as n from ${fq(t)}`);
    const deferred = "deferred" in t ? (t as Table).deferred.join(", ") : "";
    console.log(`${t.schema}.${t.name}`.padEnd(28), s.rows[0].n.padStart(12), d.rows[0].n.padStart(12), `  ${deferred}`);
  }
  console.log("");
  if (mode === "dry-run") {
    // Count rows that exist only on the target, inside a transaction that is
    // always rolled back (temporary key tables only).
    await dst.query("begin");
    await src.query("begin isolation level repeatable read read only");
    try {
      for (const t of [...(withIdentities ? [identTable()] : []), ...tables]) {
        const n = await targetOnly(t, false);
        if (n) console.log(`rows only on the target: ${t.schema}.${t.name} ${n}${mirrorDeletes ? " (would be deleted)" : " (kept; add --mirror-deletes to remove)"}`);
      }
    } finally {
      await dst.query("rollback");
      await src.query("rollback");
    }
  }
  return tables;
}

function identTable(): Table {
  return { schema: "auth", name: "users", cols: ["id", "email", "raw_user_meta_data", "created_at"].map((name) => ({ name, nullable: true })), pk: ["id"], deferred: [] };
}

// Loads the source's primary keys into a temp table on the target and counts
// (or deletes) target rows whose key is not among them. Must run inside the
// caller's transactions (source snapshot + target write transaction).
async function targetOnly(t: Table, remove: boolean): Promise<number> {
  const keys = t.pk.map(q).join(", ");
  const tmp = q(`_src_keys_${t.schema}_${t.name}`);
  await dst.query(`create temp table ${tmp} on commit drop as select ${keys} from ${fq(t)} where false`);
  const cursor = `k_${t.schema}_${t.name}`;
  await src.query(`declare ${cursor} no scroll cursor for select to_jsonb(s) as j from (select ${keys} from ${fq(t)}) s`);
  for (;;) {
    const batch = await src.query<{ j: unknown }>(`fetch 5000 from ${cursor}`);
    if (!batch.rows.length) break;
    await dst.query(`insert into ${tmp} select ${keys} from jsonb_populate_recordset(null::${fq(t)}, $1::jsonb)`, [
      JSON.stringify(batch.rows.map((x) => x.j)),
    ]);
  }
  await src.query(`close ${cursor}`);
  const match = t.pk.map((c) => `k.${q(c)} = t.${q(c)}`).join(" and ");
  const sql = remove
    ? `delete from ${fq(t)} t where not exists (select 1 from ${tmp} k where ${match})`
    : `select count(*)::int as n from ${fq(t)} t where not exists (select 1 from ${tmp} k where ${match})`;
  const r = await dst.query<{ n: number }>(sql);
  await dst.query(`drop table ${tmp}`);
  return remove ? (r.rowCount ?? 0) : r.rows[0].n;
}

async function copy(tables: Table[]) {
  // One consistent snapshot of the source for every table.
  await src.query("begin isolation level repeatable read read only");
  await dst.query("begin");
  try {
    const all = [...(withIdentities ? [IDENT_TABLE] : []), ...tables];
    for (const t of all) await dst.query(`alter table ${fq(t)} disable trigger user`);

    // Identity mirror: only these four columns are ever read from auth.users.
    const ident = identTable();
    if (withIdentities) await copyTable(ident, `select id, email, raw_user_meta_data, created_at from auth.users`);
    for (const t of tables) await copyTable(t);
    for (const t of tables.filter((x) => x.deferred.length)) await fillDeferred(t);
    if (mirrorDeletes) {
      // Children first; ON DELETE CASCADE / SET NULL rules still apply.
      for (const t of [...tables].reverse().concat(withIdentities ? [ident] : [])) {
        const n = await targetOnly(t, true);
        if (n) console.log(`deleted from ${t.schema}.${t.name}: ${n} row(s) no longer on the source`);
      }
    }

    for (const t of all) await dst.query(`alter table ${fq(t)} enable trigger user`);
    await fixSequences();
    await dst.query("commit");
    await src.query("commit");
    console.log("copy committed\n");
  } catch (err) {
    await dst.query("rollback").catch(() => {});
    await src.query("rollback").catch(() => {});
    throw err;
  }
}

async function copyTable(t: Table, sourceSql?: string) {
  const names = t.cols.map((c) => c.name);
  const select = names.map((n) => (t.deferred.includes(n) ? `null as ${q(n)}` : q(n))).join(", ");
  const updates = names.filter((n) => !t.pk.includes(n)).map((n) => `${q(n)} = excluded.${q(n)}`);
  const insert = `insert into ${fq(t)} (${names.map(q).join(", ")})
    select ${select} from jsonb_populate_recordset(null::${fq(t)}, $1::jsonb)
    on conflict (${t.pk.map(q).join(", ")}) do ${updates.length ? `update set ${updates.join(", ")}` : "nothing"}`;
  const cursor = `c_${t.schema}_${t.name}`;
  await src.query(
    `declare ${cursor} no scroll cursor for select to_jsonb(s) as j from (${sourceSql ?? `select ${names.map(q).join(", ")} from ${fq(t)}`}) s order by ${t.pk.map(q).join(", ")}`,
  );
  let copied = 0;
  for (;;) {
    const batch = await src.query<{ j: unknown }>(`fetch ${BATCH} from ${cursor}`);
    if (!batch.rows.length) break;
    const r = await dst.query(insert, [JSON.stringify(batch.rows.map((x) => x.j))]);
    if ((r.rowCount ?? 0) !== batch.rows.length) {
      throw new Error(`${t.schema}.${t.name}: wrote ${r.rowCount} of ${batch.rows.length} rows in a batch`);
    }
    copied += batch.rows.length;
  }
  await src.query(`close ${cursor}`);
  console.log(`copied ${t.schema}.${t.name}: ${copied}`);
}

async function fillDeferred(t: Table) {
  const keys = [...t.pk, ...t.deferred];
  const cursor = `d_${t.name}`;
  await src.query(
    `declare ${cursor} no scroll cursor for select to_jsonb(s) as j from (select ${keys.map(q).join(", ")} from ${fq(t)}
     where ${t.deferred.map((c) => `${q(c)} is not null`).join(" or ")}) s order by ${t.pk.map(q).join(", ")}`,
  );
  const sql = `update ${fq(t)} as t set ${t.deferred.map((c) => `${q(c)} = s.${q(c)}`).join(", ")}
    from jsonb_populate_recordset(null::${fq(t)}, $1::jsonb) as s
    where ${t.pk.map((c) => `t.${q(c)} = s.${q(c)}`).join(" and ")}`;
  let n = 0;
  for (;;) {
    const batch = await src.query<{ j: unknown }>(`fetch ${BATCH} from ${cursor}`);
    if (!batch.rows.length) break;
    const r = await dst.query(sql, [JSON.stringify(batch.rows.map((x) => x.j))]);
    if ((r.rowCount ?? 0) !== batch.rows.length) throw new Error(`${t.name}: second pass updated ${r.rowCount} of ${batch.rows.length}`);
    n += batch.rows.length;
  }
  await src.query(`close ${cursor}`);
  console.log(`linked ${t.name} (${t.deferred.join(", ")}): ${n}`);
}

// YORU uses uuid keys, but keep any serial/identity sequence ahead of the data.
async function fixSequences() {
  const seqs = await dst.query<{ seq: string; tbl: string; col: string }>(
    `select s.oid::regclass::text as seq, t.oid::regclass::text as tbl, a.attname as col
     from pg_class s join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
     join pg_class t on t.oid = d.refobjid join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
     where s.relkind = 'S'`,
  );
  for (const s of seqs.rows) {
    await dst.query(`select setval($1, greatest((select max(${q(s.col)}) from ${s.tbl}), 1))`, [s.seq]);
  }
}

async function checksum(c: pg.Client, t: { schema: string; name: string }, cols: string[], pk: string[]) {
  const r = await c.query<{ n: string; h: string | null }>(
    `select count(*) as n, md5(string_agg(md5(row(${cols.map(q).join(", ")})::text), '' order by ${pk.map(q).join(", ")})) as h from ${fq(t)}`,
  );
  return r.rows[0];
}

async function verify(tables: Table[]): Promise<boolean> {
  let ok = true;
  console.log("verification (row count + md5 of every row):");
  const ident = { schema: "auth", name: "users", cols: ["id", "email", "raw_user_meta_data", "created_at"], pk: ["id"] };
  for (const t of [...(withIdentities ? [ident] : []), ...tables.map((x) => ({ ...x, cols: x.cols.map((c) => c.name) }))]) {
    const [s, d] = await Promise.all([checksum(src, t, t.cols, t.pk), checksum(dst, t, t.cols, t.pk)]);
    const same = s.n === d.n && s.h === d.h;
    if (!same) ok = false;
    const hint = !same && Number(d.n) > Number(s.n) && !mirrorDeletes ? "  (extra rows on target: re-run with --mirror-deletes)" : "";
    console.log(`  ${same ? "OK  " : "DIFF"} ${`${t.schema}.${t.name}`.padEnd(28)} source ${s.n.padStart(7)}  target ${d.n.padStart(7)}${hint}`);
  }
  // Orphan check on the target: every profile has an identity, nothing dangles.
  if (!withIdentities) {
    console.log(ok ? "\nverification passed (identities skipped)" : "\nverification FAILED: do not cut over");
    return ok;
  }
  const orphans = await dst.query<{ n: string }>(
    "select count(*) as n from public.profiles p where not p.is_bot and not exists (select 1 from auth.users u where u.id = p.id)",
  );
  if (orphans.rows[0].n !== "0") {
    ok = false;
    console.log(`  DIFF profiles without an identity on the target: ${orphans.rows[0].n}`);
  }
  console.log(ok ? "\nverification passed" : "\nverification FAILED: do not cut over");
  return ok;
}
