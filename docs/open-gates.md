# YORU 2.0 "Open Gates"

Release notes, feature inventory, how to release, and how to roll back.
Everything here describes code in this repository; status labels are honest.

Status key:

- **Done, tested**: built, with automated tests (database and/or end-to-end).
- **Built, needs testing**: built and checked by hand or by types only.
- **Partly built**: some of the asked-for scope is missing (listed).
- **Blocked**: needs a decision, an account, or money that we do not have.
- **Not started**

## What ships in 2.0

### Gate 1: Open Horizons

| Feature | Status | Notes |
|---|---|---|
| 16 interface languages | Done, tested | en, ja, fr, es, pt, de, ko, zh-Hans, zh-Hant, id, th, vi, it, nl, ru, ar. Every language has all 222 Open Gates interface strings; a unit test fails if one is missing or has different `{placeholders}`. **Machine-translated, not reviewed by native speakers**; Settings says so. Older screens (feed, composer, chat, admin) are still English and fall back to English per string. |
| Arabic right-to-left | Done, tested | `<html dir="rtl">` set before first paint; layout uses logical CSS (`ms-`/`me-`/`start-`/`end-`). Text that isn't in the interface language (posts, `@handles`, untranslated strings) keeps its own direction. E2E checks the switch and that it persists. |
| Language preference | Done, tested | Saved on the device and on the profile; the profile wins once at sign-in so it follows you between devices. Existing accounts have no saved language and keep English until they choose. |
| Interests + Discover | Done, tested | Up to 8 of 18 interests on your profile. Explore → Discover filters people by interest, language and creators-only, and explains each match ("Shares Anime, Manga", "Speaks your language"). Opt-out: Settings → "Show me in Discover". Blocked people never appear. |
| Universal profile identity | Done, tested | Banner style (6), avatar frame (4), creator label, Pro mark, achievement showcase (pin up to 3 badges you earned; the server rejects badges you don't have). |
| Profile Evolution+ | Partly built | Showcase and looks are new. Level-based unlocks beyond the existing level system were not added. |
| Theme Forge+ (saved looks) | Done, tested | Save colour + theme + ambience as named looks: 3 slots free, 12 with Pro, enforced in the database. |
| Collections+ | Done, tested | Named collections (emoji, description, private or members-only), add from any post's ••• menu, paginated collection pages, profile tab for members-only collections. Private collections are invisible to others, checked in SQL tests. |
| XP integrity | Partly built | XP has no money value anywhere and cannot be bought. No XP multiplier was added (see "Deliberately not built"). Existing rules are unchanged: no XP for reacting to or awarding your own posts or for reposts, a like's XP is taken back on unlike, and actions are rate-limited (e.g. 20 posts per 10 minutes). **Gap:** there is no daily XP cap, so heavy posting still earns XP; worth adding before XP ever unlocks anything valuable. |

### Gate 2: Open Experience

| Feature | Status | Notes |
|---|---|---|
| Navigation polish | Built, needs testing | Translated nav in side bar, drawer, bottom bar and command palette; Creators and Collections links; drawer opens from the correct side in RTL. |
| Ghost Mode | Done, tested | Enforced by the database: while on, `last_seen_at` is not written at all (and is cleared when you turn it on), and you show as offline to everyone, admins included. It does not hide your posts or messages, and the "is typing…" line still shows to the people in a chat while you type there; the setting text promises only the online dot and last-active time. |
| Notifications | Built, needs testing | Creator decisions arrive as a system notification (existing type, no new type). Per-type notification settings are now translated. |
| Creator Showcase | Done, tested | Apply with category, a public `https://` link to your own work and a 20–600 character statement; one pending application at a time, 3 per day. Admins approve or decline with a note (both audited, applicant notified). The label says "Creator", never "partner"; the page says it is not a partnership. Anti-impersonation: admins are told to check the work is the applicant's own, and "Pretending to be someone else" is a report category. |
| Moderation center | Done, tested | Reports now have a category. A report is escalated automatically when 3 different members report the same thing, or when the category is "Someone may be at risk of harm". Admins see escalated reports first and can escalate or de-escalate (audited). Escalation only orders the queue; a person still decides. |
| Trust Center | Built, needs testing | Public page `/trust` describing what YORU actually does (RLS, rate limits, word filter, mutes up to 30 days, appeals reviewed by an admin, data export/deletion). No certifications are claimed. |
| Admin Control Center | Done, tested | New Creators and Pro tabs; report flags. Every action is checked again by the database (`require_admin`) and audited. |
| "What's new" release experience | Done, tested | Versioned (2.0), opens once per device 0.9 s after sign-in, Skip / Back / Next / Esc / arrow keys, focus kept inside, replay from Settings or the menu, no sound, follows reduced-motion. Every slide describes a feature that is in this release. |
| Product-wide finish | Partly built | New screens are complete; older screens were not restyled in this release. |

### Gate 3: Open Access

| Feature | Status | Notes |
|---|---|---|
| YORU Pro (proposed US$5.99/month) | Built, purchases **off** | Pro page, entitlement records, `is_pro()` checks in the database, admin complimentary grants (1–366 days, audited). No payment provider is connected, so nobody can be charged. See [monetization.md](monetization.md). |
| Night Pass benefits inside Pro | Partly built | Streak shield: done, tested (once per 7 days, server-side). Early access: a flag only; there are no beta features right now and the page says so. XP multiplier: deliberately not built. |
| Creator tips (5–10% fee) | Not started (architecture only) | Design in [monetization.md](monetization.md). Needs a payment provider and age/KYC rules for recipients. |
| Premium rooms | Not started | Design notes in [monetization.md](monetization.md). |
| Unified monetization backend | Partly built | `entitlements` + `payment_events` tables with a unique `(provider, event_id)` key so a webhook delivered twice is applied once. No webhook endpoint exists yet because no provider is chosen. |

### Gate 4: Gatekeeper

See [security-review.md](security-review.md).

### Database scale

Open Gates adds no new database projects. All member data, including the
new tables, lives in the original Supabase project, so there is one source
of truth and no cross-database joins. The seven-project setup
([seven-projects.md](seven-projects.md)) spreads only live-update connections
and new media uploads across the extra projects. It is not database
sharding, and it should not be described as such. The new queries are
indexed (collections by owner, items by collection and date, one pending
creator application per member, entitlements by member) and paginated.
With about 12 early members the database is nowhere near a limit; the
first limits to expect are media storage and egress, covered in
[free-tier-limits.md](free-tier-limits.md).

### Deliberately not built

- **XP multiplier for Pro.** It would let paying members climb leaderboards faster and makes like/unlike farming worth more. Needs a founder decision; if ever added it should apply only to the daily check-in, never to likes or posts.
- **Live payments.** Not without founder approval and a provider that accepts the founders (see the age section of [monetization.md](monetization.md)).

## How to release

The app can be deployed before or after the database migration: until
`0007_open_gates.sql` exists on the database, all Open Gates screens stay
hidden and the app behaves exactly like 1.x.

1. **Back up.** Supabase Dashboard → Database → Backups (or `pg_dump`), per [rollback.md](rollback.md).
2. **Apply the migration.** Supabase Dashboard → SQL Editor → paste
   `supabase/migrations/0007_open_gates.sql` → Run. It only adds columns
   (with defaults), tables (RLS on) and functions; it does not delete or
   rewrite any existing row. It is safe to run twice (verified).
   `0005_neon_ready.sql` and `0006_seven_projects.sql` are independent of it;
   apply them only if you use Neon or the seven-project setup.
3. **Deploy the app.** Either `vercel login` then `vercel --prod` from this
   branch, or merge the branch into the branch Vercel deploys from.
4. **Check.** `/api/health` returns `ok: true`; sign in, open Settings: the
   Language picker and "What's new in YORU" should be there; `/trust` loads
   signed out.

## How to roll back

- **Hide Open Gates without touching data:** `drop function public.open_gates_version();`
  The app checks this function and hides every Open Gates screen. All saved
  collections, looks and applications stay in the database. Re-run the
  migration to bring it back.
- **App rollback:** redeploy the previous Vercel deployment ("Promote to
  Production"). The 1.x app works against a database that has 0007 applied:
  every changed function kept its signature; `create_report` accepts the old
  three arguments (category defaults to "other").
- Dropping the new tables or columns is never needed for a rollback and would
  delete members' collections and settings; don't.

## Tests

| Suite | Command | Result |
|---|---|---|
| Unit + database (PGlite) | `npm test` | 117 passed, 9 skipped (the skipped 9 are the real-Postgres suite below) |
| Real Postgres adapter | `npm run db:local && npm run test:pg` | 9 passed (applies all migrations incl. 0007) |
| End-to-end (production build, demo mode) | `npm run build && npx playwright test` | 22 passed (15 existing + 7 Open Gates flows) |
| Types / lint | `npm run typecheck`, `npm run lint` | clean |

Open Gates end-to-end flows: release modal (open once, skip, replay, Esc);
Arabic switch (RTL, translated, persists, switch back); Ghost Mode (online dot
disappears for another member); Collections (create from a post, open);
Creator apply → admin approve → label on profile; admin grants Pro → member
sees it, "Not available yet" button disabled for non-Pro; Trust Center public.
