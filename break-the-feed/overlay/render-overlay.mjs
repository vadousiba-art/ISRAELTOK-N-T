// Draws the caption overlay as transparent PNG frames and composites them
// onto the finished film with ffmpeg. The film itself is not re-rendered:
// its picture is only re-encoded with the captions on top, and its audio is
// copied untouched.
//
//   node overlay/render-overlay.mjs            -> out/yoru-break-the-feed-captions.mp4
//   node overlay/render-overlay.mjs --stills 8,9,9.8   -> out/overlay-stills/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const SRC = path.join(OUT, "yoru-break-the-feed.mp4");
const DST = path.join(OUT, "yoru-break-the-feed-captions.mp4");
const args = process.argv.slice(2);
const stillsArg = args.includes("--stills") ? args[args.indexOf("--stills") + 1] : null;
const cues = JSON.parse(fs.readFileSync(path.join(ROOT, "cues.json"), "utf8"));
const fps = cues.fps;
const F0 = Math.round(7.5 * fps);
const F1 = Math.round(10.4 * fps);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/overlay/index.html`);
await page.waitForFunction(() => window.ready === true);
const shot = (t) => page.evaluate((x) => window.drawOverlay(x), t).then(() => page.screenshot({ type: "png", omitBackground: true }));

if (stillsArg) {
  // Composite single frames from the finished film for checking.
  const dir = path.join(OUT, "overlay-stills");
  fs.mkdirSync(dir, { recursive: true });
  for (const t of stillsArg.split(",").map(Number)) {
    const n = Math.round(t * fps);
    const ov = path.join(dir, `ov-${n}.png`);
    fs.writeFileSync(ov, await shot(n / fps));
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", SRC, "-i", ov, "-filter_complex", `[0:v]select=eq(n\\,${n})[b];[b][1:v]overlay=0:0`, "-frames:v", "1", path.join(dir, `t${t.toFixed(2)}.png`)]);
    console.log("still", t);
  }
} else {
  const dir = path.join(OUT, "overlay-frames");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let f = F0; f <= F1; f++) fs.writeFileSync(path.join(dir, `o_${String(f).padStart(4, "0")}.png`), await shot(f / fps));
  console.log(`overlay frames ${F0}-${F1} written`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-i", SRC,
      "-framerate", String(fps), "-start_number", String(F0), "-i", path.join(dir, "o_%04d.png"),
      "-filter_complex", `[1:v]setpts=PTS-STARTPTS+${F0 / fps}/TB[ov];[0:v][ov]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`,
      "-map", "[v]", "-map", "0:a",
      "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-maxrate", "22M", "-bufsize", "44M", "-profile:v", "high",
      "-c:a", "copy", "-movflags", "+faststart",
      DST,
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("ffmpeg failed");
  console.log("wrote", DST);
}
await browser.close();
server.close();
