// Draws the four original demo avatars (no real people, no third-party art).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": p.endsWith(".js") ? "text/javascript" : "text/html" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
fs.writeFileSync(path.join(ROOT, "capture", "avatars.html"), `<!doctype html><meta charset="utf-8"><script type="module">
import * as M from "/manga.js";
const S = 512;
const make = (fn) => { const c = document.createElement("canvas"); c.width = S; c.height = S; const g = c.getContext("2d"); fn(g); return c.toDataURL("image/png"); };
window.out = {
  kuro: make((g) => {
    g.fillStyle = "#f4f2ee"; g.fillRect(0, 0, S, S);
    M.halftone(g, { w: S, h: S, cell: 12, f: (x, y) => 0.55 * M.clamp((x + y - 560) / 400) });
    M.enso(g, { cx: 256, cy: 262, r: 170, width: 58, seed: 4, bristles: 140 });
    M.inkSplash(g, { cx: 300, cy: 300, R: 34, seed: 9, spikes: 9, drops: 10, spatter: 30, k: 1 });
  }),
  rei: make((g) => {
    g.fillStyle = "#070707"; g.fillRect(0, 0, S, S);
    M.radialLines(g, { cx: 256, cy: 256, n: 90, rIn: [200, 260], width: [1, 6], color: "#2a2a2a", seed: 5 });
    M.crescent(g, { cx: 250, cy: 262, r: 175, rot: -0.35 });
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 3;
    for (const [a, b, c2, d] of [[330, 130, 420, 210], [345, 150, 430, 235], [80, 400, 150, 330]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
  }),
  mio: make((g) => {
    g.fillStyle = "#f6f3ef"; g.fillRect(0, 0, S, S);
    g.fillStyle = "#e8a6b6"; g.beginPath(); g.arc(300, 220, 120, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2b2b2b"; g.lineWidth = 6; g.beginPath(); g.moveTo(110, 380); g.lineTo(402, 380); g.stroke();
    g.fillStyle = "#2b2b2b"; g.beginPath(); g.arc(150, 380, 10, 0, Math.PI * 2); g.fill();
  }),
  gremlin: make((g) => {
    g.fillStyle = "#ffcc29"; g.fillRect(0, 0, S, S);
    M.halftone(g, { w: S, h: S, cell: 22, color: "#ff8a00", f: (x, y) => 0.5 });
    M.starburst(g, { cx: 256, cy: 270, rin: 150, rout: 230, n: 18, seed: 3, color: "#fff" });
    g.fillStyle = "#111"; g.strokeStyle = "#111"; g.lineWidth = 10; g.lineCap = "round";
    g.beginPath(); g.ellipse(200, 230, 34, 46, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(318, 222, 26, 36, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(210, 218, 11, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(325, 212, 8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(170, 320); g.quadraticCurveTo(260, 410, 350, 300); g.stroke();
    g.fillStyle = "#e5102f"; g.beginPath(); g.moveTo(255, 352); g.quadraticCurveTo(270, 400, 300, 352); g.fill();
  }),
};
window.done = true;
</script>`);
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/capture/avatars.html`);
await page.waitForFunction(() => window.done === true);
const out = await page.evaluate(() => window.out);
for (const [name, url] of Object.entries(out)) fs.writeFileSync(path.join(ROOT, "assets", "avatars", `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
console.log("avatars:", Object.keys(out).join(", "));
await browser.close();
server.close();
