// YORU Video 002 — "transmission". Deterministic composition: every frame is a
// pure function of t, except the datamosh feedback, which reads the previous
// frame (so frames are rendered in order).

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const W = 1080;
const H = 1920;
const C = await (await fetch("/cues.json")).json();
const FPS = C.fps;
const SCALE = Number(new URLSearchParams(location.search).get("scale") || 1);
await Promise.all([
  document.fonts.load(`400 44px "JetBrains Mono"`),
  document.fonts.load(`500 26px "JetBrains Mono"`),
  document.fonts.load(`700 300px "JetBrains Mono"`),
  document.fonts.load(`800 74px "Inter"`),
  document.fonts.load(`700 100px "IPAGothic"`),
]);

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const shake = (t, f, s) => Math.sin(t * f + s) * 0.5 + Math.sin(t * f * 2.31 + s * 1.7) * 0.3 + Math.sin(t * f * 4.77 + s * 3.1) * 0.2;
const hits = (t, list, decay = 14) => list.reduce((m, c) => (t >= c ? Math.max(m, Math.exp(-(t - c) * decay)) : m), 0);
const lastCue = (t, list) => {
  let idx = -1;
  for (let i = 0; i < list.length; i++) if (t >= list[i]) idx = i;
  return idx;
};
// True for the frame range [a, b).
const within = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(SCALE);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.NoToneMapping;
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);

const loader = new THREE.TextureLoader();
const loadTex = (url) =>
  new Promise((res) =>
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      res(t);
    }),
  );
const SCREENS = ["1-home", "4-chat", "2-profile", "5-explore", "1b-feed", "3-color", "6-levelup"];
const screenTex = await Promise.all(SCREENS.map((f) => loadTex(`/assets/${f}.png`)));
const logoTex = await loadTex("/assets/wordmark.png");
const logoImg = logoTex.image;

// "001" card used on one monitor of the archive wall.
const card001 = (() => {
  const cv = document.createElement("canvas");
  cv.width = 540;
  cv.height = 960;
  const g = cv.getContext("2d");
  g.fillStyle = "#050505";
  g.fillRect(0, 0, 540, 960);
  g.fillStyle = "#e8e8e8";
  g.font = '700 190px "JetBrains Mono"';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("001", 270, 470);
  g.font = '500 26px "JetBrains Mono"';
  g.fillStyle = "#f20d2f";
  g.fillText("NO SIGNAL", 270, 600);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// ---------------------------------------------------------------- shared materials
function makeScreenMat(tex) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uMap: { value: tex },
      uOn: { value: 1 },
      uStatic: { value: 0 },
      uRed: { value: 0 },
      uGlitch: { value: 0 },
      uSeed: { value: 0 },
      uAlpha: { value: 1 },
      uBright: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uOn, uStatic, uRed, uGlitch, uSeed, uAlpha, uBright, uTime;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed*3.17) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        float row = floor(uv.y * 70.0);
        uv.x += (h(vec2(row, 1.0)) - 0.5) * 0.1 * uGlitch * step(0.72, h(vec2(row, 2.0)));
        float sy = max(uOn, 0.003);
        float y = (uv.y - 0.5) / sy + 0.5;
        vec3 c = texture2D(uMap, vec2(uv.x, clamp(y, 0.0, 1.0))).rgb;
        if (y < 0.0 || y > 1.0) c = vec3(0.0);
        float line = step(abs(uv.y - 0.5), sy * 0.5 + 0.004) * (1.0 - smoothstep(0.0, 0.7, uOn));
        c += vec3(1.0, 0.85, 0.88) * line * 1.4;
        float n = h(floor(uv * vec2(160.0, 284.0)) + floor(uTime * 30.0));
        c = mix(c, vec3(n * 0.85), uStatic);
        c = mix(c, vec3(1.0, 0.03, 0.1) * (0.35 + 0.65 * dot(c, vec3(0.33)) + 0.25 * n), uRed);
        c *= (0.88 + 0.12 * sin(vUv.y * 1100.0)) * uBright;
        gl_FragColor = vec4(c, uAlpha);
      }`,
  });
}

function buildDust(count, spread, seed, depth) {
  const r = rng(seed);
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const a = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    p.set([(r() - 0.5) * spread, (r() - 0.5) * spread * 1.8, -r() * depth + 6], i * 3);
    a.set([r(), r()], i * 2);
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("aR", new THREE.BufferAttribute(a, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.6 }, uScale: { value: SCALE } },
    vertexShader: /* glsl */ `
      uniform float uTime, uScale; attribute vec2 aR; varying float vA; varying float vHot;
      void main(){
        vec3 p = position + vec3(sin(uTime*0.3 + aR.x*30.0), sin(uTime*0.25 + aR.y*30.0) + uTime*0.15*(aR.x-0.3), 0.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min((0.6 + aR.y*aR.y*2.2) * uScale * 70.0 / max(-mv.z, 0.5), 10.0 * uScale);
        vA = 0.25 + 0.75 * fract(aR.x * 7.0 + uTime * (0.2 + aR.y));
        vHot = step(0.85, aR.x);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; varying float vA; varying float vHot;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = mix(vec3(0.9, 0.05, 0.12), vec3(1.0, 0.8, 0.8), vHot);
        gl_FragColor = vec4(col * a, a * vA * uAlpha);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// Soft red glow card (a light source in the dark room).
function glowPlane(w, h, color, strength) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uS: { value: strength }, uC: { value: new THREE.Color(...color) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uS; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 2.0; float g = exp(-dot(q,q) * 3.0); gl_FragColor = vec4(uC * g * uS, 1.0); }`,
    }),
  );
}

// ================================================================ SCENE 1 — the filmed screen
const sceneScreen = new THREE.Scene();
const screenMat = makeScreenMat(screenTex[0]);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 16), screenMat);
sceneScreen.add(screen);
const bezel = new THREE.Mesh(new THREE.BoxGeometry(9.5, 16.5, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.014) }));
bezel.position.z = -0.27;
screen.add(bezel);
// Redaction bars that sweep across the profile screen.
const barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
const bars = [
  { left: -4.25, y: (0.5 - 0.468) * 16, w: 3.9, h: 0.62, d: 0.0 },
  { left: -4.25, y: (0.5 - 0.6) * 16, w: 7.9, h: 0.58, d: 0.08 },
  { left: -4.25, y: (0.5 - 0.64) * 16, w: 5.2, h: 0.58, d: 0.14 },
].map((b) => {
  const m = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
  m.position.set(b.left, b.y, 0.02);
  m.scale.set(0.001, b.h, 1);
  m.userData = b;
  screen.add(m);
  return m;
});
const glow1 = glowPlane(40, 50, [0.6, 0.02, 0.06], 0.35);
glow1.position.z = -8;
sceneScreen.add(glow1);
const dust1 = buildDust(2500, 40, 5, 40);
sceneScreen.add(dust1);

// ================================================================ SCENE 2 — the archive wall
const sceneWall = new THREE.Scene();
sceneWall.fog = new THREE.FogExp2(0x000000, 0.022);
const monitors = [];
{
  const cols = 5;
  const rows = 7;
  const R = 15;
  const bezelGeo = new THREE.BoxGeometry(3.45, 5.8, 0.9);
  const edgeGeo = new THREE.EdgesGeometry(bezelGeo);
  const scrGeo = new THREE.PlaneGeometry(3.0, 5.333);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col - (cols - 1) / 2;
      const cy = row - (rows - 1) / 2;
      const a = cx * 0.245;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * R, -cy * 6.15, -(1 - Math.cos(a)) * R);
      g.rotation.y = -a;
      const bz = new THREE.Mesh(bezelGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.01, 0.01, 0.012) }));
      bz.position.z = -0.46;
      const ed = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0.18, 0.02, 0.04), transparent: true, opacity: 0.8 }));
      ed.position.z = -0.46;
      const is001 = row === 4 && col === 3;
      const tex = is001 ? card001 : screenTex[(row * 3 + col * 2) % screenTex.length];
      const scr = new THREE.Mesh(scrGeo, makeScreenMat(tex));
      g.add(bz, ed, scr);
      sceneWall.add(g);
      monitors.push({ g, scr, dist: Math.hypot(cx, cy), seed: hash(row * 7 + col) });
    }
  }
  // Power-on order: outward from the centre monitor.
  const order = [...monitors].sort((p, q) => p.dist - q.dist || p.seed - q.seed);
  order.forEach((m, i) => (m.on = C.archive[0] + 0.02 + i * 0.022 + m.seed * 0.03));
}
const dust2 = buildDust(3000, 60, 9, 60);
sceneWall.add(dust2);
const glow2 = glowPlane(70, 90, [0.5, 0.02, 0.05], 0.18);
glow2.position.z = -14;
sceneWall.add(glow2);

// ================================================================ SCENE 3 — the logo
const sceneLogo = new THREE.Scene();
const LOGO_W = 6.2;
const LOGO_H = LOGO_W * (logoImg.height / logoImg.width);
const LOGO_Y = 1.2;
const CAM_Z = 18;
const FOV_L = 40;
const STRIPS = 24;
const stripGroups = [];
{
  const r = rng(42);
  const sh = LOGO_H / STRIPS;
  for (let i = 0; i < STRIPS; i++) {
    const v1 = 1 - i / STRIPS;
    const v0 = 1 - (i + 1) / STRIPS;
    const geo = new THREE.PlaneGeometry(LOGO_W, sh);
    const grp = new THREE.Group();
    const ch = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((mask) => {
      const m = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uMap: { value: logoTex }, uV: { value: new THREE.Vector2(v0, v1) }, uMask: { value: mask }, uAlpha: { value: 1 }, uHot: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D uMap; uniform vec2 uV; uniform vec3 uMask; uniform float uAlpha, uHot;
            varying vec2 vUv;
            void main(){
              vec4 c = texture2D(uMap, vec2(vUv.x, mix(uV.x, uV.y, vUv.y)));
              vec3 col = mix(c.rgb, vec3(1.0, 0.1, 0.18) * 1.6, uHot) * uMask;
              gl_FragColor = vec4(col, c.a * uAlpha);
            }`,
        }),
      );
      grp.add(m);
      return m;
    });
    sceneLogo.add(grp);
    stripGroups.push({
      grp,
      ch,
      y: LOGO_Y + LOGO_H / 2 - (i + 0.5) * sh,
      x0: (r() - 0.5) * 16,
      y0: (r() - 0.5) * 7,
      z0: -8 - r() * 38,
      ry0: (r() - 0.5) * 2.2,
      rz0: (r() - 0.5) * 0.8,
      delay: (i / STRIPS) * 0.22 + r() * 0.2,
    });
  }
}
const glow3 = glowPlane(26, 4, [0.9, 0.03, 0.1], 0.0);
glow3.position.set(0, LOGO_Y, -2);
sceneLogo.add(glow3);
const dust3 = buildDust(2200, 30, 13, 30);
sceneLogo.add(dust3);

// ================================================================ UI layer (2D canvas, composited before the CRT pass)
const ui = document.createElement("canvas");
ui.width = W;
ui.height = H;
const g2 = ui.getContext("2d");
const uiTex = new THREE.CanvasTexture(ui);
uiTex.colorSpace = THREE.NoColorSpace;
uiTex.minFilter = THREE.LinearFilter;
uiTex.generateMipmaps = false;

const MONO = '"JetBrains Mono", monospace';
const SCRAMBLE = "#$%&*+<>/\\|=_01ABCDEFGHJKMNPQRSTVWXZ";

function txt(s, x, y, { font, color = "#e8e8e8", align = "center", alpha = 1, spacing = 0, glow = 0, split = 0 } = {}) {
  g2.save();
  g2.globalAlpha = alpha;
  g2.font = font;
  g2.textAlign = align;
  g2.textBaseline = "middle";
  g2.letterSpacing = `${spacing}px`;
  if (split) {
    g2.globalCompositeOperation = "lighter";
    g2.fillStyle = "rgba(255,20,50,0.85)";
    g2.fillText(s, x + split, y);
    g2.fillStyle = "rgba(20,220,255,0.55)";
    g2.fillText(s, x - split, y);
    g2.globalCompositeOperation = "source-over";
  }
  if (glow) {
    g2.shadowColor = "rgba(242,13,47,0.8)";
    g2.shadowBlur = glow;
  }
  g2.fillStyle = color;
  g2.fillText(s, x, y);
  g2.restore();
  return g2.measureText(s).width;
}

function scramble(target, k, seed) {
  const n = Math.floor(target.length * k);
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (i < n || ch === " ") out += ch;
    else if (i < n + 6) out += SCRAMBLE[Math.floor(hash(seed * 31 + i * 7) * SCRAMBLE.length)];
    else out += " ";
  }
  return out;
}

function hud(t, { state = "REC", file = "FILE_001", alpha = 0.75 } = {}) {
  const f = Math.floor(t * FPS);
  const m = 56;
  g2.save();
  g2.globalAlpha = alpha;
  g2.strokeStyle = "rgba(230,230,230,0.6)";
  g2.lineWidth = 3;
  for (const [x, y, sx, sy] of [
    [m, m + 60, 1, 1],
    [W - m, m + 60, -1, 1],
    [m, H - m - 60, 1, -1],
    [W - m, H - m - 60, -1, -1],
  ]) {
    g2.beginPath();
    g2.moveTo(x, y + sy * 54);
    g2.lineTo(x, y);
    g2.lineTo(x + sx * 54, y);
    g2.stroke();
  }
  g2.restore();
  const blink = Math.floor(t * 2) % 2 === 0;
  if (blink) {
    g2.save();
    g2.globalAlpha = alpha;
    g2.fillStyle = "#f20d2f";
    g2.beginPath();
    g2.arc(m + 34, m + 112, 11, 0, Math.PI * 2);
    g2.fill();
    g2.restore();
  }
  const font = `500 26px ${MONO}`;
  txt(state, m + 58, m + 113, { font, align: "left", alpha, spacing: 4 });
  txt("SRC: UNKNOWN", W - m - 24, m + 113, { font, align: "right", alpha: alpha * 0.8, spacing: 4 });
  const s = Math.floor(t);
  txt(`T+00:00:${String(s).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`, m + 24, H - m - 112, { font, align: "left", alpha: alpha * 0.8, spacing: 3 });
  txt(file, W - m - 24, H - m - 112, { font, align: "right", alpha: alpha * 0.8, spacing: 4 });
}

// ================================================================ post: bloom, then the CRT / glitch / datamosh pass
class CRTPass extends Pass {
  constructor() {
    super();
    const size = [Math.round(W * SCALE), Math.round(H * SCALE)];
    this.prev = new THREE.WebGLRenderTarget(...size);
    this.cur = new THREE.WebGLRenderTarget(...size);
    this.uniforms = {
      tDiffuse: { value: null },
      tUI: { value: uiTex },
      tPrev: { value: null },
      uGlitch: { value: 0 },
      uSlice: { value: 0 },
      uSeed: { value: 0 },
      uShift: { value: 0.0015 },
      uMosh: { value: 0 },
      uOffY: { value: 1 },
      uOffX: { value: 1 },
      uNoise: { value: 0.1 },
      uScan: { value: 0.35 },
      uTime: { value: 0 },
      uInvert: { value: 0 },
      uFlash: { value: 0 },
      uFlashCol: { value: new THREE.Color(1, 1, 1) },
      uBarrel: { value: 0.08 },
      uRoll: { value: 0.0 },
      uUIOnly: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tUI, tPrev;
        uniform float uGlitch, uSlice, uSeed, uShift, uMosh, uOffY, uOffX, uNoise, uScan, uTime, uInvert, uFlash, uBarrel, uRoll, uUIOnly;
        uniform vec3 uFlashCol;
        varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed*7.13) * 43758.5453); }
        vec3 src(vec2 uv){
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
          vec3 s = texture2D(tDiffuse, uv).rgb * (1.0 - uUIOnly);
          vec4 u = texture2D(tUI, uv);
          return mix(s, u.rgb, u.a);
        }
        void main(){
          // CRT power on/off: squeeze the picture to a line, then to a dot.
          vec2 c = vUv - 0.5;
          vec2 sq = vec2(max(uOffX, 0.002), max(uOffY, 0.002));
          vec2 q = c / sq;
          if (abs(q.x) > 0.5 || abs(q.y) > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
          vec2 uv = q + 0.5;
          // Barrel distortion.
          vec2 cc = uv - 0.5;
          uv = 0.5 + cc * (1.0 + uBarrel * dot(cc, cc));
          // Block displacement.
          vec2 blk = floor(uv * vec2(7.0, 56.0));
          float on = step(1.0 - uGlitch * 0.5, h(blk));
          uv.x += (h(blk + 1.7) - 0.5) * 0.24 * on * uGlitch;
          uv.y += (h(blk + 4.1) - 0.5) * 0.02 * on * uGlitch;
          // Tear lines.
          float row = floor(uv.y * 190.0);
          float tear = step(1.0 - uSlice * 0.2, h(vec2(row, 3.3)));
          uv.x += tear * (h(vec2(row, 9.1)) - 0.5) * 0.35 * uSlice;
          // Analog wobble.
          uv.x += sin(uv.y * 700.0 + uTime * 40.0) * 0.0009 * uNoise;
          // Chromatic split.
          vec2 d = vec2(uShift + uGlitch * 0.012, uGlitch * 0.002);
          vec3 col = vec3(src(uv + d).r, src(uv).g, src(uv - d).b);
          // Datamosh: drag blocks of the previous frame along random motion vectors.
          vec2 mb = floor(vUv * vec2(14.0, 25.0));
          vec2 mv = (vec2(h(mb + 2.0), h(mb + 11.0)) - 0.5) * 0.045;
          float mm = step(1.0 - uMosh, h(mb + 5.0));
          col = mix(col, texture2D(tPrev, vUv + mv).rgb, mm * 0.9);
          col = mix(col, 1.0 - col, uInvert);
          // Rolling interference bar and scanlines.
          float bar = exp(-pow((fract(vUv.y * 0.7 - uTime * 0.23 + uRoll) - 0.5) * 9.0, 2.0));
          col *= 1.0 + bar * 0.12 * uNoise * 4.0;
          float sl = 0.78 + 0.22 * sin(gl_FragCoord.y * 3.14159 / (1.5 * ${SCALE.toFixed(3)}));
          col *= mix(1.0, sl, uScan);
          // Grain and vignette.
          col += (h(vUv * vec2(1080.0, 1920.0) + fract(uTime * 7.31)) - 0.5) * uNoise;
          float v = smoothstep(1.2, 0.3, length(c * vec2(1.0, 1.3)));
          col *= v;
          // Power-off glow: the squeezed picture burns brighter.
          col *= 1.0 + (1.0 - sq.y) * 0.7 + (1.0 - sq.x) * 1.2;
          col = mix(col, uFlashCol, uFlash);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.copy = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { t: { value: null } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }`,
      }),
    );
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tPrev.value = this.prev.texture;
    renderer.setRenderTarget(this.cur);
    this.fsQuad.render(renderer);
    this.copy.material.uniforms.t.value = this.cur.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
    [this.prev, this.cur] = [this.cur, this.prev];
  }
}

const composer = new EffectComposer(renderer);
composer.setPixelRatio(SCALE);
composer.setSize(W, H);
const renderPass = new RenderPass(sceneScreen, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.6, 0.45, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const crt = new CRTPass();
composer.addPass(crt);
const U = crt.uniforms;

// ================================================================ frame
const screenFor = (name) => screenTex[SCREENS.indexOf(name)];
const CUT_SCREENS = ["1-home", "4-chat", "2-profile", "5-explore", "1b-feed"];
const BUILD_SCREENS = ["6-levelup", "4-chat", "3-color", "1-home", "001", "2-profile", "flash", "5-explore"];
const FRAG = ["001", "002", "003", "004", "005"];

window.renderFrame = (t) => {
  const f = Math.round(t * FPS);
  let scene = null;
  g2.clearRect(0, 0, W, H);

  // Per-frame defaults.
  let glitch = 0;
  let slice = 0;
  let shift = 0.0012;
  let mosh = 0;
  let offY = 1;
  let offX = 1;
  let noise = 0.09;
  let scan = 0.35;
  let invert = 0;
  let flashA = 0;
  let flashCol = [1, 1, 1];
  let bloomS = 0.6;
  let barrel = 0.08;
  let uiOnly = 0;
  camera.fov = 50;
  camera.up.set(0, 1, 0);

  const showScreen = (tex, { rotY = 0, rotX = 0, dist = 18.5, push = 0, shakeAmt = 0.12, roll = 0 } = {}) => {
    scene = sceneScreen;
    screenMat.uniforms.uMap.value = tex;
    screen.rotation.set(rotX, rotY, 0);
    camera.position.set(shake(t, 3, 1) * shakeAmt, shake(t, 2.6, 2) * shakeAmt, dist - push);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(shake(t, 2, 5) * shakeAmt * 0.5, 0, 0);
  };
  screenMat.uniforms.uTime.value = t;
  screenMat.uniforms.uSeed.value = f % 89;
  screenMat.uniforms.uGlitch.value = 0;
  screenMat.uniforms.uStatic.value = 0;
  screenMat.uniforms.uRed.value = 0;
  screenMat.uniforms.uOn.value = 1;
  bars.forEach((b) => (b.visible = false));
  for (const d of [dust1, dust2, dust3]) d.material.uniforms.uTime.value = t;

  // ------------------------------------------------ 0–1.5 s: cold open
  if (t < C.breach) {
    uiOnly = 1;
    scene = sceneScreen;
    const fl = within(t, C.flicker[0], C.flicker[1] + 1 / FPS);
    const l2 = fl && f % 2 === 0 ? "to be pub1ic." : "to be public.";
    const font = `400 62px ${MONO}`;
    g2.font = font;
    g2.letterSpacing = "0px";
    const w = g2.measureText(l2).width;
    const dx = fl ? 9 : 0;
    txt("this wasn't meant", W / 2 + dx, H / 2 - 44, { font, color: "#e6e6e6", split: fl ? 7 : 0 });
    txt(l2, W / 2 + dx, H / 2 + 44, { font, color: "#e6e6e6", split: fl ? 7 : 0 });
    // Cursor: on for the first half of every second, so frame 0 always shows it.
    if (t % 1 < 0.5) {
      g2.fillStyle = "#e6e6e6";
      g2.fillRect(W / 2 + w / 2 + 12, H / 2 + 44 - 32, 30, 64);
    }
    txt("001", W - 72, H - 84, { font: `500 22px ${MONO}`, color: "#8a8a8a", align: "right", alpha: 0.5, spacing: 3 });
    if (fl) {
      glitch = 0.25;
      slice = 0.6;
      shift = 0.006;
    }
    // A pressure wave just before the breach.
    const pre = ramp(t, C.breach - 0.25, C.breach);
    shift += pre * pre * 0.01;
    noise = 0.09 + pre * 0.1;
  }

  // ------------------------------------------------ 1.5–1.7 s: breach
  else if (t < C.cuts1[0]) {
    const k = f - Math.round(C.breach * FPS);
    showScreen(screenFor("1-home"), { rotY: 0.18, dist: 17, shakeAmt: 0.6 });
    if (k === 0) {
      flashA = 1;
    } else {
      const font = `400 62px ${MONO}`;
      const jx = (hash(f) - 0.5) * 160;
      const jy = (hash(f + 3) - 0.5) * 300;
      txt("this wasn't meant", W / 2 + jx, H / 2 - 44 + jy, { font, split: 14 });
      txt("to be public.", W / 2 - jx, H / 2 + 44 + jy, { font, split: 14 });
      glitch = 1;
      slice = 1;
      mosh = 0.5;
      shift = 0.02;
      invert = k === 2 ? 1 : 0;
      screenMat.uniforms.uGlitch.value = 1;
    }
    bloomS = 1.0;
  }

  // ------------------------------------------------ 1.7–3.8 s: recovered footage
  else if (t < C.stutter[0]) {
    const ci = lastCue(t, C.cuts1);
    const local = t - C.cuts1[ci];
    const side = ci % 2 ? -1 : 1;
    showScreen(screenFor(CUT_SCREENS[ci]), { rotY: side * 0.2, rotX: 0.04, dist: 19.2, push: local * 1.4, shakeAmt: 0.14, roll: side * 0.02 });
    const cutHit = hits(t, C.cuts1, 22);
    glitch = cutHit * 0.9;
    slice = cutHit * 0.8;
    mosh = local < 2 / FPS && ci > 0 ? 0.55 : 0;
    shift = 0.0015 + cutHit * 0.012;
    screenMat.uniforms.uGlitch.value = cutHit;
    if (CUT_SCREENS[ci] === "2-profile") {
      bars.forEach((b) => {
        b.visible = true;
        const k = easeOut(ramp(local, 0.06 + b.userData.d, 0.2 + b.userData.d));
        b.scale.x = Math.max(0.001, b.userData.w * k);
      });
    }
    hud(t, { state: "REC", file: "FILE_001" });
    txt(`> recovering fragment ${FRAG[ci]} / 007`, W / 2, H - 250, { font: `500 28px ${MONO}`, color: "#d8d8d8", alpha: 0.85, spacing: 2 });
  }

  // ------------------------------------------------ 3.8–4.4 s: stutter, 4.4–4.5 s: 夜
  else if (t < C.archive[0]) {
    if (t >= C.egg[0]) {
      // The easter egg: three frames — one torn, then two clean.
      const k = f - Math.round(C.egg[0] * FPS);
      uiOnly = 1;
      scene = sceneScreen;
      const clean = k >= 1;
      const size = 820;
      g2.save();
      g2.font = `700 ${size}px "IPAGothic", "WenQuanYi Zen Hei", sans-serif`;
      g2.textAlign = "center";
      g2.textBaseline = "middle";
      const bands = clean ? 1 : 9;
      for (let b = 0; b < bands; b++) {
        const y0 = H / 2 - size / 2 + (b * size) / bands;
        g2.save();
        g2.beginPath();
        g2.rect(0, y0, W, size / bands + 1);
        g2.clip();
        const dx = clean ? 0 : (hash(f * 13 + b) - 0.5) * 260;
        g2.shadowColor = "rgba(242,13,47,0.9)";
        g2.shadowBlur = clean ? 60 : 20;
        g2.fillStyle = "#f20d2f";
        g2.fillText("夜", W / 2 + dx, H / 2);
        g2.restore();
      }
      g2.restore();
      glitch = clean ? 0.08 : 0.9;
      slice = clean ? 0 : 1;
      shift = clean ? 0.004 : 0.03;
      noise = 0.14;
    } else {
      const k = f - Math.round(C.stutter[0] * FPS);
      const pick = ["1-home", "6-levelup", "4-chat", "3-color", "2-profile", "5-explore", "1b-feed"][Math.floor(k / 2) % 7];
      showScreen(screenFor(pick), { rotY: (hash(Math.floor(k / 2)) - 0.5) * 0.6, dist: 16 + hash(k) * 3, shakeAmt: 0.5, roll: (hash(k + 9) - 0.5) * 0.2 });
      glitch = 0.5 + hash(f) * 0.5;
      slice = 0.7;
      mosh = 0.3 + 0.25 * ramp(t, C.stutter[0], C.egg[0]);
      shift = 0.008 + hash(f + 1) * 0.02;
      screenMat.uniforms.uGlitch.value = 1;
      invert = k % 8 === 5 ? 1 : 0;
      hud(t, { state: "ERR", file: "FILE_001", alpha: hash(f + 4) > 0.5 ? 0.8 : 0.2 });
    }
  }

  // ------------------------------------------------ 4.5–6.6 s: the archive
  else if (t < C.build[0]) {
    scene = sceneWall;
    const k = ramp(t, C.archive[0], C.archive[1]);
    const e = easeInOut(k);
    camera.fov = 52;
    camera.position.set(lerp(0.3, 3.2, e) + shake(t, 2.2, 1) * 0.08, lerp(0.2, -1.4, e) + shake(t, 2, 3) * 0.08, lerp(7.2, 31, easeOut(k)));
    const roll = lerp(-0.03, 0.06, e);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(lerp(0, 1.0, e), lerp(0, -0.5, e), -6);
    for (const m of monitors) {
      const u = m.scr.material.uniforms;
      u.uTime.value = t;
      u.uSeed.value = (f + m.seed * 50) % 97;
      u.uOn.value = easeOut(ramp(t, m.on, m.on + 0.12));
      const st = t >= C.staticAll ? clamp(0.6 + 0.4 * hash(f + m.seed * 100)) : 0;
      u.uStatic.value = t >= C.redAll ? 0.25 : st;
      u.uRed.value = t >= C.redAll ? 0.92 : 0;
      u.uGlitch.value = hits(t, [C.staticAll, C.redAll], 10) + (hash(f * 3 + m.seed * 70) > 0.97 ? 0.8 : 0);
      u.uBright.value = 1 - ramp(t, C.archive[1] - 0.12, C.archive[1]) * 0.9;
    }
    // Everything powers off together at the end of the section.
    const off = ramp(t, C.archive[1] - 0.15, C.archive[1]);
    if (off > 0) monitors.forEach((m) => (m.scr.material.uniforms.uOn.value = 1 - easeIn(off)));
    glitch = hits(t, [C.archive[0], C.staticAll, C.redAll], 12) * 0.8;
    slice = hits(t, [C.staticAll], 8) * 0.8;
    mosh = within(t, C.staticAll, C.staticAll + 0.1) ? 0.4 : 0;
    shift = 0.0015 + glitch * 0.01;
    bloomS = 0.75 + (t >= C.redAll ? 0.4 : 0);
    flashA = hits(t, [C.redAll], 25) * 0.6;
    flashCol = [0.95, 0.05, 0.18];
    hud(t, { state: t >= C.staticAll ? "SIGNAL LOST" : "ARCHIVE", file: "FILE_001", alpha: 0.7 });
  }

  // ------------------------------------------------ 6.6–7.6 s: build
  else if (t < C.impact2) {
    const bi = lastCue(t, C.build);
    const kind = BUILD_SCREENS[bi];
    const local = t - C.build[bi];
    const acc = ramp(t, C.build[0], C.impact2);
    if (kind === "001") {
      uiOnly = 1;
      scene = sceneScreen;
      txt("001", W / 2, H / 2, { font: `700 300px ${MONO}`, color: "#f2f2f2", split: 10 });
    } else if (kind === "flash") {
      uiOnly = 1;
      scene = sceneScreen;
      flashA = 1;
    } else {
      showScreen(screenFor(kind), { rotY: 0, dist: 16.4, push: local * 3, shakeAmt: 0.2 + acc * 0.6, roll: (bi % 2 ? 1 : -1) * acc * 0.06 });
    }
    const hit = kind === "001" ? 0.1 : hits(t, C.build, 26);
    glitch = hit * 0.9 + acc * 0.35 * (kind === "001" ? 0.2 : 1);
    slice = hit * 0.9 + acc * 0.4 * (kind === "001" ? 0.2 : 1);
    mosh = acc * 0.3;
    shift = 0.002 + acc * 0.02;
    noise = 0.09 + acc * 0.15;
    screenMat.uniforms.uGlitch.value = 0.3 + acc;
    hud(t, { state: "REC", file: "FILE_001", alpha: 0.5 + hash(f) * 0.4 });
  }

  // ------------------------------------------------ 7.6–7.667 s: impact, 7.667–8.2 s: silence
  else if (t < C.reveal) {
    uiOnly = 1;
    scene = sceneScreen;
    const k = f - Math.round(C.impact2 * FPS);
    if (k === 0) {
      flashA = 1;
    } else if (k === 1) {
      g2.fillStyle = "#f20d2f";
      for (let i = 0; i < 14; i++) g2.fillRect(0, hash(i + f) * H, W, 6 + hash(i * 3) * 40);
      glitch = 1;
      slice = 1;
    } else {
      // Dead air. One cursor blink in the dark.
      noise = 0.0;
      scan = 0;
      if (within(t, 7.9, 8.067)) {
        g2.fillStyle = "#e6e6e6";
        g2.fillRect(W / 2 - 11, H / 2 - 23, 22, 46);
      }
    }
  }

  // ------------------------------------------------ 8.2–11.7 s: the logo
  else if (t < C.powerOff[0]) {
    scene = sceneLogo;
    camera.fov = FOV_L;
    const k = ramp(t, C.reveal, C.lock);
    const e = easeOut(k);
    const camX = lerp(5.5, 0, e);
    const camY = lerp(-1.2, 0, e);
    const camZ = lerp(12.5, CAM_Z, e);
    const micro = hits(t, C.micro, 30);
    camera.position.set(camX + shake(t, 6, 1) * micro * 0.15, camY + LOGO_Y * (1 - e) * 0.3, camZ);
    camera.lookAt(0, LOGO_Y * (1 - e) + 0, 0);
    // CRT turn-on.
    offY = lerp(0.004, 1, easeOut(ramp(t, C.reveal, C.reveal + 0.14)));
    offX = lerp(0.6, 1, easeOut(ramp(t, C.reveal, C.reveal + 0.08)));

    stripGroups.forEach((s, i) => {
      const p = clamp((t - C.reveal - s.delay) / (C.lock - C.reveal - s.delay));
      const q = 1 - Math.pow(1 - p, 3);
      const mj = micro > 0.2 && hash(i * 5 + lastCue(t, C.micro)) > 0.7 ? (hash(i + f) - 0.5) * 1.2 * micro : 0;
      s.grp.position.set(lerp(s.x0, 0, q) + mj, lerp(s.y + s.y0, s.y, q), lerp(s.z0, 0, q));
      s.grp.rotation.set(0, lerp(s.ry0, 0, q), lerp(s.rz0, 0, q));
      const split = (1 - q) * 0.9 + micro * 0.18;
      s.ch[0].position.x = split;
      s.ch[2].position.x = -split;
      s.ch[1].position.x = 0;
      s.ch.forEach((m) => {
        m.material.uniforms.uHot.value = (1 - q) * 0.7;
        m.material.uniforms.uAlpha.value = clamp(p * 4);
      });
    });
    const lock = hits(t, [C.lock], 7);
    glow3.material.uniforms.uS.value = 0.12 + lock * 0.35;
    dust3.material.uniforms.uAlpha.value = 0.5;
    bloomS = 0.5 + lock * 0.45 + (1 - e) * 0.45;
    flashA = hits(t, [C.lock], 26) * 0.18 + (t < C.reveal + 1 / FPS ? 0.5 : 0);
    glitch = hits(t, [C.reveal], 10) * 0.7 + micro * 0.5;
    slice = micro * 0.5;
    shift = 0.0012 + (1 - e) * 0.008 + micro * 0.01;
    noise = 0.07;
    barrel = 0.06;

    // Headline decodes in, then the sign-off.
    const hk = ramp(t, C.headline[0], C.headline[1]);
    if (hk > 0) {
      const font = `800 74px "Inter"`;
      const a = Math.min(1, hk * 4);
      const lines = ["THE INTERNET IS", "ABOUT TO CHANGE."];
      lines.forEach((ln, li) => {
        const kk = clamp(hk * 1.7 - li * 0.6);
        txt(scramble(ln, kk, f + li * 100), W / 2, 1012 + li * 92, { font, color: "#f4f4f4", alpha: a, spacing: 3, split: kk < 1 ? 5 : 0 });
      });
    }
    const ek = ramp(t, C.eot[0], C.eot[1]);
    if (ek > 0) {
      const line = "001 // END OF TRANSMISSION";
      txt(scramble(line, ek, f + 7), W / 2, 1620, { font: `500 34px ${MONO}`, color: "#c9c9c9", alpha: 0.9, spacing: 6 });
      if (ek >= 1 && Math.floor(t * 3) % 2 === 0) {
        g2.fillStyle = "#f20d2f";
        g2.globalAlpha = 0.9;
        g2.fillRect(W / 2 + 300, 1601, 18, 38);
        g2.globalAlpha = 1;
      }
    }
    txt("001", 72, 120, { font: `500 22px ${MONO}`, color: "#8a8a8a", align: "left", alpha: 0.4 * ramp(t, C.lock, C.lock + 0.4), spacing: 3 });
  }

  // ------------------------------------------------ 11.7–12.2 s: power off, then dark until the loop
  else {
    scene = sceneLogo;
    camera.fov = FOV_L;
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);
    stripGroups.forEach((s) => {
      s.grp.position.set(0, s.y, 0);
      s.grp.rotation.set(0, 0, 0);
      s.ch[0].position.x = 0;
      s.ch[2].position.x = 0;
    });
    txt("THE INTERNET IS", W / 2, 1012, { font: `800 74px "Inter"`, color: "#f4f4f4", spacing: 3 });
    txt("ABOUT TO CHANGE.", W / 2, 1104, { font: `800 74px "Inter"`, color: "#f4f4f4", spacing: 3 });
    txt("001 // END OF TRANSMISSION", W / 2, 1620, { font: `500 34px ${MONO}`, color: "#c9c9c9", alpha: 0.9, spacing: 6 });
    const a = ramp(t, C.powerOff[0], C.powerOff[0] + 0.14);
    const b = ramp(t, C.powerOff[0] + 0.14, C.powerOff[0] + 0.3);
    const fade = ramp(t, C.powerOff[0] + 0.3, C.powerOff[1]);
    offY = lerp(1, 0.004, easeIn(a));
    offX = lerp(1, 0.004, easeIn(b));
    flashA = 0;
    if (t >= C.powerOff[1]) {
      uiOnly = 1;
      g2.clearRect(0, 0, W, H);
      offY = 1;
      offX = 1;
    } else if (fade > 0) {
      offX = 0.004 * (1 - fade) + 0.0005;
      offY = 0.004 * (1 - fade) + 0.0005;
    }
    bloomS = 0.7 + a * 0.3;
    glitch = a > 0 && a < 0.4 ? 0.3 : 0;
    noise = 0.09;
  }

  uiTex.needsUpdate = true;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderPass.scene = scene ?? sceneScreen;
  bloom.strength = bloomS;
  U.uGlitch.value = clamp(glitch, 0, 1.2);
  U.uSlice.value = clamp(slice, 0, 1.2);
  U.uSeed.value = f % 97;
  U.uShift.value = shift;
  U.uMosh.value = mosh;
  U.uOffY.value = offY;
  U.uOffX.value = offX;
  U.uNoise.value = noise;
  U.uScan.value = scan;
  U.uTime.value = t;
  U.uInvert.value = invert;
  U.uFlash.value = clamp(flashA);
  U.uFlashCol.value.setRGB(...flashCol);
  U.uBarrel.value = barrel;
  U.uUIOnly.value = uiOnly;
  composer.render();
  return true;
};

await document.fonts.ready;
window.ready = true;
