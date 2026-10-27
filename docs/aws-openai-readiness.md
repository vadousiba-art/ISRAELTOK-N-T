# AWS and OpenAI credits: readiness

**Status: no AWS or OpenAI credits are confirmed.** Nothing in YORU uses AWS
or OpenAI today, and no document or pitch should say otherwise until an
approval email exists. This page lists what would change if credits arrive,
so they could be used within days.

## Today

| Need | Provider now | Cost now |
|---|---|---|
| Hosting (web + API) | Vercel | free tier |
| Database, logins, storage, realtime | Supabase (7 projects, see [seven-projects.md](seven-projects.md)) | free tier |
| AI Menace (roasts, chaos tools) | Anthropic API, server-side only (`src/lib/server/ai.ts`) | pay per use; **without a key the app falls back to the built-in offline "Menace Lite"**, so AI is optional |

## If AWS credits are approved

These are the uses that would help, in order. None is needed to run YORU.

1. **Media storage and delivery (S3 + CloudFront).** Media is the first free
   tier limit we would hit (storage and egress). The upload flow is already
   two-step: the server signs, the browser uploads directly
   (`/api/upload/sign`, `src/lib/server/storage.ts`). An S3 backend means a
   third storage target next to Supabase and demo, using presigned PUT URLs.
   The bucket must stay private and be served through the existing
   members-only `/api/media` route or signed CloudFront URLs. Estimate: 2–3
   days including tests.
2. **AI through Amazon Bedrock.** Bedrock hosts Anthropic's Claude models,
   so the Menace prompts and tool schemas would work unchanged. It needs a
   small adapter in `ai.ts` that picks Anthropic or Bedrock by environment
   variable. Estimate: 1 day.
3. **Backups (S3).** A scheduled `pg_dump` to an S3 bucket with lifecycle
   rules would close the "no automatic backups on Supabase Free" gap
   ([security-review.md](security-review.md) finding 6).

Requirements before applying: an AWS account owned by an adult (account
terms require legal capacity, the same issue as payments: see
[monetization.md](monetization.md)), billing alerts set to US$1, and
credits added before any resource is created.

## If OpenAI credits are approved

- They could power the AI Menace instead of, or alongside, Anthropic. This
  needs a provider switch in `ai.ts`, and the structured "tool" outputs
  re-tested, because each provider formats tool calls differently. Estimate:
  1–2 days.
- They could also run moderation checks (a moderation endpoint on new posts
  and images) to support the existing word filter and reports. That is a
  product decision: it sends member content to a third party, so the
  Privacy Policy would need updating first.

## What not to claim

- Not "backed by", "partnered with" or "powered by" AWS or OpenAI.
- Not "AWS Activate" or any credit amount until it is in writing.
- Anthropic usage is pay-as-you-go on our own key, not a partnership.
