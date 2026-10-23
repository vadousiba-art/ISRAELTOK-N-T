import type { PGlite } from "@electric-sql/pglite";
import { runSeed, type SeedAdapter } from "@/lib/seed/run";
import { SEED_UNREAD_NOTIFICATIONS } from "@/lib/seed/data";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const TABLES_WITH_ID = new Set(["posts", "poll_options", "comments", "awards", "stories", "messages", "channels", "notifications"]);

function cols(obj: Record<string, unknown>) {
  const keys = Object.keys(obj);
  for (const k of keys) if (!IDENT.test(k)) throw new Error(`bad column ${k}`);
  return keys;
}

export async function seedDemo(db: PGlite) {
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
      const res = await db.query<{ id: string }>(sql, keys.map((k) => row[k]));
      return res.rows[0]?.id;
    },
    async update(table, match, values) {
      if (!IDENT.test(table)) throw new Error("bad table");
      const vk = cols(values);
      const mk = cols(match);
      const sql = `update public.${table} set ${vk.map((k, i) => `${k} = $${i + 1}`).join(", ")} where ${mk
        .map((k, i) => `${k} = $${vk.length + i + 1}`)
        .join(" and ")}`;
      await db.query(sql, [...vk.map((k) => values[k]), ...mk.map((k) => match[k])]);
    },
    async finalize(ids) {
      await db.query(
        `update public.notifications set read_at = now()
         where user_id <> $1 or id not in (
           select id from public.notifications where user_id = $1 order by created_at desc limit $2)`,
        [ids.you, SEED_UNREAD_NOTIFICATIONS],
      );
      await db.query("delete from public.rate_limits");
    },
    log: (m) => console.log(`[itn demo seed] ${m}`),
  };
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
