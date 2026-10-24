# YORU launch trailer

A 20-second vertical (1080×1920) launch trailer, built entirely in code. Every
frame is rendered in the browser from procedural 3D geometry and HTML type, and
every sound is synthesized. No paid generation services, stock footage or
samples are used.

## How it is built

| Part | File | What it does |
| --- | --- | --- |
| Cue sheet | `cues.json` | One timeline (140 BPM) shared by picture and sound, so every cut, word and impact lands on the beat. |
| Picture | `index.html`, `main.js` | Three.js scene graph: a 3,380-shard crystal that fractures, a 16,000-particle field, an instanced "city" of 1,100 monoliths with gates and light streaks, the real app screens, and the real YORU wordmark assembled from thousands of 3D tiles. Post: motion trails, bloom, and a custom glitch / chromatic / grain pass. Kinetic type and HUD are HTML/CSS layered on top. `window.renderFrame(t)` draws any time `t` deterministically. |
| Sound | `audio/synth.py` | Kicks, sub drops, metallic hits and sweeps, glass shards, glitch stutters, risers, a D-minor bass line, a true silence and the final impact — all oscillators and filtered noise (numpy + scipy). |
| Render | `render.mjs` | Serves the folder, drives headless Chromium frame by frame, pipes frames into ffmpeg and muxes the soundtrack. |

## Render it

Requires Node 18+, Python 3 with numpy + scipy, ffmpeg, and Playwright's Chromium.

```bash
cd trailer
npm install
python3 audio/synth.py          # -> audio/yoru-trailer.wav
node render.mjs --preview       # half-res check -> out/preview.mp4
node render.mjs                 # final 1080x1920 H.264 + AAC -> out/yoru-trailer.mp4
node render.mjs --stills 3,9.5  # PNG stills -> out/stills/
```

To change timing, edit `cues.json` and re-run both the synth and the render.

## Timeline

| Time | Beat |
| --- | --- |
| 0–3 s | Darkness. Red signal blinks three times; the camera rushes at the structure; particles emerge. |
| 3–6.9 s | Impact. The crystal shatters into thousands of shards; hard cuts on every beat: THE / INTERNET / AFTER / DARK. / 夜. |
| 6.9–12 s | Flight through a crimson city of monoliths and gates, real app screens streaming past; ANIME · MANGA · VOCALOID · GAMING · ART; the word YORU stamps in letter by letter; FIND YOUR PEOPLE. |
| 12–15.2 s | Everything spirals into one crimson point with accelerating cuts. |
| 15.2–16 s | Silence. One heartbeat. |
| 16–20 s | The biggest hit. The real wordmark assembles from 3D fragments and light trails, locks, and holds on black with the tagline and yoru-social.vercel.app. |
