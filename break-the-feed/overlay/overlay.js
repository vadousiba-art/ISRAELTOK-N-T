// Caption overlay for the phone section of BREAK THE FEED, drawn on a
// transparent canvas and composited onto the finished film with ffmpeg.
//
// The highlight brackets are placed with the exact camera and phone pose the
// film was rendered with (copied from main.js), so they sit on the real UI.

import * as THREE from "three";
import { clamp, lerp, ramp, easeOut, easeIn, easeInOut } from "../manga.js";

const W = 1080;
const H = 1920;
const C = await (await fetch("/cues.json")).json();
const CRIMSON = "#e5102f";
const JP = '"IPAGothic", "WenQuanYi Zen Hei", sans-serif';
await Promise.all([document.fonts.load('900 56px "Inter"'), document.fonts.load('600 30px "Inter"'), document.fonts.load(`700 24px ${JP}`)]);

// ---------------------------------------------------------------- pose (from main.js)
const FRONT = 0.62 / 2 + 0.12;
const CONT = { w: 5.9, h: 5.9 * (16 / 9) };
const CONT_Y = -(11.4 - CONT.h) / 2 + 0.05;
const phone = new THREE.Object3D();
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 400);
let zoom = 1;
function pose(t) {
  const k = easeInOut(ramp(t, C.fold[0], C.push[0]));
  const pk = easeInOut(ramp(t, C.push[0], C.push[1]));
  const ang = lerp(lerp(0.62, -0.2, k), 0, pk);
  const settle = 1 - pk;
  const dist = lerp(lerp(39, 34, k), 19.57 + FRONT, pk);
  const camY = lerp(lerp(2.2, 0.8, k), CONT_Y, pk);
  phone.position.set(0, Math.sin(t * 1.3) * 0.08 * settle, 0);
  phone.rotation.set(0.04 * settle, Math.sin(t * 0.7) * 0.05 * settle, 0);
  phone.updateMatrixWorld(true);
  cam.position.set(Math.sin(ang) * dist, camY, Math.cos(ang) * dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, lerp(0, CONT_Y, pk), 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  zoom = 1 + (t >= C.reveal ? Math.exp(-(t - C.reveal) * 10) : 0) * 0.015;
}
// Screenshot pixel (540x960 space) -> output pixel.
function project(px, py) {
  const v = new THREE.Vector3((px / 540 - 0.5) * CONT.w, CONT_Y + (0.5 - py / 960) * CONT.h, FRONT + 0.004);
  v.applyMatrix4(phone.matrixWorld).project(cam);
  const x = (v.x * 0.5 + 0.5) * W;
  const y = (0.5 - v.y * 0.5) * H;
  return [W / 2 + (x - W / 2) * zoom, H / 2 + (y - H / 2) * zoom];
}

// ---------------------------------------------------------------- captions
// Each caption describes only what is on the phone screen at that moment.
const CAPS = [
  { n: "01", label: "HOME", jp: "ホーム", head: "WATCH IT TOGETHER.", sub: "Anime nights  ·  Stories  ·  Tonight's picks", in: 7.62, out: C.swipes[0], rect: [16, 112, 524, 238], hi: [7.8, C.swipes[0] - 0.02] },
  { n: "02", label: "FEED", jp: "フィード", head: "SETTLE THE DEBATE.", sub: "Polls  ·  Fan art  ·  Honest ratings", in: C.swipes[0] + 0.24, out: C.swipes[1], rect: [16, 142, 524, 662], hi: [8.82, C.swipes[1] - 0.02] },
  { n: "03", label: "PROFILE", jp: "プロフィール", head: "LEVEL UP NIGHTLY.", sub: "Streaks  ·  XP  ·  What you're watching", in: C.swipes[1] + 0.24, out: C.push[0] + 0.06, rect: [36, 684, 506, 748], hi: [9.64, C.push[0] + 0.04] },
];
const TOP = 186; // kicker baseline area; the phone never rises above ~340 px here

const cv = document.getElementById("ov");
const g = cv.getContext("2d");

function caption(c, t) {
  const kIn = clamp((t - c.in) / 0.22);
  const kOut = clamp((t - c.out) / 0.14);
  if (kIn <= 0 || kOut >= 1) return;
  // Exits slide left with the app's swipe; the last one lifts away as the camera pushes in.
  const last = c === CAPS[CAPS.length - 1];
  const ox = last ? 0 : -140 * easeIn(kOut);
  const oy = last ? -40 * easeIn(kOut) : 0;
  const fade = 1 - kOut;
  const enter = easeOut(kIn);
  g.save();
  g.translate(ox + (1 - enter) * 70, oy);
  g.globalAlpha = fade;
  g.textBaseline = "middle";

  // Kicker: crimson number tag, label, Japanese.
  const kk = easeOut(clamp((t - c.in) / 0.12));
  g.globalAlpha = fade * kk;
  g.font = '800 24px "Inter"';
  g.letterSpacing = "3px";
  const tagW = g.measureText(c.n).width + 22;
  const x0 = W / 2 - 420;
  g.fillStyle = CRIMSON;
  g.fillRect(x0, TOP - 18, tagW, 36);
  g.fillStyle = "#fff";
  g.fillText(c.n, x0 + 11, TOP + 1);
  g.fillStyle = "#f2f2f2";
  g.fillText(c.label, x0 + tagW + 16, TOP + 1);
  const lw = g.measureText(c.label).width;
  g.font = `700 22px ${JP}`;
  g.letterSpacing = "2px";
  g.fillStyle = "rgba(242,242,242,0.55)";
  g.fillText(c.jp, x0 + tagW + 16 + lw + 14, TOP + 1);

  // Headline: wiped on behind a crimson bar.
  const hk = easeInOut(clamp((t - c.in - 0.05) / 0.2));
  g.font = '900 58px "Inter"';
  g.letterSpacing = "-1px";
  const hw = g.measureText(c.head).width;
  const hy = TOP + 62;
  g.save();
  g.beginPath();
  g.rect(x0 - 4, hy - 40, (hw + 12) * hk, 84);
  g.clip();
  g.globalAlpha = fade;
  g.fillStyle = "#ffffff";
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 18;
  g.fillText(c.head, x0, hy + 2);
  g.restore();
  if (hk > 0 && hk < 1) {
    g.globalAlpha = fade;
    g.fillStyle = CRIMSON;
    g.fillRect(x0 - 4 + (hw + 12) * hk - 5, hy - 36, 6, 76);
  }

  // Sub-line.
  const sk = easeOut(clamp((t - c.in - 0.16) / 0.16));
  g.globalAlpha = fade * sk;
  g.font = '600 29px "Inter"';
  g.letterSpacing = "1px";
  g.fillStyle = "rgba(235,235,235,0.88)";
  g.fillText(c.sub, x0 + (1 - sk) * 24, hy + 58);
  g.restore();
}

// Crimson corner brackets that follow the UI element in perspective.
function brackets(c, t) {
  const [a, b] = c.hi;
  const k = clamp((t - a) / 0.16);
  const out = clamp((t - b) / 0.08);
  if (k <= 0 || out >= 1 || t < a) return;
  const [x0, y0, x1, y1] = c.rect;
  const pad = 6;
  const P = [project(x0 - pad, y0 - pad), project(x1 + pad, y0 - pad), project(x1 + pad, y1 + pad), project(x0 - pad, y1 + pad)];
  const cx = P.reduce((s, p) => s + p[0], 0) / 4;
  const cy = P.reduce((s, p) => s + p[1], 0) / 4;
  const sc = lerp(1.12, 1, easeOut(k));
  const Q = P.map(([x, y]) => [cx + (x - cx) * sc, cy + (y - cy) * sc]);
  g.save();
  g.globalAlpha = easeOut(k) * (1 - out);
  g.strokeStyle = CRIMSON;
  g.lineWidth = 4;
  g.lineCap = "square";
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = 6;
  const L = 30;
  for (let i = 0; i < 4; i++) {
    const p = Q[i];
    const nx = Q[(i + 1) % 4];
    const pv = Q[(i + 3) % 4];
    const d1 = Math.hypot(nx[0] - p[0], nx[1] - p[1]);
    const d2 = Math.hypot(pv[0] - p[0], pv[1] - p[1]);
    g.beginPath();
    g.moveTo(p[0] + ((nx[0] - p[0]) / d1) * L, p[1] + ((nx[1] - p[1]) / d1) * L);
    g.lineTo(p[0], p[1]);
    g.lineTo(p[0] + ((pv[0] - p[0]) / d2) * L, p[1] + ((pv[1] - p[1]) / d2) * L);
    g.stroke();
  }
  g.restore();
}

window.drawOverlay = (t) => {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  pose(t);
  for (const c of CAPS) {
    brackets(c, t);
    caption(c, t);
  }
  return true;
};
window.ready = true;
