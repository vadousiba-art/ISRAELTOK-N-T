# API integrations

Every external API YORU calls, where in the code, and how it behaves on errors. Last reviewed 2026-10-27.

"Live-tested" means tested against the real provider from this repository's environment. Nothing below was live-tested in this change, because no provider credentials were available. Supabase calls that existed before this change run in production today. New code paths were tested against local Postgres 16 and mocks, as noted.

## Supabase Auth

- Docs: <https://supabase.com/docs/guides/auth>, SSR: <https://supabase.com/docs/guides/auth/server-side/nextjs>
- Packages: `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.118
- Keys: the public URL plus anon/publishable key (browser and SSR cookies); the service role or secret key (server-only admin calls)

| Operation | Code | Notes |
| --- | --- | --- |
| `auth.getUser()` | `src/lib/server/db.ts`, `src/proxy.ts` | Validates the session with the Auth server on every API call. Never trusts the cookie alone |
| `auth.signInWithPassword` | `src/app/api/auth/login/route.ts`, join | Per-IP limit of 10/min (in-memory), plus Supabase's own limits |
| `auth.admin.createUser` | `src/app/api/auth/join/route.ts` | `email_confirm: true` (no email step). Neon mode: followed by the identity mirror insert, and deleted again if that fails |
| `auth.admin.deleteUser` | join (rollback), `src/app/api/account/delete/route.ts` | |
| `auth.signOut` | logout, delete | |

Not implemented in the app (and not added here): password reset, email verification, OAuth. Supabase hosts these if you turn them on later.

## Supabase Postgres via PostgREST (default data backend)

- Docs: <https://supabase.com/docs/reference/javascript/rpc>
- `supabase.rpc(fn, args)` with the user's session (RLS applies), or the admin client for server-only functions. Code: `src/lib/server/db.ts`
- Errors: functions raise `CODE|message`. `toAppError` (`src/lib/server/errors.ts`) maps these to HTTP statuses.

## Neon Postgres (optional data backend, `DATA_BACKEND=neon`)

- Docs: <https://neon.com/docs>, Vercel connections: <https://neon.com/docs/guides/vercel-connection-methods>, pooling: <https://neon.com/docs/connect/connection-pooling>
- Package: `pg` 8.23 (node-postgres), as Neon recommends for Vercel Fluid compute, plus `@vercel/functions` `attachDatabasePool` (closes idle connections before an instance is suspended) and `waitUntil` (finishes the realtime relay after the response)
- Auth: `DATABASE_URL` (pooled, PgBouncer transaction mode). Server-only, never `NEXT_PUBLIC_`.
- Code: `src/lib/server/postgres.ts`

| Behaviour | Implementation |
| --- | --- |
| Pool | `max` = `PG_POOL_MAX` (default 5) per instance; 10 s idle and connect timeouts; `application_name=yoru` |
| Identity and RLS | Per request: `BEGIN` → `set_config('request.jwt.claims', {sub, role}, true)` → `SET LOCAL ROLE authenticated` → `select public.fn(named args)` → `COMMIT`. Everything is transaction-scoped, so it is safe behind PgBouncer transaction pooling (no session `SET`, no `LISTEN`) |
| Parameterization | Function and argument names must match `^[a-z_][a-z0-9_]*$` and come from the zod allow-list; values are always bind parameters |
| Timeouts | `statement_timeout` per transaction (`PG_STATEMENT_TIMEOUT_MS`, default 15 s) → 503 `DB_TIMEOUT` |
| Retries | Only the *connect* step, 3 attempts with 250/500/1000 ms backoff (covers a compute waking from scale-to-zero). Once a transaction starts it is never retried, because a write may have committed |
| Errors | Connection failures (`ECONNREFUSED`, `57P01`, `08xxx`, `53300`, ...) → 503 `DB_UNAVAILABLE` with no host details; broken clients are discarded from the pool |
| Health | `pgHealth()`: version, applied migrations, and whether `SET ROLE authenticated` works. Exposed on `/api/health` only with `Authorization: Bearer $CRON_SECRET` |
| Tested | `tests/db/postgres-adapter.test.ts` (9 tests) against local Postgres 16 with a non-superuser owner; all 15 Playwright flows on a copied database. **Not tested against Neon cloud** |

## Supabase Storage

- Docs: <https://supabase.com/docs/guides/storage>
- Bucket `media`: private, 50 MB per file, MIME allow-list (`supabase/migrations/0002_storage.sql`)

| Operation | Code | Notes |
| --- | --- | --- |
| `createSignedUploadUrl(path)` | `src/app/api/upload/sign/route.ts` | After checking type, size and the 30/hour quota. Path `u/<user>/<uuid>.<ext>` |
| `uploadToSignedUrl` | `src/lib/client/api.ts` (browser) | Bytes go browser → Supabase. Photos over 600 KB are downscaled to ≤2048 px first |
| `createSignedUrl(path, 3600)` | `src/app/api/media/[...path]/route.ts` | Default backend: signed with the user's session (the bucket RLS re-checks `is_member()`). Neon: membership checked in Neon, then signed with the service key |
| `createSignedUrl(path, 60)` + `Range: bytes=0-15` | `src/app/api/rpc/[fn]/route.ts` | Content check before an upload is attached. Fails open if storage is unreachable. **New, not live-tested** |
| `list`, `remove` | account deletion; `src/app/api/cron/cleanup-uploads/route.ts` | Cleanup is report-only unless `UPLOAD_CLEANUP_MODE=delete` |

## Supabase Realtime

- Docs: <https://supabase.com/docs/guides/realtime/postgres-changes>, <https://supabase.com/docs/guides/realtime/broadcast>, <https://supabase.com/docs/guides/realtime/authorization>
- Default: `postgres_changes` on five tables, filtered by RLS (`src/components/providers/LiveProvider.tsx`).
- Typing: public Broadcast channel `typing:<channel id>` (`src/lib/client/typing.ts`).
- Neon mode (`src/lib/server/realtime/*`):
  - Server → `POST {SUPABASE_URL}/realtime/v1/api/broadcast/{topic}/events/live?private=true`, header `apikey: <service/secret key>`, JSON body `{events: [...]}`. One request per topic, at most 6 in parallel, 5 s timeout, one retry on network errors, 5xx or 429. Failures are logged, never shown to users.
  - Browser → `supabase.realtime.setAuth()`, then `channel(topic, {config: {private: true}})` for `yoru:u:<own id>` and `yoru:all`.
  - Authorization: policy `"yoru relay topics"` on `realtime.messages` (`supabase/manual/neon-1-realtime-policy.sql`). It has no INSERT policy, so browsers cannot publish.
  - Tested: routing and authorization rules with unit tests, the policy against a stub `realtime` schema, and delivery through the SSE path in the e2e flows. **The Broadcast REST call itself is not live-tested.**
  - Limits: 2M messages/month and 200 concurrent connections on Free. A DM produces 2 messages (one per member), a public-group message or new post produces 1.

## Vercel

- Docs: <https://vercel.com/docs/functions>, cron: <https://vercel.com/docs/cron-jobs>
- `vercel.json` cron: `/api/cron/cleanup-uploads` daily at 04:17 UTC (Hobby allows once a day, ±59 min). Vercel adds `Authorization: Bearer $CRON_SECRET` when that env var exists; the route compares it in constant time.
- `export const maxDuration = 60` on the cleanup route. The job stops scanning after 30 s and checks at most 300 files per run.

## Anthropic (unchanged)

- `src/lib/server/ai.ts`. Per-user daily and burst limits are stored in Postgres, with a fallback to the offline Menace Lite.

## Not integrated (on purpose)

- **Cloudflare R2, Upstash Redis, hosted search, queues:** not needed by current features or traffic. See the reasoning in [architecture.md](architecture.md#service-responsibilities).
