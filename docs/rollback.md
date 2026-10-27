# Rollback

## Backups

Supabase Free has no automatic backups, so take your own, weekly and before any migration:

```bash
pg_dump "$SOURCE_DATABASE_URL" --schema=public --format=custom --no-owner --file yoru-public-$(date +%F).dump
```

Store dumps privately, never in the repository. Neon keeps 6 hours of history on Free (restore with a branch from a point in time), so take a `pg_dump` of Neon too if it is primary.

## When to roll back

Roll back to Supabase as the primary database if, after a Neon cutover:
- verification ever shows a difference you cannot explain;
- people can't log in, post, or see their old data;
- Neon reports compute suspended (CU-hours used up) and you will not upgrade;
- error rates (5xx in Vercel logs) stay above normal for more than 15 minutes.

## Roll back from Neon to Supabase

Supabase Auth, Storage and Realtime never moved, so only the data source changes.

1. Turn on `MAINTENANCE_READ_ONLY=true` in Vercel (Production) and redeploy, so no new writes land on Neon while you switch.
2. **Writes made on Neon since cutover:**
   - Within minutes of cutover with no real activity: nothing to carry back.
   - Otherwise, copy them back with the same tool, pointed the other way. The tool upserts by primary key, so Supabase ends up with everything written on Neon:
     ```bash
     SOURCE_DATABASE_URL='<neon direct>' DATABASE_URL_DIRECT='<supabase connection string>' npx tsx scripts/db/copy-to-neon.mts --skip-identities --mirror-deletes --dry-run
     ```
     The script refuses a target that lacks the migration log table, and Supabase's migrations are not recorded in `_itn_migrations`. Create it on Supabase first and record the applied migrations:
     ```sql
     create table if not exists public._itn_migrations (name text primary key, applied_at timestamptz default now());
     insert into public._itn_migrations (name) values ('0001_core.sql'), ('0003_yoru_features.sql'), ('0004_open_signup.sql'), ('0005_neon_ready.sql') on conflict do nothing;
     ```
     Then run it with `--skip-identities --mirror-deletes --yes`. `--mirror-deletes` makes Supabase forget anything deleted on Neon (closed accounts stay closed). Logins already live in Supabase Auth, and Supabase manages its own `auth.users`, so the identity mirror is not copied back.
3. On Supabase, run [`supabase/manual/neon-rollback-signup.sql`](../supabase/manual/neon-rollback-signup.sql). It restores the sign-up trigger function from migration 0004.
4. In Vercel, remove `DATA_BACKEND` (or set it to `supabase`). You can leave `DATABASE_URL`; it is ignored. Redeploy.
5. Validate:
   - `/api/health` shows `"database":"supabase"` and `"realtime":"postgres_changes"`;
   - log in as an existing user; check that recent posts made during the Neon period are there; open an old photo; post and DM; sign up a test account and delete it.
6. Remove `MAINTENANCE_READ_ONLY` and redeploy.
7. Optional: drop the Realtime policy on Supabase (`drop policy if exists "yoru relay topics" on realtime.messages;`). It is harmless to keep.

Keep the Neon project until the rollback has been stable for a week.

## Roll back the application code

Every change in this work is behind configuration. With `DATA_BACKEND` unset, the app runs exactly the original Supabase paths. The only changes active in the default setup are:
- browser-side photo downscaling;
- the upload ownership and content check when media is attached (it fails open if storage is unreachable);
- the read-only switch (off unless set);
- the daily cleanup cron (report-only, and inert without `CRON_SECRET`).

To return to the previous code entirely, use Vercel → Deployments → pick the deployment before this change → **Promote to Production** (instant), or `git revert` the commit and redeploy.

Migration 0005 does not need reverting: it only adds indexes, a server-only function and an opt-in capture branch. To remove it anyway, drop the indexes and `media_paths_in_use`, and re-run the `emit_change()` definition from `0001_core.sql`.

## Validate data after any rollback

```bash
SOURCE_DATABASE_URL=<the database you consider the truth> DATABASE_URL_DIRECT=<the other one> npx tsx scripts/db/copy-to-neon.mts --verify   # add --skip-identities when the target is Supabase
```

It compares row counts and checksums per table, without writing anything.
