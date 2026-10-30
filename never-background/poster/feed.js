// The "breaking out of the feed" edit: YORU's posts on a real Instagram home
// screen (status bar, header, nav, post header, icons and caption are crops of
// nextyoru's own screenshots), with the film's characters popping out of the
// post frames over the UI. No like counts are shown: none are invented.

import { INK, PAPER, CRIMSON, rng, clamp, lerp, radialLines, fracture, polyPath, centroid } from "../film/manga.js";
import { head, standing, tone, PAL } from "../film/art.js";

const c = document.getElementById("c");
const g = c.getContext("2d");
const W = 1080, H = 2424;
const BG = "rgb(13,16,20)";
const FONT = "Inter, system-ui, sans-serif";

const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
const HOME = await img("/poster/ig/home.png");
const POST = await img("/poster/ig/post.png");
const BOKEH = await img("/assets/stock/frames/bokeh/0260.jpg");
const BOKEH2 = await img("/assets/stock/frames/bokeh/0120.jpg");
await document.fonts.load("700 40px Inter");
await document.fonts.load("400 40px Inter");

// crop(src, sy, sh) -> draw at dy (full width)
function crop(src, sy, sh, dy, sx = 0, sw = W, dx = 0) {
  g.drawImage(src, sx, sy, sw, sh, dx, dy, sw, sh);
}
function offscreen(w = W, h = H) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
}
function drawOn(cv, fn) {
  const q = cv.getContext("2d");
  q.clearRect(0, 0, cv.width, cv.height);
  fn(q);
  return cv;
}
const at = (q, x, y, s, fn) => { q.save(); q.translate(x, y); q.scale(s, s); fn(); q.restore(); };

// ------------------------------------------------------------------ layout (full-res px)
const A = { y: 392, h: 508 };   // post A media
const B = { y: 1290, h: 540 };  // post B media

// ------------------------------------------------------------------ media backgrounds
function sunset(q, y, h, { lines = true, seed = 1, bokeh = BOKEH, focus = [540, 0.45] } = {}) {
  q.save();
  q.beginPath();
  q.rect(0, y, W, h);
  q.clip();
  const sky = q.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#ffd3a0");
  sky.addColorStop(0.45, "#ff9a84");
  sky.addColorStop(1, "#6d4596");
  q.fillStyle = sky;
  q.fillRect(0, y, W, h);
  // the city at night, out of focus
  q.globalCompositeOperation = "screen";
  q.filter = "blur(6px) saturate(1.5)";
  q.globalAlpha = 0.85;
  const s = Math.max(W / bokeh.width, h / bokeh.height) * 1.1;
  q.drawImage(bokeh, (W - bokeh.width * s) / 2, y + (h - bokeh.height * s) / 2, bokeh.width * s, bokeh.height * s);
  q.globalAlpha = 1;
  q.filter = "none";
  q.globalCompositeOperation = "source-over";
  if (lines) radialLines(q, { cx: focus[0], cy: y + h * focus[1], n: 130, rIn: [h * 0.62, h * 0.85], width: [2, 11], color: "rgba(255,255,255,0.55)", seed });
  tone(q, `M0 ${y} H${W} V${y + h} H0 Z`, (px, py) => clamp((py - y - h * 0.55) / (h * 0.6)) * 0.5, { cell: 10, color: "#4e2f78", box: [0, y, W, h] });
  // warm light leak
  q.globalCompositeOperation = "screen";
  for (const [x, yy, r, col] of [[160, y + h * 0.2, h * 0.9, "255,170,90"], [930, y + h * 0.75, h * 0.8, "255,90,130"]]) {
    const gr = q.createRadialGradient(x, yy, 0, x, yy, r);
    gr.addColorStop(0, `rgba(${col},0.45)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    q.fillStyle = gr;
    q.fillRect(0, y, W, h);
  }
  q.restore();
}

// ------------------------------------------------------------------ characters (transparent layers, screen space)
const heroA = drawOn(offscreen(), (q) => {
  // the friend first (further back), then the protagonist
  at(q, 712 - 306 * 0.25, A.y + 34 - 30 * 0.25, 0.25, () => standing(q, { pal: PAL.bob, hair: "bob", eyes: "smile", mouth: "grin", earring: true, rim: 0 }));
  at(q, 400 - 306 * 0.29, A.y - 46 - 30 * 0.29, 0.29, () => standing(q, { pal: PAL.hero, headphones: true, eyes: "open", look: [0.35, -0.1], mouth: "soft", brows: "calm", rim: 1 }));
});
function noteGlyph(q, x, y, s, color, rot) {
  q.save();
  q.translate(x, y);
  q.rotate(rot);
  q.scale(s, s);
  q.fillStyle = color;
  q.strokeStyle = INK;
  q.lineWidth = 5;
  q.beginPath();
  q.ellipse(-14, 30, 16, 12, -0.4, 0, Math.PI * 2);
  q.ellipse(34, 20, 16, 12, -0.4, 0, Math.PI * 2);
  q.rect(-2, -34, 6, 64);
  q.rect(46, -44, 6, 64);
  q.moveTo(-2, -34); q.lineTo(52, -44); q.lineTo(52, -30); q.lineTo(-2, -20); q.closePath();
  q.stroke();
  q.fill();
  q.restore();
}
const notesA = drawOn(offscreen(), (q) => {
  q.shadowColor = "rgba(255,255,255,0.8)";
  q.shadowBlur = 18;
  noteGlyph(q, 560, A.y - 24, 1.25, CRIMSON, -0.2);
  noteGlyph(q, 585, A.y + 175, 0.85, "#fff4e6", 0.15);
  noteGlyph(q, 505, A.y + 85, 0.7, "#ffd3a0", -0.1);
});
const heroB = drawOn(offscreen(), (q) => {
  // a friend leaning in from the left, inside the frame
  at(q, -170, B.y + 70, 0.86, () => head(q, { pal: PAL.curly, hair: "curly", eyes: "smile", mouth: "grin", headset: true, collar: "jacket" }));
  // the protagonist, eyes closed, smiling; their head breaks out of the top
  at(q, 610 - 306 * 0.98, B.y - 128 - 30 * 0.98, 0.98, () => head(q, { pal: PAL.hero, headphones: true, eyes: "smile", mouth: "soft", brows: "calm", rim: 1 }));
});

function mute(x, y) {
  g.save();
  g.fillStyle = "rgba(38,38,38,0.85)";
  g.beginPath();
  g.arc(x, y, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(x - 14, y - 6); g.lineTo(x - 7, y - 6); g.lineTo(x + 3, y - 15); g.lineTo(x + 3, y + 15); g.lineTo(x - 7, y + 6); g.lineTo(x - 14, y + 6); g.closePath();
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x + 9, y - 6); g.lineTo(x + 18, y + 6);
  g.moveTo(x + 18, y - 6); g.lineTo(x + 9, y + 6);
  g.moveTo(x - 16, y - 16); g.lineTo(x + 18, y + 18);
  g.stroke();
  g.restore();
}

function layer(cv, clip, { shadow = false } = {}) {
  g.save();
  g.beginPath();
  clip(g);
  g.clip();
  if (shadow) {
    g.shadowColor = "rgba(0,0,0,0.55)";
    g.shadowBlur = 26;
    g.shadowOffsetY = 10;
  }
  g.drawImage(cv, 0, 0);
  g.restore();
}

// Shards of the frame breaking where a character pushes through.
function shards(media, edgeY, x0, x1, dir, seed, keep = 0.4) {
  const r = rng(seed);
  const poly = [[x0, edgeY - (dir < 0 ? 0 : 60)], [x1, edgeY - (dir < 0 ? 0 : 60)], [x1, edgeY + (dir < 0 ? 60 : 0)], [x0, edgeY + (dir < 0 ? 60 : 0)]];
  const parts = fracture(poly, seed, 4);
  for (const p of parts) {
    if (r() > keep) continue;
    const cc = centroid(p);
    const out = 26 + r() * 70;
    const tx = (cc[0] - (x0 + x1) / 2) * 0.12 + (r() - 0.5) * 20, ty = dir * out;
    const rot = (r() - 0.5) * 0.9, sc = 0.4 + r() * 0.3;
    g.save();
    polyPath(g, p, tx, ty, rot, sc, cc);
    g.save();
    g.clip();
    g.translate(cc[0] + tx, cc[1] + ty);
    g.rotate(rot);
    g.scale(sc, sc);
    g.translate(-cc[0], -cc[1]);
    g.drawImage(media, 0, 0);
    g.restore();
    polyPath(g, p, tx, ty, rot, sc, cc);
    g.strokeStyle = r() < 0.5 ? CRIMSON : "rgba(255,255,255,0.85)";
    g.lineWidth = 2.5;
    g.stroke();
    g.restore();
  }
  // a hairline crack along the broken edge
  g.save();
  g.strokeStyle = CRIMSON;
  g.lineWidth = 3;
  g.shadowColor = CRIMSON;
  g.shadowBlur = 10;
  g.beginPath();
  let x = x0 - 40;
  g.moveTo(x, edgeY);
  while (x < x1 + 40) {
    x += 18 + r() * 26;
    g.lineTo(x, edgeY + (r() - 0.5) * 10);
  }
  g.stroke();
  g.restore();
}

// ------------------------------------------------------------------ compose
g.fillStyle = BG;
g.fillRect(0, 0, W, H);
// a post header scrolled half under the top bar
crop(POST, 1415, 115, 270);

// Post A
const mediaA = drawOn(offscreen(), (q) => sunset(q, A.y, A.h, { seed: 5, focus: [470, 0.42] }));
g.drawImage(mediaA, 0, 0);
layer(heroA, (q) => q.rect(0, A.y, W, A.h));
mute(1008, A.y + A.h - 50);
crop(POST, 1105, 85, A.y + A.h + 8);                 // like / comment / repost / share / save
crop(POST, 1215, 155, A.y + A.h + 100);              // caption + time
shards(mediaA, A.y + A.h, 300, 780, 1, 11);
layer(heroA, (q) => q.rect(0, A.y + A.h, W, 700), { shadow: true }); // feet step out over the UI
shards(mediaA, A.y, 300, 520, -1, 31, 0.18);
layer(heroA, (q) => q.rect(0, A.y - 200, W, 200), { shadow: true });   // the head breaks out of the top
layer(notesA, (q) => q.rect(0, 0, W, H), { shadow: true });

// Post B
crop(POST, 1415, 115, B.y - 120);
const mediaB = drawOn(offscreen(), (q) => sunset(q, B.y, B.h, { seed: 9, bokeh: BOKEH2, focus: [610, 0.35] }));
g.drawImage(mediaB, 0, 0);
layer(heroB, (q) => q.rect(0, B.y, W, B.h));
mute(1008, B.y + B.h - 50);
crop(POST, 1105, 85, B.y + B.h + 8);
// caption B, in the app's style
g.fillStyle = "#f5f5f5";
g.textBaseline = "alphabetic";
g.font = `700 37px ${FONT}`;
const cx = 33, cy = B.y + B.h + 140;
g.fillText("nextyoru", cx, cy);
const uw = g.measureText("nextyoru ").width;
g.font = `400 37px ${FONT}`;
g.fillText("you were never a background character. 夜", cx + uw, cy);
g.fillStyle = "#a8a8ad";
g.font = `400 33px ${FONT}`;
g.fillText("1 hour ago", cx, cy + 58);
shards(mediaB, B.y, 360, 880, -1, 23);
layer(heroB, (q) => q.rect(300, B.y - 300, 640, 300), { shadow: true }); // head breaks out the top

// the next post, peeking in
crop(POST, 1415, 115, 2098);
g.fillStyle = "#f2efe9";
g.fillRect(0, 2214, W, 30);

// real top bar and nav on top
crop(HOME, 0, 318, 0);
crop(HOME, 2233, 191, 2233);

window.ready = true;
