// YORU — "You were never a background character."
// A 25-second vertical film, every frame a pure function of t (Canvas 2D).
// Timeline: cues.json (shared with the score in audio/synth.py).

import { INK, PAPER, CRIMSON, rng, clamp, lerp, ramp, easeOut, easeIn, easeInOut, expoOut, radialLines, motionLines, brushStroke, fracture, polyPath, centroid } from "./manga.js";
import { head, profile, standing, phoneHead, silhouette, torso, tone, hatch, taper, fill, stroke, ink, GREY } from "./art.js";
import { sheet } from "./sheet.js";

const c = document.getElementById("c");
let g = c.getContext("2d");
const W = 1080, H = 1920;
const C = await (await fetch("/film/cues.json", { cache: "no-store" })).json();
const FONT = "Inter, system-ui, sans-serif";

function img(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
const IMG = {
  wordmark: await img("/assets/brand/wordmark.png"),
  profile: await img("/assets/screens/profile-rei.png"),
  post0: await img("/assets/screens/post-0.png"),
  post1: await img("/assets/screens/post-1.png"),
  post2: await img("/assets/screens/post-2.png"),
};
await document.fonts.load(`800 40px Inter`);
await document.fonts.load(`500 40px Inter`);

const within = (t, [a, b]) => t >= a && t < b;
const at = (x, y, s, fn) => { g.save(); g.translate(x, y); g.scale(s, s); fn(); g.restore(); };

// ------------------------------------------------------------------ texture
const grain = document.createElement("canvas");
grain.width = grain.height = 512;
{
  const q = grain.getContext("2d");
  const d = q.createImageData(512, 512);
  const r = rng(99);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 120;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  q.putImageData(d, 0, 0);
}
function finish(t, { vignette = 0.45 } = {}) {
  g.save();
  g.globalAlpha = 0.07;
  g.globalCompositeOperation = "overlay";
  const ox = Math.floor(hash(t * 30) * 512), oy = Math.floor(hash(t * 30 + 7) * 512);
  for (let y = -oy; y < H; y += 512) for (let x = -ox; x < W; x += 512) g.drawImage(grain, x, y);
  g.restore();
  if (vignette) {
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${vignette})`);
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }
}
function hash(n) {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

// ------------------------------------------------------------------ captions
// lines: [{ text, at }]; each line rises in on its own beat.
function caption(t, lines, out, { y = 1300, size = 72, gap = 1.22, plate = 0.6, color = "#fff", weight = 800 } = {}) {
  const first = lines[0].at;
  if (t < first || t > out) return;
  const fadeOut = 1 - ramp(t, out - 0.22, out);
  const lh = size * gap;
  const top = y - ((lines.length - 1) * lh) / 2;
  if (plate) {
    const k = ramp(t, first, first + 0.3) * fadeOut;
    const band = g.createLinearGradient(0, top - size * 1.6, 0, top + lines.length * lh + size * 0.6);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.3, `rgba(0,0,0,${plate * k})`);
    band.addColorStop(0.7, `rgba(0,0,0,${plate * k})`);
    band.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = band;
    g.fillRect(0, top - size * 1.6, W, lines.length * lh + size * 2.2);
  }
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${weight} ${size}px ${FONT}`;
  lines.forEach((l, i) => {
    const k = easeOut(ramp(t, l.at, l.at + 0.28));
    if (k <= 0) return;
    g.globalAlpha = k * fadeOut;
    g.shadowColor = "rgba(0,0,0,0.85)";
    g.shadowBlur = 22;
    g.shadowOffsetY = 4;
    g.fillStyle = l.color || color;
    g.fillText(l.text, W / 2, top + i * lh + (1 - k) * 18);
  });
  g.restore();
}

// ------------------------------------------------------------------ small props
function note(x, y, s, color = INK) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(-14, 30, 16, 12, -0.4, 0, Math.PI * 2);
  g.ellipse(34, 20, 16, 12, -0.4, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-2, -34, 6, 64);
  g.fillRect(46, -44, 6, 64);
  g.beginPath();
  g.moveTo(-2, -34);
  g.lineTo(52, -44);
  g.lineTo(52, -30);
  g.lineTo(-2, -20);
  g.fill();
  g.restore();
}
function heart(x, y, s, color = INK, filled = false) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 12);
  g.bezierCurveTo(-26, -6, -18, -28, 0, -14);
  g.bezierCurveTo(18, -28, 26, -6, 0, 12);
  if (filled) { g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.lineWidth = 4; g.stroke(); }
  g.restore();
}
function rrect(x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function bubble(x, y, w, h, tail, text, { size = 40, fillC = PAPER, inkC = INK, font = 800 } = {}) {
  g.save();
  g.beginPath();
  g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.moveTo(x + tail[0] * 0.3 - 18, y + h * 0.35);
  g.lineTo(x + tail[0], y + tail[1]);
  g.lineTo(x + tail[0] * 0.3 + 18, y + h * 0.35);
  g.fillStyle = fillC;
  g.fill();
  g.strokeStyle = inkC;
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = fillC;
  g.beginPath();
  g.ellipse(x, y, w / 2 - 3, h / 2 - 3, 0, 0, Math.PI * 2);
  g.fill();
  if (text) {
    g.fillStyle = inkC;
    g.font = `${font} ${size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, x, y + 2);
  }
  g.restore();
}
function sfx(text, x, y, size, rot = 0, color = INK) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `italic 900 ${size}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.strokeStyle = color === INK ? PAPER : INK;
  g.lineWidth = size * 0.16;
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  g.restore();
}

// A paper notification drifting through the air.
function paperNote(kind, s, alpha) {
  g.save();
  g.scale(s, s);
  g.globalAlpha = alpha;
  g.fillStyle = PAPER;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  rrect(-44, -30, 88, 60, 10);
  g.fill();
  g.stroke();
  g.fillStyle = INK;
  if (kind === 0) heart(-18, 2, 0.9, INK, true);
  else if (kind === 1) { rrect(-30, -16, 34, 24, 8); g.fill(); g.beginPath(); g.moveTo(-24, 8); g.lineTo(-30, 18); g.lineTo(-14, 8); g.fill(); }
  else if (kind === 2) { g.beginPath(); g.arc(-16, 0, 14, Math.PI, 0); g.lineTo(-2, 8); g.lineTo(-30, 8); g.closePath(); g.fill(); }
  else { g.font = `900 22px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("+1", -16, 2); }
  g.fillRect(4, -10, 30, 6);
  g.fillRect(4, 4, 20, 6);
  g.restore();
}

// ------------------------------------------------------------------ generic feed (not YORU: the noisy everywhere-feed)
function feedCard(x, y, w, h, seed, kind = "post") {
  const r = rng(seed);
  if (kind === "trend") {
    g.fillStyle = "#151517";
    rrect(x, y, w, h, 18);
    g.fill();
    g.strokeStyle = "#3a3a3e";
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = "#e9e7e3";
    g.font = `900 ${h * 0.24}px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("#trend", x + 26, y + h * 0.36);
    g.fillStyle = "#5c5b60";
    g.fillRect(x + 26, y + h * 0.62, w * 0.5, 10);
    g.fillRect(x + 26, y + h * 0.75, w * 0.32, 10);
    g.fillStyle = "#e9e7e3";
    g.font = `800 ${h * 0.11}px ${FONT}`;
    g.textAlign = "right";
    g.fillText("9.9M ♥", x + w - 24, y + h * 0.8);
    return;
  }
  g.fillStyle = "#e9e7e3";
  rrect(x, y, w, h, 18);
  g.fill();
  g.fillStyle = "#b9b7b3";
  g.beginPath();
  g.arc(x + 40, y + 40, 20, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#9d9b98";
  g.fillRect(x + 72, y + 28, w * (0.25 + r() * 0.2), 10);
  g.fillRect(x + 72, y + 46, w * 0.18, 8);
  if (kind === "fav") {
    note(x + 52, y + h * 0.56, 0.75, INK);
    g.fillStyle = INK;
    g.font = `800 ${Math.round(w * 0.072)}px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("my favorite song.", x + 110, y + h * 0.5);
    g.font = `500 ${Math.round(w * 0.056)}px ${FONT}`;
    g.fillText("it sounds like 3am.", x + 110, y + h * 0.66);
    for (let i = 0; i < 18; i++) {
      const bh = 6 + Math.abs(Math.sin(i * 1.7)) * 26;
      g.fillRect(x + 110 + i * 14, y + h * 0.86 - bh / 2, 8, bh);
    }
    heart(x + w - 40, y + h * 0.84, 0.8, INK, false);
    return;
  }
  g.fillStyle = "#c9c7c3";
  rrect(x + 18, y + 76, w - 36, h - 96, 12);
  g.fill();
  g.fillStyle = "#b0aeaa";
  for (let i = 0; i < 4; i++) g.fillRect(x + 36 + i * (w - 72) / 4, y + 96 + r() * 20, (w - 72) / 5, h - 140 - r() * 30);
}

function phone(x, y, w, h, screen, { bezel = 16, radius = 54, glow = 0.35 } = {}) {
  if (glow) {
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, w * 0.3, x + w / 2, y + h / 2, w * 1.3);
    gr.addColorStop(0, `rgba(255,255,255,${glow * 0.35})`);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x - w, y - w * 0.6, w * 3, h + w * 1.2);
  }
  g.fillStyle = "#050506";
  rrect(x, y, w, h, radius);
  g.fill();
  g.strokeStyle = "#3b3b40";
  g.lineWidth = 3;
  g.stroke();
  g.save();
  rrect(x + bezel, y + bezel, w - 2 * bezel, h - 2 * bezel, radius - bezel * 0.6);
  g.clip();
  screen(x + bezel, y + bezel, w - 2 * bezel, h - 2 * bezel);
  g.restore();
}

// A right hand holding the phone (owner's view): fingertips over the left
// edge, palm below, thumb over the screen. thumb = [dx, dy] offset of the tip.
function hand(X, Y, Wp, Hp, thumb = [0, 0], { shade = 0.4 } = {}) {
  // Palm, behind the lower right of the phone
  const palm = `M${X + Wp * 0.3} ${Y + Hp - 10} C${X + Wp * 0.2} ${Y + Hp + 160} ${X + Wp * 0.1} ${H} ${X + Wp * 0.05} ${H + 80} L${X + Wp + 320} ${H + 80} C${X + Wp + 220} ${Y + Hp + 100} ${X + Wp + 120} ${Y + Hp * 0.8} ${X + Wp + 30} ${Y + Hp * 0.6} Z`;
  g.save();
  g.globalCompositeOperation = "destination-over";
  ink(g, palm, 7);
  g.restore();
  // Fingertips over the left edge
  for (let i = 0; i < 3; i++) {
    const fy = Y + Hp * (0.5 + i * 0.13);
    const d = `M${X - 60} ${fy - 34} C${X + 10} ${fy - 40} ${X + 38} ${fy - 30} ${X + 40} ${fy} C${X + 38} ${fy + 30} ${X + 10} ${fy + 40} ${X - 60} ${fy + 34} Z`;
    ink(g, d, 6);
    tone(g, d, shade, { cell: 8, box: [X - 70, fy - 50, 120, 100] });
    stroke(g, `M${X + 4} ${fy - 24} C${X + 12} ${fy - 6} ${X + 12} ${fy + 6} ${X + 4} ${fy + 24}`, INK, 3);
  }
  // Thumb from the lower right
  const bx = X + Wp + 40, by = Y + Hp * 0.86;
  const tx = X + Wp * 0.64 + thumb[0], ty = Y + Hp * 0.6 + thumb[1];
  const ang = Math.atan2(ty - by, tx - bx);
  const len = Math.hypot(tx - bx, ty - by);
  g.save();
  g.translate(bx, by);
  g.rotate(ang);
  const th = `M-40 -70 C${len * 0.4} -66 ${len - 70} -50 ${len - 20} -36 C${len + 20} -24 ${len + 24} 24 ${len - 20} 36 C${len - 80} 48 ${len * 0.4} 66 -40 80 Z`;
  ink(g, th, 7);
  tone(g, th, (x, y) => (y > 20 ? shade + 0.15 : 0), { cell: 8, box: [-60, -80, len + 80, 170] });
  ink(g, `M${len - 78} -26 C${len - 40} -30 ${len - 18} -24 ${len - 12} 0 C${len - 18} 24 ${len - 40} 30 ${len - 78} 26 C${len - 88} 10 ${len - 88} -10 ${len - 78} -26 Z`, 4);
  stroke(g, `M${len * 0.45} -40 C${len * 0.48} -10 ${len * 0.48} 10 ${len * 0.45} 40`, INK, 3);
  g.restore();
}

// ------------------------------------------------------------------ scene: the crowd (0–2.5)
const CROWD = (() => {
  const out = [];
  const r = rng(12);
  const rows = [
    { y: 600, s: 0.3, xs: [70, 190, 300, 420, 660, 780, 900, 1010] },
    { y: 720, s: 0.44, xs: [40, 200, 350, 730, 880, 1040] },
    { y: 930, s: 0.66, xs: [90, 290, 800, 990] },
  ];
  for (const row of rows) for (const x of row.xs) out.push({ x: x + (r() - 0.5) * 30, y: row.y + (r() - 0.5) * 30, s: row.s * (0.9 + r() * 0.2), seed: Math.floor(r() * 1e6) });
  return out;
})();
const NOTES = (() => {
  const r = rng(31);
  return Array.from({ length: 46 }, () => ({ x: r() * 1180 - 50, y: r() * 2200, v: 60 + r() * 90, sw: r() * 6, ph: r() * 6, rot: (r() - 0.5) * 1.4, d: 0.45 + r() * 1.0, k: Math.floor(r() * 4) }));
})();
// The protagonist sits at the centre of the room.
const SEAT = { x: 414, y: 760, s: 0.42 };
const EYE = { x: SEAT.x + 234 * SEAT.s, y: SEAT.y + 380 * SEAT.s };

function crowd(t) {
  const k = easeInOut(ramp(t, ...C.crowdPush));
  const z = lerp(1, 3.4, k);
  const fx = lerp(W / 2, EYE.x, k), fy = lerp(980, EYE.y, k);
  g.save();
  g.translate(W / 2, lerp(980, 900, k));
  g.scale(z, z);
  g.translate(-fx, -fy);
  // Room
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1d1d21");
  bg.addColorStop(0.5, "#141416");
  bg.addColorStop(1, "#0b0b0c");
  g.fillStyle = bg;
  g.fillRect(-200, -200, W + 400, H + 400);
  // Window grid on the back wall, a city at night
  g.fillStyle = "#26262b";
  g.fillRect(140, 250, 800, 300);
  g.fillStyle = "#0e0e10";
  for (let i = 0; i < 4; i++) g.fillRect(140 + i * 200 + 6, 256, 188, 288);
  const rr = rng(5);
  g.fillStyle = "#3d3d44";
  for (let i = 0; i < 70; i++) g.fillRect(150 + rr() * 780, 380 + rr() * 160, 6, 6 + rr() * 10);
  // Floor perspective
  g.strokeStyle = "#232327";
  g.lineWidth = 3;
  for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(540 + i * 30, 640); g.lineTo(540 + i * 260, 2100); g.stroke(); }
  for (let j = 0; j < 9; j++) { const yy = 640 + Math.pow(j / 8, 1.8) * 1460; g.beginPath(); g.moveTo(-200, yy); g.lineTo(1280, yy); g.stroke(); }
  // Crowd behind
  for (const p of CROWD) at(p.x, p.y, p.s, () => phoneHead(g, { seed: p.seed, glow: 0.8 + 0.2 * Math.sin(t * 3 + p.seed) }));
  // The protagonist on a bench: the only face we can see
  g.fillStyle = "#2c2c31";
  g.fillRect(250, 1236, 580, 26);
  at(SEAT.x, SEAT.y, SEAT.s, () => {
    torso(g, { tone: 0.35 });
    // knees
    ink(g, "M60 1100 C40 1180 60 1260 140 1280 L470 1280 C550 1260 570 1180 550 1100 Z", 6);
    tone(g, "M60 1100 C40 1180 60 1260 140 1280 L470 1280 C550 1260 570 1180 550 1100 Z", 0.55, { cell: 9, box: [40, 1080, 540, 220] });
    // phone held low, a dim glow
    g.fillStyle = "#0a0a0a";
    g.fillRect(250, 900, 110, 170);
    g.fillStyle = "rgba(240,240,250,0.9)";
    g.fillRect(260, 910, 90, 150);
    ink(g, "M200 960 C230 930 270 940 280 990 L270 1080 C240 1100 200 1080 196 1040 Z", 5);
    ink(g, "M410 960 C380 930 340 940 330 990 L340 1080 C370 1100 410 1080 414 1040 Z", 5);
    head(g, { headphones: true, eyes: "open", look: [-0.5, 0.15], brows: "worried", mouth: "neutral", glow: "#ffffff" });
  });
  // Foreground crowd, out of focus
  g.save();
  g.filter = "blur(5px)";
  for (const [x, y, s, seed] of [[40, 1360, 1.35, 7], [1040, 1400, 1.4, 9], [250, 1620, 1.2, 11], [860, 1640, 1.25, 13]]) at(x, y, s, () => phoneHead(g, { seed, glow: 0.9 }));
  g.restore();
  // Notifications falling like paper
  for (const n of NOTES) {
    const y = ((n.y + t * n.v) % 2300) - 200;
    const x = n.x + Math.sin(t * 1.3 + n.ph) * 30 * n.sw;
    g.save();
    g.translate(x, y);
    g.rotate(n.rot + Math.sin(t * 1.7 + n.ph) * 0.5);
    paperNote(n.k, n.d * 0.9, 0.55 + n.d * 0.35);
    g.restore();
  }
  g.restore();
  // Panel border: this is a manga page
  g.strokeStyle = PAPER;
  g.lineWidth = 6;
  g.strokeRect(28, 28, W - 56, H - 56);
}

// ------------------------------------------------------------------ scene: the eye (2.1–3.3)
function eyeCU(t) {
  const k = ramp(t, 2.1, 3.3);
  const z = lerp(1, 1.12, k);
  g.save();
  g.translate(540, 900);
  g.scale(z, z);
  g.translate(-540, -900);
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#e4e1dc");
  tone(g, `M0 0 H${W} V${H} H0 Z`, (x, y) => clamp(0.65 - y / 1100) + clamp((Math.abs(x - 540) - 380) / 600), { cell: 12, box: [0, 0, W, H] });
  // Brow and hair
  taper(g, [[150, 520], [400, 450], [700, 455], [950, 520]], 54, { a: 0.2, b: 0.4 });
  const fringe = "M-20 -20 H1100 V330 Q1080 430 1050 520 Q1020 430 1000 360 Q960 520 900 650 Q890 500 860 400 Q800 520 760 600 Q760 470 720 380 Q660 470 610 540 Q620 430 600 350 Q540 450 470 590 Q480 450 450 360 Q390 470 330 640 Q330 480 300 380 Q240 480 170 690 Q180 520 160 410 Q100 500 60 600 Q60 470 40 380 Q10 420 -20 460 Z";
  tone(g, "M0 0 H1080 V760 H0 Z", (x, y) => clamp(0.55 - (y - 380) / 700), { cell: 10, box: [0, 0, 1080, 800] });
  fill(g, fringe, INK);
  for (const l of [[[120, 180], [260, 120], [400, 110]], [[560, 110], [700, 120], [860, 170]]]) taper(g, l, 18, { color: PAPER, a: 0.45, b: 0.45, steps: 24 });
  // Eye
  const white = "M110 920 C270 650 770 610 980 840 C900 1060 640 1130 470 1120 C300 1110 170 1030 110 920 Z";
  fill(g, white, "#fbfaf7");
  g.save();
  g.clip(new Path2D(white));
  const ix = 560, iy = 890;
  const ig = g.createLinearGradient(0, iy - 250, 0, iy + 250);
  ig.addColorStop(0, "#030303");
  ig.addColorStop(0.55, "#262629");
  ig.addColorStop(1, "#8a898d");
  g.fillStyle = ig;
  g.beginPath();
  g.arc(ix, iy, 250, 0, Math.PI * 2);
  g.fill();
  const r = rng(4);
  g.lineCap = "round";
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + r() * 0.02;
    const r0 = 104 + r() * 16, r1 = 170 + r() * 70;
    g.strokeStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.08 + r() * 0.18})`;
    g.lineWidth = 2 + r() * 3;
    g.beginPath();
    g.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0);
    g.lineTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1);
    g.stroke();
  }
  g.strokeStyle = "#050505";
  g.lineWidth = 18;
  g.beginPath();
  g.arc(ix, iy, 244, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#000";
  g.beginPath();
  g.arc(ix, iy, 100, 0, Math.PI * 2);
  g.fill();
  // Reflection: the glowing phone, its feed scrolling
  g.save();
  g.translate(632, 820);
  g.rotate(0.06);
  g.fillStyle = "rgba(255,255,255,0.92)";
  rrect(-60, -96, 120, 192, 16);
  g.fill();
  g.save();
  rrect(-52, -88, 104, 176, 10);
  g.clip();
  const off = (t * 160) % 46;
  g.fillStyle = "rgba(20,20,22,0.55)";
  for (let i = -1; i < 6; i++) { g.fillRect(-44, -88 + i * 46 - off + 6, 88, 30); }
  g.restore();
  // The crimson line across the reflection
  const ck = easeOut(ramp(t, C.crimsonLine, C.crimsonLine + 0.22));
  if (ck > 0) {
    g.strokeStyle = CRIMSON;
    g.lineWidth = 5;
    g.shadowColor = CRIMSON;
    g.shadowBlur = 14;
    g.beginPath();
    g.moveTo(-130, 30);
    g.lineTo(-130 + 270 * ck, 30 - 30 * ck);
    g.stroke();
  }
  g.restore();
  g.fillStyle = "#fff";
  g.beginPath();
  g.ellipse(470, 770, 46, 56, -0.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(470, 1010, 16, 0, Math.PI * 2);
  g.fill();
  // Lid shadow
  g.fillStyle = "rgba(10,10,10,0.42)";
  g.fill(new Path2D("M60 560 L1020 560 L1020 860 C780 660 300 680 60 960 Z"));
  g.restore();
  // Lids and lashes
  taper(g, [[90, 940], [260, 690], [560, 610], [820, 680], [1000, 830]], 46, { a: 0.12, b: 0.1 });
  for (let i = 0; i < 7; i++) {
    const a = 0.62 + i * 0.06;
    const x = lerp(700, 1010, a - 0.6) * 1, y = lerp(650, 840, a - 0.6);
    taper(g, [[x, y], [x + 50 + i * 6, y - 40 - i * 4], [x + 70 + i * 10, y - 90 - i * 6]], 14, { a: 0.05, b: 0.8, steps: 14 });
  }
  taper(g, [[230, 1050], [470, 1130], [760, 1080]], 12, { a: 0.4, b: 0.4 });
  taper(g, [[160, 760], [420, 590], [760, 590]], 8, { a: 0.4, b: 0.5 });
  g.restore();
}

// ------------------------------------------------------------------ scene: scrolling (3.3–4.5)
const PH = { x: 250, y: 130, w: 580, h: 1110 };
function scrollOffset(t) {
  // fast, slows on the favourite card, then a rush of trends
  const t0 = C.scroll[0];
  const a = Math.min(t, C.favCard) - t0;
  let o = Math.max(0, a) * 1100;
  if (t > C.favCard) o += easeOut(ramp(t, C.favCard, C.trendWave[0])) * 120;
  if (t > C.trendWave[0]) o += Math.pow(t - C.trendWave[0], 1.6) * 2600;
  return o;
}
function feedScreen(x, y, w, h, t, { fav = true, trend = true } = {}) {
  g.fillStyle = "#d8d6d2";
  g.fillRect(x, y, w, h);
  const ch = 250, gap = 16;
  const o = scrollOffset(t);
  const favIndex = 6;
  // index 6 lands mid-screen at C.favCard
  const base = y + 24 - o + (C.favCard - C.scroll[0]) * 1100 - favIndex * (ch + gap) + h / 2 - ch / 2 - 24;
  for (let i = 0; i < 40; i++) {
    const cy = base + i * (ch + gap);
    if (cy > y + h || cy + ch < y) continue;
    const kind = fav && i === favIndex ? "fav" : i > favIndex + 1 && trend ? "trend" : "post";
    feedCard(x + 16, cy, w - 32, ch, 100 + i, kind);
  }
  // The wave of identical trends pours over everything
  if (trend && t > C.trendWave[0]) {
    const k = ramp(t, ...C.trendWave);
    for (let j = 0; j < 9; j++) {
      const kk = clamp(k * 1.6 - j * 0.08);
      if (kk <= 0) continue;
      const cy = y + h + 40 - easeOut(kk) * (h + 260) + j * 120;
      feedCard(x + 16 + Math.sin(j * 2.1) * 10, cy, w - 32, ch, 900, "trend");
    }
  }
}
function scrollScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#101012");
  const swipe = (t * 2.6) % 1;
  const thumb = t > C.favCard && t < C.trendWave[0] ? [0, 0] : [-20 + 40 * swipe, 120 - 260 * easeInOut(swipe)];
  phone(PH.x, PH.y, PH.w, PH.h, (x, y, w, h) => feedScreen(x, y, w, h, t), { glow: 0.5 });
  hand(PH.x, PH.y, PH.w, PH.h, thumb);
}

// ------------------------------------------------------------------ scene: things they love (4.5–5.5)
const PANELS3 = [
  [[40, 60], [1040, 60], [1040, 600], [40, 680]],
  [[40, 710], [1040, 630], [1040, 1170], [40, 1210]],
  [[40, 1440], [1040, 1420], [1040, 1860], [40, 1860]],
];
function panelIn(t, t0, poly, draw) {
  if (t < t0) return;
  const k = expoOut(ramp(t, t0, t0 + 0.22));
  const cx = centroid(poly);
  g.save();
  g.translate(cx[0], cx[1]);
  g.scale(lerp(1.12, 1, k), lerp(1.12, 1, k));
  g.translate(-cx[0], -cx[1]);
  g.globalAlpha = clamp(k * 1.5);
  polyPath(g, poly);
  g.save();
  g.clip();
  draw();
  g.restore();
  polyPath(g, poly);
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.stroke();
  // slam flash
  const f = 1 - ramp(t, t0, t0 + 0.12);
  if (f > 0) {
    polyPath(g, poly);
    g.fillStyle = `rgba(255,255,255,${f * 0.9})`;
    g.fill();
  }
  g.restore();
}
function interests(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0b0b0c");
  // 1 — music, eyes closed
  panelIn(t, C.interests[0], PANELS3[0], () => {
    fill(g, "M0 0 H1080 V760 H0 Z", PAPER);
    radialLines(g, { cx: 700, cy: 380, n: 90, rIn: [300, 420], width: [2, 10], color: "#cfccc7", seed: 3 });
    at(260, -120, 1.2, () => profile(g, { headphones: true, eyes: "closed" }));
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.9 + i * 0.27) % 1;
      note(760 + i * 60 + Math.sin(p * 6 + i) * 20, 520 - p * 380, 0.9 + i * 0.1, INK);
    }
  });
  // 2 — drawing: a sketch appears under the pencil
  panelIn(t, C.interests[1], PANELS3[1], () => {
    fill(g, "M0 600 H1080 V1300 H0 Z", "#e9e6e0");
    hatch(g, "M0 600 H1080 V1300 H0 Z", { gap: 14, angle: 0.4, w: 1.2, color: "#cfcac2", box: [0, 600, 1080, 700] });
    g.save();
    g.translate(300, 760);
    g.rotate(-0.06);
    fill(g, "M0 0 H560 V420 H0 Z", "#fbfaf6");
    stroke(g, "M0 0 H560 V420 H0 Z", INK, 3);
    const k = ramp(t, C.interests[1], C.interests[1] + 0.6);
    g.save();
    g.translate(120, 30);
    g.scale(0.5, 0.5);
    g.beginPath();
    g.rect(0, 0, 640 * Math.max(0.2, k), 760);
    g.clip();
    g.globalAlpha = 0.9;
    head(g, { hair: "buns", eyes: "smile", mouth: "grin", collar: "tee" });
    g.restore();
    g.restore();
    // pencil + hand
    const px = 300 + 120 + 320 * Math.max(0.2, ramp(t, C.interests[1], C.interests[1] + 0.6)), py = 900 + Math.sin(t * 30) * 8;
    g.save();
    g.translate(px, py);
    g.rotate(-0.7);
    fill(g, "M0 0 L26 -18 L280 -18 L280 18 L26 18 Z", "#f0eee9");
    stroke(g, "M0 0 L26 -18 L280 -18 L280 18 L26 18 Z", INK, 5);
    fill(g, "M0 0 L12 -8 L12 8 Z", INK);
    ink(g, "M120 -40 C170 -90 280 -80 320 -20 C340 40 300 100 220 110 C170 112 120 80 110 30 Z", 6);
    tone(g, "M120 -40 C170 -90 280 -80 320 -20 C340 40 300 100 220 110 C170 112 120 80 110 30 Z", 0.3, { cell: 8, box: [100, -100, 240, 220] });
    stroke(g, "M160 20 C190 30 230 28 260 10", INK, 3);
    g.restore();
  });
  // 3 — reading manga
  panelIn(t, C.interests[2], PANELS3[2], () => {
    fill(g, "M0 1200 H1080 V1900 H0 Z", PAPER);
    tone(g, "M0 1200 H1080 V1900 H0 Z", (x, y) => clamp((y - 1200) / 900) * 0.35, { cell: 11, box: [0, 1200, 1080, 700] });
    at(250, 1330, 0.95, () => head(g, { headphones: true, eyes: "down", look: [0, 1], brows: "up" }));
    // the book
    g.save();
    g.translate(540, 1850);
    g.rotate(-0.05);
    ink(g, "M-330 -150 L-10 -120 L-10 260 L-330 230 Z", 7);
    ink(g, "M10 -120 L330 -150 L330 230 L10 260 Z", 7);
    for (const [x, y, w, h] of [[-300, -110, 130, 120], [-150, -100, 120, 120], [-300, 30, 260, 150], [40, -110, 120, 130], [180, -120, 120, 130], [40, 40, 260, 150]]) stroke(g, `M${x} ${y} h${w} v${h} h${-w} Z`, INK, 4);
    g.restore();
    for (let i = 0; i < 5; i++) {
      const a = t * 2 + i * 1.3;
      const x = 300 + i * 120, y = 1480 + Math.sin(a) * 20;
      g.fillStyle = INK;
      g.beginPath();
      for (let j = 0; j < 4; j++) {
        const an = (j * Math.PI) / 2;
        g.lineTo(x + Math.cos(an) * 26, y + Math.sin(an) * 26);
        g.lineTo(x + Math.cos(an + Math.PI / 4) * 6, y + Math.sin(an + Math.PI / 4) * 6);
      }
      g.fill();
    }
  });
}

// ------------------------------------------------------------------ scene: typing, deleting (5.5–6.9)
const MSG = "have you ever heard of";
function typedText(t) {
  const [a, b] = C.typeText;
  const [d0, d1] = C.deleteText;
  if (t < a) return "";
  if (t < b) return MSG.slice(0, Math.round(ramp(t, a, b) * MSG.length));
  if (t < d0) return MSG;
  return MSG.slice(0, Math.round((1 - ramp(t, d0, d1)) * MSG.length));
}
function chatScreen(x, y, w, h, t, text, { sent = null } = {}) {
  g.fillStyle = "#121214";
  g.fillRect(x, y, w, h);
  // top bar
  g.fillStyle = "#1c1c1f";
  g.fillRect(x, y, w, 120);
  g.fillStyle = "#3a3a3f";
  g.beginPath();
  g.arc(x + 70, y + 62, 30, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x + 120, y + 48, 200, 14);
  g.fillRect(x + 120, y + 72, 120, 10);
  // input
  const iy = y + h * 0.56;
  g.fillStyle = "#26262a";
  rrect(x + 30, iy, w - 150, 96, 48);
  g.fill();
  g.fillStyle = text ? "#8d8c92" : "#3a3a3f";
  g.beginPath();
  g.arc(x + w - 70, iy + 48, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(x + w - 88, iy + 30);
  g.lineTo(x + w - 48, iy + 48);
  g.lineTo(x + w - 88, iy + 66);
  g.closePath();
  g.fill();
  g.font = `500 ${Math.round(Math.min(40, w * 0.046))}px ${FONT}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = text ? "#f2f0ec" : "#6c6b70";
  g.fillText(text || "Message", x + 66, iy + 50);
  const tw = text ? g.measureText(text).width : 0;
  if (Math.floor(t * 3.2) % 2 === 0 || (t > C.typeText[0] && t < C.typeText[1])) {
    g.fillStyle = "#f2f0ec";
    g.fillRect(x + 70 + tw, iy + 26, 4, 50);
  }
  // keyboard
  const ky = iy + 130;
  g.fillStyle = "#1a1a1d";
  g.fillRect(x, ky, w, h - (ky - y));
  g.fillStyle = "#2c2c31";
  const rows = [10, 9, 7];
  rows.forEach((n, ri) => {
    const kw = (w - 40) / 10;
    const ox = x + 20 + ((10 - n) * kw) / 2;
    for (let i = 0; i < n; i++) { rrect(ox + i * kw + 5, ky + 24 + ri * 110, kw - 10, 92, 12); g.fill(); }
  });
  rrect(x + w * 0.25, ky + 24 + 3 * 110, w * 0.5, 92, 12);
  g.fill();
  if (sent) sent(x, y, w, h);
}
function typingScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0c0c0d");
  const z = lerp(1, 1.05, ramp(t, ...C.typing));
  g.save();
  g.translate(540, 960);
  g.scale(z, z);
  g.translate(-540, -960);
  phone(90, 120, 900, 1900, (x, y, w, h) => chatScreen(x, y, w, h, t, typedText(t)), { radius: 90, bezel: 22, glow: 0.25 });
  // thumb hovering, pulling back while deleting
  const hes = ramp(t, ...C.hesitate);
  const tap = Math.abs(Math.sin(t * 22)) * (t > C.typeText[0] && t < C.typeText[1] ? 1 : 0);
  g.save();
  g.translate(0, 40 + hes * 160 - tap * 24);
  const by = 1760;
  const th = `M1240 ${by + 300} C1040 ${by + 120} 900 ${by - 40} 820 ${by - 120} C780 ${by - 170} 820 ${by - 230} 880 ${by - 200} C980 ${by - 150} 1120 ${by - 40} 1300 ${by + 60} Z`;
  ink(g, th, 8);
  tone(g, th, (x, y) => (y > by - 120 ? 0.4 : 0), { cell: 9, box: [780, by - 260, 540, 600] });
  ink(g, `M830 ${by - 150} C840 ${by - 196} 880 ${by - 206} 910 ${by - 186} C920 ${by - 160} 900 ${by - 130} 870 ${by - 126} Z`, 5);
  g.restore();
  g.restore();
}

// ------------------------------------------------------------------ scene: the group moves on (6.9–7.5)
function groupScene(t) {
  const k = ramp(t, ...C.group);
  fill(g, `M0 0 H${W} V${H} H0 Z`, PAPER);
  motionLines(g, { angle: 0, n: 70, color: "#bdb9b2", seed: 8, width: [2, 8], len: [300, 1200], offset: t * 2400 });
  const slide = -easeIn(k) * 700;
  g.save();
  g.translate(slide, 0);
  at(240, 470, 0.82, () => head(g, { hair: "bob", eyes: "smile", mouth: "grin", earring: true, collar: "tee" }));
  at(700, 420, 0.86, () => head(g, { hair: "curly", tone: 0.38, eyes: "smile", mouth: "grin", collar: "jacket" }));
  at(470, 520, 0.9, () => head(g, { hair: "cap", eyes: "smile", mouth: "open", tone: 0.15, collar: "dark" }));
  sfx("HAHA", 420, 330, 110, -0.12);
  sfx("HA!", 960, 380, 90, 0.15);
  bubble(760, 1150, 440, 180, [-120, -120], "the 3am thing!!", { size: 42 });
  g.restore();
  // the protagonist at the edge, in shadow, not moving
  at(-260, 760, 1.5, () => profile(g, { light: "dark", headphones: false }));
  fill(g, `M0 0 H${W} V${H} H0 Z`, `rgba(0,0,0,${0.15 + k * 0.25})`);
}

// ------------------------------------------------------------------ scene: sent into the void (7.5–8.05)
function sendScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0d0d0f");
  const tapped = t > C.sendTap;
  phone(PH.x, PH.y, PH.w, PH.h, (x, y, w, h) => {
    if (!tapped) {
      chatScreen(x, y, w, h, t, "this song sounds like 3am.");
      return;
    }
    // the message joins the feed, and the feed rushes over it
    const k = ramp(t, ...C.sink);
    g.fillStyle = "#d8d6d2";
    g.fillRect(x, y, w, h);
    const o = easeIn(clamp((k - 0.2) / 0.8)) * 1800;
    for (let i = 0; i < 14; i++) feedCard(x + 16, y + 30 + i * 266 - o, w - 32, 250, 300 + i, i % 2 ? "trend" : "post");
    const by = y + h * 0.42 - easeIn(clamp((k - 0.3) / 0.7)) * 900;
    g.save();
    g.globalAlpha = 1 - easeIn(k) * 0.9;
    g.fillStyle = CRIMSON;
    rrect(x + 50, by, w - 100, 120, 40);
    g.fill();
    g.fillStyle = "#fff";
    g.font = `600 30px ${FONT}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("this song sounds like 3am.", x + 80, by + 44);
    g.fillText("anyone?", x + 80, by + 82);
    g.restore();
    // more cards cover it
    for (let j = 0; j < 6; j++) {
      const kk = clamp((k - 0.3) * 2 - j * 0.1);
      feedCard(x + 16, y + h + 20 - easeOut(kk) * (h * 0.9) + j * 150, w - 32, 250, 950, "trend");
    }
    g.fillStyle = `rgba(0,0,0,${easeIn(k) * 0.7})`;
    g.fillRect(x, y, w, h);
  }, { glow: 0.35 });
  hand(PH.x, PH.y, PH.w, PH.h, tapped ? [120, -40] : [150, -10 + Math.sin(t * 9) * 4]);
}

// ------------------------------------------------------------------ scene: nobody is listening (8.05–9.0)
function aloneScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#050506");
  const hush = 1 - ramp(t, ...C.hush) * 0.6;
  const gl = g.createRadialGradient(560, 1500, 50, 560, 1500, 900);
  gl.addColorStop(0, `rgba(235,235,240,${0.35 * hush})`);
  gl.addColorStop(1, "rgba(235,235,240,0)");
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  const z = lerp(1, 1.02, ramp(t, ...C.alone));
  at(-300, -40, 2.5 * z, () => profile(g, { light: "below" }));
  fill(g, `M0 0 H${W} V${H} H0 Z`, `rgba(0,0,0,${0.28 + (1 - hush) * 0.5})`);
}

// ------------------------------------------------------------------ scene: eyes close (9.0–9.55)
function eyesState(t) {
  const [a, b] = C.blink;
  if (t < a) return "open";
  if (t < lerp(a, b, 0.5)) return "down";
  return "closed";
}
function closeScene(t, invert = false) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#060607");
  at(-760, -900, 4.2, () => head(g, { headphones: true, eyes: eyesState(t), look: [0, 0.6], light: "below", brows: "worried", mouth: "neutral" }));
  const v = g.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, "rgba(0,0,0,0.6)");
  v.addColorStop(0.4, "rgba(0,0,0,0.1)");
  v.addColorStop(1, "rgba(0,0,0,0.75)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  if (invert) {
    g.globalCompositeOperation = "difference";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  }
}

// ------------------------------------------------------------------ the feed wall, shattered (9.55–10.4)
// feedCard and friends draw on `g`; the wall is drawn once offscreen by
// pointing `g` at another context.
const wall = document.createElement("canvas");
wall.width = W;
wall.height = H;
{
  const main = g;
  g = wall.getContext("2d");
  g.fillStyle = "#1a1a1d";
  g.fillRect(0, 0, W, H);
  for (let r = 0; r < 8; r++) for (let col = 0; col < 3; col++) feedCard(20 + col * 350, -40 + r * 250 + (col % 2) * 80, 330, 230, r * 7 + col, (r + col) % 3 === 0 ? "post" : "trend");
  g = main;
}
const WALL_SHARDS = (() => {
  const base = [[0, 0], [W, 0], [W, H], [0, H]];
  return fracture(base, 404, 6).map((p) => ({ p, c: centroid(p), r: hash(p[0][0] * 0.13 + p[0][1] * 0.07) }));
})();

function shatter(t, behind) {
  const k = ramp(t, ...C.shatter);
  behind();
  for (const s of WALL_SHARDS) {
    const dx = s.c[0] - W / 2, dy = s.c[1] - H * 0.48;
    const d = Math.hypot(dx, dy) || 1;
    const kk = clamp(k * 1.3 - s.r * 0.15);
    if (kk >= 1) continue;
    const e = 1 - Math.pow(1 - kk, 2.2);
    const tx = (dx / d) * e * 1700 + (dx / d) * 40 * kk, ty = (dy / d) * e * 1700 + kk * kk * 400;
    const rot = (s.r - 0.5) * 3 * e;
    const sc = 1 + e * 0.6;
    g.save();
    polyPath(g, s.p, tx, ty, rot, sc, s.c);
    g.save();
    g.clip();
    g.translate(s.c[0] + tx, s.c[1] + ty);
    g.rotate(rot);
    g.scale(sc, sc);
    g.translate(-s.c[0], -s.c[1]);
    g.drawImage(wall, 0, 0);
    g.restore();
    polyPath(g, s.p, tx, ty, rot, sc, s.c);
    g.strokeStyle = PAPER;
    g.lineWidth = 4;
    g.stroke();
    g.restore();
  }
  // the crimson slash, fading
  const sk = 1 - ramp(t, C.shatter[0] + 0.1, C.shatter[0] + 0.45);
  if (sk > 0) {
    g.save();
    g.globalAlpha = sk;
    brushStroke(g, { pts: [[-60, 1420], [400, 1060], [700, 820], [1140, 460]], width: 90, seed: 7, color: CRIMSON, progress: 1 });
    g.restore();
  }
}

// ------------------------------------------------------------------ the people: silhouettes become individuals
const PEOPLE = [
  { hair: "bob", eyes: "smile", mouth: "grin", earring: true, collar: "tee", prop: "guitar" },
  { hair: "curly", tone: 0.38, mouth: "smile", headset: true, collar: "jacket", prop: "controller" },
  { hair: "cap", tone: 0.16, mouth: "open", eyes: "wide", collar: "dark", prop: "board" },
  { hair: "long", glasses: true, mouth: "soft", collar: "tee", prop: "book" },
  { hair: "buns", eyes: "smile", mouth: "grin", blush: true, tone: 0.1, collar: "hoodie", prop: "camera" },
  { hair: "undercut", shave: true, tone: 0.46, mouth: "smile", earring: true, collar: "jacket", prop: "brush" },
];
const GRID = [
  [[30, 150], [530, 150], [530, 690], [30, 730]],
  [[550, 150], [1050, 150], [1050, 650], [550, 690]],
  [[30, 750], [530, 710], [530, 1230], [30, 1250]],
  [[550, 710], [1050, 670], [1050, 1210], [550, 1230]],
  [[30, 1270], [530, 1250], [530, 1780], [30, 1780]],
  [[550, 1250], [1050, 1230], [1050, 1780], [550, 1780]],
];
function prop(kind, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineWidth = 6;
  if (kind === "guitar") {
    g.rotate(-0.6);
    g.fillRect(-8, -150, 16, 170);
    rrect(-22, -200, 44, 60, 10); g.fill();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-28, -190 + i * 18, 6, 0, 7); g.arc(28, -190 + i * 18, 6, 0, 7); g.fill(); }
    g.beginPath(); g.ellipse(0, 70, 70, 62, 0, 0, 7); g.ellipse(0, -4, 52, 44, 0, 0, 7); g.fill();
    g.fillStyle = PAPER; g.beginPath(); g.arc(0, 40, 18, 0, 7); g.fill();
  } else if (kind === "controller") {
    rrect(-90, -40, 180, 80, 40); g.fill();
    g.fillStyle = PAPER;
    g.fillRect(-60, -6, 36, 12); g.fillRect(-48, -18, 12, 36);
    for (const [a, b] of [[44, -10], [62, 8], [26, 8], [44, 26]]) { g.beginPath(); g.arc(a, b - 8, 7, 0, 7); g.fill(); }
  } else if (kind === "board") {
    g.rotate(-0.4);
    rrect(-140, -26, 280, 52, 26); g.fill();
    g.fillStyle = PAPER; g.fillRect(-100, -4, 200, 8);
    g.fillStyle = INK;
    for (const a of [-90, 90]) { g.beginPath(); g.arc(a, 40, 16, 0, 7); g.fill(); }
  } else if (kind === "book") {
    ink(g, "M-100 -70 L0 -50 L100 -70 L100 70 L0 90 L-100 70 Z", 6);
    stroke(g, "M0 -50 L0 90", INK, 5);
    for (let i = 0; i < 3; i++) stroke(g, `M-80 ${-30 + i * 26} L-20 ${-20 + i * 26} M20 ${-20 + i * 26} L80 ${-30 + i * 26}`, INK, 3);
  } else if (kind === "camera") {
    rrect(-90, -55, 180, 110, 18); g.fill();
    g.fillRect(-40, -78, 60, 28);
    g.fillStyle = PAPER; g.beginPath(); g.arc(0, 0, 38, 0, 7); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.fill();
    g.fillStyle = PAPER; g.beginPath(); g.arc(8, -8, 7, 0, 7); g.fill();
  } else if (kind === "brush") {
    g.rotate(0.7);
    g.fillRect(-8, -40, 16, 180);
    g.beginPath(); g.moveTo(-14, -40); g.quadraticCurveTo(-18, -110, 0, -150); g.quadraticCurveTo(18, -110, 14, -40); g.fill();
    g.strokeStyle = INK; g.lineWidth = 10; g.beginPath(); g.moveTo(-160, 120); g.quadraticCurveTo(-60, 40, 40, 110); g.stroke();
  }
  g.restore();
}
function peopleGrid(t, { reveal = true } = {}) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0b0b0c");
  GRID.forEach((poly, i) => {
    const a = C.silhouettes[0] + i * 0.05;
    if (t < a) return;
    const kin = expoOut(ramp(t, a, a + 0.2));
    const cx = centroid(poly);
    g.save();
    g.translate(cx[0], cx[1]);
    g.scale(lerp(0.85, 1, kin), lerp(0.85, 1, kin));
    g.translate(-cx[0], -cx[1]);
    polyPath(g, poly);
    g.save();
    g.clip();
    const rv = reveal ? easeOut(ramp(t, C.individuals[i], C.individuals[i] + 0.25)) : 0;
    const xs = Math.min(...poly.map((p) => p[0])), ys = Math.min(...poly.map((p) => p[1]));
    // grey world
    fill(g, `M${xs} ${ys} h520 v560 h-520 Z`, "#4a494e");
    at(xs + 40, ys + 70, 0.72, () => silhouette(g, { seed: i, color: "#6e6d72" }));
    // the person, wiped in diagonally
    if (rv > 0) {
      g.save();
      g.beginPath();
      const p = rv * 1300;
      g.moveTo(xs - 200, ys + 700);
      g.lineTo(xs - 200 + p, ys + 700 - p * 1.1);
      g.lineTo(xs - 200 + p + 200, ys + 700 - p * 1.1 + 400);
      g.lineTo(xs - 200, ys + 900);
      g.closePath();
      g.rect(xs - 1, ys - 1, rv >= 1 ? 600 : 0, rv >= 1 ? 700 : 0);
      g.clip();
      fill(g, `M${xs} ${ys} h520 v560 h-520 Z`, PAPER);
      radialLines(g, { cx: xs + 260, cy: ys + 260, n: 60, rIn: [200, 300], width: [2, 9], color: "#d6d2cb", seed: 20 + i });
      at(xs + 50, ys + 60, 0.7, () => head(g, PEOPLE[i]));
      prop(PEOPLE[i].prop, xs + 440, ys + 470, 0.55);
      g.restore();
    }
    g.restore();
    polyPath(g, poly);
    g.strokeStyle = PAPER;
    g.lineWidth = 8;
    g.stroke();
    g.restore();
  });
}

// ------------------------------------------------------------------ scene: looking up (11.1–12.35)
function lookUp(t) {
  const [a, b] = C.lookUp;
  fill(g, `M0 0 H${W} V${H} H0 Z`, PAPER);
  radialLines(g, { cx: 540, cy: 860, n: 140, rIn: [420, 560], width: [2, 14], color: INK, seed: 61, alpha: 0.85 });
  tone(g, `M0 0 H${W} V${H} H0 Z`, (x, y) => clamp(Math.hypot(x - 540, y - 860) / 1300 - 0.15) * 0.8, { cell: 12, box: [0, 0, W, H] });
  const glow = easeOut(ramp(t, a + 0.25, a + 0.9));
  const lg = g.createRadialGradient(540, 760, 60, 540, 760, 760);
  lg.addColorStop(0, `rgba(255,255,255,${0.95 * glow})`);
  lg.addColorStop(0.55, `rgba(255,255,255,${0.5 * glow})`);
  lg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
  const z = lerp(1.0, 1.08, easeOut(ramp(t, a, b)));
  const eyes = t < a + 0.25 ? "down" : t < a + 0.6 ? "up" : "open";
  const look = t < a + 0.25 ? [0, 1] : t < a + 0.6 ? [0.1, -1] : [0, -0.1];
  const mouth = t < a + 0.8 ? "neutral" : "soft";
  g.save();
  g.translate(540, 900);
  g.scale(z, z);
  g.translate(-540, -900);
  at(60, 420, 1.6, () => head(g, { headphones: true, eyes, look, brows: t < a + 0.6 ? "up" : "calm", mouth, rim: easeOut(ramp(t, a + 0.3, a + 0.8)), glow: null }));
  g.restore();
}

// ------------------------------------------------------------------ scene: sharing, replies (12.35–13.4)
function shareScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0b0b0c");
  const main = [[30, 120], [1050, 120], [1050, 760], [30, 860]];
  panelIn(t, C.share[0], main, () => {
    fill(g, "M0 0 H1080 V900 H0 Z", PAPER);
    radialLines(g, { cx: 380, cy: 520, n: 100, rIn: [320, 420], width: [2, 10], color: "#cbc7c0", seed: 71 });
    at(60, 160, 1.0, () => head(g, { headphones: true, eyes: "smile", mouth: "grin", brows: "up", rim: 0.9 }));
    bubble(810, 330, 440, 280, [-190, 130], "", {});
    note(740, 290, 1.0);
    note(860, 270, 0.75);
    g.fillStyle = INK;
    g.font = `800 36px ${FONT}`;
    g.textAlign = "center";
    g.fillText("you have to", 810, 382);
    g.fillText("hear this", 810, 424);
  });
  const reps = [
    { poly: [[30, 890], [520, 860], [520, 1230], [30, 1250]], p: PEOPLE[0], text: "♪♪!!", at: C.replies[0] },
    { poly: [[560, 860], [1050, 800], [1050, 1220], [560, 1230]], p: PEOPLE[3], text: "send it!", at: C.replies[1] },
    { poly: [[30, 1470], [1050, 1440], [1050, 1830], [30, 1840]], p: PEOPLE[1], text: "SAME!!", at: C.replies[2] },
  ];
  for (const r of reps) {
    panelIn(t, r.at, r.poly, () => {
      const xs = Math.min(...r.poly.map((p) => p[0])), ys = Math.min(...r.poly.map((p) => p[1]));
      fill(g, `M${xs} ${ys} h1100 v500 h-1100 Z`, PAPER);
      at(xs + 20, ys - 10, 0.62, () => head(g, r.p));
      bubble(xs + 330 + (r.poly[1][0] - r.poly[0][0] > 600 ? 260 : 0), ys + 150, 260, 140, [-120, 40], r.text, { size: 42 });
    });
  }
}

// ------------------------------------------------------------------ scene: the real app (13.4–15.6)
const UIPH = { x: 266, y: 110, w: 548 };
UIPH.h = Math.round(((UIPH.w - 28) * 2338) / 1080) + 28;
function uiScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0b0b0c");
  tone(g, `M0 0 H${W} V${H} H0 Z`, (x, y) => clamp(0.3 - Math.hypot(x - 540, y - 700) / 3000), { cell: 12, color: "#26262a", box: [0, 0, W, H] });
  radialLines(g, { cx: 540, cy: 700, n: 80, rIn: [560, 700], width: [2, 7], color: CRIMSON, seed: 81, alpha: 0.5 });
  const [s0, s1, s2, s3] = C.uiShots;
  const kIn = expoOut(ramp(t, s0, s0 + 0.35));
  g.save();
  g.translate(540, 700);
  g.scale(lerp(0.7, 1, kIn), lerp(0.7, 1, kIn));
  g.rotate((1 - kIn) * -0.08);
  g.translate(-540, -700);
  phone(UIPH.x, UIPH.y, UIPH.w, UIPH.h, (x, y, w, h) => {
    const draw = (im, a = 1, dx = 0) => { g.globalAlpha = a; g.drawImage(im, x + dx, y, w, h); g.globalAlpha = 1; };
    if (t < s1) draw(IMG.profile);
    else if (t < s2) { draw(IMG.profile, 1, -w * easeInOut(ramp(t, s1, s1 + 0.2))); draw(IMG.post0, 1, w * (1 - easeInOut(ramp(t, s1, s1 + 0.2)))); }
    else if (t < s3) { draw(IMG.post0); draw(IMG.post1, easeOut(ramp(t, s2, s2 + 0.15))); }
    else { draw(IMG.post1); draw(IMG.post2, easeOut(ramp(t, s3, s3 + 0.15))); }
    // crimson brackets around a reply as it arrives
    const sy = h / 2338;
    const mark = (y0, y1, ta) => {
      const k = easeOut(ramp(t, ta, ta + 0.25)) * (1 - ramp(t, ta + 0.5, ta + 0.7));
      if (k <= 0) return;
      g.strokeStyle = CRIMSON;
      g.lineWidth = 4;
      g.globalAlpha = k;
      const xa = x + 14, xb = x + w - 14, ya = y + y0 * sy, yb = y + y1 * sy, L = 26;
      g.beginPath();
      g.moveTo(xa, ya + L); g.lineTo(xa, ya); g.lineTo(xa + L, ya);
      g.moveTo(xb - L, ya); g.lineTo(xb, ya); g.lineTo(xb, ya + L);
      g.moveTo(xa, yb - L); g.lineTo(xa, yb); g.lineTo(xa + L, yb);
      g.moveTo(xb - L, yb); g.lineTo(xb, yb); g.lineTo(xb, yb - L);
      g.stroke();
      g.globalAlpha = 1;
    };
    mark(1170, 1420, s2);
    mark(1460, 1720, s3);
    if (t < s1) mark(780, 880, s0 + 0.25);
  }, { radius: 50, bezel: 14, glow: 0.2 });
  g.restore();
  g.save();
  g.globalAlpha = kIn;
  g.fillStyle = "#9a999f";
  g.font = `700 24px ${FONT}`;
  g.textAlign = "center";
  g.letterSpacing = "4px";
  g.fillText("REAL YORU SCREENS · DEMO ACCOUNTS", 540, UIPH.y + UIPH.h + 40);
  g.restore();
}

// ------------------------------------------------------------------ scene: the logo (15.6–17.0)
function wordmark(cx, cy, w, alpha = 1) {
  const im = IMG.wordmark;
  const h = (w * im.height) / im.width;
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  g.restore();
}
function logoScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#000");
  const [a, b] = C.logoLines;
  const k = easeIn(ramp(t, a, b));
  const fade = 1 - ramp(t, b, b + 0.4);
  if (fade > 0) {
    g.save();
    g.globalAlpha = fade;
    radialLines(g, { cx: 540, cy: 900, n: 120, rIn: [lerp(1100, 160, k), lerp(1300, 260, k)], width: [2, 16], color: CRIMSON, seed: 91 });
    g.restore();
  }
  const f = 1 - ramp(t, C.logoIn, C.logoIn + 0.15);
  const li = expoOut(ramp(t, C.logoIn, C.logoIn + 0.6));
  if (li > 0) {
    wordmark(540, 900, lerp(860, 720, li), clamp(li * 1.4));
    const lw = easeOut(ramp(t, C.logoIn + 0.2, C.logoIn + 0.7)) * 520;
    g.fillStyle = CRIMSON;
    g.fillRect(540 - lw / 2, 1010, lw, 5);
  }
  if (f > 0 && t >= C.logoIn) { g.fillStyle = `rgba(255,255,255,${f * 0.85})`; g.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ scene: the final panel (17.0–20.0)
const CENTER = [[170, 130], [910, 160], [900, 1660], [180, 1640]];
const GLIMPSE = [
  { poly: [[20, 60], [360, 40], [350, 420], [30, 440]], p: 0 },
  { poly: [[730, 80], [1060, 60], [1060, 450], [740, 430]], p: 4 },
  { poly: [[10, 700], [250, 690], [250, 1060], [20, 1070]], p: 1 },
  { poly: [[840, 720], [1070, 700], [1070, 1080], [850, 1090]], p: 5 },
  { poly: [[30, 1420], [360, 1400], [360, 1820], [40, 1840]], p: 2 },
  { poly: [[720, 1400], [1060, 1420], [1050, 1850], [730, 1830]], p: 3 },
];
function finalScene(t) {
  const [a, b] = C.final;
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#0a0a0b");
  const zk = easeInOut(ramp(t, a, a + 2.3));
  const z = lerp(1.9, 1.0, zk);
  g.save();
  g.translate(540, lerp(700, 760, zk));
  g.scale(z, z);
  g.translate(-540, -lerp(560, 760, zk));
  // glimpses of other people around
  GLIMPSE.forEach((gp, i) => {
    const k = easeOut(ramp(t, a + 0.15 + i * 0.12, a + 0.5 + i * 0.12));
    if (k <= 0) return;
    g.save();
    g.globalAlpha = k;
    polyPath(g, gp.poly);
    g.save();
    g.clip();
    const xs = Math.min(...gp.poly.map((p) => p[0])), ys = Math.min(...gp.poly.map((p) => p[1]));
    fill(g, `M${xs} ${ys} h400 v460 h-400 Z`, PAPER);
    at(xs - 20, ys + 10, 0.6, () => head(g, PEOPLE[gp.p]));
    g.restore();
    polyPath(g, gp.poly);
    g.strokeStyle = PAPER;
    g.lineWidth = 6;
    g.stroke();
    g.restore();
  });
  // the protagonist's panel
  polyPath(g, CENTER);
  g.save();
  g.clip();
  fill(g, `M0 0 H${W} V${H} H0 Z`, PAPER);
  radialLines(g, { cx: 540, cy: 560, n: 150, rIn: [380, 520], width: [2, 14], color: INK, seed: 33, alpha: 0.9 });
  tone(g, `M0 0 H${W} V${H} H0 Z`, (x, y) => clamp((y - 900) / 900) * 0.5, { cell: 12, box: [0, 0, W, H] });
  at(372, 380, 0.55, () => standing(g, { headphones: true, eyes: "open", mouth: "soft", brows: "calm", rim: 1 }));
  g.restore();
  polyPath(g, CENTER);
  g.strokeStyle = PAPER;
  g.lineWidth = 10;
  g.stroke();
  // crimson lines drawing a frame around the panel
  const fr = easeInOut(ramp(t, a + 0.3, a + 1.4));
  if (fr > 0) {
    g.strokeStyle = CRIMSON;
    g.lineWidth = 6;
    const pts = [[150, 110], [930, 140], [920, 1680], [160, 1660], [150, 110]];
    let len = 0;
    const seg = [];
    for (let i = 0; i < 4; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); len += l; }
    let rem = fr * len;
    g.beginPath();
    g.moveTo(...pts[0]);
    for (let i = 0; i < 4 && rem > 0; i++) {
      const u = Math.min(1, rem / seg[i]);
      g.lineTo(lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u));
      rem -= seg[i];
    }
    g.stroke();
  }
  g.restore();
}

// ------------------------------------------------------------------ scene: the question, the end card
function questionScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#050505");
  const out = 1 - ramp(t, C.question[1] - 0.15, C.question[1]);
  const lines = ["What do you wish", "more people", "understood", "about you?"];
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 100px ${FONT}`;
  lines.forEach((l, i) => {
    const k = easeOut(ramp(t, C.questionIn + i * 0.09, C.questionIn + 0.35 + i * 0.09));
    g.globalAlpha = k * out;
    g.fillStyle = l === "understood" ? "#fff" : "#f1efeb";
    g.fillText(l, 540, 760 + i * 124 + (1 - k) * 24);
  });
  const lk = easeOut(ramp(t, C.questionIn + 0.4, C.questionIn + 0.9)) * out;
  g.globalAlpha = 1;
  g.fillStyle = CRIMSON;
  g.fillRect(540 - 90 * lk, 660, 180 * lk, 5);
  g.restore();
}
function endScene(t) {
  fill(g, `M0 0 H${W} V${H} H0 Z`, "#000");
  const k = expoOut(ramp(t, C.end[0] + 0.05, C.end[0] + 0.6));
  wordmark(540, 860, lerp(700, 660, k), k);
  const lw = easeOut(ramp(t, C.end[0] + 0.3, C.end[0] + 0.8)) * 380;
  g.fillStyle = CRIMSON;
  g.fillRect(540 - lw / 2, 970, lw, 5);
  const tk = easeOut(ramp(t, C.tagline, C.tagline + 0.5));
  g.save();
  g.globalAlpha = tk;
  g.fillStyle = "#f1efeb";
  g.font = `800 50px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "8px";
  g.fillText("YOUR PEOPLE. YOUR STORY.", 540, 1060 + (1 - tk) * 14);
  g.restore();
}

// ------------------------------------------------------------------ frame
function renderFrame(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.filter = "none";
  g.letterSpacing = "0px";
  let vig = 0.45;
  if (t < C.eyeIn[1]) crowd(t);
  if (t >= C.eyeIn[0] && t < C.hook[1]) {
    g.save();
    g.globalAlpha = easeInOut(ramp(t, ...C.eyeIn));
    eyeCU(t);
    g.restore();
  }
  if (within(t, C.scroll)) scrollScene(t);
  if (within(t, [C.interests[0], C.typing[0]])) interests(t);
  if (within(t, C.typing)) typingScene(t);
  if (within(t, C.group)) groupScene(t);
  if (within(t, C.send)) sendScene(t);
  if (within(t, C.alone)) { aloneScene(t); vig = 0.6; }
  if (within(t, [C.close[0], C.impact])) { closeScene(t); vig = 0.6; }
  // impact frames
  if (within(t, [C.impact, C.impact + 1 / 30])) { fill(g, `M0 0 H${W} V${H} H0 Z`, "#fff"); vig = 0; }
  else if (within(t, [C.impact + 1 / 30, C.impact + 2 / 30])) { closeScene(t, true); vig = 0; }
  else if (within(t, [C.impact + 2 / 30, C.shatter[0] + 0.05])) {
    fill(g, `M0 0 H${W} V${H} H0 Z`, CRIMSON);
    brushStroke(g, { pts: [[-60, 1420], [400, 1060], [700, 820], [1140, 460]], width: 90, seed: 7, color: INK, progress: 1 });
    vig = 0;
  } else if (within(t, [C.shatter[0] + 0.05, C.lookUp[0]])) shatter(t, () => peopleGrid(t));
  if (within(t, C.lookUp)) lookUp(t);
  if (within(t, C.share)) shareScene(t);
  if (within(t, C.ui)) uiScene(t);
  if (within(t, C.logo)) logoScene(t);
  if (within(t, C.final)) finalScene(t);
  if (within(t, C.question)) { questionScene(t); vig = 0.2; }
  if (t >= C.end[0]) { endScene(t); vig = 0.2; }

  // captions
  caption(t, [{ text: "Have you ever felt…", at: C.line1 }], C.hook[1] - 0.05, { y: 1290, size: 76 });
  caption(t, [{ text: "…invisible", at: C.line2[0] }, { text: "in a world where", at: C.line2[1] }, { text: "everyone is connected?", at: C.line2[2] }], C.hook[1] - 0.05, { y: 1490, size: 68, plate: 0.5 });
  caption(t, [{ text: "You have things you love.", at: C.loved[0] }], C.loved[1], { y: 1330 });
  caption(t, [{ text: "Things you wish", at: C.understood[0] }, { text: "someone understood.", at: C.understood[0] + 0.12 }], C.understood[1], { y: 520 });
  caption(t, [{ text: "But sometimes…", at: C.sometimes[0] }], C.sometimes[1], { y: 1330 });
  caption(t, [{ text: "…it feels like", at: C.nobody[0] }, { text: "nobody is listening.", at: C.nobody[0] + 0.14 }], C.nobody[1], { y: 1330 });
  caption(t, [{ text: "You were never boring.", at: C.boring[0] }], C.boring[1], { y: t < C.ui[0] ? 1345 : 1490, size: 74 });
  caption(t, [{ text: "You were looking", at: C.yourPeople[0] }, { text: "for your people.", at: C.yourPeople[0] + 0.14 }], C.yourPeople[1], { y: 1490, size: 74 });
  caption(t, [{ text: "Someone out there", at: C.someone[0] }, { text: "loves the things you love.", at: C.someone[0] + 0.16 }], C.someone[1], { y: 1330, size: 64 });
  finish(t, { vignette: vig });
}

function renderCover() {
  renderFrame(11.95);
  g.save();
  const band = g.createLinearGradient(0, 1180, 0, 1760);
  band.addColorStop(0, "rgba(5,5,6,0)");
  band.addColorStop(0.2, "rgba(5,5,6,0.92)");
  band.addColorStop(1, "rgba(5,5,6,0.96)");
  g.fillStyle = band;
  g.fillRect(0, 1180, W, 740);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.font = `900 92px ${FONT}`;
  g.fillText("YOU WERE NEVER A", 540, 1390);
  g.fillText("BACKGROUND", 540, 1500);
  g.fillStyle = CRIMSON;
  g.fillText("CHARACTER.", 540, 1610);
  g.restore();
}

window.renderFrame = renderFrame;
window.renderCover = renderCover;
window.renderSheet = () => sheet(g);
window.ready = true;
