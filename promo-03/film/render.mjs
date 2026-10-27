// Renders YORU film 03, "Your world. Your rules.", frame by frame in headless Chromium and encodes it with ffmpeg.
//
//   node render.mjs                 full 1080x1920 MP4 -> out/yoru-your-world-your-rules.mp4
//   node render.mjs --preview       half-res WebGL, 540x960 MP4 -> out/preview.mp4
//   node render.mjs --stills 3,9.5  PNG stills at the given times -> out/stills/
//   node render.mjs --cover         cover frame -> out/cover.png
//
// Every frame is independent (a pure function of t); frames are rendered in
// order only so they can stream straight into ffmpeg.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const FILM = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(FILM, ".."); // serves promo-03/ so the film can read the captured assets
const OUT = path.join(ROOT, "out");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const preview = flag("--preview");
const stills = opt("--stills", null);
const scale = Number(opt("--scale", preview ? 0.5 : 1));
const cues = JSON.parse(fs.readFileSync(path.join(FILM, "cues.json"), "utf8"));
const fps = cues.fps;
const total = Math.round(cues.duration * fps);
const from = Number(opt("--from", 0));
const to = Number(opt("--to", cues.duration));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--font-render-hinting=none"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`[page ${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.goto(`http://127.0.0.1:${port}/film/index.html?scale=${scale}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });

const shot = () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });

if (flag("--cover")) {
  await page.evaluate(() => window.renderCover());
  fs.writeFileSync(path.join(OUT, "cover.png"), await shot());
  console.log("wrote", path.join(OUT, "cover.png"));
} else if (stills) {
  const dir = path.join(OUT, "stills");
  fs.mkdirSync(dir, { recursive: true });
  const times = stills.split(",").map(Number).sort((a, b) => a - b);
  // Warm up the trail buffer with the few frames before each still.
  for (const t of times) {
    const f = Math.round(t * fps);
    for (let k = Math.max(0, f - 6); k <= f; k++) await page.evaluate((x) => window.renderFrame(x), k / fps);
    fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), await shot());
    console.log("still", t);
  }
} else {
  const audio = path.join(FILM, "audio", "your-world.wav");
  const name = preview ? "preview.mp4" : "yoru-your-world-your-rules.mp4";
  const f0 = Math.round(from * fps);
  const f1 = Math.min(total, Math.round(to * fps));
  const withAudio = fs.existsSync(audio) && f0 === 0 && f1 === total;
  if (!withAudio && !preview) throw new Error("partial renders need --preview (protects the final file)");
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
      ...(withAudio ? ["-i", audio] : []),
      ...(preview ? ["-vf", "scale=540:960:flags=lanczos"] : []),
      "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "22" : "18", "-maxrate", "22M", "-bufsize", "44M",
      "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(fps),
      ...(withAudio ? ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest"] : []),
      "-movflags", "+faststart",
      path.join(OUT, name),
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const started = Date.now();
  // Warm-up frames for a partial render so the trails are not empty.
  for (let k = Math.max(0, f0 - 6); k < f0; k++) await page.evaluate((x) => window.renderFrame(x), k / fps);
  for (let f = f0; f < f1; f++) {
    await page.evaluate((x) => window.renderFrame(x), f / fps);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 30 === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`frame ${f}/${f1}  ${el.toFixed(0)}s elapsed, ${(el / (f - f0 + 1)).toFixed(2)}s/frame`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("wrote", path.join(OUT, name), withAudio ? "(with audio)" : "(no audio)");
}

await browser.close();
server.close();
