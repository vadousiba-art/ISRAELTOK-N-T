# Database migration: Supabase Postgres → Neon

Status (2026-10-27): **built and rehearsed locally; no production cutover has happened.** Production still runs on Supabase. Read the decision in [architecture.md](architecture.md#decision-supabase-stays-primary-for-now) first. On Neon's Free plan, the 100 CU-hour monthly cap would probably take an active YORU offline mid-month, so cut over only on a paid Neon plan, or once you have confirmed your usage fits.

| | |
| --- | --- |
| Source | Supabase project Postgres (schema from `supabase/migrations/0001–0005`, `auth.users` managed by Supabase Auth) |
| Target | Neon Postgres 16 or 17, same migrations applied by `npm run db:migrate`, plus `src/lib/database/postgres-shim.sql` (roles `anon`/`authenticated`/`service_role`, an `auth` schema with `uid()`/`role()`, and an `auth.users` identity mirror) |
| Auth | Stays on Supabase. User ids do not change. Passwords never leave Supabase. |
| Files | Stay in Supabase Storage. Paths in rows are copied unchanged, so every existing media URL keeps working. |

## Schema changes

Only one new migration, **`0005_neon_ready.sql`**. It is additive and safe on Supabase too:

- `emit_change()` keeps its `pg_notify` and additionally records a compact change list, but **only** when a session sets `yoru.capture = on` (only the Neon adapter does). Supabase behaviour is unchanged.
- Trigram indexes for the existing searches (`pg_trgm`; skipped if the extension can't be installed).
- 19 foreign-key indexes for cascading deletes.
- `media_paths_in_use(text[])`: a server-only function used by the upload cleanup job.

No table, column or row is changed or removed. Apply it to the **Supabase** project as well (SQL editor or `supabase db push`). It is required there for the upload cleanup cron and helps search; the app works without it.

## Stage 1: inventory and backup

1. Record sizes, without printing any personal data:
   ```sql
   select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by 2 desc;
   select pg_size_pretty(pg_database_size(current_database()));
   select count(*) from auth.users;
   ```
2. **Back up Supabase** (Supabase Free has no automatic backups). Get the connection string from Project Settings → Database (use the *Session pooler* string if your network has no IPv6), then:
   ```bash
   pg_dump "$SOURCE_DATABASE_URL" --schema=public --format=custom --no-owner --file yoru-public-$(date +%F).dump
   pg_dump "$SOURCE_DATABASE_URL" --schema=auth --table=auth.users --data-only --format=custom --file yoru-auth-users-$(date +%F).dump
   ```
   Keep both files private: the auth dump contains password hashes. Never commit them. Test that the public dump restores into a scratch database (`pg_restore --list` at minimum).
3. Note the rollback requirements: the Supabase project, its keys and these dumps stay untouched for at least 30 days after cutover.

## Stage 2: provision Neon (needs your account)

1. Create a project at <https://console.neon.tech> on Postgres 16 or 17, in the region closest to your Vercel functions (Vercel → Project → Settings → Functions → Region).
2. Free plan: set **autoscaling max to 0.25 CU** (Compute → Edit) to stretch CU-hours. Leave scale-to-zero on (it can't be turned off on Free anyway).
3. Copy two connection strings from **Connect**: the *pooled* one (host contains `-pooler`) → `DATABASE_URL`, and the *direct* one → `DATABASE_URL_DIRECT`. Keep them server-only. See [environment-setup.md](environment-setup.md).
4. Create a `preview` branch for Vercel Preview deployments, so previews never touch production data.
5. Apply the schema:
   ```bash
   DATABASE_URL_DIRECT='postgres://…' npm run db:migrate -- --dry-run
   DATABASE_URL_DIRECT='postgres://…' npm run db:migrate
   ```
   This runs the shim plus `0001, 0003, 0004, 0005` (0002 is Supabase Storage only), each in its own transaction, recorded in `public._itn_migrations`.

## Stage 3: copy data

```bash
export SOURCE_DATABASE_URL='postgres://…supabase…'   # read-only use
export DATABASE_URL_DIRECT='postgres://…neon…'
npm run db:copy -- --dry-run     # plan + counts, writes nothing
npm run db:copy -- --yes         # copy, then verify
```

What `scripts/db/copy-to-neon.mts` does:

- Reads the source inside one `REPEATABLE READ READ ONLY` transaction, so all tables come from the same instant.
- **auth.users: copies only `id, email, raw_user_meta_data, created_at`.** It never selects password hashes, tokens or sessions.
- Copies every public table except `rate_limits` (short-lived counters), in foreign-key order, upserting by primary key. Ids, timestamps, nulls and values are preserved, and a re-run converges on the source. Default rows the migrations created (channels, settings) take the source's values.
- Fills cyclic and self references in a second pass (`profiles.pinned_post_id`, `comments.parent_id`, `posts.repost_of`, `messages.reply_to`, and notification links).
- Disables *user* triggers during the copy, so no notifications, XP or sign-up logic fire. Constraints (PK, FK, unique, check) stay enforced.
- Runs as **one transaction** on Neon: any error rolls everything back. Every batch's write count is checked, so no row is skipped silently.
- With `--mirror-deletes`, also deletes target rows that no longer exist on the source (children first; cascade rules apply). `--dry-run` shows how many. Without the flag, nothing is ever deleted, and verification reports extra rows.
- Refuses to run if the target is missing migrations, if a target column is `NOT NULL` but absent on the source, or if the source has columns the target lacks (schema drift).

## Stage 4: validate

`--yes` ends with verification, and `npm run db:copy -- --verify` repeats it at any time. Per table it compares row counts and an md5 over every row (common columns, UTC, ordered by primary key). It also checks that every human profile has an identity row. Any difference prints `DIFF`, and the command exits non-zero.

Then exercise the app against Neon **before** switching production:

```bash
# Real Postgres adapter tests (create test users and posts: use the preview branch, never production)
TEST_DATABASE_URL='postgres://…preview-branch…' npm run test:pg
```

and a Vercel **Preview** deployment with `DATA_BACKEND=neon` pointing at the preview branch:
- log in as an existing user (proves the identity mapping);
- post with a photo, comment, react, DM a second account (check that live updates arrive);
- open an old photo (proves media paths);
- sign up a new account and delete it;
- run an admin action and look in the audit log.

Do not declare success because the database accepts connections.

## Stage 5: cutover (needs your approval and a short write pause)

Nothing may be written to Supabase after the final copy, so cutover happens in a short read-only window (a few minutes for YORU's current size).

1. Announce a window in the app (Admin → Controls → announcement). Then set **`MAINTENANCE_READ_ONLY=true`** in Vercel (Production) and redeploy. Reading keeps working; every write (posts, chat, uploads, sign-ups, AI, contact form, deletion) gets a friendly "posting is paused" message. Nothing new can reach Supabase after the final copy.
2. On Supabase (SQL editor), run [`supabase/manual/neon-1-realtime-policy.sql`](../supabase/manual/neon-1-realtime-policy.sql). It is additive: one Realtime Authorization policy.
3. Final copy: `npm run db:copy -- --mirror-deletes --dry-run`, then `npm run db:copy -- --mirror-deletes --yes`. It upserts everything changed since the rehearsal, and deletes rows that were deleted on Supabase in the meantime (closed accounts, removed posts and likes must not come back). Then it verifies. It must print `verification passed`.
4. On Supabase, run [`supabase/manual/neon-2-cutover-signup.sql`](../supabase/manual/neon-2-cutover-signup.sql). This makes the Supabase-side sign-up trigger a no-op, because profiles are now created on Neon.
5. In Vercel → Project → Settings → Environment Variables (**Production**), keep `MAINTENANCE_READ_ONLY=true` for now, and add `DATA_BACKEND=neon`, `DATABASE_URL` (pooled) and `CRON_SECRET`. Confirm that `SUPABASE_SERVICE_ROLE_KEY` is present. Redeploy.
6. Check (reads only, while still read-only):
   - `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/health` shows `"database":"postgres"`, `"realtime":"broadcast"`, `db.can_switch_role: true` and migrations `0001, 0003, 0004, 0005`;
   - log in, browse the feed and chats, open an old photo.
7. Remove `MAINTENANCE_READ_ONLY` (or set it to `false`) and redeploy. Post, DM a second account (check that the live update arrives), upload a photo. Remove the announcement.

Do not switch unless the schema is verified, the data checks pass, login works, core flows pass, media opens, and the rollback steps in [rollback.md](rollback.md) are understood.

## Stage 6: monitor, then retire

- First 48 h: watch Vercel → Logs for `[yoru] database unavailable`, `realtime relay`, and 5xx responses. Watch Neon → Monitoring for connections, CU-hours used, and storage.
- Keep the Supabase database **unchanged** for at least 30 days. Do not delete the Supabase project: Auth, Storage and Realtime still run there.
- After 30 days without rollback, Supabase's copy of the public tables can be left as an archive. Nothing reads it. Dropping it is optional, and irreversible without the dump.

## Local rehearsal (no accounts needed)

```bash
npm run db:local       # local Postgres 16 with a non-superuser "neondb_owner", like Neon
npm run db:rehearse    # Supabase stand-in with demo data + edge cases → migrate → copy → change/delete on source → final copy --mirror-deletes → verify
npm run build
E2E_DATABASE_URL=postgres://neondb_owner@127.0.0.1:54329/yoru_target CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
```

Results from 2026-10-27 (local Postgres 16.15, not Neon cloud):
- the rehearsal copied 53 identities and 24 tables. Both runs verified with identical checksums, and no password or token column exists on the target;
- all 15 Playwright end-to-end flows passed against the copied database through the Neon adapter.

## Manual steps that need you

1. Create the Neon project and branches, and put the connection strings into Vercel (stage 2).
2. Back up Supabase with `pg_dump` (stage 1). The connection string contains the database password, so only you should handle it.
3. Approve and run stages 5 and 6.
