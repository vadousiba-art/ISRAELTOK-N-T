# my-story

A personal short-form video (1080×1920, 30 fps) edited in code: Canvas 2D in
headless Chromium for the picture, a numpy/scipy sampler for the score, ffmpeg
to encode.

The personal parts stay out of git: the photos (`photos/`), the timeline with
the on-screen text (`film/cues.json`), the script (`SCRIPT.md`) and the render
(`out/`).

| File | Does |
| --- | --- |
| `prep.py` | Crops photos out of phone screenshots of a photo viewer → `photos/cropped/` |
| `film/main.js` | The edit: Ken Burns, grades, crossfades, the crack and fade-out effects, captions, grain, light leaks, the phone montage |
| `film/audio/score.py` | The score, on the same timeline (CC0 VSCO-2-CE samples and Mixkit SFX via `never-background/film/audio/bank.py`) |
| `film/render.mjs` | Renders frames and encodes `out/my-story.mp4` (`--stills t1,t2`, `--preview`, `--cover`) |
