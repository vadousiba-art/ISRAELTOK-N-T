# Free-tier limits

**Verified 2026-10-27** from the providers' own pricing and documentation pages, linked below. Free tiers change without notice and are not promised to last; re-check before relying on any number. "—" means the provider does not publish that figure for its free plan, or it does not apply.

## Services YORU uses

| | Vercel Hobby | Supabase Free | Neon Free (optional) |
| --- | --- | --- | --- |
| Purpose | Hosting, API routes, cron | Auth, Storage, Realtime (and the DB by default) | Primary Postgres when `DATA_BACKEND=neon` |
| Storage | — | DB 500 MB; files 1 GB | 1 GB per project (20 GB per account) |
| Compute | 4 h Active CPU, 360 GB-hrs memory per month; functions up to 300 s, 2 GB / 1 vCPU | Shared, no hour cap | **100 CU-hours per project per month** (0.25–2 CU; 0.25 CU ≈ 400 h) |
| Requests | 1,000,000 function invocations | — (Edge Functions: 500k, unused) | — |
| Bandwidth | 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer | 5 GB egress + 5 GB cached egress | 5 GB egress per project |
| Users | — | 50,000 MAU | — (Neon Auth: 60k MAU, unused) |
| Connections | — | — | Pooler: up to 10,000 clients; 104 direct (97 usable) at 0.25 CU |
| Realtime | — | 200 concurrent connections, 2M messages/month, 256 KB/message | — |
| Background jobs | Cron: 100 per project, **once per day**, ±59 min | — | — |
| Important restrictions | **Non-commercial personal use only** (ads or payments need Pro) | **Pauses after 1 week of inactivity**; 2 active projects; **no automatic backups** | Scale-to-zero after 5 min (cannot be disabled); 6 h restore window; 10 branches |
| When exceeded | Vercel notifies; may pause the project | Over-quota warnings; possible restrictions | CU-hours or egress: **compute suspended until next month**. Storage: writes blocked. Data is kept |
| Data export | — | `pg_dump` with the connection string | `pg_dump`; branches |
| Upgrade path | Pro | Pro | Launch (paid, usage-based) |
| Sources | [limits](https://vercel.com/docs/limits), [fair use](https://vercel.com/docs/limits/fair-use-guidelines), [cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) | [pricing](https://supabase.com/pricing) | [pricing](https://neon.com/pricing), [plans](https://neon.com/docs/introduction/plans), [pooling](https://neon.com/docs/connect/connection-pooling) |

## Evaluated and not used

| | Cloudflare R2 | Upstash Redis |
| --- | --- | --- |
| Free | 10 GB-month storage, 1M Class A + 10M Class B operations/month, free egress | 500K commands/month, 250 MB data, 10 GB bandwidth, 1 database |
| Why not now | YORU's media fits in Supabase's 1 GB. Switching means a second storage system and moving every file. Reconsider when media egress or storage nears Supabase's limit | Postgres already enforces per-user limits atomically. Nothing needs a cache at this traffic |
| Sources | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) | [Upstash pricing](https://upstash.com/pricing/redis) |

## YORU-specific risks

1. **Neon compute hours (the deciding factor).** The presence heartbeat (every open tab, every 60 s) and chat keep a database awake while anyone is online. If YORU is in use more than about 55% of the hours in a month, Neon Free's 100 CU-hours run out and the database stops until the next billing cycle. On Neon Free, cap autoscaling at 0.25 CU, because autoscaling to 2 CU spends hours 8× faster.
2. **Supabase egress (5 GB/month).** Every photo or video view is egress. Browser-side downscaling now keeps new photos around 0.3–1.6 MB instead of up to 10 MB. Videos (up to 50 MB) are the biggest risk; consider a lower video limit if egress climbs.
3. **Supabase database size (500 MB).** Text is small. The biggest tables over time are `notifications` and `messages`. Consider trimming notifications older than 90 days once size matters (that is a data change, so ask first).
4. **Realtime messages (2M/month).** At YORU's size this is far away. In Neon mode, each DM uses 2 messages and each public event 1.
5. **Vercel Hobby non-commercial clause.** Adding ads or payments requires Vercel Pro.
6. **No backups on Supabase Free.** Take a weekly `pg_dump` ([rollback.md](rollback.md#backups)).

No number in this repository claims how many users YORU can support. The local load test (`npm run load-test`) measured about 95–128 requests/s from one local server process on local Postgres, with database connections capped at 5. That is not a production capacity figure: production depends on Vercel instance count, region latency and the provider limits above.

## How to monitor

| Service | Where | What to watch | Alerts on Free |
| --- | --- | --- | --- |
| Vercel | Dashboard → Usage | Invocations, Active CPU, Fast Data Transfer | Email notifications as you approach limits |
| Supabase | Dashboard → Project → Usage (Reports) | Database size, Storage size, Egress, Realtime messages and peak connections, MAU | Usage emails. Otherwise check weekly |
| Neon | Console → Project → Monitoring; Billing → Usage | CU-hours used versus days left in the month, storage, connections | Check weekly, or daily near the end of the month; consumption alerts are limited on Free |
| App | `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/health` | `ok`, `db.latency_ms`, migrations | Point a free uptime monitor at the public `/api/health` (it does not touch the database) |

Never upgrade a plan or enable a paid feature without the owner's explicit approval.
