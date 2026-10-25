// YORU film 03 — YOUR WORLD. YOUR RULES.
// Deterministic composition: window.renderFrame(t) draws the frame at t.
// Layers, back to front: 2D (bg) → 3D phones (real captured screens) → 2D (fg);
// one final pass applies camera punch, controlled chromatic split, flashes, grain.

import * as THREE from "three";
import * as M from "./manga.js";

const { INK, PAPER, CRIMSON, rng, clamp, lerp, ramp, easeOut, easeIn, easeInOut, expoOut } = M;
const W = 1080;
const H = 1920;
const C = await (await fetch("/film/cues.json")).json();
const FPS = C.fps;
const BEAT = 60 / C.bpm;
const SCALE = Number(new URLSearchParams(location.search).get("scale") || 1);
const JP = '"IPAGothic", "WenQuanYi Zen Hei", sans-serif';
await Promise.all([
  document.fonts.load('900 84px "Inter"'),
  document.fonts.load('700 46px "Inter"'),
  document.fonts.load('600 26px "Inter"'),
  document.fonts.load(`700 30px ${JP}`),
]);
const shake = (t, f, s) => Math.sin(t * f + s) * 0.5 + Math.sin(t * f * 2.31 + s * 1.7) * 0.3 + Math.sin(t * f * 4.77 + s * 3.1) * 0.2;
const kick = (t, t0, amp, decay = 14) => (t >= t0 ? amp * Math.exp(-(t - t0) * decay) : 0);
const punch = (t, t0, amt, dur = 0.22) => (t >= t0 ? 1 + amt * (1 - easeOut(clamp((t - t0) / dur))) : 1);

// ---------------------------------------------------------------- assets (all captured from the real app)
const loadImg = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(src));
    i.src = src;
  });
const S = (n) => `/assets/screens/${n}.png`;
const pad3 = (i) => String(i).padStart(3, "0");
const IMG = {};
const names = ["profile-kuro", "profile-rei", "profile-mio", "profile-gremlin", "recolor-before-kuro", "recolor-after-kuro", "theme-before-mio", "theme-after-mio"];
await Promise.all([
  ...names.map(async (n) => (IMG[n] = await loadImg(S(n)))),
  ...Array.from({ length: 27 }, async (_, i) => (IMG[`edit${i}`] = await loadImg(`/assets/sequences/edit-rei/${pad3(i)}.png`))),
  ...Array.from({ length: 21 }, async (_, i) => (IMG[`hue${i}`] = await loadImg(`/assets/sequences/hue-kuro/${pad3(i)}.png`))),
  (async () => (IMG.logo = await loadImg("/assets/brand/wordmark.png")))(),
]);
const LOGO_AR = IMG.logo.height / IMG.logo.width;
const TEX = {};
function tex(name) {
  if (!TEX[name]) {
    const t = new THREE.Texture(IMG[name]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    TEX[name] = t;
  }
  return TEX[name];
}
// Slider knob positions measured in each captured frame (1080x2338 screenshot px).
const KNOB_X = [947, 947, 928, 909, 890, 871, 853, 834, 815, 796, 777, 758, 736, 718, 699, 680, 661, 642, 623, 604, 599];
const KNOB_Y = 694;

// ---------------------------------------------------------------- 2D layers
function layer() {
  const cv = document.createElement("canvas");
  cv.width = Math.round(W * SCALE);
  cv.height = Math.round(H * SCALE);
  return { cv, g: cv.getContext("2d", { willReadFrequently: true }) };
}
const BG = layer();
const FG = layer();
const begin = (L) => {
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.clearRect(0, 0, L.cv.width, L.cv.height);
  L.g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
};

// ---------------------------------------------------------------- renderer + final pass
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("gl"), antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(SCALE);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NoToneMapping;
const rt3d = new THREE.WebGLRenderTarget(Math.round(W * SCALE), Math.round(H * SCALE), { type: THREE.HalfFloatType, samples: 4 });
const texOf = (cv) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
};
const bgTex = texOf(BG.cv);
const fgTex = texOf(FG.cv);
const finalMat = new THREE.ShaderMaterial({
  uniforms: {
    tBG: { value: bgTex },
    tFG: { value: fgTex },
    t3D: { value: rt3d.texture },
    uUse3D: { value: 0 },
    uZoom: { value: 1 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRot: { value: 0 },
    uOff: { value: new THREE.Vector2() },
    uShift: { value: 0 },
    uInvert: { value: 0 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uGrain: { value: 0 },
    uSeed: { value: 0 },
    uFade: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tBG, tFG, t3D;
    uniform float uUse3D, uZoom, uRot, uShift, uInvert, uFlash, uGrain, uSeed, uFade;
    uniform vec2 uCenter, uOff;
    uniform vec3 uFlashCol;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed * 7.13) * 43758.5453); }
    vec3 knee(vec3 x){ vec3 k = vec3(0.8); return mix(x, k + (1.0 - exp(-(x - k) * 5.0)) * 0.2, step(k, x)); }
    vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    vec3 comp(vec2 uv){
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      vec3 col = texture2D(tBG, uv).rgb;
      if (uUse3D > 0.5) {
        vec4 s = texture2D(t3D, uv);
        col = mix(col, toSRGB(knee(s.rgb / max(s.a, 1e-4))), clamp(s.a, 0.0, 1.0));
      }
      vec4 f = texture2D(tFG, uv);
      return mix(col, f.rgb, f.a);
    }
    void main(){
      const vec2 asp = vec2(1080.0, 1920.0);
      vec2 p = (vUv - uCenter) * asp;
      float c = cos(uRot), s = sin(uRot);
      p = mat2(c, s, -s, c) * p / uZoom;
      vec2 uv = p / asp + uCenter - uOff;
      vec2 d = (uv - 0.5) * uShift;
      vec3 col = vec3(comp(uv + d).r, comp(uv).g, comp(uv - d).b);
      col = mix(col, 1.0 - col, uInvert);
      col += (h(vUv * asp) - 0.5) * uGrain;
      col = mix(col, uFlashCol, uFlash);
      gl_FragColor = vec4(clamp(col * uFade, 0.0, 1.0), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const finalScene = new THREE.Scene();
const finalCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
finalScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMat));
const FU = finalMat.uniforms;

// ================================================================ 3D studio + phones
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 500);
scene.add(camera);
{
  const env = new THREE.Scene();
  env.background = new THREE.Color(0, 0, 0);
  const box = (w, h, col, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(7, 26, new THREE.Color(7, 7, 7), [-15, 3, 7]);
  box(5, 22, new THREE.Color(3.5, 3.5, 3.6), [15, 0, 5]);
  box(30, 2.2, new THREE.Color(2.2, 2.2, 2.2), [0, 16, 3]);
  box(18, 8, new THREE.Color(0.9, 0.03, 0.1), [3, -4, -16]);
  box(40, 30, new THREE.Color(0.04, 0.04, 0.045), [0, 0, 22]);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
}
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
// Proportions follow the captured screens: 1080x2338 (19.5:9) plus a status strip.
const PH = { w: 6.4, h: 13.75, d: 0.58, r: 1.05 };
const FRONT = PH.d / 2 + 0.11;
const CONT = { w: 5.9, h: 5.9 * (2338 / 1080) };
const DISP = { w: 5.9, h: CONT.h + 0.45 };
const CONT_Y = -(DISP.h - CONT.h) / 2;
const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(PH.w - 0.22, PH.h - 0.22, PH.r - 0.11), { depth: PH.d, bevelEnabled: true, bevelThickness: 0.11, bevelSize: 0.11, bevelSegments: 8, curveSegments: 32 });
bodyGeo.translate(0, 0, -PH.d / 2);
const faceGeo = new THREE.ShapeGeometry(roundedRect(PH.w - 0.1, PH.h - 0.1, PH.r - 0.05), 32);

const SCREEN_FRAG = /* glsl */ `
  uniform sampler2D uA, uB;
  uniform float uWipe, uManga, uBorder, uBright;
  uniform vec3 uWipeCol;
  uniform vec2 uDisp, uCont, uTexel; uniform float uContY;
  varying vec2 vUv;
  vec3 ui(vec2 uv){ return uv.y < uWipe ? texture2D(uB, uv).rgb : texture2D(uA, uv).rgb; }
  float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 manga(vec2 uv){
    vec3 c = ui(uv);
    float l = lum(ui(uv - vec2(uTexel.x, 0.0))), r = lum(ui(uv + vec2(uTexel.x, 0.0)));
    float b = lum(ui(uv - vec2(0.0, uTexel.y))), t = lum(ui(uv + vec2(0.0, uTexel.y)));
    float edge = length(vec2(r - l, t - b));
    float ink = smoothstep(0.08, 0.9, lum(c));
    vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (uv / uTexel / 4.5);
    float d = length(fract(g) - 0.5);
    float dots = 1.0 - smoothstep(-0.04, 0.04, d - sqrt(ink) * 0.62);
    float tone = ink > 0.82 ? 1.0 : (ink < 0.1 ? 0.0 : dots);
    vec3 m = vec3(0.957, 0.949, 0.933) * (1.0 - tone) + vec3(0.04) * tone;
    m = mix(m, vec3(0.04), smoothstep(0.12, 0.3, edge));
    float red = c.r - max(c.g, c.b);
    return mix(m, vec3(0.9, 0.06, 0.18), smoothstep(0.16, 0.3, red));
  }
  void main(){
    vec2 p = (vUv - 0.5) * uDisp;
    vec2 q = abs(p) - (uDisp * 0.5 - 0.72);
    if (length(max(q, 0.0)) - 0.72 > 0.0) discard;
    float cy = (p.y - uContY) / uCont.y + 0.5;
    vec3 col = vec3(0.0);
    if (cy <= 1.0) {
      vec2 uv = vec2(vUv.x, cy);
      col = ui(uv) * uBright;
      float line = smoothstep(0.006, 0.0, abs(uv.y - uWipe)) * step(0.001, uWipe) * step(uWipe, 0.999);
      col = mix(col, uWipeCol, line);
      if (uManga > 0.0) col = mix(col, manga(uv), uManga);
    } else {
      float hole = length(p - vec2(0.0, uDisp.y * 0.5 - 0.24));
      col += vec3(0.05) * smoothstep(0.14, 0.12, hole) * smoothstep(0.07, 0.1, hole);
    }
    // Manga panel border (used when the phones turn into panels).
    vec2 e = uDisp * 0.5 - abs(p);
    col = mix(col, vec3(0.02), uBorder * (1.0 - smoothstep(0.16, 0.2, min(e.x, e.y))));
    gl_FragColor = vec4(col, 1.0);
  }`;

function makePhone() {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x3c3c42, metalness: 1, roughness: 0.22, envMapIntensity: 2.2 });
  const body = new THREE.Mesh(bodyGeo, frameMat);
  const outline = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xf4f2ee, side: THREE.BackSide }));
  outline.scale.set(1.035, 1.018, 1.25);
  outline.visible = false;
  const face = new THREE.Mesh(faceGeo, new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
  face.position.z = FRONT + 0.002;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: null },
      uB: { value: null },
      uWipe: { value: 0 },
      uWipeCol: { value: new THREE.Color(1, 1, 1) },
      uManga: { value: 0 },
      uBorder: { value: 0 },
      uBright: { value: 1 },
      uDisp: { value: new THREE.Vector2(DISP.w, DISP.h) },
      uCont: { value: new THREE.Vector2(CONT.w, CONT.h) },
      uContY: { value: CONT_Y },
      uTexel: { value: new THREE.Vector2(1 / 1080, 1 / 2338) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: SCREEN_FRAG,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(DISP.w, DISP.h), mat);
  screen.position.z = FRONT + 0.004;
  const glass = new THREE.Mesh(
    faceGeo,
    new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.03 }),
  );
  glass.position.z = FRONT + 0.008;
  const buttons = [
    [3.0, 1.6],
    [1.0, 1.0],
  ].map(([y, h]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.26), frameMat);
    b.position.set(PH.w / 2 + 0.02, y, 0);
    return b;
  });
  g.add(body, outline, face, screen, glass, ...buttons);
  scene.add(g);
  g.visible = false;
  const setScreen = (a, b = a, wipe = 0) => {
    mat.uniforms.uA.value = tex(a);
    mat.uniforms.uB.value = tex(b);
    mat.uniforms.uWipe.value = wipe;
  };
  const panelMode = (k) => {
    // k: 0 = phone, 1 = flat manga panel.
    body.visible = k < 1;
    face.visible = k < 1;
    glass.visible = k < 0.5;
    buttons.forEach((b) => (b.visible = k < 1));
    outline.visible = k > 0.3 && k < 1;
    body.material = k > 0.3 ? toonBody : frameMat;
    mat.uniforms.uManga.value = clamp(k * 1.4);
    mat.uniforms.uBorder.value = clamp((k - 0.5) * 2);
  };
  return { g, mat, screen, setScreen, panelMode, frameMat };
}
const toonBody = new THREE.MeshBasicMaterial({ color: 0x050505 });
const hero = makePhone();
const lineup = [makePhone(), makePhone(), makePhone(), makePhone()];
const LOOK_KEYS = ["kuro", "rei", "mio", "gremlin"];

// Screenshot pixel (1080x2338) on a phone -> output pixel, with the final-pass zoom.
const _v = new THREE.Vector3();
function project(phone, px, py, zoom = 1) {
  _v.set((px / 1080 - 0.5) * CONT.w, CONT_Y + (0.5 - py / 2338) * CONT.h, FRONT + 0.004);
  phone.g.updateMatrixWorld(true);
  _v.applyMatrix4(phone.g.matrixWorld).project(camera);
  const x = (_v.x * 0.5 + 0.5) * W;
  const y = (0.5 - _v.y * 0.5) * H;
  return [W / 2 + (x - W / 2) * zoom, H / 2 + (y - H / 2) * zoom];
}
function aimCamera({ ang = 0, dist = 34.7, lift = 1.74, tilt = 0, fov = 30 }) {
  camera.fov = fov;
  camera.position.set(Math.sin(ang) * dist, lift + tilt, Math.cos(ang) * dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, lift, 0);
  camera.updateMatrixWorld(true);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

// ================================================================ 2D pieces
const studioBG = (() => {
  const L = layer();
  const g = L.g;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const grd = g.createRadialGradient(W / 2, 820, 60, W / 2, 1000, 1300);
  grd.addColorStop(0, "#1c1c1e");
  grd.addColorStop(0.5, "#0b0b0c");
  grd.addColorStop(1, "#000");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  return L.cv;
})();
function drawStudio(g) {
  g.drawImage(studioBG, 0, 0, W, H);
}

// Titles live in the band above the phone so they never cover the interface.
function title(g, text, jp, t, t0, t1, { y = 214, color = "#ffffff", sub = null, subColor = null, size = 84, exit = "up" } = {}) {
  const kIn = clamp((t - t0) / 0.22);
  const kOut = clamp((t - (t1 - 0.14)) / 0.14);
  if (t < t0 || t >= t1) return;
  const x0 = 84;
  g.save();
  g.textBaseline = "middle";
  g.font = `900 ${size}px "Inter"`;
  g.letterSpacing = "-2px";
  const w = g.measureText(text).width;
  const oy = exit === "up" ? -30 * easeIn(kOut) : 0;
  const ox = exit === "left" ? -160 * easeIn(kOut) : 0;
  g.globalAlpha = 1 - kOut;
  // Wipe on behind a crimson bar.
  const hk = easeInOut(kIn);
  g.save();
  g.beginPath();
  g.rect(x0 - 6 + ox, y - size, (w + 16) * hk, size * 2);
  g.clip();
  g.fillStyle = color;
  g.fillText(text, x0 + ox, y + oy + 4);
  g.restore();
  if (hk > 0 && hk < 1) {
    g.fillStyle = CRIMSON;
    g.fillRect(x0 - 6 + (w + 16) * hk - 6 + ox, y - size * 0.62, 8, size * 1.24);
  }
  const sk = easeOut(clamp((t - t0 - 0.12) / 0.2));
  g.globalAlpha = (1 - kOut) * sk;
  g.font = `700 30px ${JP}`;
  g.letterSpacing = "4px";
  g.fillStyle = subColor || color;
  g.globalAlpha *= 0.7;
  g.fillText(jp, x0 + ox + (1 - sk) * 20, y + size * 0.78 + oy);
  if (sub) {
    g.globalAlpha = (1 - kOut) * sk * 0.82;
    g.font = '600 26px "Inter"';
    g.letterSpacing = "1px";
    const jw = g.measureText(" ").width;
    g.fillText(sub, x0 + ox, y + size * 0.78 + 44 + oy + jw * 0);
  }
  g.restore();
}

function tap(g, x, y, t, t0) {
  const e = t - t0;
  if (e < -0.12 || e > 0.45) return;
  g.save();
  const pre = clamp((e + 0.12) / 0.12);
  g.globalAlpha = (e < 0 ? pre : 1 - clamp(e / 0.45)) * 0.85;
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.strokeStyle = "rgba(255,255,255,0.9)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(x, y, e < 0 ? 26 : 26 - 6 * clamp(e / 0.1), 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (e > 0) {
    g.globalAlpha = (1 - clamp(e / 0.4)) * 0.8;
    g.beginPath();
    g.arc(x, y, 26 + easeOut(clamp(e / 0.4)) * 60, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------- scene 01 pieces
const OUT_W = 620;
const OUT_H = Math.round(OUT_W * (PH.h / PH.w));
const OUT_X = (W - OUT_W) / 2;
const OUT_Y = (H - OUT_H) / 2;
function phoneOutline(g, k, alpha = 1) {
  // Draws the outline progressively (k 0..1) as a dashed path reveal.
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = "#f4f2ee";
  g.lineWidth = 3;
  roundRectPath(g, OUT_X, OUT_Y, OUT_W, OUT_H, 70);
  const P = 2 * (OUT_W + OUT_H);
  g.setLineDash([P * k, P]);
  g.stroke();
  g.setLineDash([]);
  if (k >= 1) {
    g.fillStyle = "#f4f2ee";
    g.beginPath();
    g.arc(W / 2, OUT_Y + 34, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
const QLINES = [
  { text: "WHY SHOULD", at: 0, size: 70 },
  { text: "YOUR SOCIALS", at: 0, size: 70 },
  { text: "LOOK LIKE", at: 1, size: 70 },
  { text: "EVERYONE", at: 2, size: 70 },
  { text: "ELSE'S?", at: 3, size: 96, color: CRIMSON },
];
function question(g, t) {
  const times = [C.q[0], C.q[1], C.q[2], 1.8];
  let y = H / 2 - 230;
  for (const l of QLINES) {
    const t0 = times[l.at];
    const k = easeOut(clamp((t - t0) / 0.16));
    y += l.size * 1.12;
    if (t < t0) continue;
    g.save();
    g.globalAlpha = k;
    g.font = `900 ${l.size}px "Inter"`;
    g.letterSpacing = "-2px";
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = l.color || "#f4f2ee";
    const s = l.size > 80 ? 1 + 0.5 * (1 - easeOut(clamp((t - t0) / 0.12))) : 1;
    g.translate(W / 2, y);
    g.scale(s, s);
    g.fillText(l.text, 0, (1 - k) * 18);
    g.restore();
  }
}
const outlineShards = (() => {
  const r = rng(303);
  const out = [];
  const P = [
    [OUT_X, OUT_Y],
    [OUT_X + OUT_W, OUT_Y],
    [OUT_X + OUT_W, OUT_Y + OUT_H],
    [OUT_X, OUT_Y + OUT_H],
  ];
  for (let s = 0; s < 4; s++) {
    const a = P[s];
    const b = P[(s + 1) % 4];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const u0 = i / n + r() * 0.05;
      const u1 = (i + 1) / n - r() * 0.05;
      out.push({ a: [lerp(a[0], b[0], u0), lerp(a[1], b[1], u0)], b: [lerp(a[0], b[0], u1), lerp(a[1], b[1], u1)], spin: (r() - 0.5) * 4, sp: 0.6 + r() * 1.2 });
    }
  }
  return out;
})();
function impactFrame1(bg, fg, e, variant) {
  const cx = W / 2;
  const cy = H / 2;
  bg.fillStyle = variant === "crimson" ? CRIMSON : PAPER;
  bg.fillRect(0, 0, W, H);
  const boil = Math.floor(e * 15);
  if (variant !== "flash") M.halftone(bg, { cell: 13, angle: 0.6, f: (x, y) => 0.7 * clamp((Math.hypot(x - cx, y - cy) - 560) / 700) });
  M.radialLines(bg, { cx, cy, n: 210, rIn: [330, 560], width: [3, 40], seed: 100 + boil });
  if (variant === "flash") return;
  const k = expoOut(clamp(e / 0.25));
  M.inkSplash(bg, { cx, cy, R: 260 * (0.55 + 0.45 * k), seed: 11, spikes: 24, drops: 56, spatter: 200, k });
  M.starburst(bg, { cx, cy, rin: 100, rout: 220 * (0.6 + 0.4 * k), n: 22, seed: 200 + boil, color: variant === "crimson" ? CRIMSON : PAPER });
  // The phone outline breaks apart and flies outward.
  fg.save();
  fg.lineCap = "square";
  for (const s of outlineShards) {
    const mx = (s.a[0] + s.b[0]) / 2;
    const my = (s.a[1] + s.b[1]) / 2;
    const dx = mx - cx;
    const dy = my - cy;
    const l = Math.hypot(dx, dy);
    const d = (Math.pow(e + 0.04, 0.7) * 700 + e * 120) * s.sp;
    const tx = (dx / l) * d;
    const ty = (dy / l) * d;
    const rot = s.spin * e;
    fg.save();
    fg.translate(mx + tx, my + ty);
    fg.rotate(rot);
    fg.strokeStyle = INK;
    fg.lineWidth = 16;
    fg.beginPath();
    fg.moveTo(s.a[0] - mx, s.a[1] - my);
    fg.lineTo(s.b[0] - mx, s.b[1] - my);
    fg.stroke();
    fg.strokeStyle = PAPER;
    fg.lineWidth = 5;
    fg.stroke();
    fg.restore();
  }
  fg.restore();
}

// ---------------------------------------------------- scene 03 looks
const LOOKS = [
  { key: "kuro", name: "DARK MANGA", jp: "黒インク", sub: "Ice 氷 color  ·  Rain 雨 ambience  ·  Reading status", light: true, pose: { ry: 0.26, rz: 0.02 } },
  { key: "rei", name: "CRIMSON UNDERGROUND", jp: "紅の地下", sub: "YORU red 紅  ·  Stars 星 ambience  ·  Listening status", light: false, pose: { ry: -0.22, rz: -0.02 } },
  { key: "mio", name: "CLEAN MINIMAL", jp: "シンプル", sub: "Light theme  ·  Sakura 桜 color  ·  Watching status", light: true, pose: { ry: 0.0, rz: 0 } },
  { key: "gremlin", name: "INTERNET CHAOS", jp: "カオス", sub: "Gold 金 color  ·  Fireflies 蛍  ·  Roastable  ·  Inside jokes", light: true, pose: { ry: 0.18, rz: -0.05 } },
];
function lookBG(g, i, e) {
  if (i === 0) {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    M.halftone(g, { cell: 14, angle: 0.6, f: (x, y) => 0.5 * clamp((x + y - 1700) / 900) });
    M.enso(g, { cx: W / 2 + 20, cy: 1160, r: 600, width: 120, seed: 31, bristles: 160, progress: expoOut(clamp(e / 0.35)) });
  } else if (i === 1) {
    g.fillStyle = "#050505";
    g.fillRect(0, 0, W, H);
    const grd = g.createRadialGradient(W / 2, 1150, 40, W / 2, 1150, 900);
    grd.addColorStop(0, "rgba(229,16,47,0.42)");
    grd.addColorStop(1, "rgba(229,16,47,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const r = rng(77);
    for (let k = 0; k < 14; k++) {
      const x = r() * W;
      const len = 300 + r() * 900;
      const y = ((r() * H + e * (900 + r() * 900)) % (H + len)) - len;
      g.fillStyle = `rgba(229,16,47,${0.15 + r() * 0.35})`;
      g.fillRect(x, y, 2 + r() * 3, len);
    }
  } else if (i === 2) {
    g.fillStyle = "#f2f0ec";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(0,0,0,0.06)";
    g.lineWidth = 1;
    for (let x = 60; x < W; x += 120) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 60; y < H; y += 120) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
  } else {
    g.fillStyle = "#ffc21f";
    g.fillRect(0, 0, W, H);
    M.halftone(g, { cell: 30, angle: 0.3 + e * 0.2, color: "#ff8f00", f: () => 0.42 });
    const r = rng(91);
    for (let k = 0; k < 9; k++) {
      const x = r() * W;
      const y = 380 + r() * 1500;
      M.starburst(g, { cx: x, cy: y, rin: 34 + r() * 30, rout: 70 + r() * 70, n: 12, seed: 900 + k + Math.floor(e * 7.5), color: k % 3 === 0 ? "#ffffff" : k % 3 === 1 ? INK : CRIMSON });
    }
  }
}
// Transition accents into each look (fg), each with its own rhythm.
function lookIn(fg, i, e) {
  if (i === 0) {
    // Ink swallows the frame, then clears.
    const k = clamp((e + 0.15) / 0.15);
    const k2 = clamp(e / 0.18);
    if (e < 0) M.inkSplash(fg, { cx: W / 2, cy: 1100, R: lerp(80, 2500, easeIn(k)), seed: 41, spikes: 16, drops: 20, spatter: 60, k: 1 });
    else if (k2 < 1) {
      fg.save();
      fg.fillStyle = INK;
      fg.fillRect(0, 0, W, H);
      fg.globalCompositeOperation = "destination-out";
      M.inkSplash(fg, { cx: W / 2, cy: 1100, R: lerp(60, 2600, easeIn(k2)), seed: 42, spikes: 14, drops: 0, spatter: 0, k: 1 });
      fg.restore();
    }
  } else if (i === 1) {
    if (e >= -0.08 && e < 0.12) {
      const k = expoOut(clamp((e + 0.08) / 0.1));
      M.brushStroke(fg, { pts: [[1180, 260], [700, 900], [260, 1500], [-120, 1900]], width: 190, seed: 51, color: CRIMSON, bristles: 110, dry: 0.5, progress: k, alpha: 1 - clamp((e - 0.04) / 0.08) });
    }
  } else if (i === 2) {
    if (e >= -0.1 && e < 0.08) {
      const k = easeInOut(clamp((e + 0.1) / 0.12));
      fg.fillStyle = "#f2f0ec";
      fg.fillRect(W * (1 - k), 0, W * k + 2, H);
      fg.fillStyle = INK;
      fg.fillRect(W * (1 - k) - 6, 0, 6, H);
    }
  } else if (e >= -0.06 && e < 0.1) {
    // Halftone burst + blocks.
    const r = rng(60 + Math.floor((e + 0.06) * 30));
    for (let k = 0; k < 10; k++) {
      fg.fillStyle = k % 2 ? "#ffc21f" : INK;
      fg.fillRect(r() * W, r() * H, 200 + r() * 600, 30 + r() * 120);
    }
  }
}

// ---------------------------------------------------- MAKE IT YOURS grid
const GRID = [
  { key: "kuro", poly: [[40, 330], [548, 310], [530, 1100], [40, 1124]] },
  { key: "rei", poly: [[572, 308], [1040, 290], [1040, 1076], [556, 1098]] },
  { key: "mio", poly: [[40, 1150], [520, 1126], [536, 1880], [40, 1880]] },
  { key: "gremlin", poly: [[546, 1124], [1040, 1102], [1040, 1880], [560, 1880]] },
];
function makeItYours(bg, fg, t) {
  const e = t - C.makeIt[0];
  bg.fillStyle = PAPER;
  bg.fillRect(0, 0, W, H);
  GRID.forEach((p, i) => {
    const t0 = i * (BEAT / 4);
    const k = easeOut(clamp((e - t0) / 0.12));
    if (e < t0) return;
    const c = M.centroid(p.poly);
    const img = IMG[`profile-${p.key}`];
    bg.save();
    bg.translate(c[0], c[1]);
    bg.scale(lerp(1.15, 1, k), lerp(1.15, 1, k));
    bg.translate(-c[0], -c[1]);
    bg.globalAlpha = k;
    M.polyPath(bg, p.poly, 0, 0, 0, 1, [0, 0]);
    bg.save();
    bg.clip();
    const pw = 560;
    const scaleImg = pw / 1080;
    bg.drawImage(img, 0, 150, 1080, 1700, c[0] - pw / 2, c[1] - 0.47 * 1700 * scaleImg, pw, 1700 * scaleImg);
    bg.restore();
    bg.lineWidth = 9;
    bg.strokeStyle = INK;
    bg.stroke();
    bg.restore();
  });
  const bk = clamp((e - 0.5) / 0.14);
  if (bk > 0) {
    fg.save();
    fg.translate(W / 2, 1100);
    fg.rotate(-0.06);
    const bw = W * 1.4 * easeOut(bk);
    fg.fillStyle = INK;
    fg.fillRect(-bw / 2, -100, bw, 200);
    fg.fillStyle = CRIMSON;
    fg.fillRect(-bw / 2, 92, bw, 10);
    fg.globalAlpha = easeOut(clamp((e - 0.56) / 0.14));
    fg.font = '900 112px "Inter"';
    fg.letterSpacing = "-3px";
    fg.textAlign = "center";
    fg.textBaseline = "middle";
    fg.fillStyle = "#ffffff";
    fg.fillText("MAKE IT YOURS.", 0, -6);
    fg.font = `700 30px ${JP}`;
    fg.letterSpacing = "6px";
    fg.fillStyle = "rgba(255,255,255,0.7)";
    fg.fillText("自分らしく", 0, 64);
    fg.restore();
  }
}

// ---------------------------------------------------- lineup placement
const LINE = [
  { x: -5.7, y: 0.5, z: -2.6, ry: 0.42, d: 0.0 },
  { x: -2.0, y: -0.3, z: 0.0, ry: 0.16, d: 0.12 },
  { x: 2.0, y: 0.3, z: -0.7, ry: -0.16, d: 0.24 },
  { x: 5.7, y: -0.5, z: -2.6, ry: -0.42, d: 0.36 },
];

// ================================================================ frame
window.renderFrame = (t) => {
  const f = Math.round(t * FPS);
  begin(BG);
  begin(FG);
  const bg = BG.g;
  const fg = FG.g;
  let use3D = false;
  let zoom = 1;
  let center = [0.5, 0.5];
  let rot = 0;
  let off = [0, 0];
  let shift = 0;
  let invert = 0;
  let flash = 0;
  let flashCol = [1, 1, 1];
  let grain = 0;
  let fade = 1;
  hero.g.visible = false;
  lineup.forEach((p) => (p.g.visible = false));

  // ---------------------------------------------------- 01 the question
  if (t < C.inkReveal[1]) {
    if (t < C.impact1) {
      bg.fillStyle = "#000";
      bg.fillRect(0, 0, W, H);
      phoneOutline(bg, easeInOut(ramp(t, C.outline[0], C.outline[1])));
      question(bg, t);
      zoom = punch(t, 1.8, 0.03, 0.18);
    } else {
      const e = t - C.impact1;
      const fi = f - Math.round(C.impact1 * FPS);
      if (t < C.inkReveal[0]) {
        impactFrame1(bg, fg, e, fi === 0 ? "flash" : fi === 2 ? "crimson" : "normal");
        invert = fi === 1 ? 1 : 0;
        zoom = punch(t, C.impact1 + 2 / FPS, 0.14, 0.3);
        const sk = kick(t, C.impact1, 14 / W, 12);
        off = [shake(t, 70, 1) * sk, shake(t, 64, 2) * sk * 0.56];
        rot = -0.035;
        shift = fi <= 3 ? 0.01 : kick(t, C.impact1, 0.005, 8);
        grain = 0.04;
        // Ink floods in.
        const w = ramp(t, C.inkReveal[0] - 0.2, C.inkReveal[0]);
        if (w > 0) M.inkSplash(fg, { cx: W / 2, cy: H / 2, R: lerp(260, 2600, easeIn(w)), seed: 12, spikes: 18, drops: 30, spatter: 100, k: 1 });
      } else {
        // The ink clears, revealing the real app on a phone.
        use3D = true;
        drawStudio(bg);
        hero.g.visible = true;
        hero.setScreen("edit0");
        hero.g.rotation.set(0.02, 0.18, 0);
        hero.g.position.set(0, 0, 0);
        aimCamera({ ang: 0.05, dist: 36 });
        const k = clamp((t - C.inkReveal[0]) / (C.inkReveal[1] - C.inkReveal[0]));
        fg.save();
        fg.fillStyle = INK;
        fg.fillRect(0, 0, W, H);
        fg.globalCompositeOperation = "destination-out";
        M.inkSplash(fg, { cx: W / 2, cy: 1100, R: lerp(40, 2400, easeIn(k)), seed: 13, spikes: 16, drops: 0, spatter: 0, k: 1 });
        fg.restore();
      }
    }
  }

  // ---------------------------------------------------- 02 your profile (real editing workflow)
  else if (t < C.looks[0] - 0.15) {
    use3D = true;
    drawStudio(bg);
    hero.g.visible = true;
    const k = easeInOut(ramp(t, C.s2, C.looks[0]));
    hero.g.position.set(0, 0, 0);
    hero.g.rotation.set(0.02 * (1 - k), lerp(0.18, -0.08, k), 0);
    aimCamera({ ang: lerp(0.05, 0.02, k), dist: lerp(36, 31.5, k), lift: lerp(1.74, 1.5, k) });
    // Edit frames on their cue times.
    const [tBefore, tDialog, tAvatar, tStatus, tBio, tFlair, tJoke, tAfter] = C.edit;
    let a = "edit0";
    let b = null;
    let wipe = 0;
    if (t < tDialog) a = "edit0";
    else if (t < tAvatar) {
      a = "edit0";
      b = "edit1";
      wipe = easeOut(clamp((t - tDialog) / 0.14));
    } else if (t < tStatus) a = "edit2";
    else if (t < tBio) a = `edit${3 + Math.min(10, Math.floor((t - tStatus) / 0.085))}`;
    else if (t < tFlair) a = `edit${14 + Math.min(8, Math.floor((t - tBio) / 0.085))}`;
    else if (t < tJoke) a = "edit23";
    else if (t < tJoke + 0.15) a = "edit24";
    else if (t < tAfter) a = "edit25";
    else {
      a = "edit25";
      b = "edit26";
      wipe = easeInOut(clamp((t - tAfter) / 0.18));
    }
    hero.setScreen(a, b || a, b ? wipe : 0);
    hero.mat.uniforms.uWipeCol.value.setRGB(0.12, 0.12, 0.12);
    // Taps on the real controls.
    const P = (x, y) => project(hero, x, y);
    tap(fg, ...P(756, 590), t, tDialog - 0.05);
    tap(fg, ...P(170, 940), t, tAvatar - 0.06);
    tap(fg, ...P(320, 1706), t, tFlair - 0.04);
    tap(fg, ...P(540, 2194), t, tAfter - 0.06);
    // Titles, with a manga-panel cut between them.
    title(fg, "YOUR PROFILE.", "プロフィール", t, C.titleProfile[0], C.titleProfile[1], { exit: "left" });
    title(fg, "YOUR IDENTITY.", "アイデンティティ", t, C.titleIdentity[0], C.titleIdentity[1] + 0.2);
    const pc = t - C.panelCut;
    if (pc >= -0.04 && pc < 0.16) {
      const kk = easeOut(clamp((pc + 0.04) / 0.1));
      fg.save();
      fg.beginPath();
      fg.moveTo(0, 90);
      fg.lineTo(W, 60);
      fg.lineTo(W, 380);
      fg.lineTo(0, 410);
      fg.closePath();
      fg.clip();
      M.motionLines(fg, { angle: -0.03, n: 40, color: "#f4f2ee", width: [1, 5], seed: 70 + Math.floor(pc * 30), alpha: 0.5 * (1 - clamp(pc / 0.16)), area: [0, 60, W, 360] });
      fg.restore();
      fg.save();
      fg.strokeStyle = "#f4f2ee";
      fg.lineWidth = 6;
      fg.globalAlpha = 1 - clamp(pc / 0.16);
      fg.beginPath();
      fg.moveTo(W * (1 - kk), 420 - 30 * (1 - kk));
      fg.lineTo(W, 390);
      fg.stroke();
      fg.restore();
      zoom = punch(t, C.panelCut, 0.015, 0.15);
    }
  }

  // ---------------------------------------------------- 03 build your aesthetic
  else if (t < C.makeIt[0]) {
    const i = Math.max(0, Math.min(3, Math.floor(t - C.looks[0] + 0.15)));
    const L = LOOKS[i];
    const e = t - C.looks[i];
    use3D = e >= 0 || i > 0;
    if (e < 0 && i === 0) {
      // Ink takes the end of scene 02 before the first look.
      use3D = true;
      drawStudio(bg);
      hero.g.visible = true;
      hero.setScreen("edit26");
      lookIn(fg, 0, e);
      aimCamera({ ang: 0.02, dist: 31.5, lift: 1.5 });
    } else {
      const li = e < 0 ? i - 1 : i;
      const Lc = LOOKS[li];
      const ec = t - C.looks[li];
      lookBG(bg, li, ec);
      hero.g.visible = true;
      hero.setScreen(`profile-${Lc.key}`);
      const snap = easeOut(clamp(ec / 0.2));
      hero.g.position.set(0, lerp(-1.2, 0, snap), lerp(-6, 0, snap));
      hero.g.rotation.set(0.03, Lc.pose.ry * (0.6 + 0.4 * snap) + Math.sin(t * 1.6) * 0.03, Lc.pose.rz + (li === 3 ? Math.sin(t * 9) * 0.01 : 0));
      aimCamera({ ang: 0, dist: 36.5, lift: 1.95 });
      const col = Lc.light ? INK : "#ffffff";
      title(fg, Lc.name, Lc.jp, t, C.looks[li] + 0.04, C.looks[li] + 1.0, { size: Lc.name.length > 14 ? 66 : 80, color: col, sub: Lc.sub });
      // Honest label: these are example profiles, not preset themes.
      fg.save();
      fg.font = '500 22px "Inter"';
      fg.letterSpacing = "2px";
      fg.fillStyle = Lc.light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
      fg.textAlign = "right";
      fg.fillText("EXAMPLE PROFILES · REAL SETTINGS", W - 60, 74);
      fg.restore();
      zoom = punch(t, C.looks[li], 0.03, 0.2);
      shift = kick(t, C.looks[li], li === 3 ? 0.008 : 0.003, 12);
      grain = li === 0 ? 0.03 : 0.015;
      if (e < 0) lookIn(fg, i, e);
      else lookIn(fg, i, e);
    }
  }

  // ---------------------------------------------------- make it yours
  else if (t < C.s4) {
    makeItYours(bg, fg, t);
    zoom = punch(t, C.makeIt[0] + 0.5, 0.025, 0.2);
    grain = 0.03;
  }

  // ---------------------------------------------------- 04 watch it come to life
  else if (t < C.s5) {
    if (t < C.crimsonImpact) {
      use3D = true;
      drawStudio(bg);
      hero.g.visible = true;
      const k = easeInOut(ramp(t, C.s4, C.crimsonImpact));
      hero.g.position.set(0, Math.sin(t * 1.2) * 0.06, 0);
      hero.g.rotation.set(0.03, Math.sin(t * 0.6) * 0.04, 0);
      aimCamera({ ang: lerp(0.5, -0.32, k), dist: lerp(35, 33, k), lift: 1.7 });
      const u = hero.mat.uniforms;
      if (t < C.slider[0]) hero.setScreen("recolor-before-kuro");
      else if (t < C.recolorAfter) {
        const i = Math.min(20, Math.floor(((t - C.slider[0]) / (C.slider[1] - C.slider[0])) * 20));
        hero.setScreen(`hue${i}`);
        const [x, y] = project(hero, KNOB_X[i], KNOB_Y);
        fg.save();
        fg.fillStyle = "rgba(255,255,255,0.32)";
        fg.strokeStyle = "rgba(255,255,255,0.9)";
        fg.lineWidth = 3;
        fg.beginPath();
        fg.arc(x, y, 24, 0, Math.PI * 2);
        fg.fill();
        fg.stroke();
        fg.restore();
      } else if (t < C.themeBefore) {
        hero.setScreen("hue20", "recolor-after-kuro", easeInOut(clamp((t - C.recolorAfter) / 0.22)));
        u.uWipeCol.value.setRGB(0.25, 0.62, 1.0);
      } else if (t < C.themeAfter) hero.setScreen("theme-before-mio");
      else {
        hero.setScreen("theme-before-mio", "theme-after-mio", easeInOut(clamp((t - C.themeAfter) / 0.22)));
        u.uWipeCol.value.setRGB(1, 1, 1);
      }
      title(fg, "YOUR SPACE.", "自分の場所", t, C.titleSpace[0], C.titleSpace[1], { exit: "left" });
      title(fg, "YOUR RULES.", "自分のルール", t, C.titleRules[0], C.titleRules[1] + 0.05);
      zoom = punch(t, C.recolorAfter, 0.012, 0.2) * punch(t, C.themeAfter, 0.012, 0.2);
    } else {
      // One restrained crimson impact frame.
      const e = t - C.crimsonImpact;
      bg.fillStyle = "#000";
      bg.fillRect(0, 0, W, H);
      M.radialLines(bg, { cx: W / 2, cy: 1000, n: 170, rIn: [300, 520], width: [2, 34], color: CRIMSON, seed: 820 + Math.floor(e * 15) });
      M.starburst(bg, { cx: W / 2, cy: 1000, rin: 120, rout: 280 * expoOut(clamp(e / 0.1)) + 40, n: 24, seed: 830, color: PAPER });
      flash = f === Math.round(C.crimsonImpact * FPS) ? 0.9 : 0;
      flashCol = [0.9, 0.06, 0.18];
      zoom = punch(t, C.crimsonImpact, 0.1, 0.25) * lerp(1, 2.4, easeIn(ramp(t, C.crimsonImpact + 0.22, C.s5)));
      shift = kick(t, C.crimsonImpact, 0.008, 10);
      grain = 0.03;
    }
  }

  // ---------------------------------------------------- 05 one community, different identities
  else if (t < C.s6) {
    use3D = true;
    drawStudio(bg);
    const e = t - C.s5;
    lineup.forEach((p, i) => {
      const L = LINE[i];
      const k = easeOut(clamp((e - L.d) / 0.7));
      p.g.visible = true;
      p.setScreen(`profile-${LOOK_KEYS[i]}`);
      p.panelMode(0);
      p.g.position.set(L.x * lerp(1.4, 1, k), L.y + lerp(-16, 0, k) + Math.sin(t * 1.1 + i) * 0.08, L.z);
      p.g.rotation.set(0.03, L.ry + (1 - k) * 0.5 * Math.sign(L.ry || 1), (1 - k) * 0.2);
    });
    const dk = easeInOut(ramp(t, C.s5, C.s6));
    aimCamera({ ang: lerp(0.1, -0.08, dk), dist: lerp(60, 55, dk), lift: 2.0 });
    title(fg, "DIFFERENT VIBES.", "それぞれの個性", t, C.vibes, C.s6 + 0.1);
    title(fg, "ONE YORU.", "ひとつの夜", t, C.oneYoru, C.s6 + 0.1, { y: 214 + 150, size: 84 });
  }

  // ---------------------------------------------------- 06 final reveal
  else {
    if (t < C.collapse[1]) {
      use3D = true;
      drawStudio(bg);
      const ck = easeInOut(ramp(t, C.converge[0], C.converge[1]));
      const mk = ramp(t, C.mangaPanels[0], C.mangaPanels[1]);
      lineup.forEach((p, i) => {
        const L = LINE[i];
        p.g.visible = true;
        p.setScreen(`profile-${LOOK_KEYS[i]}`);
        p.panelMode(mk);
        p.g.position.set(lerp(L.x, (i - 1.5) * 0.9, ck), lerp(L.y, (i - 1.5) * -0.5, ck), lerp(L.z, i * 0.4, ck));
        p.g.rotation.set(0, lerp(L.ry, 0, ck), lerp(0, (i - 1.5) * 0.07, ck));
      });
      aimCamera({ ang: -0.08 * (1 - ck), dist: lerp(55, 42, ck), lift: 2.0 });
      const k = easeIn(ramp(t, C.collapse[0], C.collapse[1]));
      zoom = Math.max(0.004, 1 - k);
      rot = k * 0.8;
      grain = 0.03 * mk;
      if (mk > 0) {
        bg.fillStyle = `rgba(244,242,238,${clamp(mk * 1.5)})`;
        bg.fillRect(0, 0, W, H);
        M.radialLines(bg, { cx: W / 2, cy: 1000, n: 160, rIn: [520, 760], width: [2, 26], seed: 840 + Math.floor(t * 15), alpha: clamp(mk * 1.5) });
      }
    } else {
      bg.fillStyle = "#000";
      bg.fillRect(0, 0, W, H);
      if (t >= C.logo[0]) {
        const LW = 760;
        const LH = LW * LOGO_AR;
        const cy = 880;
        const rk = easeInOut(ramp(t, C.logo[0], C.logo[1]));
        const half = (LW / 2 + 30) * rk;
        bg.save();
        bg.beginPath();
        bg.rect(W / 2 - half, 0, half * 2, H);
        bg.clip();
        const sc = lerp(1.02, 1, easeOut(ramp(t, C.logo[0], C.logo[1] + 0.4)));
        bg.imageSmoothingQuality = "high";
        bg.drawImage(IMG.logo, W / 2 - (LW * sc) / 2, cy - (LH * sc) / 2, LW * sc, LH * sc);
        bg.restore();
        // A crimson line opens with the logo, then settles to a short accent.
        const lk = ramp(t, C.logo[0], C.logo[1]);
        const settle = easeInOut(ramp(t, C.logo[1] + 0.1, C.logo[1] + 0.6));
        const lw = lerp(half * 2, 120, settle);
        bg.fillStyle = CRIMSON;
        bg.globalAlpha = lk > 0 ? 1 : 0;
        bg.fillRect(W / 2 - lw / 2, cy + LH / 2 + 40, lw, 4);
        bg.globalAlpha = 1;
        const gk = easeOut(ramp(t, C.tagline[0], C.tagline[1]));
        if (gk > 0) {
          bg.save();
          bg.globalAlpha = gk;
          bg.fillStyle = "#f2f2f2";
          bg.font = '700 46px "Inter"';
          bg.textAlign = "center";
          bg.textBaseline = "middle";
          const sp = lerp(0.4, 0.2, gk) * 46;
          bg.letterSpacing = `${sp}px`;
          bg.fillText("YOUR WORLD. YOUR RULES.", W / 2 + sp / 2, 1110);
          bg.restore();
        }
      }
      fade = 1 - easeInOut(ramp(t, C.fadeOut[0], C.fadeOut[1]));
    }
  }

  bgTex.needsUpdate = true;
  fgTex.needsUpdate = true;
  if (use3D) {
    renderer.setRenderTarget(rt3d);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  }
  FU.uUse3D.value = use3D ? 1 : 0;
  FU.uZoom.value = zoom;
  FU.uCenter.value.set(...center);
  FU.uRot.value = rot;
  FU.uOff.value.set(off[0], off[1]);
  FU.uShift.value = shift;
  FU.uInvert.value = invert;
  FU.uFlash.value = flash;
  FU.uFlashCol.value.setRGB(...flashCol);
  FU.uGrain.value = grain;
  FU.uSeed.value = f % 61;
  FU.uFade.value = fade;
  renderer.setClearColor(0x000000, 1);
  renderer.render(finalScene, finalCam);
  return true;
};

// Cover frame: the four real example profiles under the campaign line.
window.renderCover = () => {
  window.renderFrame(C.makeIt[0] + 0.9);
  return true;
};

await document.fonts.ready;
window.ready = true;
