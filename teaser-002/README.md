# YORU Video 002 — "transmission"

A 13-second vertical (1080×1920, 30 fps) loop for TikTok, built entirely in
code: Three.js scenes, a 2D canvas type layer, a custom CRT / glitch /
datamosh pass, and a synthesized soundtrack. It uses only real YORU assets
(the wordmark and real app screenshots) and makes no feature claims.

## Files

| File | Role |
| --- | --- |
| `cues.json` | The frame-accurate timeline shared by picture and sound. |
| `main.js`, `index.html` | The composition. `window.renderFrame(t)` draws time `t`. |
| `audio/synth.py` | Sound design (numpy + scipy). Mixed as a circular buffer so the loop seam is inaudible. |
| `render.mjs` | Headless Chromium → ffmpeg (H.264 + AAC). |
| `assets/` | Real YORU wordmark and app screenshots, Inter. |

## Render

```bash
cd teaser-002
npm install
python3 audio/synth.py          # -> audio/yoru-002.wav
node render.mjs --preview       # half-res check -> out/preview.mp4
node render.mjs                 # final -> out/yoru-002.mp4
node render.mjs --stills 4.43   # PNG stills -> out/stills/
```

## Timeline

| Time | What happens |
| --- | --- |
| 0.0–1.5 | Black. `this wasn't meant / to be public.` with a blinking cursor. Mains hum. |
| 1.5–1.7 | Breach: bass impact, the text tears apart. |
| 1.7–3.8 | "Recovered footage" of real YORU screens on a CRT, camera handheld; HUD: REC, SRC: UNKNOWN, FILE_001; `recovering fragment 001 / 007`. The profile handle and bio get redacted. |
| 3.8–4.5 | Datamosh stutter, then the hidden 夜. |
| 4.5–6.6 | The archive: an endless curved wall of 35 monitors powers on, loses signal, turns red, shuts off. |
| 6.6–7.6 | Accelerating cuts, one frame of `001`. |
| 7.6–8.2 | Impact — then the transmission drops into true silence. One cursor blink. |
| 8.2–9.0 | CRT turns on; the real wordmark assembles from 24 strips flying through 3D space with RGB channels converging. |
| 9.0–11.7 | Hold. `THE INTERNET IS ABOUT TO CHANGE.` decodes in, then `001 // END OF TRANSMISSION`. |
| 11.7–13.0 | CRT power-off to a dot, then black and room tone — which is exactly how frame 0 begins, so the loop is seamless. |

## Hidden details (for the comments)

1. **夜** (night) appears for three frames inside the glitch at 4.40 s — one torn frame, then two clean frames.
2. **001** recurs: bottom-right corner of the opening, `FILE_001` on the HUD, `fragment 001 / 007`, one monitor in the archive wall reads `001 / NO SIGNAL`, a single full-frame `001` at 7.39 s, a faint `001` in the corner of the logo hold, and the sign-off.
3. For two frames at 0.8 s, "public" is spelled **pub1ic**.
4. Under the recovered footage (from 2.0 s), a quiet 880 Hz tone plays **"001" in Morse code** (`----- ----- .----`).
5. The 夜 frames have their own sound: a bit-crushed three-note bell motif in the Japanese in-sen scale.
6. There are seven real screens, and the footage counter says `/ 007`.
