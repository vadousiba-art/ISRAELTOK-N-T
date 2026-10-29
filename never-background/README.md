# YORU — "YOU WERE NEVER A BACKGROUND CHARACTER."

A 25-second vertical (1080×1920, 30 fps) emotional short for TikTok and
Instagram Reels. Emotional arc: intrigue → recognition → heartbreak →
awakening → belonging. Built entirely in code and rendered locally: original
manga art, real YORU screens, an original synthesized score. No stock footage,
no paid generation services, no licensed music.

## Toolchain

| Need | Tool used |
| --- | --- |
| Characters, manga panels, impact frames, typography | Canvas 2D in headless Chromium (`film/art.js` characters, `film/manga.js` ink primitives, `film/main.js` scenes) |
| Real YORU screens | Playwright against a **local** demo-mode build (`capture/capture.mjs`); production is never touched |
| Score and sound design | numpy + scipy (`film/audio/synth.py`): additive piano, oscillators, filtered noise, saturation, convolution reverb |
| Encode | ffmpeg (H.264 High, AAC 256k) |

```bash
cd never-background
bash ../promo-03/capture/server.sh && node capture/capture.mjs   # re-capture screens (local demo server)
python3 film/audio/synth.py                                      # -> film/audio/never-background.wav
node film/render.mjs --preview                                   # -> out/preview.mp4 (540x960)
node film/render.mjs                                             # -> out/yoru-never-a-background-character.mp4
node film/render.mjs --cover                                     # -> out/cover.png
node film/render.mjs --stills 2.7,11.9                           # -> out/stills/
node film/render.mjs --sheet                                     # character sheet -> out/sheet.png
```

`film/cues.json` is the one timeline both picture and sound read (100 BPM, beat 0.6 s).

## Film plan as built

| Time | Beat | Picture | Sound |
| --- | --- | --- | --- |
| 0–3.3 s | **Hook** | A monochrome manga panel: a crowded room, every face hidden behind a glowing phone, notifications drifting down like paper. One face is visible. The camera pushes into their eye. "Have you ever felt…" / "…invisible" / "in a world where" / "everyone is connected?" On "connected" a thin crimson line cuts across the phone's reflection in the eye. | Near silence: room tone, distant phone buzzes, paper. The first fragile piano note lands with the crimson line. |
| 3.3–9.0 s | **Problem** | Thumb scrolling an endless (generic, unbranded) feed; someone's "my favorite song." card is buried by a wave of identical #trend cards. "You have things you love." Three panels: headphones on and eyes closed, a sketch taking shape, reading manga behind a book. Typing "have you ever heard of", hesitating, deleting it. "Things you wish someone understood." A group laughing at an inside joke slides away past them. "But sometimes…" A message is sent and sinks under the feed. A still close-up in the dark: "…it feels like nobody is listening." | The piano continues; a distant electronic pulse grows and the piano starts to crush and distort beneath it; scroll, typing, deleting and send foley; muffled laughter. True silence from 8.72 s. |
| 9.0–17.0 s | **Payoff** | Their eyes close; everything stops. White frame, inverted frame, crimson frame with an ink slash: the feed shatters. Grey silhouettes in panels are wiped away into individual people, each with their own style and interest (guitar, games, skating, books, photography, painting). The protagonist looks up — the first clear look at their face, with a crimson rim light. They share a song; others answer in their own panels. "You were never boring." Real YORU screens: REI's profile ("Listening to Tokyo night drive mix", inside jokes), REI's post, then two replies arriving, each framed in crimson. Labelled **REAL YORU SCREENS · DEMO ACCOUNTS**. "You were looking for your people." Crimson impact lines converge into the official YORU 夜 wordmark. | A held breath (reverse swell), then the release: sub boom and crack, cinematic percussion (kick, snare, taiko), distorted guitar (D–B♭–F–C), atmospheric pads, and the melodic payoff with a piano double. Logo hit with a shimmer at 16.0 s. |
| 17.0–25.0 s | **Invitation** | The protagonist stands in a tall panel, no longer swallowed by the crowd, glimpses of the others around them; crimson lines draw a frame as the camera pulls back. "Someone out there loves the things you love." Then black: "What do you wish more people understood about you?" held for over two seconds. End card: YORU 夜, "YOUR PEOPLE. YOUR STORY." | Warm and hopeful in F major (pads, piano arpeggio, the payoff phrase in major), then almost nothing under the question so it can breathe; a final F(add9) chord and a soft chime on the tagline. |

## Product integrity

- **Real interface, honestly labelled.** Every phone screen in the YORU section is a real capture of the current app. The accounts in it (REI, Kuro, Mio) are fictional demo users on a throwaway local database, and the film says so on screen. Their avatars are original drawings. Only the local server's "DEMO MODE" strip is hidden during capture (production never shows it). The seeded demo home feed is never shown.
- **Features shown exist today:** profile "Currently: Listening to…", status, bio, inside jokes, posts, comments and replies.
- **The "everywhere feed" in the problem section is fictional and unbranded** (grey cards, "#trend"); it represents social media in general, not any real platform.
- **No testimonials, no invented community activity presented as real, no promises.** The film never claims YORU guarantees friendship or ends loneliness; it invites people to share what they love.
- All art, typography layout and sound are original to this project; the font is Inter (OFL) and the wordmark is YORU's own.

## Delivery notes

- Captions sit between y ≈ 520 and 1500 (inside TikTok/Reels safe areas) on a soft dark band for readability without sound.
- The first frame (the crowd of phone-lit faces with one visible face) reads without sound and works as an auto-thumbnail; `out/cover.png` is a dedicated cover.
- Post copy: see `CAPTION.md`.
