# YORU — BREAK THE FEED

A 20-second vertical (1080×1920, 30 fps) manga impact-frame film for YORU 夜,
built entirely in code and rendered locally. No stock footage, no paid
generation services, no copyrighted music.

## Toolchain (verified on the build machine)

| Need | Tool used | Notes |
| --- | --- | --- |
| 3D (phone, studio, paper folds, shards) | **Three.js r170** (WebGL2, physically based materials, PMREM studio reflections) in headless **Chromium** | Blender and DaVinci Resolve are not installed in this environment. |
| Manga ink, speed lines, screentone, typography | **Canvas 2D**, procedural (`manga.js`) | Every stroke is generated from seeded randomness: dry-brush strokes are built bristle by bristle. |
| Compositing / camera / grading | Custom WebGL pass in `main.js` | Layers: ink behind → 3D → ink in front; punch zoom, controlled chromatic split, inversion, flashes, paper grain. |
| Sound | **numpy + scipy** (`audio/synth.py`) | Original score and foley, all synthesized. |
| Encode | **ffmpeg** (libx264 + AAC) | `render.mjs` streams frames straight into ffmpeg. |

## Render

```bash
cd break-the-feed
npm install
python3 audio/synth.py            # -> audio/break-the-feed.wav
node render.mjs --preview         # half-res check -> out/preview.mp4
node render.mjs                   # final -> out/yoru-break-the-feed.mp4
node render.mjs --stills 11.8     # PNG stills -> out/stills/
```

`cues.json` is the single timeline both picture and sound read. 150 BPM, beat 0.4 s.

## Film plan as built

| Time | Scene |
| --- | --- |
| 0.0–2.0 | **The calm.** Black; a tiny official YORU logo blinks on with a soft electronic pulse; a white panel border draws itself around it. At 1.6 s the sound stops completely. |
| 2.0–4.0 | **First impact.** One white flash frame, one inverted frame, one crimson frame at the peak, then a black-and-white impact illustration: radial speed lines, a spiked ink explosion, the calm panel shattering toward the lens, screentone, foreground ink. Camera punch and brief shake; ink floods the frame. |
| 4.0–7.0 | **Panel break.** (1) Macro of a dry-brush stroke; (2) a panel slams in with BREAK / THE / FEED. on a receding plane and a vertical フィードを壊せ caption; the camera dives into the full stop, which (3) becomes the centre of a halftone field that collapses into one point; (4) a white burst on black; (5) a crimson brush slash. The page splits along the slash. |
| 7.0–10.0 | **The digital world.** The two halves fold away like paper, revealing a physically lit phone in a dark studio running the real YORU app (home → feed → profile, real screenshots). Slow orbit. |
| 10.0–13.0 | **Second impact.** Push into the screen; the interface turns into a manga page (inverted to paper, halftoned, inked, crimson kept as spot colour); its panels shatter toward the lens. 0.2 s of silence, then the climax poster, held frozen for 0.73 s, then everything collapses into the centre. |
| 13.0–17.0 | **Brand reveal.** Absolute black. A crimson line scans across and reveals the official wordmark (YORU 夜), traces an underline, fades. THE FEED IS YOURS. |
| 17.0–20.0 | **Final sting.** Impact flash; the logo inside a fractured panel; it shrinks back into the opening composition, cuts to black, and the video loops into its own first frame. |

## Captions over the phone section

`overlay/` adds animated captions to the finished film without re-rendering it:
it draws transparent caption frames for 7.5–10.4 s and composites them onto
`out/yoru-break-the-feed.mp4` with ffmpeg (picture re-encoded, audio copied).

```bash
node overlay/render-overlay.mjs          # -> out/yoru-break-the-feed-captions.mp4
node overlay/render-overlay.mjs --stills 8.1,9.0,9.9
```

| Screen on the phone | Caption | Highlighted on screen |
| --- | --- | --- |
| Home | 01 HOME — WATCH IT TOGETHER. Anime nights · Stories · Tonight's picks | the "Anime night Friday 9pm — vote for the movie" event card |
| Feed | 02 FEED — SETTLE THE DEBATE. Polls · Fan art · Honest ratings | the "Best anime opening of 2026?" poll |
| Profile | 03 PROFILE — LEVEL UP NIGHTLY. Streaks · XP · What you're watching | the Lv 4 Night Owl XP bar |

Captions slide out with each in-app swipe. The crimson brackets use the exact
camera and phone pose from `main.js`, so they track the UI in perspective.

## Brand and content accuracy

- Logo: the official `wordmark.png`, unmodified, never shown above its native 868 px width.
- Interface: real screenshots from the project (`public/brand/yoru/screens`). The manga treatment is a visual filter on those screenshots; nothing is invented, and there are no metrics, endorsements or feature claims.
- Japanese: 夜 comes from the official wordmark; フィードを壊せ ("break the feed") is set vertically with correct vertical forms (upright long-vowel mark, small ィ in the upper right of its cell).
- The crescent and ensō in the impact frames are original ink drawings inspired by the brand mark, not copies of any existing artwork.
