# YORU (夜)

> THE INTERNET AFTER DARK. 夜は、まだ終わらない。

A private, invite-only, Japanese-inspired social network for anime, manga, Vocaloid, music, gaming and art fans. It mixes a feed, stories, group chats, threads, and an AI comedian called **The AI Menace**.

> YORU is a visual rebrand of the app formerly called IsraelTokn't. The database, accounts, auth and Android package id (`com.israeltoknt.app`) are unchanged, so existing users keep everything.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Motion · Supabase (Postgres, Auth, Realtime, Storage) · Claude**.

---

## Quick start (demo mode, no accounts needed)

```bash
npm install
npm run dev
# open http://localhost:3000
```

With no Supabase credentials the app runs in **demo mode**:

- The real database schema (`supabase/migrations/*.sql`, with all RLS policies and functions) runs inside an embedded Postgres (PGlite), stored in `.data/`.
- On first start it seeds the group from the mockup: Ethan, Lucas, Zach, Tyler, the AI Menace, 48 extra members, posts, stories, chats, polls and awards.
- Login is an account picker, so you can switch users and test realtime chat in two browser windows.
- Uploads are saved to `.data/uploads/`. Realtime runs over Server-Sent Events.
- `npm run demo:reset` wipes the demo data, and it re-seeds on the next start.

Demo mode lets anyone log in as anyone. It turns itself off in production unless you set `DEMO_MODE=true`. Don't expose it publicly.

---

## Real setup (Supabase)

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Apply the schema.** Open the SQL editor and run, in order:
   - `supabase/migrations/0001_core.sql` (tables, RLS, functions, triggers, realtime)
   - `supabase/migrations/0002_storage.sql` (the private `media` bucket and its read policy)

   Or use the Supabase CLI: `supabase init` (once; it keeps the existing migrations), then `supabase link --project-ref <ref>` and `supabase db push`.
3. **Configure the environment:** `cp .env.example .env.local`, then fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Add `ANTHROPIC_API_KEY` to enable the full AI Menace.
4. **Recommended auth settings:** under Authentication → Providers → Email, turn off **"Allow new users to sign up"**. The app creates accounts server-side after checking the invite, and a database trigger also rejects any sign-up without a valid invite, so this is defence in depth.
5. **Start it:** `npm run build && npm start` (or deploy to Vercel or any Node host).
6. **Become the owner.** Visit `/join`. The first account created becomes the owner. Then open **Admin → Invites** to create invite links for your friends.
7. *(Optional)* `npm run seed -- --yes` loads the demo content into Supabase. Do this after you've created your own owner account, otherwise the seed user becomes the owner.

`/setup` shows which pieces are configured, and `/api/health` returns the same status as JSON.

---

## Android app

`android/` is a small native Android app (plain Java, no extra libraries) that opens the live site full-screen. It supports photo and video uploads, the back button, external links in the browser, invite links that open in the app, an offline screen, and the logo as its icon. Accounts, chat and the feed all run on the server, so the app stays up to date without new releases.

- **Download:** the built APK is served at `/download/yoru.apk` (the old `/download/israeltoknt.apk` link redirects there). The login screen and the menu link to it, and the link is hidden inside the app itself.
- **Build:** install the Android SDK (platform 36, build-tools 36) and JDK 17+. Create `android/local.properties` with `sdk.dir=...` and `android/keystore.properties` with your signing key (see `android/app/build.gradle`). Then run `cd android && gradle assembleRelease`. To point the app at a different site, pass `-PitnUrl=https://your-site`.
- **Updates:** future APKs must be signed with the same key, or phones will refuse to update and require an uninstall. Keep the keystore safe.
- **iPhone:** open the site in Safari, then Share → Add to Home Screen. The web app manifest makes it open full-screen.

## Features

| Area | What works |
| --- | --- |
| **Feed** | Infinite scroll, text, images, GIFs, video, polls, links, quote posts, reposts, bookmarks, hashtags (including Hebrew and emoji), trending (score with time decay), live "new posts" pill |
| **Reactions** | Like plus 8 custom reactions (💀 🔥 😭 🤡 🧢 🫡 W L). Hold or right-click the heart to pick one. Emoji burst animations |
| **Comments** | Threaded replies up to 4 levels, comment likes, delete, report, "Summon Menace" roast replies |
| **Group chats** | Realtime public and private groups and DMs, typing indicators, replies, emoji reactions, media, @mention autocomplete, unread counts, `/menace` command |
| **Stories** | 24-hour photo, video or text stories, group stories, viewer with progress bars and hold-to-pause, view counts, delete, report |
| **AI Menace** | Dedicated chat with history, 3 roast intensities, opt-in personalized roasts, Roast Me, Skill Issue Detector, Rate My Take, Propaganda Generator, Diplomatic Crisis Simulator, Fake Breaking News (can post to the feed), Comeback Generator, Roast of the Day |
| **Chaos tools** | Random chaos button, synthesized soundboard, daily challenge (+5 chaos points), community awards (5 per day) |
| **Profiles** | Avatar upload, bio, status, flair, inside jokes, stats, 11 achievement badges, posts and media tabs |
| **Leaderboards** | Opt-in only: most liked, biggest menace, most awarded, most roasted, top yapper |
| **Notifications** | Likes, reactions, comments, replies, mentions, reposts, awards, DMs, roasts, optional friend activity. Each one can be toggled, and they update live |
| **Admin** | Invite links with max uses and expiry, revoke, promote or demote admins (owner only), verify, ban or unban, report queue (dismiss, delete content, delete and ban) |
| **UX** | Dark, light and system themes; reduced-motion support (system, reduced, or full); mobile-first layout with a desktop 3-column view; absurd loading, empty, 404 and error screens |

---

## Security model

- **Private by default.** Every table has row-level security. Only signed-in, non-banned members can read anything. Anonymous users can't read even public channels.
- **Writes only go through Postgres functions** (`SECURITY DEFINER`) that check membership, validate input and enforce per-user **rate limits** in the database. Signed-in users get no INSERT, UPDATE or DELETE grants on any table.
- **Reads go through `SECURITY INVOKER` functions**, so RLS still applies.
- **Invite-only sign-up** is enforced by a trigger on `auth.users`. Invite use is counted atomically.
- **The API allowlists browser-callable functions** and validates every argument with zod (`src/lib/server/rpc-registry.ts`). Bot and invite functions can only be executed by the service role.
- **Uploads:** the server checks type, size and quota, then issues a one-time signed upload URL into a private bucket that also enforces MIME type and size. Media is served through `/api/media/*`, which checks the session first. In demo mode the file signature (magic bytes) is also checked.
- **Secrets stay on the server:** the service-role key and Anthropic key are only read in server code. The browser only sees the public URL and anon key.
- **Security headers:** `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, and a permissions policy.

### AI privacy rules

- The Menace only receives text that a user explicitly sends: their message, a tool input, or a post they ask it to roast, which every member can already see.
- Profile details (bio, status, inside jokes, recent posts) are shared **only if that user enables "Personalized roasts"**.
- Other people can only be roasted if they opted in. Intensity is capped at the level they chose.
- DMs and group chats are **never** sent to the AI. The `/menace` chat command sends only that one message.
- Per-user daily and per-minute limits apply. Rate limits from the API return a friendly 503, and other failures fall back to the offline "Menace Lite".

---

## Project layout

```
supabase/migrations/   SQL schema, RLS, functions, triggers (single source of truth)
src/app/(app)/         Signed-in screens: feed, explore, post, chat, menace, chaos, profile...
src/app/api/           rpc/[fn], auth, upload, media, live (SSE), ai/[tool], health
src/lib/server/        db adapter (Supabase or PGlite), AI client, uploads, errors, rate limiting
src/lib/seed/          Demo content + storage-agnostic seeder
src/components/        Shell, feed, stories, chat, menace, profile, ui
tests/unit|db|e2e      Vitest unit tests, SQL security tests (PGlite), Playwright flows
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (demo mode if Supabase isn't configured) |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit, AI client (mocked API) and database security tests |
| `npm run test:e2e` | Builds, then runs the Playwright flows in demo mode (set `CHROMIUM_PATH` to use a preinstalled Chromium) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run seed -- --yes` | Seed a Supabase project with the demo content |
| `npm run demo:reset` | Wipe the local demo database |

## Content note

Political satire, absurdism, dark humour and aggressive banter between friends who opted in are the point. Attacks based on protected identity are not. The AI's system prompt enforces this, and members can report and block.
