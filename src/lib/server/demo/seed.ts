import { appMode, dataBackend } from "@/lib/config";
import type { SqlConn } from "@/lib/database/migrations";
import { runSeed, type SeedAdapter } from "@/lib/seed/run";
import { CORE_USERS, SEED_UNREAD_NOTIFICATIONS } from "@/lib/seed/data";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const TABLES_WITH_ID = new Set(["posts", "poll_options", "comments", "awards", "stories", "messages", "channels", "notifications"]);

function cols(obj: Record<string, unknown>) {
  const keys = Object.keys(obj);
  for (const k of keys) if (!IDENT.test(k)) throw new Error(`bad column ${k}`);
  return keys;
}

// node-postgres sends JS arrays as Postgres arrays; jsonb objects must be text.
function toParam(v: unknown) {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v;
}

export async function seedDemo(db: SqlConn, opts: { transaction?: boolean } = {}) {
  const adapter: SeedAdapter = {
    async createUser(u, inviteCode) {
      const res = await db.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
        [
          `${u.username.toLowerCase()}@itn-demo.example.com`,
          JSON.stringify({
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url ?? null,
            invite_code: inviteCode,
          }),
        ],
      );
      return res.rows[0].id;
    },
    async insert(table, row) {
      if (!IDENT.test(table)) throw new Error("bad table");
      const keys = cols(row);
      const sql = `insert into public.${table} (${keys.join(", ")}) values (${keys
        .map((_, i) => `$${i + 1}`)
        .join(", ")}) ${TABLES_WITH_ID.has(table) ? "returning id" : ""}`;
      const res = await db.query<{ id: string }>(sql, keys.map((k) => toParam(row[k])));
      return res.rows[0]?.id;
    },
    async update(table, match, values) {
      if (!IDENT.test(table)) throw new Error("bad table");
      const vk = cols(values);
      const mk = cols(match);
      const sql = `update public.${table} set ${vk.map((k, i) => `${k} = $${i + 1}`).join(", ")} where ${mk
        .map((k, i) => `${k} = $${vk.length + i + 1}`)
        .join(" and ")}`;
      await db.query(sql, [...vk.map((k) => toParam(values[k])), ...mk.map((k) => match[k])]);
    },
    async finalize(ids) {
      await db.query(
        `update public.notifications set read_at = now()
         where user_id <> $1 or id not in (
           select id from public.notifications where user_id = $1 order by created_at desc limit $2)`,
        [ids.you, SEED_UNREAD_NOTIFICATIONS],
      );
      await db.query("delete from public.rate_limits");
      // Demo only: give the seeded people interests and languages so Discover
      // has something to show locally (skipped if the Open Gates columns are absent).
      // The demo login accounts keep no saved language, like existing accounts;
      // only background members vary.
      const hasCol = await db.query<{ ok: boolean }>(
        "select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'interests') as ok",
      );
      if (hasCol.rows[0]?.ok) {
        await db.query(`
          with ranked as (select id, row_number() over (order by created_at, id) as n from public.profiles where not is_bot)
          update public.profiles p set
            interests = string_to_array((array['anime,manga,gaming', 'vocaloid,jpop,music', 'art,cosplay,anime',
                               'gaming,memes,tech', 'manga,writing,film', 'jrock,music,figures'])[(r.n % 6) + 1], ','),
            locale = case when p.username = any(string_to_array($1, ',')) then null
                          else (array['en','ja','en','es','fr','en','pt','ko'])[(r.n % 8) + 1] end
          from ranked r where p.id = r.id and r.n > 1`, [CORE_USERS.map((u) => u.username).join(",")]);
      }
    },
    log: (m) => console.log(`[itn demo seed] ${m}`),
  };
  if (opts.transaction === false) return runSeed(adapter);
  // One transaction so a crash never leaves a half-seeded database behind.
  await db.exec("begin");
  try {
    await runSeed(adapter);
    await db.exec("commit");
  } catch (err) {
    await db.exec("rollback");
    throw err;
  }
}

const g = globalThis as unknown as { __yoruDemoSeed?: Promise<void> };

// Demo login on a plain Postgres database (DEMO_MODE with DATA_BACKEND=neon,
// used for local end-to-end tests): seed once if there are no people yet.
// PGlite seeds itself when it opens. Never runs with Supabase Auth.
export function ensureDemoSeeded(): Promise<void> {
  if (appMode() !== "demo" || dataBackend() !== "postgres") return Promise.resolve();
  g.__yoruDemoSeed ??= (async () => {
    const { pgQuery, pgTransaction } = await import("../postgres");
    const humans = await pgQuery<{ n: number }>("select count(*)::int as n from public.profiles where not is_bot");
    if (humans.rows[0].n > 0) return;
    await pgTransaction(async (conn) => {
      await conn.exec("lock table public.profiles in exclusive mode");
      const again = await conn.query<{ n: number }>("select count(*)::int as n from public.profiles where not is_bot");
      if (again.rows[0].n === 0) await seedDemo(conn, { transaction: false });
    });
  })().catch((err) => {
    g.__yoruDemoSeed = undefined;
    throw err;
  });
  return g.__yoruDemoSeed;
}
