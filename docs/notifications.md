# Push notifications

Members can get YORU's notifications on their lock screen even when YORU is closed: on the website (Chrome, Edge, Firefox, Safari on Mac), the installed web app on iPhone/iPad (iOS 16.4+, once YORU is on the Home Screen) and the Android app. Push is off until a member turns it on and allows it.

## How it works

```
like / comment / reply / mention / message / award / level-up / Night Watch notice
        │  (already filtered by the member's notification settings, blocks and bans)
        ▼
public.notifications ──trigger──▶ public.push_outbox   (only if the member has a device)
        ▼
any write request ─▶ schedulePush() ─▶ push_claim() ─▶ wordPush() ─▶ web-push (encrypt + VAPID sign)
        ▼                                                                 │
push_report() (ok / gone / failed)  ◀────────────────────────────────────┘
        ▼
the device's push service (FCM / Mozilla / Apple / Microsoft) ─▶ public/sw.js ─▶ notification
```

- **What's pushed** mirrors `public.notifications`, so the existing toggles in Settings → Notifications (likes, comments, mentions, reposts, messages, awards, friend activity), blocks and bans apply automatically. Wording is in `src/lib/push.ts` (tested): "Zach · liked your post", "Zach · commented: “…”", DMs show the sender and message (high urgency, re-alerting, one per chat), likes on one post collapse into one, Night Watch notices come from "YORU · Night Watch". Tapping opens the post, chat, Account Standing or Notifications. The app icon shows the unread count where supported.
- **Sending.** After every write (any RPC that isn't a read, and the server's own writes) the server sends what's queued, in the background (`waitUntil`), one pass at a time per instance (`src/lib/server/push.ts`). Notifications created with no request around (scheduled posts published by pg_cron) go out with the next write anyone makes.
- **Delivery hygiene.** Payloads are encrypted per device (RFC 8291, aes128gcm) and signed with YORU's VAPID key (RFC 8292). TTL is 24 h; a `topic` lets newer pushes replace older ones while a phone is offline. Devices the push service reports gone (404/410) are removed, and so are devices that fail 5 times in a row. Up to 10 devices per member.
- **Turning it on.** The permission prompt only appears from a tap on **Turn on notifications** (Notifications page, Inbox, Settings → Notifications). A test notification is sent straight away. iPhone/iPad in Safari get Home Screen steps instead; if permission was refused, the card explains how to allow it. Each visit quietly re-links the device to whoever is signed in (another account may have used the browser) and clears the app badge.
- **Privacy.** The database stores each device's push address, its two public keys and a short name like "Chrome on Android" (migration 0014, private to its owner). The push services can't read notification contents. See the Privacy Policy, section 4 ("Push notifications").

## The Android app

`android/` is now a Trusted Web Activity (androidbrowserhelper 2.7.4): YORU runs in Chrome, full screen, verified by `public/.well-known/assetlinks.json` (package `com.yoru.social`, release key SHA-256 `5A:4C:56:…:9F:52`). Web Push works exactly as on the website and Chrome hands the notifications to the app (`DelegationService`), so they appear as YORU's with the moon status icon, and Android 13+ asks for the notification permission the first time. Without Chrome it opens YORU in a browser tab. Version 2.3.0 (code 6) installs over the old 1.3.0 WebView app (same key). The paused native Kotlin app moved to `android-native/`.

Build: `cd android && gradle :app:assembleRelease` (needs `android/keystore.properties`), then copy `app/build/outputs/apk/release/app-release.apk` to `public/download/yoru.apk` and update `APK_META` in `src/components/landing/GlowButton.tsx`.

## Setup

`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (generate once with `npx web-push generate-vapid-keys`; the private key is Sensitive in Vercel), optional `VAPID_SUBJECT`. Changing the keys invalidates every device's subscription; members would need to turn notifications on again.

## Testing

`tests/unit/push.test.ts` (wording, links, grouping) and `tests/db/push.test.ts` (subscriptions are private and move with the signed-in member, only members with a device queue pushes, settings and blocks apply, claim/report hygiene). End to end was checked against a stand-in push service that decrypts payloads and verifies VAPID signatures, with the service worker displaying a push delivered through Chrome DevTools (open-source Chromium can't register with Google's push service, so a real phone is the final check).
