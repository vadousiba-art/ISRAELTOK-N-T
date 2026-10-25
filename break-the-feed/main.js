// YORU — BREAK THE FEED. Deterministic composition: window.renderFrame(t)
// draws the frame at time t. Layers, back to front: 2D ink (bg), 3D (phone,
// paper folds, shards), 2D ink (fg); one final pass applies camera punch,
// controlled chromatic split, inversion, flashes and paper grain.

import * as THREE from "three";
import * as M from "./manga.js";

const { INK, PAPER, CRIMSON, rng, hash1, noise1, clamp, lerp, ramp, easeOut, easeIn, easeInOut, expoOut } = M;
const W = 1080;
const H = 1920;
const C = await (await fetch("/cues.json")).json();
const FPS = C.fps;
const SCALE = Number(new URLSearchParams(location.search).get("scale") || 1);
const JP = '"IPAGothic", "WenQuanYi Zen Hei", sans-serif';
await Promise.all([
  document.fonts.load('900 400px "Inter"'),
  document.fonts.load('600 44px "Inter"'),
  document.fonts.load(`700 70px ${JP}`),
]);

const shake = (t, f, s) => Math.sin(t * f + s) * 0.5 + Math.sin(t * f * 2.31 + s * 1.7) * 0.3 + Math.sin(t * f * 4.77 + s * 3.1) * 0.2;
const within = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;

// ---------------------------------------------------------------- images
const loadImg = (src) =>
  new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.src = src;
  });
const logoImg = await loadImg("/assets/wordmark.png");
const LOGO_AR = logoImg.height / logoImg.width;

// ---------------------------------------------------------------- 2D layers
function layer() {
  const cv = document.createElement("canvas");
  cv.width = Math.round(W * SCALE);
  cv.height = Math.round(H * SCALE);
  const g = cv.getContext("2d");
  return { cv, g };
}
const BG = layer();
const FG = layer();
const begin = (L) => {
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.clearRect(0, 0, L.cv.width, L.cv.height);
  L.g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
};

// ---------------------------------------------------------------- renderer + final pass
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
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
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tBG, tFG, t3D;
    uniform float uUse3D, uZoom, uRot, uShift, uInvert, uFlash, uGrain, uSeed;
    uniform vec2 uCenter, uOff;
    uniform vec3 uFlashCol;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed * 7.13) * 43758.5453); }
    // Keeps colours exact below the knee (the app screens) and rolls off highlights.
    vec3 knee(vec3 x){ vec3 k = vec3(0.8); return mix(x, k + (1.0 - exp(-(x - k) * 5.0)) * 0.2, step(k, x)); }
    vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    vec3 comp(vec2 uv){
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      vec3 col = texture2D(tBG, uv).rgb;
      if (uUse3D > 0.5) {
        vec4 s = texture2D(t3D, uv);
        vec3 c3 = toSRGB(knee(s.rgb / max(s.a, 1e-4)));
        col = mix(col, c3, clamp(s.a, 0.0, 1.0));
      }
      vec4 f = texture2D(tFG, uv);
      return mix(col, f.rgb, f.a);
    }
    void main(){
      const vec2 asp = vec2(1080.0, 1920.0);
      vec2 p = (vUv - uCenter) * asp;
      float c = cos(uRot), s = sin(uRot);
      p = mat2(c, s, -s, c) * p;
      p /= uZoom;
      vec2 uv = p / asp + uCenter - uOff;
      vec2 d = (uv - 0.5) * uShift;
      vec3 col = vec3(comp(uv + d).r, comp(uv).g, comp(uv - d).b);
      col = mix(col, 1.0 - col, uInvert);
      col += (h(vUv * asp) - 0.5) * uGrain;
      col = mix(col, uFlashCol, uFlash);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const finalScene = new THREE.Scene();
const finalCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
finalScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMat));
const FU = finalMat.uniforms;

// ================================================================ 3D: studio, phone
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 400);
scene.add(camera);

// Studio environment for reflections: two softboxes, a top strip, a faint crimson kicker.
{
  const env = new THREE.Scene();
  env.background = new THREE.Color(0, 0, 0);
  const box = (w, h, col, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  box(7, 26, new THREE.Color(7, 7, 7), [-15, 3, 7], [0, 0, 0]);
  box(5, 22, new THREE.Color(3.5, 3.5, 3.6), [15, 0, 5], [0, 0, 0]);
  box(30, 2.2, new THREE.Color(2.2, 2.2, 2.2), [0, 16, 3], [0, 0, 0]);
  box(18, 8, new THREE.Color(0.9, 0.03, 0.1), [3, -4, -16], [0, 0, 0]);
  box(40, 30, new THREE.Color(0.04, 0.04, 0.045), [0, 0, 22], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.03).texture;
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

const PH = { w: 6.5, h: 12.0, d: 0.62, r: 1.0 };
const FRONT = PH.d / 2 + 0.12;
const DISP = { w: 5.9, h: 11.4 }; // display area
const CONT = { w: 5.9, h: 5.9 * (16 / 9) }; // app screenshot area (9:16)
const CONT_Y = -(DISP.h - CONT.h) / 2 + 0.05;

const phone = new THREE.Group();
scene.add(phone);
const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(PH.w - 0.24, PH.h - 0.24, PH.r - 0.12), {
  depth: PH.d,
  bevelEnabled: true,
  bevelThickness: 0.12,
  bevelSize: 0.12,
  bevelSegments: 8,
  curveSegments: 32,
});
bodyGeo.translate(0, 0, -PH.d / 2);
const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x3c3c42, metalness: 1, roughness: 0.22, envMapIntensity: 2.2 });
const toonBody = new THREE.MeshBasicMaterial({ color: 0x050505 });
const body = new THREE.Mesh(bodyGeo, frameMat);
phone.add(body);
const outline = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xf4f2ee, side: THREE.BackSide }));
outline.scale.set(1.035, 1.02, 1.25);
outline.visible = false;
phone.add(outline);
const face = new THREE.Mesh(
  new THREE.ShapeGeometry(roundedRect(PH.w - 0.12, PH.h - 0.12, PH.r - 0.06), 32),
  new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }),
);
face.position.z = FRONT + 0.002;
phone.add(face);
for (const [y, h] of [
  [2.6, 1.5],
  [0.7, 0.9],
]) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.28), frameMat);
  b.position.set(PH.w / 2 + 0.02, y, 0);
  phone.add(b);
}

const texLoader = new THREE.TextureLoader();
const loadTex = (url) =>
  new Promise((res) =>
    texLoader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      res(t);
    }),
  );
const [texHome, texFeed, texProfile] = await Promise.all(["1-home", "1b-feed", "2-profile"].map((n) => loadTex(`/assets/${n}.png`)));

// Screen shader: slide transitions between real screens, and the manga
// treatment (inverted to paper, halftoned, ink edges, crimson kept as spot colour).
const SCREEN_FRAG = /* glsl */ `
  uniform sampler2D uA, uB;
  uniform float uMix, uManga, uMangaR, uFull, uBright;
  uniform vec2 uDisp, uCont; uniform float uContY;
  varying vec2 vUv;
  vec3 ui(vec2 uv){
    vec2 ua = uv + vec2(uMix, 0.0);
    vec2 ub = uv - vec2(1.0 - uMix, 0.0);
    if (ua.x <= 1.0) return texture2D(uA, ua).rgb * (1.0 - uMix * 0.4);
    return texture2D(uB, ub).rgb;
  }
  float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 manga(vec2 uv){
    vec3 c = ui(uv);
    vec2 tx = vec2(1.0 / 540.0, 1.0 / 960.0);
    float l = lum(ui(uv - vec2(tx.x, 0.0))), r = lum(ui(uv + vec2(tx.x, 0.0)));
    float b = lum(ui(uv - vec2(0.0, tx.y))), t = lum(ui(uv + vec2(0.0, tx.y)));
    float edge = length(vec2(r - l, t - b));
    float L = lum(c);
    // Bright UI -> ink; dark UI -> paper.
    float ink = smoothstep(0.08, 0.9, L);
    vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (uv * vec2(540.0, 960.0) / 3.2);
    float d = length(fract(g) - 0.5);
    float dots = 1.0 - smoothstep(-0.04, 0.04, d - sqrt(ink) * 0.62);
    float tone = ink > 0.82 ? 1.0 : (ink < 0.1 ? 0.0 : dots);
    vec3 m = vec3(0.957, 0.949, 0.933) * (1.0 - tone) + vec3(0.04) * tone;
    m = mix(m, vec3(0.04), smoothstep(0.12, 0.3, edge));
    float red = c.r - max(c.g, c.b);
    m = mix(m, vec3(0.9, 0.06, 0.18), smoothstep(0.16, 0.3, red));
    return m;
  }
  void main(){
    vec2 uv = vUv;
    vec3 col = vec3(0.0);
    if (uFull > 0.5) {
      // Display area with rounded corners, status strip and camera hole.
      vec2 p = (uv - 0.5) * uDisp;
      vec2 q = abs(p) - (uDisp * 0.5 - 0.62);
      float sd = length(max(q, 0.0)) - 0.62;
      if (sd > 0.0) discard;
      float cy = (p.y - uContY) / uCont.y + 0.5;
      if (cy > 1.0) {
        col = vec3(0.0);
        float hole = length(p - vec2(0.0, uDisp.y * 0.5 - 0.42));
        col += vec3(0.05) * smoothstep(0.17, 0.15, hole) * smoothstep(0.1, 0.13, hole);
      } else {
        uv = vec2(uv.x, cy);
        vec3 base = ui(uv) * uBright;
        float rr = length((uv - 0.5) * vec2(0.5625, 1.0));
        float k = smoothstep(uMangaR, uMangaR - 0.02, rr) * uManga;
        float ring = smoothstep(0.03, 0.0, abs(rr - uMangaR)) * uManga * step(uMangaR, 1.1);
        col = mix(base, manga(uv), k);
        col = mix(col, vec3(0.03), ring);
      }
    } else {
      col = mix(ui(uv), manga(uv), uManga);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;
function screenMat(full) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: texHome },
      uB: { value: texFeed },
      uMix: { value: 0 },
      uManga: { value: 0 },
      uMangaR: { value: 0 },
      uFull: { value: full ? 1 : 0 },
      uBright: { value: 1 },
      uDisp: { value: new THREE.Vector2(DISP.w, DISP.h) },
      uCont: { value: new THREE.Vector2(CONT.w, CONT.h) },
      uContY: { value: CONT_Y },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: SCREEN_FRAG,
    side: THREE.DoubleSide,
  });
}
const scrMat = screenMat(true);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(DISP.w, DISP.h), scrMat);
screen.position.z = FRONT + 0.004;
phone.add(screen);
const glass = new THREE.Mesh(
  new THREE.ShapeGeometry(roundedRect(PH.w - 0.12, PH.h - 0.12, PH.r - 0.06), 32),
  new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.03 }),
);
glass.position.z = FRONT + 0.008;
phone.add(glass);

function setToon(on) {
  body.material = on ? toonBody : frameMat;
  outline.visible = on;
  glass.visible = !on;
  face.material.color.set(on ? 0x050505 : 0x030303);
}

// Paper sheets that fold away (attached to the camera so they start screen-aligned).
const SHEET_D = 6;
const sheetH = 2 * SHEET_D * Math.tan(THREE.MathUtils.degToRad(15));
const sheetW = sheetH * (W / H);
const snapshot = layer();
const snapTex = texOf(snapshot.cv);
const sheetMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: snapTex }, uShade: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMap; uniform float uShade; varying vec2 vUv;
    vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
    void main(){
      vec3 c = gl_FrontFacing ? toLin(texture2D(uMap, vUv).rgb) : vec3(0.78, 0.77, 0.75);
      gl_FragColor = vec4(c * uShade, 1.0);
    }`,
  side: THREE.DoubleSide,
});
// The slash line that splits the page (pixel space).
const SLASH = [
  [1180, 170],
  [760, 690],
  [330, 1250],
  [-110, 1810],
];
const splitA = SLASH[0];
const splitB = SLASH[3];
const halves = (() => {
  const rect = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  const d = [splitB[0] - splitA[0], splitB[1] - splitA[1]];
  const l = Math.hypot(...d);
  return splitPolyXY(rect, splitA, [d[0] / l, d[1] / l]);
})();
function splitPolyXY(poly, p, d) {
  const side = (q) => (q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0];
  const a = [];
  const b = [];
  for (let i = 0; i < poly.length; i++) {
    const q = poly[i];
    const r2 = poly[(i + 1) % poly.length];
    const s1 = side(q);
    const s2 = side(r2);
    (s1 >= 0 ? a : b).push(q);
    if (s1 * s2 < 0) {
      const tt = s1 / (s1 - s2);
      const x = [q[0] + (r2[0] - q[0]) * tt, q[1] + (r2[1] - q[1]) * tt];
      a.push(x);
      b.push(x);
    }
  }
  return [a, b];
}
const pxToSheet = ([x, y]) => [(x / W - 0.5) * sheetW, (0.5 - y / H) * sheetH];
const sheets = halves.map((poly, i) => {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(...pxToSheet(p))));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let k = 0; k < pos.count; k++) {
    uv[k * 2] = pos.getX(k) / sheetW + 0.5;
    uv[k * 2 + 1] = pos.getY(k) / sheetH + 0.5;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  // The upper sheet folds back over the top edge, the lower one over the bottom edge.
  const upper = poly.some(([x, y]) => x === 0 && y === 0);
  const hingeY = upper ? sheetH / 2 : -sheetH / 2;
  geo.translate(0, -hingeY, 0);
  const pivot = new THREE.Group();
  pivot.position.set(0, hingeY, -SHEET_D);
  const mesh = new THREE.Mesh(geo, sheetMat.clone());
  mesh.material.uniforms.uMap.value = snapTex;
  pivot.add(mesh);
  pivot.visible = false;
  camera.add(pivot);
  return { pivot, mesh, dir: upper ? 1 : -1, poly };
});

// Screen shards for the burst (content-space polygons on the phone screen).
const shardGroup = new THREE.Group();
scene.add(shardGroup);
const shards = (() => {
  const hw = CONT.w / 2;
  const hh = CONT.h / 2;
  const polys = M.fracture(
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ],
    17,
    3,
  );
  const r = rng(99);
  return polys.map((poly) => {
    const sp = M.shrinkPoly(poly, 0.06);
    const c = M.centroid(sp);
    const shape = new THREE.Shape(sp.map(([x, y]) => new THREE.Vector2(x - c[0], y - c[1])));
    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.getAttribute("position");
    const uv = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) {
      uv[k * 2] = (pos.getX(k) + c[0] + hw) / CONT.w;
      uv[k * 2 + 1] = (pos.getY(k) + c[1] + hh) / CONT.h;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const mat = screenMat(false);
    mat.uniforms.uA.value = texProfile;
    mat.uniforms.uManga.value = 1;
    const m = new THREE.Mesh(geo, mat);
    shardGroup.add(m);
    const dist = Math.hypot(c[0] / hw, c[1] / hh);
    return { m, c, dist, axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), spin: 1.5 + r() * 2.5, push: 0.8 + r() * 0.6 };
  });
})();
shardGroup.visible = false;

// ================================================================ 2D scene pieces
function drawLogo(g, cx, cy, w, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingQuality = "high";
  g.drawImage(logoImg, cx - w / 2, cy - (w * LOGO_AR) / 2, w, w * LOGO_AR);
  g.restore();
}

// The calm: tiny logo in a thin white panel border.
const CALM = { w: 380, h: 210, logo: 220 };
function drawCalm(g, borderK, logoA) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (logoA > 0) drawLogo(g, W / 2, H / 2, CALM.logo, logoA);
  if (borderK > 0) {
    const x = W / 2 - CALM.w / 2;
    const y = H / 2 - CALM.h / 2;
    const P = 2 * (CALM.w + CALM.h);
    let L = borderK * P;
    const segs = [
      [x, y, CALM.w, 0],
      [x + CALM.w, y, 0, CALM.h],
      [x + CALM.w, y + CALM.h, -CALM.w, 0],
      [x, y + CALM.h, 0, -CALM.h],
    ];
    g.save();
    g.strokeStyle = "#f4f2ee";
    g.lineWidth = 3;
    g.lineCap = "square";
    g.beginPath();
    g.moveTo(x, y);
    for (const [sx, sy, dx, dy] of segs) {
      const len = Math.abs(dx) + Math.abs(dy);
      const k = Math.min(1, L / len);
      g.lineTo(sx + dx * k, sy + dy * k);
      L -= len;
      if (L <= 0) break;
    }
    g.stroke();
    g.restore();
  }
}

// Impact frame 1: the calm panel shatters inside an ink explosion.
const IF1 = { cx: 560, cy: 880 };
const calmShards = (() => {
  const x = W / 2 - CALM.w / 2;
  const y = H / 2 - CALM.h / 2;
  const outer = [
    [x - 12, y - 12],
    [x + CALM.w + 12, y - 12],
    [x + CALM.w + 12, y + CALM.h + 12],
    [x - 12, y + CALM.h + 12],
  ];
  const r = rng(31);
  return M.fracture(outer, 41, 4).map((p) => {
    const c = M.centroid(p);
    const a = Math.atan2(c[1] - IF1.cy, c[0] - IF1.cx) + (r() - 0.5) * 0.5;
    return { p, c, a, depth: 0.4 + r() * 1.6, spin: (r() - 0.5) * 3 };
  });
})();
function drawIF1(bg, fg, e, variant) {
  const boil = Math.floor(e * 15);
  const paper = variant === "crimson" ? CRIMSON : PAPER;
  bg.fillStyle = paper;
  bg.fillRect(0, 0, W, H);
  if (variant !== "flash") {
    M.halftone(bg, {
      cell: 13,
      f: (x, y) => 0.75 * clamp((Math.hypot(x - IF1.cx, y - IF1.cy) - 620) / 700),
      angle: 0.6,
    });
  }
  const grow = 1 + Math.min(e, 1.5) * 0.06;
  M.radialLines(bg, { cx: IF1.cx, cy: IF1.cy, n: 200, rIn: [330 * grow, 600 * grow], width: [3, 42], seed: 100 + boil });
  if (variant === "flash") return;
  const k = expoOut(clamp(e / 0.28));
  M.inkSplash(bg, { cx: IF1.cx, cy: IF1.cy, R: 300 * (0.55 + 0.45 * k) + e * 16, seed: 7, spikes: 26, drops: 60, spatter: 220, k });
  M.starburst(bg, { cx: IF1.cx, cy: IF1.cy, rin: 110 + e * 10, rout: 250 * (0.6 + 0.4 * k) + e * 12, n: 22, seed: 200 + boil, color: variant === "crimson" ? CRIMSON : PAPER });
  // The shattered calm panel flies at the camera.
  for (const s of calmShards) {
    const d = 40 + (Math.pow(e + 0.05, 0.8) * 760 + e * 120) * s.depth;
    const tx = Math.cos(s.a) * d;
    const ty = Math.sin(s.a) * d;
    const sc = 1 + e * 2.4 * s.depth;
    const target = s.depth > 1.2 ? fg : bg;
    M.polyPath(target, s.p, tx, ty, s.spin * e, sc);
    target.fillStyle = INK;
    target.fill();
    target.lineWidth = 4 + s.depth * 3;
    target.strokeStyle = PAPER;
    target.stroke();
  }
  // Foreground ink drops racing past the lens.
  const r = rng(12);
  fg.fillStyle = INK;
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = 700 + e * (900 + r() * 900);
    const rad = 26 + r() * 60 + e * 30;
    fg.beginPath();
    fg.ellipse(IF1.cx + Math.cos(a) * d, IF1.cy + Math.sin(a) * d, rad * 1.8, rad, a, 0, Math.PI * 2);
    fg.fill();
  }
}

// P1: macro on a dry brush stroke.
const P1_STROKE = [
  [-2400, 2300],
  [-1200, 1500],
  [0, 1050],
  [1100, 700],
  [1900, 520],
];
function drawP1(bg, fg, e) {
  bg.fillStyle = PAPER;
  bg.fillRect(0, 0, W, H);
  // Camera travels along the stroke toward its dry tail.
  const k = easeOut(clamp(e / 0.8));
  const sx = lerp(-520, 520, k);
  const sy = lerp(330, -170, k);
  bg.save();
  bg.translate(sx, sy);
  bg.rotate(-0.08);
  M.brushStroke(bg, { pts: P1_STROKE, width: 2100, seed: 77, bristles: 1100, thin: 0.6, dry: 0.95, taper: 0.55, M: 170 });
  bg.restore();
  // A spatter hit on the beat.
  const hit = e - 0.4;
  if (hit >= 0) M.inkSplash(fg, { cx: 760, cy: 1380, R: 70, seed: 33, core: 0, drops: 24, spatter: 90, k: expoOut(clamp(hit / 0.15)) });
}

// P2: perspective typography on a receding plane.
const TC = (() => {
  const cv = document.createElement("canvas");
  cv.width = 1000;
  cv.height = 2400;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 1000, 2400);
  g.fillStyle = "#f4f2ee";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = '900 330px "Inter"';
  g.letterSpacing = "-6px";
  g.fillText("BREAK", 500, 560);
  g.fillText("THE", 500, 1120);
  g.fillText("FEED.", 500, 1680);
  const wFeed = g.measureText("FEED.").width;
  const wDot = g.measureText(".").width;
  // Centre of the full stop (cap-height dot sits on the baseline).
  return { cv, dot: [500 + wFeed / 2 - wDot / 2 - 4, 1680 - 30] };
})();
const P2 = { yH: -260, K: 1750, Lk: 560, zNear: 0.818, vNear: 1745, panel: [
  [34, 28],
  [1048, 52],
  [1040, 1884],
  [44, 1862],
] };
function p2Scroll(t) {
  const k = ramp(t, C.p2, C.p2 + 0.32);
  return 2600 * (1 - expoOut(k)) - 70 * ramp(t, C.p2 + 0.32, C.p2zoom[1]);
}
function p2RowV(y, scroll) {
  const z = P2.K / (y - P2.yH);
  return { v: P2.vNear + scroll - (z - P2.zNear) * P2.Lk, s: 1 / z };
}
function p2DotScreen(t) {
  const scroll = p2Scroll(t);
  let best = null;
  for (let y = 60; y < 1880; y++) {
    const { v, s } = p2RowV(y, scroll);
    const err = Math.abs(v - TC.dot[1]);
    if (!best || err < best.err) best = { err, y, x: W / 2 + (TC.dot[0] - 500) * s };
  }
  return [best.x, best.y];
}
function drawP2(bg, fg, t, slideK) {
  const g = fg;
  g.save();
  const oy = lerp(-1900, 0, easeOut(slideK));
  const rot = lerp(0.07, 0, easeOut(slideK));
  g.translate(W / 2, H / 2 + oy);
  g.rotate(rot);
  g.translate(-W / 2, -H / 2);
  // White gutter around the panel, then the panel.
  M.polyPath(g, M.shrinkPoly(P2.panel, -16), 0, 0, 0, 1, [0, 0]);
  g.fillStyle = PAPER;
  g.fill();
  M.polyPath(g, P2.panel, 0, 0, 0, 1, [0, 0]);
  g.fillStyle = "#000";
  g.fill();
  g.save();
  g.clip();
  const scroll = p2Scroll(t);
  const step = 1 / SCALE;
  for (let y = 40; y < 1890; y += step) {
    const { v, s } = p2RowV(y, scroll);
    if (v < 0 || v >= 2400) continue;
    g.drawImage(TC.cv, 0, v, 1000, 1, W / 2 - 500 * s, y, 1000 * s, step + 0.5);
  }
  // Depth fade toward the horizon.
  const grd = g.createLinearGradient(0, 0, 0, 900);
  grd.addColorStop(0, "rgba(0,0,0,0.92)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, 900);
  M.radialLines(g, { cx: W / 2, cy: P2.yH, n: 70, rIn: [600, 900], width: [1, 9], color: "#f4f2ee", seed: 300 + Math.floor(t * 15), alpha: 0.28, len: 3600 });
  // Vertical Japanese caption: フィードを壊せ (break the feed).
  vertJP(g, "フィードを壊せ", 980, 150, 46, "#f4f2ee");
  g.restore();
  M.panelBorder(g, P2.panel, { width: 9, color: PAPER });
  g.restore();
}

// Vertical Japanese with correct vertical forms: the long-vowel mark turns
// upright and small kana sit in the upper right of their cell.
function vertJP(g, str, x, y, size, color) {
  g.save();
  g.font = `700 ${size}px ${JP}`;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let yy = y;
  for (const ch of str) {
    g.save();
    if (ch === "ー") {
      g.translate(x, yy);
      g.rotate(Math.PI / 2);
      g.scale(1, -1);
      g.fillText(ch, 0, 0);
    } else if ("ィァゥェォッャュョ".includes(ch)) {
      g.fillText(ch, x + size * 0.12, yy - size * 0.12);
    } else {
      g.fillText(ch, x, yy);
    }
    g.restore();
    yy += size * 1.08;
  }
  g.restore();
}

// P3: halftone field collapsing into one point.
function drawP3(bg, e) {
  bg.fillStyle = "#000";
  bg.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const cell = 52;
  const col = lerp(0, 1, easeIn(clamp((e - 0.1) / 0.3)));
  bg.fillStyle = PAPER;
  bg.beginPath();
  const ang = 0.45;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let v = -24; v <= 24; v++) {
    for (let u = -14; u <= 14; u++) {
      const x0 = (u * ca - v * sa) * cell;
      const y0 = (u * sa + v * ca) * cell;
      const d = Math.hypot(x0, y0);
      const cov = clamp(1 - d / 1100);
      if (cov <= 0.02) continue;
      const sw = col * (3.2 - d / 500);
      const s = 1 - col;
      const x = cx + (x0 * Math.cos(sw) - y0 * Math.sin(sw)) * s;
      const y = cy + (x0 * Math.sin(sw) + y0 * Math.cos(sw)) * s;
      const rad = cell * 0.5 * Math.sqrt(cov) * 1.15 * (1 - col * 0.85);
      bg.moveTo(x + rad, y);
      bg.arc(x, y, rad, 0, Math.PI * 2);
    }
  }
  bg.fill();
}

// P4: white impact burst on black.
function drawP4(bg, e) {
  bg.fillStyle = "#000";
  bg.fillRect(0, 0, W, H);
  const boil = Math.floor(e * 15);
  const k = expoOut(clamp(e / 0.14));
  M.radialLines(bg, { cx: W / 2, cy: H / 2, n: 150, rIn: [380 * k + 120, 700 * k + 160], width: [2, 30], color: PAPER, seed: 400 + boil });
  M.starburst(bg, { cx: W / 2, cy: H / 2, rin: 230 * k, rout: 620 * k + e * 80, n: 30, seed: 500 + boil, color: PAPER });
  const ring = 260 + e * 2600;
  bg.save();
  bg.strokeStyle = PAPER;
  bg.lineWidth = Math.max(0, 34 * (1 - e / 0.4));
  bg.beginPath();
  bg.arc(W / 2, H / 2, ring, 0, Math.PI * 2);
  bg.stroke();
  bg.restore();
}

// P5: the crimson slash, drawn over the settled burst.
function drawP5(g, e) {
  drawP4(g, 0.4 + Math.min(e, 0.1) * 0.5);
  const k = expoOut(clamp(e / 0.1));
  M.brushStroke(g, { pts: SLASH, width: 150, seed: 61, color: CRIMSON, bristles: 110, dry: 0.5, progress: k, taper: 0.5, M: 160 });
  if (e > 0.06) {
    M.inkSplash(g, { cx: 300, cy: 1290, R: 60, seed: 62, core: 0, drops: 18, spatter: 60, color: CRIMSON, k: expoOut(clamp((e - 0.06) / 0.12)) });
    M.inkSplash(g, { cx: 900, cy: 520, R: 45, seed: 63, core: 0, drops: 12, spatter: 40, color: CRIMSON, k: expoOut(clamp((e - 0.06) / 0.12)) });
  }
}
let snapReady = false;
function ensureSnapshot() {
  if (snapReady) return;
  begin(snapshot);
  drawP5(snapshot.g, C.split - C.p5);
  snapTex.needsUpdate = true;
  snapReady = true;
}

// Studio backdrop.
const studioBG = (() => {
  const L = layer();
  const g = L.g;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const grd = g.createRadialGradient(W / 2, 760, 50, W / 2, 900, 1250);
  grd.addColorStop(0, "#1b1b1d");
  grd.addColorStop(0.45, "#0b0b0c");
  grd.addColorStop(1, "#000");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const fl = g.createRadialGradient(W / 2, 1660, 10, W / 2, 1660, 520);
  fl.addColorStop(0, "rgba(255,255,255,0.06)");
  fl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fl;
  g.save();
  g.translate(W / 2, 1660);
  g.scale(1, 0.18);
  g.translate(-W / 2, -1660);
  g.fillRect(0, 1100, W, 1100);
  g.restore();
  return L.cv;
})();

// Impact frame 2 — the poster. Static layers, cached.
const POSTER = { cx: 540, cy: 900 };
const posterBG = layer();
const posterFG = layer();
{
  const g = posterBG.g;
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  M.halftone(g, { cell: 12, angle: 0.6, f: (x, y) => 0.7 * clamp((Math.hypot(x - POSTER.cx, y - POSTER.cy) - 560) / 650) });
  M.radialLines(g, { cx: POSTER.cx, cy: POSTER.cy, n: 230, rIn: [470, 700], width: [3, 40], seed: 42 });
  M.crescent(g, { cx: POSTER.cx - 20, cy: POSTER.cy - 30, r: 400, rot: -0.25 });
  M.enso(g, { cx: POSTER.cx, cy: POSTER.cy, r: 520, width: 78, seed: 23 });
  const border = [
    [36, 40],
    [1046, 30],
    [1040, 1882],
    [30, 1890],
  ];
  M.panelBorder(g, border, { width: 12 });

  const f = posterFG.g;
  f.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  // Shards of the old feed, frozen mid-flight.
  const r = rng(808);
  const pieces = M.fracture(
    [
      [0, 0],
      [300, 0],
      [300, 420],
      [0, 420],
    ],
    808,
    3,
  );
  const spots = [
    [140, 330, -0.5],
    [930, 380, 0.4],
    [120, 1480, 0.3],
    [960, 1420, -0.3],
    [250, 1700, 0.8],
    [840, 1730, -0.7],
    [70, 900, 0.2],
    [1010, 990, -0.2],
  ];
  spots.forEach(([x, y, rot], i) => {
    const p = pieces[i % pieces.length];
    const c = M.centroid(p);
    const sc = 0.55 + r() * 0.5;
    M.polyPath(f, p, x - c[0], y - c[1], rot, sc);
    f.fillStyle = i % 3 === 0 ? INK : PAPER;
    f.fill();
    f.lineWidth = 7;
    f.strokeStyle = INK;
    f.stroke();
    if (i % 3 === 1) {
      f.save();
      M.polyPath(f, p, x - c[0], y - c[1], rot, sc);
      f.clip();
      M.halftone(f, { x: x - 200, y: y - 200, w: 400, h: 400, cell: 10, f: () => 0.35 });
      f.restore();
    }
  });
  M.inkSplash(f, { cx: POSTER.cx, cy: POSTER.cy, R: 520, seed: 91, core: 0, drops: 34, spatter: 140, k: 1 });
  // Caption box: フィードを壊せ, set vertically.
  f.save();
  f.fillStyle = PAPER;
  f.strokeStyle = INK;
  f.lineWidth = 5;
  f.fillRect(902, 96, 104, 560);
  f.strokeRect(902, 96, 104, 560);
  f.restore();
  vertJP(f, "フィードを壊せ", 954, 148, 66, INK);
  f.save();
  f.font = '900 60px "Inter"';
  f.letterSpacing = "2px";
  const tw = f.measureText("BREAK THE FEED").width;
  f.fillStyle = PAPER;
  f.strokeStyle = INK;
  f.lineWidth = 5;
  f.fillRect(66, 1712, tw + 44, 104);
  f.strokeRect(66, 1712, tw + 44, 104);
  f.fillStyle = INK;
  f.textBaseline = "middle";
  f.fillText("BREAK THE FEED", 88, 1766);
  f.fillStyle = CRIMSON;
  f.fillRect(66, 1822, 150, 10);
  f.restore();
}

// Sting: the logo inside a fractured panel.
const STING = { w: 860, h: 420, rot: -0.05 };
const stingPanel = [
  [W / 2 - STING.w / 2 - 10, H / 2 - STING.h / 2 + 18],
  [W / 2 + STING.w / 2 + 6, H / 2 - STING.h / 2 - 12],
  [W / 2 + STING.w / 2 - 8, H / 2 + STING.h / 2 + 10],
  [W / 2 - STING.w / 2 + 4, H / 2 + STING.h / 2 - 6],
];
function drawSting(bg, fg, e, shrink) {
  bg.fillStyle = "#000";
  bg.fillRect(0, 0, W, H);
  const boil = Math.floor(e * 15);
  const fx = 1 - ramp(shrink, 0, 0.3);
  if (fx > 0) {
    M.radialLines(bg, { cx: W / 2, cy: H / 2, n: 160, rIn: [520, 760], width: [2, 30], color: PAPER, seed: 600 + boil, alpha: fx });
    // Broken border fragments drifting away.
    const r = rng(612);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = 520 + e * 140 + r() * 260;
      const s = 20 + r() * 50;
      bg.save();
      bg.globalAlpha = fx;
      bg.translate(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d * 1.3);
      bg.rotate(a + e * (r() - 0.5) * 2);
      bg.fillStyle = PAPER;
      bg.fillRect(-s, -4, s * 2, 8);
      bg.restore();
    }
  }
  // Panel morphs toward the calm border; logo scales down to calm size.
  const k = easeInOut(shrink);
  const sx = lerp(1, CALM.w / STING.w, k);
  const sy = lerp(1, CALM.h / STING.h, k);
  const rot = lerp(STING.rot, 0, k);
  const poly = stingPanel.map(([x, y]) => {
    const dx = (x - W / 2) * sx;
    const dy = (y - H / 2) * sy;
    return [W / 2 + dx * Math.cos(rot) - dy * Math.sin(rot) , H / 2 + dx * Math.sin(rot) + dy * Math.cos(rot)];
  });
  M.polyPath(bg, poly, 0, 0, 0, 1, [0, 0]);
  bg.fillStyle = "#000";
  bg.fill();
  bg.save();
  bg.strokeStyle = PAPER;
  bg.lineWidth = lerp(10, 3, k);
  bg.lineJoin = "miter";
  bg.stroke();
  bg.restore();
  // Cracks radiating from the impact point at the panel's top-right corner.
  if (fx > 0) {
    const r = rng(640);
    const ox = poly[1][0] - 40;
    const oy = poly[1][1] + 40;
    bg.save();
    bg.globalAlpha = fx;
    bg.strokeStyle = PAPER;
    bg.lineWidth = 2.5;
    for (let i = 0; i < 11; i++) {
      let a = Math.PI * (0.55 + r() * 0.75);
      let x = ox;
      let y = oy;
      bg.beginPath();
      bg.moveTo(x, y);
      const n = 5 + Math.floor(r() * 5);
      for (let j = 0; j < n; j++) {
        a += (r() - 0.5) * 0.7;
        const l = 30 + r() * 70;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l;
        bg.lineTo(x, y);
      }
      bg.stroke();
    }
    bg.restore();
  }
  drawLogo(fg, W / 2, H / 2, lerp(760, CALM.logo, k));
}

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
  phone.visible = false;
  shardGroup.visible = false;
  sheets.forEach((s) => (s.pivot.visible = false));
  setToon(false);

  const punch = (t0, amt, dur = 0.22) => {
    const k = clamp((t - t0) / dur);
    return t >= t0 ? 1 + amt * (1 - easeOut(k)) : 1;
  };
  const kick = (t0, amp, decay = 14) => (t >= t0 ? amp * Math.exp(-(t - t0) * decay) : 0);

  // ---------------------------------------------------- 01 the calm
  if (t < C.impact1) {
    const fi = f - Math.round(C.logoIn * FPS);
    const logoA = fi < 0 ? 0 : fi === 1 ? 0.25 : 1;
    drawCalm(bg, easeInOut(ramp(t, C.border[0], C.border[1])), logoA);
  }

  // ---------------------------------------------------- 02 first impact
  else if (t < C.p1) {
    const e = t - C.impact1;
    const fi = f - Math.round(C.impact1 * FPS);
    const variant = fi === 0 ? "flash" : fi === 2 ? "crimson" : "normal";
    drawIF1(bg, fg, e, variant);
    invert = fi === 1 ? 1 : 0;
    zoom = punch(C.impact1 + 2 / FPS, 0.16, 0.3) * lerp(1, 1.06, ramp(t, 2.3, C.inkWipe[0])) * punch(2.8, 0.025, 0.15) * punch(3.2, 0.025, 0.15);
    const sk = kick(C.impact1, 16 / W, 11);
    off = [shake(t, 70, 1) * sk, shake(t, 64, 2) * sk * 0.56];
    rot = -0.045 + kick(C.impact1, 0.03, 9);
    shift = fi <= 3 ? 0.012 : kick(C.impact1, 0.006, 8);
    grain = 0.05;
    // Ink floods the frame.
    const w = ramp(t, C.inkWipe[0], C.inkWipe[1]);
    if (w > 0) M.inkSplash(fg, { cx: IF1.cx, cy: IF1.cy, R: lerp(320, 2600, easeIn(w)), seed: 8, spikes: 18, drops: 30, spatter: 120, k: 1 });
  }

  // ---------------------------------------------------- 03 panel break
  else if (t < C.fold[0]) {
    grain = 0.045;
    if (t < C.p2) {
      drawP1(bg, fg, t - C.p1);
      zoom = punch(C.p1 + 0.4, 0.02, 0.15);
    } else if (t < C.p3) {
      drawP1(bg, fg, C.p2 - C.p1);
      const slideK = clamp((t - C.p2) / (3 / FPS));
      drawP2(bg, fg, t, slideK);
      const land = C.p2 + 3 / FPS;
      const sk = kick(land, 10 / W, 16);
      off = [shake(t, 80, 4) * sk, shake(t, 70, 5) * sk];
      // Dive into the full stop.
      const zk = ramp(t, C.p2zoom[0], C.p2zoom[1]);
      if (zk > 0) {
        const [dx, dy] = p2DotScreen(t);
        center = [dx / W, 1 - dy / H];
        zoom = Math.exp(easeIn(zk) * Math.log(34));
      }
    } else if (t < C.p4) {
      const e = t - C.p3;
      drawP3(bg, e);
      zoom = lerp(18, 1, expoOut(clamp(e / 0.1)));
    } else if (t < C.p5) {
      const e = t - C.p4;
      drawP4(bg, e);
      zoom = punch(C.p4, 0.12, 0.25);
      flash = f === Math.round(C.p4 * FPS) ? 1 : 0;
      shift = kick(C.p4, 0.01, 10);
    } else if (t < C.split) {
      const e = t - C.p5;
      drawP5(bg, e);
      const sk = kick(C.p5, 9 / W, 18);
      off = [shake(t, 90, 6) * sk, shake(t, 80, 7) * sk];
      shift = kick(C.p5, 0.006, 12);
    } else {
      // The page splits along the slash.
      ensureSnapshot();
      bg.fillStyle = "#000";
      bg.fillRect(0, 0, W, H);
      const k = easeOut(ramp(t, C.split, C.fold[0]));
      const d = [splitB[0] - splitA[0], splitB[1] - splitA[1]];
      const l = Math.hypot(...d);
      const n = [-d[1] / l, d[0] / l];
      halves.forEach((poly, i) => {
        const s = (i === 0 ? 1 : -1) * 34 * k;
        bg.save();
        bg.translate(n[0] * s, n[1] * s);
        M.polyPath(bg, poly, 0, 0, 0, 1, [0, 0]);
        bg.clip();
        bg.setTransform(1, 0, 0, 1, n[0] * s * SCALE, n[1] * s * SCALE);
        bg.drawImage(snapshot.cv, 0, 0);
        bg.restore();
      });
    }
  }

  // ---------------------------------------------------- 04 the digital world (+ push)
  else if (t < C.burst[0]) {
    use3D = true;
    bg.drawImage(studioBG, 0, 0, W, H);
    phone.visible = true;
    const k = easeInOut(ramp(t, C.fold[0], C.push[0]));
    const pk = easeInOut(ramp(t, C.push[0], C.push[1]));
    const ang = lerp(lerp(0.62, -0.2, k), 0, pk);
    const settle = 1 - pk;
    const dist = lerp(lerp(39, 34, k), 19.57 + FRONT, pk);
    const camY = lerp(lerp(2.2, 0.8, k), CONT_Y, pk);
    phone.position.set(0, Math.sin(t * 1.3) * 0.08 * settle, 0);
    phone.rotation.set(0.04 * settle, Math.sin(t * 0.7) * 0.05 * settle, 0);
    camera.position.set(Math.sin(ang) * dist, camY, Math.cos(ang) * dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, lerp(0, CONT_Y, pk), 0);
    // Real screens, swiped like the app.
    const [s1, s2] = C.swipes;
    const u = scrMat.uniforms;
    if (t < s1 + 0.35) {
      u.uA.value = texHome;
      u.uB.value = texFeed;
      u.uMix.value = easeInOut(ramp(t, s1, s1 + 0.35));
    } else {
      u.uA.value = texFeed;
      u.uB.value = texProfile;
      u.uMix.value = easeInOut(ramp(t, s2, s2 + 0.35));
    }
    u.uManga.value = t >= C.manga[0] ? 1 : 0;
    u.uMangaR.value = lerp(0, 1.25, easeIn(ramp(t, C.manga[0], C.manga[1])));
    u.uBright.value = 1;
    // Paper sheets fold away to reveal the studio.
    const fk = ramp(t, C.fold[0], C.fold[1]);
    if (fk < 1) {
      ensureSnapshot();
      const d = [splitB[0] - splitA[0], splitB[1] - splitA[1]];
      const l = Math.hypot(...d);
      const n = [-d[1] / l, d[0] / l];
      sheets.forEach((s, i) => {
        s.pivot.visible = true;
        const a = easeInOut(fk) * (i === 0 ? 1.95 : 2.05);
        s.pivot.rotation.set(s.dir * a, 0, 0);
        const sep = (i === 0 ? 1 : -1) * 34;
        s.mesh.position.set((n[0] * sep * sheetW) / W, (-n[1] * sep * sheetH) / H, 0);
        s.mesh.material.uniforms.uShade.value = 0.35 + 0.65 * Math.cos(a * 0.8);
      });
    }
    const hit = kick(C.reveal, 1, 10);
    zoom = 1 + hit * 0.015;
    grain = fk < 1 ? 0.03 : 0.012;
  }

  // ---------------------------------------------------- 05 second impact
  else if (t < C.collapse[0]) {
    grain = 0.04;
    if (t < C.silence2[0]) {
      // Shards of the manga'd interface burst toward the lens.
      use3D = true;
      const e = t - C.burst[0];
      bg.fillStyle = PAPER;
      bg.fillRect(0, 0, W, H);
      const lk = ramp(t, C.burst[0], C.burst[0] + 0.25);
      M.halftone(bg, { cell: 13, angle: 0.6, f: (x, y) => 0.6 * lk * clamp((Math.hypot(x - 540, y - 960) - 500) / 700) });
      M.radialLines(bg, { cx: 540, cy: 960, n: 180, rIn: [520, 760], width: [2, 30], seed: 700 + Math.floor(e * 15), alpha: lk });
      camera.position.set(0, CONT_Y, 19.57 + FRONT);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, CONT_Y, 0);
      shardGroup.visible = true;
      shardGroup.position.set(0, CONT_Y, FRONT + 0.004);
      for (const s of shards) {
        const k = clamp((e - s.dist * 0.1) / 0.5);
        const q = Math.pow(k, 1.6);
        s.m.position.set(s.c[0] * (1 + q * 1.8 * s.push), s.c[1] * (1 + q * 1.4 * s.push), q * 17 * s.push);
        s.m.quaternion.setFromAxisAngle(s.axis, q * s.spin);
        s.m.material.uniforms.uA.value = texProfile;
        s.m.material.uniforms.uMix.value = 0;
      }
      // Ink strokes sweep across.
      M.brushStroke(fg, { pts: [[-200, 1500], [400, 1150], [1300, 700]], width: 120, seed: 71, bristles: 70, dry: 0.6, progress: expoOut(ramp(t, C.burst[0] + 0.05, C.burst[0] + 0.2)) });
      M.brushStroke(fg, { pts: [[1300, 1650], [600, 1300], [-200, 1100]], width: 90, seed: 72, bristles: 60, dry: 0.7, progress: expoOut(ramp(t, C.burst[0] + 0.2, C.burst[0] + 0.33)) });
      M.motionLines(fg, { angle: -0.5, n: 26, seed: 73 + Math.floor(e * 15), width: [2, 8], len: [500, 1600], alpha: ramp(t, 11.0, 11.1) * (1 - ramp(t, 11.3, 11.4)) });
      zoom = punch(C.burst[0], 0.04, 0.2) * punch(11.0, 0.03, 0.15) * punch(11.2, 0.03, 0.15);
      shift = kick(C.burst[0], 0.005, 10);
    } else if (t < C.climax) {
      // The breath before the hit.
      bg.fillStyle = PAPER;
      bg.fillRect(0, 0, W, H);
      M.radialLines(bg, { cx: POSTER.cx, cy: POSTER.cy, n: 120, rIn: [620, 820], width: [1, 6], seed: 801 });
      zoom = lerp(1, 0.95, easeOut(ramp(t, C.silence2[0], C.climax)));
    } else {
      // The poster. Flash, one inverted frame, then a held freeze.
      use3D = true;
      const fi = f - Math.round(C.climax * FPS);
      if (fi === 0) {
        bg.fillStyle = PAPER;
        bg.fillRect(0, 0, W, H);
        M.radialLines(bg, { cx: POSTER.cx, cy: POSTER.cy, n: 230, rIn: [470, 700], width: [3, 40], seed: 42 });
        use3D = false;
      } else {
        bg.drawImage(posterBG.cv, 0, 0, W, H);
        fg.drawImage(posterFG.cv, 0, 0, W, H);
        invert = fi === 1 ? 1 : 0;
        zoom = fi === 1 ? 1.06 : 1;
        shift = fi === 1 ? 0.01 : 0;
      }
      phone.visible = use3D;
      setToon(true);
      camera.fov = 58;
      camera.position.set(0, 0, 15);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, -0.4, 0);
      phone.position.set(0.7, -0.7, -2.6);
      phone.rotation.set(-0.86, 0.38, 0.34);
      const u = scrMat.uniforms;
      u.uA.value = texProfile;
      u.uMix.value = 0;
      u.uManga.value = 1;
      u.uMangaR.value = 2;
    }
  }

  // ---------------------------------------------------- collapse into black
  else if (t < C.logo[0]) {
    if (t < C.collapse[1]) {
      use3D = true;
      phone.visible = true;
      setToon(true);
      camera.fov = 58;
      camera.position.set(0, 0, 15);
      camera.lookAt(0, -0.4, 0);
      phone.position.set(0.7, -0.7, -2.6);
      phone.rotation.set(-0.86, 0.38, 0.34);
      bg.drawImage(posterBG.cv, 0, 0, W, H);
      fg.drawImage(posterFG.cv, 0, 0, W, H);
      const k = easeIn(ramp(t, C.collapse[0], C.collapse[1]));
      zoom = Math.max(0.004, 1 - k);
      rot = k * 0.9;
      grain = 0.04 * (1 - k);
    } else {
      bg.fillStyle = "#000";
      bg.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------- 06 brand reveal
  else if (t < C.sting) {
    bg.fillStyle = "#000";
    bg.fillRect(0, 0, W, H);
    const LW = 760;
    const LH = LW * LOGO_AR;
    const cy = 880;
    const x0 = W / 2 - LW / 2;
    const x1 = W / 2 + LW / 2;
    const rk = easeInOut(ramp(t, C.logo[0], C.logo[1]));
    const lineX = lerp(x0 - 24, x1 + 24, rk);
    const sc = lerp(1.015, 1, easeOut(ramp(t, C.logo[0], 14.4)));
    bg.save();
    bg.beginPath();
    bg.rect(0, 0, lineX, H);
    bg.clip();
    drawLogo(bg, W / 2, cy, LW * sc);
    bg.restore();
    // Crimson trace: a vertical scan line, then an underline drawn back, then gone.
    const fade = 1 - ramp(t, C.traceFade[0], C.traceFade[1]);
    bg.save();
    bg.fillStyle = CRIMSON;
    bg.shadowColor = "rgba(229,16,47,0.6)";
    bg.shadowBlur = 10;
    if (rk < 1) {
      bg.fillRect(lineX - 2, cy - LH / 2 - 26, 4, LH + 52);
    }
    const tk = easeInOut(ramp(t, C.trace[0], C.trace[1]));
    if (t >= C.trace[0] && fade > 0) {
      bg.globalAlpha = fade;
      const uy = cy + LH / 2 + 34;
      bg.fillRect(lerp(x1, x0, tk), uy, (x1 - lerp(x1, x0, tk)), 3);
      // The scan line shrinks into the underline's start.
      const vh = (LH + 52) * (1 - ramp(t, C.trace[0], C.trace[0] + 0.15));
      if (vh > 1) bg.fillRect(x1 + 22, uy - vh, 4, vh);
    }
    bg.restore();
    // Tagline.
    const gk = easeOut(ramp(t, C.tagline[0], C.tagline[1]));
    if (gk > 0) {
      bg.save();
      bg.globalAlpha = gk;
      bg.fillStyle = "#f2f2f2";
      bg.font = '600 44px "Inter"';
      bg.fontKerning = "normal";
      bg.textAlign = "center";
      bg.textBaseline = "middle";
      const sp = lerp(0.42, 0.24, gk) * 44;
      bg.letterSpacing = `${sp}px`;
      bg.fillText("THE FEED IS YOURS.", W / 2 + sp / 2, 1110);
      bg.restore();
    }
  }

  // ---------------------------------------------------- 07 final sting -> back to the calm
  else {
    const e = t - C.sting;
    const fi = f - Math.round(C.sting * FPS);
    if (t >= C.endBlack) {
      bg.fillStyle = "#000";
      bg.fillRect(0, 0, W, H);
    } else if (t >= C.calmHold[0]) {
      drawCalm(bg, 1, 1);
    } else if (fi === 0) {
      bg.fillStyle = PAPER;
      bg.fillRect(0, 0, W, H);
      M.radialLines(bg, { cx: W / 2, cy: H / 2, n: 160, rIn: [520, 760], width: [2, 30], seed: 600 });
    } else {
      const shrink = ramp(t, C.shrink[0], C.shrink[1]);
      drawSting(bg, fg, e, shrink);
      invert = fi === 1 ? 1 : 0;
      zoom = (fi === 1 ? 1.08 : 1) * lerp(1, 1.035, ramp(t, C.sting, C.shrink[0])) * (1 - 0.035 * easeInOut(shrink));
      shift = fi <= 2 ? 0.008 : 0;
      const sk = kick(C.sting, 10 / W, 14);
      off = [shake(t, 80, 8) * sk, shake(t, 75, 9) * sk];
      grain = 0.03 * (1 - shrink);
    }
  }

  bgTex.needsUpdate = true;
  fgTex.needsUpdate = true;
  if (use3D) {
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setRenderTarget(rt3d);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  }
  camera.fov = 30;
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
  renderer.setClearColor(0x000000, 1);
  renderer.render(finalScene, finalCam);
  return true;
};

await document.fonts.ready;
window.ready = true;
