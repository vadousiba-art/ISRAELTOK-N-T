# YORU backend architecture

Last reviewed: 2026-10-27. Provider limits are summarised in [free-tier-limits.md](free-tier-limits.md).

## TL;DR

- **Production today (unchanged):** Vercel (Next.js 16) + Supabase (Postgres, Auth, Storage, Realtime). This stays the recommended production setup on a zero budget. The reasons are in [Decision](#decision-supabase-stays-primary-for-now).
- **Neon-ready (implemented, tested, off by default):** setting `DATA_BACKEND=neon` moves app data to Neon Postgres. Supabase keeps login, file storage and realtime delivery. The same SQL schema, RLS policies and functions run on both databases.
- One source of truth per kind of data. Nothing is ever written to two databases at the same time.

## What the audit found

| Area | Finding |
| --- | --- |
| Frontend | Next.js 16.4 App Router, React 19.3, Tailwind 4, Motion, SWR. Deployed on Vercel. `src/proxy.ts` refreshes the Supabase session and gates pages (routing only; it is not the security boundary). |
| Backend | Next route handlers under `src/app/api/*` (16 routes). No server actions. Node runtime. |
| Package manager | npm (`package-lock.json`), Node ≥ 20.12. |
| Database | 26 tables (25 with RLS), 129 application functions, 23 triggers, 24 RLS policies, 65 indexes. All in `supabase/migrations/0001–0005`. |
| Data access | **Every** read and write is a Postgres function called through one adapter (`src/lib/server/db.ts`). The browser never queries tables. 73 browser-callable functions are allow-listed and validated with zod (`src/lib/server/rpc-registry.ts`). |
| Auth | Supabase Auth, email + password. Accounts are created server-side (`/api/auth/join`); a database trigger (`handle_new_user`) creates the profile and applies the invite / open-sign-up rules. No OAuth providers, no password-reset flow in the app, and email confirmation is skipped (`email_confirm: true`). |
| Storage | One private Supabase bucket `media`. Uploads go browser → Supabase via one-time signed upload URLs; reads go through `/api/media/*`, which checks the session and redirects to a 1-hour signed URL. |
| Realtime | Supabase Realtime `postgres_changes` on messages, message_reactions, notifications, posts and stories, plus public Broadcast channels for typing indicators. Demo mode uses SSE. |
| Search | `ILIKE '%…%'` over posts and profiles (no index before 0005); hashtags use a GIN array index. |
| Rate limits | Per-user write limits inside Postgres (`enforce_rate_limit`, `consume_quota`), so they hold across server instances. Login, sign-up and contact form have in-memory per-IP limits, which hold only per instance. |
| Tests | Vitest (unit + SQL security tests on PGlite), Playwright (15 end-to-end flows), plus the new real-Postgres adapter tests. No CI workflow in the repo. |
| Background jobs | None before this change. Added: a daily abandoned-upload cleanup (Vercel Cron). |

### Bottlenecks and risks found

1. **Search did full-table scans.** Migration 0005 adds trigram indexes. Posts search drops from a scan of every post to an index lookup once there are thousands of posts.
2. **Cascading deletes had no supporting indexes.** Deleting an account or post scanned likes, comments, notifications and so on. 0005 adds 19 foreign-key indexes.
3. **Full-size photos.** Images up to 10 MB were stored and served as-is, eating storage and the 5 GB egress allowance. Uploads are now downscaled in the browser (longest side 2048 px; a 4000×3000 photo went from 11.3 MB to 1.6 MB in testing).
4. **Uploaded bytes were not checked in Supabase mode.** The bucket enforced only the *declared* type. Attaching an upload to a post, story, message or avatar now requires that it is the caller's own file and that its first bytes match its type.
5. **No backups on Supabase Free.** Supabase Free includes no automatic backups. See [rollback.md](rollback.md) for the manual `pg_dump` routine.
6. **Presence heartbeat.** Every open tab writes `touch_presence` every 60 s. That is harmless on Supabase, but it keeps a scale-to-zero database awake. This is the main reason Neon Free does not fit yet (see the decision below).
7. **In-memory per-IP limits** on login, join and the contact form reset per serverless instance. Supabase Auth's own limits still apply. Add a shared store (Upstash) only if abuse shows up.

## Decision: Supabase stays primary for now

Measured against the verified free tiers ([free-tier-limits.md](free-tier-limits.md)):

- **Neon Free compute is capped at 100 CU-hours per project per month.** That is about 400 hours at the smallest size (0.25 CU), out of a 730-hour month. When it runs out, the database is **suspended until next month**. YORU's realtime app keeps the database busy whenever anyone has it open (presence heartbeat, chat), so it would scale to zero rarely. A steadily active YORU would likely hit the cap around the middle of the month, and the whole app would go down.
- **Supabase Free has no compute-hour cap.** Its limits are 500 MB of database, 50k MAU, 1 GB of files, 5 GB egress, and pausing after 1 week of *inactivity*, which an active app never reaches.
- Moving data to Neon means replacing `postgres_changes` with a server relay and keeping an identity mirror in Neon. That is more moving parts for a gain of 1 GB of storage instead of 500 MB.

**Switch to Neon when** the Supabase database nears 500 MB, or when you move to a paid Neon plan (the compute cap is lifted on paid plans). The code, migrations, copy tool and tests are ready, and the cutover is a configuration change plus the steps in [database-migration.md](database-migration.md).

**Use Neon now for** preview and test databases: branches, a separate test database, and the local rehearsal. That costs nothing and never touches production.

## Architecture with `DATA_BACKEND=neon`

```
                 Browser / Android WebView
   │  pages, /api/*            │ upload bytes         │ Realtime websocket
   ▼                           ▼ (signed URL)         ▼ (private topics + typing)
┌──────────────────────┐   ┌──────────────────┐   ┌───────────────────────┐
│ Vercel (Next.js 16)  │──▶│ Supabase Storage │   │ Supabase Realtime     │
│ route handlers       │   │ bucket "media"   │   │ Broadcast             │
│  db.ts adapter ──────┼─┐ └──────────────────┘   └───────────▲───────────┘
│  realtime relay ─────┼─┼────── REST broadcast (secret key) ──┘
└────────┬─────────────┘ │
         │ getUser       │ pooled TCP (pg), one transaction per request,
         ▼               ▼ SET LOCAL ROLE authenticated + JWT claims
┌──────────────────┐   ┌───────────────────────────────────────────────┐
│ Supabase Auth    │   │ Neon Postgres: all app data, the same          │
│ logins, sessions │   │ migrations, RLS and functions; auth.users      │
│ password hashes  │   │ mirror (id, email, metadata only)              │
└──────────────────┘   └───────────────────────────────────────────────┘
```

With the default (`DATA_BACKEND` unset), the picture is today's: the adapter calls Supabase PostgREST, and Realtime streams `postgres_changes`.

## Service responsibilities

| Service | Responsibility | Data it stores | How the app authenticates | API / SDK | Browser or server | Free-tier limits that matter | Failure and recovery | Duplicates another service? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Vercel** | Hosting, route handlers, cron | None (stateless) | Project env vars | Next.js, `@vercel/functions` (`attachDatabasePool`, `waitUntil`), Vercel Cron | Both | 1M invocations, 4 h active CPU, 100 GB transfer, daily cron only, non-commercial use only | Redeploy or roll back a deployment in the dashboard | No |
| **Supabase Postgres** (default primary DB) | All app data | Profiles, posts, comments, reactions, bookmarks, blocks, channel memberships, chats and DMs, notifications, moderation, audit, XP | Server: the user's session via PostgREST (RLS applies), or the service key for server-only functions | `supabase-js` `rpc()` | Server only | 500 MB DB, pauses after 7 days idle, no backups | Supabase restarts it; restore from your own `pg_dump` | Not when Neon is used: then it is a frozen rollback copy |
| **Neon Postgres** (optional primary DB) | All app data when `DATA_BACKEND=neon` | Same tables; `auth.users` mirror without credentials | `DATABASE_URL` (server-only); per request `SET LOCAL ROLE authenticated` + JWT claims, so RLS applies | `pg` (node-postgres) Pool, Neon pooled endpoint (PgBouncer, transaction mode) | Server only | 1 GB/project, **100 CU-hours/month**, 5 GB egress, 6 h history | Connection errors → 503 "try again"; connect is retried 3× with backoff; writes are never retried after they start. Suspended compute wakes on the next query. Out of CU-hours = down until next month | No: Supabase Postgres is then read-only legacy |
| **Supabase Auth** | Logins, sessions, password hashes | Credentials, sessions | Anon key + cookies (SSR); service key for admin calls | `@supabase/ssr`, `supabase-js` `auth.*` | Both (cookies) | 50k MAU | If down: nobody can log in; existing pages fail closed (401) | No (Neon keeps only id, email, metadata) |
| **Supabase Storage** | Photos, GIFs, videos | Objects under `u/<user>/<uuid>.<ext>` | Service key (server) issues signed URLs | `createSignedUploadUrl`, `uploadToSignedUrl`, `createSignedUrl`, `list`, `remove` | Upload: browser with a signed token. Read: browser follows the server redirect | 1 GB files, 5 GB egress, 50 MB per-file bucket limit | Uploads and media fail; posts without media keep working | No |
| **Supabase Realtime** | Live updates and typing | Nothing persistent | Default: `postgres_changes` with RLS. Neon: private Broadcast topics authorised by policy `yoru relay topics`; server sends with the secret key | `supabase-js` channels; REST `POST /realtime/v1/api/broadcast/{topic}/events/{event}?private=true` | Browser subscribes; server publishes (Neon mode) | 200 concurrent connections, 2M messages/month, 256 KB/message | Best effort: screens also refresh on timers, so a missed event only delays an update | No |
| **Anthropic** (existing) | AI Menace | Chat history in Postgres | `ANTHROPIC_API_KEY` | `@anthropic-ai/sdk` | Server | Paid API; offline "Menace Lite" without a key | Falls back to Menace Lite | No |

Not added, on purpose: **Cloudflare R2** (10 GB free, free egress). It would only pay off once media egress or storage exceeds Supabase's free tier, and it would mean a second storage system plus moving every existing file. **Upstash Redis**: Postgres already enforces per-user limits atomically, and Vercel needs no cache store for this traffic. **A search provider**: trigram indexes cover users, posts and hashtags.

## Data ownership (single source of truth)

| Data | Default | `DATA_BACKEND=neon` |
| --- | --- | --- |
| Credentials, sessions | Supabase Auth | Supabase Auth |
| User id ↔ profile | `profiles.id` = Supabase Auth user id | Same ids. Neon's `auth.users` mirror has id, email, sign-up metadata and created_at |
| All app rows | Supabase Postgres | Neon Postgres |
| Media bytes | Supabase Storage | Supabase Storage (paths stored in Postgres rows) |
| Live events | Derived from Postgres changes | Derived from the same changes, then relayed |

## Flows

**Authentication.** The browser posts to `/api/auth/login`. The server calls `signInWithPassword`, which sets the Supabase cookies. For each API call, the server checks the session with `auth.getUser()` against the Auth server (the cookie alone is never trusted). Then it runs the function as that user: through PostgREST with the user's JWT, or on Neon with `SET LOCAL ROLE authenticated` and `request.jwt.claims = {sub: <user id>}`. RLS policies and the functions' own checks (`require_member()`, `is_admin()`, ownership, bans, mutes, rate limits) decide the result, exactly as before.

**Sign-up (Neon).** The server checks the invite or open sign-ups and the username on Neon, then calls `auth.admin.createUser`. It inserts the new identity into Neon's `auth.users`, where `handle_new_user` validates and creates the profile in the same transaction. If that insert fails (an invite was used up a moment ago, a username race), the new Supabase login is deleted again, so no half-created account remains.

**Account deletion (Neon).** Deletion runs `delete_account` on Neon (cascades remove the person's content), then removes the identity mirror row, the files in `u/<id>/`, and the Supabase login.

**Media.**
1. `POST /api/upload/sign` checks type, size and the hourly quota, then returns a one-time signed upload URL.
2. The browser downscales large photos and uploads directly to Supabase, so no large files pass through Vercel.
3. When the path is attached to a post, story, message or avatar, the server checks that the file is the caller's own and that its first bytes match the type.
4. Reads go through `/api/media/<path>`. It checks membership (in Neon when Neon is primary), then redirects to a 1-hour signed URL.
5. Unattached uploads older than 48 h are reported, or removed when enabled, by the daily cron.

**Realtime (Neon).**
1. Each request runs in one transaction with `yoru.capture = on`. The `emit_change()` trigger records a compact list of what changed: ids and routing fields, never message text. Notification text is the exception, because it is the recipient's own toast.
2. After COMMIT the server routes each change:
   - notifications → the recipient's topic `yoru:u:<id>`;
   - DMs and private groups → each member's topic;
   - public groups, new posts and stories → `yoru:all`.
3. The server sends one Broadcast message per topic (kept alive with `waitUntil`).
4. Browsers subscribe to two private topics only: their own and `yoru:all`. The Realtime Authorization policy refuses any other user's topic.
5. Bulk writes of more than 300 changes send a single "resync" instead.
6. Typing indicators are unchanged: public Broadcast `typing:<channel>`.

## Consistency and outages

- One writer per data category, so there is no dual-write or reconciliation in normal operation. During cutover, writes are paused, the copy is verified, and only then is traffic switched ([database-migration.md](database-migration.md)).
- Database writes are atomic (one transaction per request). Realtime is delivered after commit. If delivery fails, the data is still correct and screens catch up on their SWR refresh (60 s for counts, on focus, on navigation).
- **Neon down or out of CU-hours:** the app returns 503 "database is waking up or unreachable". Logins still work, but nothing loads. Fix: wait, upgrade, or roll back ([rollback.md](rollback.md)).
- **Supabase Auth down:** nobody can log in or act. Data is unaffected.
- **Supabase Storage down:** media fails to load or upload. Everything else works. The new content check fails open rather than blocking text posts.
- **Supabase Realtime down:** updates arrive on refresh instead of instantly.

## Feature → service dependency map

| Feature | Postgres (Supabase or Neon) | Supabase Auth | Storage | Realtime | Anthropic |
| --- | --- | --- | --- | --- | --- |
| Sign-up, login, logout, sessions | ✓ (profile, invite rules) | ✓ | | | |
| Profile view/edit, settings, style, flair | ✓ | ✓ | avatar | | |
| Feed, posts, polls, reposts, quotes, hashtags, search, trending | ✓ | ✓ | media | new-post pill | |
| Comments, replies, likes, reactions, awards, bookmarks | ✓ | ✓ | | notifications | |
| Stories | ✓ | ✓ | media | story ring | |
| Group chats, DMs, message reactions | ✓ | ✓ | media | messages, typing | |
| Notifications | ✓ | ✓ | | live toasts | |
| XP, levels, streaks, achievements, leaderboards | ✓ | ✓ | | level-up toast | |
| Reports, moderation, bans, mutes, audit log, admin controls | ✓ | ✓ | | broadcast toasts | |
| AI Menace | ✓ (history, limits) | ✓ | | | ✓ (or Menace Lite) |
| Contact form, account deletion | ✓ | ✓ | deletes files | | |
| Abandoned-upload cleanup (cron) | ✓ (`media_paths_in_use`) | | ✓ | | |
