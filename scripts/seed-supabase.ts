/**
 * Seed a Supabase project with the demo content (users, posts, stories, chats).
 *
 *   npm run seed -- --yes
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from
 * .env.local / .env). Demo accounts get the password in SEED_PASSWORD, or a
 * random one that is printed at the end. On an empty project the first seeded
 * account ("AriMenace") becomes the owner — sign up yourself first if you want
 * to own the place.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runSeed, type SeedAdapter } from "../src/lib/seed/run";
import { SEED_UNREAD_NOTIFICATIONS, SEED_USERS } from "../src/lib/seed/data";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error(`This creates ${SEED_USERS.length} demo accounts and sample content in ${url}.\nRe-run with --yes to continue.`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(12).toString("base64url");
const WITH_ID = new Set(["posts", "poll_options", "comments", "awards", "stories", "messages", "channels"]);

async function main() {
  const { data: existing } = await sb.from("profiles").select("id").ilike("username", SEED_USERS[0].username).maybeSingle();
  if (existing) {
    console.error("Looks like this project is already seeded (AriMenace exists). Aborting.");
    process.exit(1);
  }

  const adapter: SeedAdapter = {
    async createUser(u, inviteCode) {
      const { data, error } = await sb.auth.admin.createUser({
        email: `${u.username.toLowerCase()}@itn-demo.example.com`,
        password,
        email_confirm: true,
        user_metadata: { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url ?? null, invite_code: inviteCode },
      });
      if (error || !data.user) throw new Error(`createUser ${u.username}: ${error?.message}`);
      return data.user.id;
    },
    async insert(table, row) {
      if (WITH_ID.has(table)) {
        const { data, error } = await sb.from(table).insert(row).select("id").single();
        if (error) throw new Error(`insert ${table}: ${error.message}`);
        return (data as { id: string }).id;
      }
      const { error } = await sb.from(table).insert(row);
      if (error) throw new Error(`insert ${table}: ${error.message}`);
      return undefined;
    },
    async update(table, match, values) {
      const { error } = await sb.from(table).update(values).match(match);
      if (error) throw new Error(`update ${table}: ${error.message}`);
    },
    async finalize(ids) {
      const { data } = await sb
        .from("notifications")
        .select("id")
        .eq("user_id", ids.you)
        .order("created_at", { ascending: false })
        .limit(SEED_UNREAD_NOTIFICATIONS);
      const keep = (data ?? []).map((r: { id: string }) => r.id);
      let q = sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      if (keep.length) q = q.not("id", "in", `(${keep.join(",")})`);
      await q;
    },
    log: (m) => console.log(`• ${m}`),
  };

  await runSeed(adapter);
  console.log(`\nDone. Demo accounts use emails like arimenace@itn-demo.example.com`);
  if (!process.env.SEED_PASSWORD) console.log(`Password for all demo accounts: ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
