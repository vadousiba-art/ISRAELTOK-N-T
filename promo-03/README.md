# YORU film 03 — YOUR WORLD. YOUR RULES.

A 25-second vertical (1080×1920, 30 fps) customization showcase. Every phone
screen in the film is a **real capture of the YORU app**, recorded from the
app's own flows; nothing on a phone screen is mocked up.

## 1. Feature inventory (from the source and a live local run)

Verified by reading `src/components/profile/EditProfileDialog.tsx`,
`src/components/yoru/ColorSlider.tsx`, `src/app/(app)/settings/page.tsx`,
`src/app/(app)/u/[username]/page.tsx`, `src/lib/progress.ts`,
`src/components/fx/Ambience.tsx`, and by using each control in the running app.

### A. Implemented and working (shown in the film)

| Feature | Where | Visible to others? |
| --- | --- | --- |
| Avatar upload (JPEG/PNG/WebP/GIF) | Edit profile | Yes |
| Display name, Status line, Bio | Edit profile | Yes |
| Flair: one of 15 emoji next to your name | Edit profile | Yes |
| Inside jokes: up to 12 chips on your profile | Edit profile | Yes |
| App color: hue slider (0–359°) + presets YORU red 紅, Sakura 桜, Violet 菫, Ice 氷, Jade 翠, Gold 金, Ember 炎 — recolors the whole app | Settings → Style | Yes: your profile banner glow, level ring and level badge wear your color |
| "Currently": Watching / Reading / Listening to / Playing + a title | Settings → Style | Yes |
| Theme: Dark / Light / System | Settings → Appearance | No (your device) |
| Ambience: Off / Stars 星 / Sakura 桜 / Rain 雨 / Fireflies 蛍 animated backgrounds | Settings → Style | No (your device) |
| "Let others roast me" (🔥 roastable tag on your profile) | Settings → The AI Menace | Yes |

Also implemented but not featured: Motion and Sound-effect preferences,
pin a post to your profile, notification and privacy preferences, and
earned (not chosen) levels, streaks and achievements.

### B. Partially implemented

- The small text "flair" chip under a username is set by admins, not by users.
  (The user-chosen emoji is what the Edit dialog labels "Flair"; that is what the film shows.)
- There is no banner upload: the profile banner is a generated gradient tinted with the user's color.
- Theme, ambience and motion are per-device preferences, not part of the public profile.

### C. Concept only / not in the app

- Named, selectable profile themes. The film's four looks (DARK MANGA,
  CRIMSON UNDERGROUND, CLEAN MINIMAL, INTERNET CHAOS) are **example profiles
  built from the real settings above**, and are labelled on screen
  "EXAMPLE PROFILES · REAL SETTINGS", with the exact settings listed under each name.
- Custom banner images, layouts or fonts. None appear in the film.

No concept mockups were needed: every screen is real.

## 2. How the screens were made

`capture/capture.mjs` drives the real app (production build, `DEMO_MODE`,
a throwaway embedded database on `localhost:3200`; production was never
touched) at phone resolution, 1080×2338 (400×866 CSS px at 2.7×):

1. Signs up four fictional demo users through the real `/join` flow.
2. Uploads their avatars and fills the real Edit-profile dialog.
3. Sets theme, color preset, Currently, ambience (and roastable) in real Settings.
4. Checks in for the night and makes one post each.
5. Records interaction sequences: REI's whole edit (27 frames), Kuro's
   color slider drag from YORU red to Ice (21 frames), Kuro's profile before/after,
   Mio's dark → light theme switch.

The only change made to captures: the local demo server shows a "DEMO MODE"
strip that production never shows; it is hidden with CSS during capture.
Avatars (`assets/avatars`) are original drawings made in code for the demo
users; the stories row and other members visible on the home feed are the
app's seeded demo data.

| Demo user | Look | Real settings |
| --- | --- | --- |
| Kuro @kuro_ink | DARK MANGA | Ice 氷 · Rain 雨 · 🥷 flair · Reading "Vagabond" · inside jokes |
| REI @rei_underground | CRIMSON UNDERGROUND | YORU red 紅 · Stars 星 · ⚔️ flair · Listening to "Tokyo night drive mix" |
| Mio @mio_studio | CLEAN MINIMAL | Light theme · Sakura 桜 · Sakura ambience · Watching "Frieren" · no flair |
| GREMLIN.EXE @gremlin_exe | INTERNET CHAOS | Gold 金 · Fireflies 蛍 · 🤡 flair · roastable · three inside jokes |

## 3. Production

| Need | Tool used |
| --- | --- |
| Screens | Playwright + Chromium against the real Next.js app |
| 3D phones, camera, reflections | Three.js r170 (physically based materials, studio environment reflections) |
| Manga frames, titles, transitions | Canvas 2D (`film/manga.js`) |
| Compositing / grade | Custom WebGL pass (`film/main.js`) |
| Score and foley | numpy + scipy (`film/audio/synth.py`) |
| Encode | ffmpeg (H.264 High + AAC) |

Blender and DaVinci Resolve are not installed in this environment.

```bash
cd promo-03
npm install
bash capture/server.sh && node capture/capture.mjs   # re-capture screens (local demo server)
python3 film/audio/synth.py                          # -> film/audio/your-world.wav
node film/render.mjs --preview                       # -> out/preview.mp4
node film/render.mjs                                 # -> out/yoru-your-world-your-rules.mp4
node film/render.mjs --cover                         # -> out/cover.png
```

## 4. Film plan as built

| Time | Scene |
| --- | --- |
| 0–3 s | **The question.** A phone outline draws in the dark; WHY SHOULD / YOUR SOCIALS / LOOK LIKE / EVERYONE / ELSE'S? line by line. Impact frame (flash, inverted frame, crimson frame), ink floods and clears to reveal the real app. |
| 3–7 s | **Your profile.** REI's real edit, frame by frame: tap Edit, pick avatar, type status and bio, pick ⚔️, add inside jokes, Save — the profile updates. YOUR PROFILE. → manga-panel cut → YOUR IDENTITY. |
| 7–11 s | **Build your aesthetic.** Four example profiles on the beat, each with its own transition: ink (DARK MANGA), crimson slash (CRIMSON UNDERGROUND), clean panel wipe (CLEAN MINIMAL), halftone/glitch (INTERNET CHAOS). |
| 11–12 s | **MAKE IT YOURS.** The four real profiles slam in as a manga page. |
| 12–16 s | **Watch it come to life.** Kuro drags the color slider (the real recording; touch point on the measured knob), the profile updates red → Ice; Mio switches dark → light. YOUR SPACE. / YOUR RULES. One crimson impact frame. |
| 16–20 s | **Different vibes. One YORU.** The four phones fly into a lineup. |
| 20–25 s | **Final reveal.** Phones converge, turn into manga panels, collapse to black; silence; the official wordmark opens from the centre with a crimson line; YOUR WORLD. YOUR RULES. Fades to black, which is also the first frame. |
