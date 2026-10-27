// YORU launch trailer — deterministic Three.js composition.
// Every visual is a pure function of time t (seconds). The renderer calls
// window.renderFrame(t) once per frame, in order, and captures the result.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const W = 1080;
const H = 1920;
const RED = new THREE.Color("#f20d2f");
const C = await (await fetch("/cues.json")).json();
const BEAT = 60 / C.bpm;
const SCALE = Number(new URLSearchParams(location.search).get("scale") || 1);

// ---------------------------------------------------------------- helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const easeIn = (k) => k * k * k;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const expo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
// Smooth deterministic noise for camera shake.
const shake = (t, f, s) => Math.sin(t * f * 1.0 + s) * 0.5 + Math.sin(t * f * 2.31 + s * 1.7) * 0.3 + Math.sin(t * f * 4.77 + s * 3.1) * 0.2;
// Envelope that spikes at each time in list and decays.
const hits = (t, list, decay = 14) => list.reduce((m, c) => (t >= c ? Math.max(m, Math.exp(-(t - c) * decay)) : m), 0);
const lastCue = (t, list) => {
  let idx = -1;
  for (let i = 0; i < list.length; i++) if (t >= list[i]) idx = i;
  return idx;
};
const beatEnv = (t, start, decay = 9) => (t < start ? 0 : Math.exp(-(((t - start) % BEAT) * decay)));

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(SCALE);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000);

const loader = new THREE.TextureLoader();
const loadTex = (url) =>
  new Promise((res) =>
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      res(t);
    }),
  );
const SCREEN_FILES = ["1-home", "4-chat", "2-profile", "5-explore", "1b-feed", "3-color", "6-levelup"];
const [screenTex, logoImg] = await Promise.all([
  Promise.all(SCREEN_FILES.map((f) => loadTex(`/assets/${f}.png`))),
  new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.src = "/assets/wordmark.png";
  }),
]);
const logoTex = new THREE.Texture(logoImg);
logoTex.colorSpace = THREE.SRGBColorSpace;
logoTex.needsUpdate = true;

// ---------------------------------------------------------------- shared GLSL
const ROT = /* glsl */ `
vec3 rotAxis(vec3 v, vec3 a, float ang){ float c=cos(ang), s=sin(ang); return v*c + cross(a,v)*s + a*dot(a,v)*(1.0-c); }
`;

// ================================================================ SCENE A — the structure
const sceneA = new THREE.Scene();
sceneA.fog = new THREE.FogExp2(0x000000, 0.012);

// Crystal of ~5000 shards that fracture on the first impact.
function buildShards() {
  const ico = new THREE.IcosahedronGeometry(5.2, 12);
  const pos = ico.getAttribute("position");
  const n = pos.count;
  const center = new Float32Array(n * 3);
  const rand = new Float32Array(n * 3);
  const bary = new Float32Array(n * 3);
  const r = rng(7);
  for (let f = 0; f < n / 3; f++) {
    const cx = (pos.getX(f * 3) + pos.getX(f * 3 + 1) + pos.getX(f * 3 + 2)) / 3;
    const cy = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
    const cz = (pos.getZ(f * 3) + pos.getZ(f * 3 + 1) + pos.getZ(f * 3 + 2)) / 3;
    const rr = [r(), r(), r()];
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k;
      center.set([cx, cy, cz], i * 3);
      rand.set(rr, i * 3);
      bary.set(k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1], i * 3);
    }
  }
  ico.setAttribute("aCenter", new THREE.BufferAttribute(center, 3));
  ico.setAttribute("aRand", new THREE.BufferAttribute(rand, 3));
  ico.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: { uExplode: { value: 0 }, uGlow: { value: 0 }, uScan: { value: -10 }, uHeat: { value: 0 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      ${ROT}
      uniform float uExplode;
      attribute vec3 aCenter; attribute vec3 aRand; attribute vec3 aBary;
      varying vec3 vBary; varying vec3 vN; varying vec3 vW; varying float vR; varying float vDist;
      void main(){
        vec3 local = position - aCenter;
        float tt = uExplode;
        vec3 axis = normalize(aRand*2.0-1.0 + vec3(0.001));
        local = rotAxis(local, axis, tt*(1.5 + aRand.x*9.0));
        local *= 1.0 + aRand.y*0.6*min(tt,1.0);
        vec3 dir = normalize(normalize(aCenter) + (aRand-0.5)*0.9);
        float dist = (5.0 + aRand.y*34.0) * (1.0 - exp(-tt*1.35)) + tt*(0.5+aRand.z*4.0);
        vec3 p = aCenter + dir*dist + local;
        vec4 w = modelMatrix * vec4(p,1.0);
        vW = w.xyz; vBary = aBary; vR = aRand.z; vDist = dist;
        vN = normalize(mat3(modelMatrix) * rotAxis(normalize(aCenter), axis, tt*(1.5 + aRand.x*9.0)));
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; uniform float uScan; uniform float uHeat; uniform float uFade;
      varying vec3 vBary; varying vec3 vN; varying vec3 vW; varying float vR; varying float vDist;
      void main(){
        float e = min(min(vBary.x, vBary.y), vBary.z);
        float edge = 1.0 - smoothstep(0.0, 0.06, e);
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
        vec3 red = vec3(0.95, 0.05, 0.18);
        vec3 col = vec3(0.008) + red * fres * 0.3;
        col += red * edge * (0.18 + uGlow*1.1);
        float band = exp(-pow((vW.y - uScan)*1.6, 2.0));
        col += red * band * 0.9 * edge + red * band * 0.25 + vec3(1.0,0.6,0.6)*band*edge*0.6;
        col += red * uHeat * (0.2 + vR) * 0.8 * exp(-vDist*0.08);
        gl_FragColor = vec4(col, uFade);
      }`,
  });
  return new THREE.Mesh(ico, mat);
}
const crystal = buildShards();
sceneA.add(crystal);

const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.4, 4),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.05, 0.2), transparent: true }),
);
sceneA.add(core);

const lattice = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(7.6, 1)),
  new THREE.LineBasicMaterial({ color: new THREE.Color(1.2, 0.08, 0.18), transparent: true, opacity: 0.55 }),
);
sceneA.add(lattice);

const ringsA = [];
for (let i = 0; i < 4; i++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(9 + i * 2.2, 0.035 + i * 0.01, 8, 220),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.06, 0.2), transparent: true }),
  );
  ring.rotation.set(Math.PI / 2 + i * 0.5, i * 0.7, 0);
  ringsA.push(ring);
  sceneA.add(ring);
}

// Signal flare + expanding rings for the opening.
const signal = new THREE.Mesh(new THREE.CircleGeometry(0.22, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.1, 0.3), transparent: true }));
const signalRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.0, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.06, 0.2), transparent: true, side: THREE.DoubleSide }));
sceneA.add(signal, signalRing);

// Huge background monoliths for scale.
const monoA = new THREE.Group();
{
  const r = rng(11);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.0, 0.006) }));
    const a = r() * Math.PI * 2;
    const rad = 40 + r() * 60;
    m.position.set(Math.cos(a) * rad, (r() - 0.5) * 30, -40 - r() * 120);
    m.scale.set(3 + r() * 8, 40 + r() * 120, 3 + r() * 8);
    m.rotation.y = r() * Math.PI;
    monoA.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 0.02, 0.07), transparent: true, opacity: 0.6 }));
    e.position.copy(m.position);
    e.scale.copy(m.scale);
    e.rotation.copy(m.rotation);
    monoA.add(e);
  }
}
sceneA.add(monoA);

// ================================================================ particles (shared field)
function buildDust(count, spread, seed) {
  const r = rng(seed);
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const th = r() * Math.PI * 2;
    const ph = Math.acos(2 * r() - 1);
    const rad = Math.pow(r(), 0.5) * spread;
    p.set([Math.sin(ph) * Math.cos(th) * rad, Math.sin(ph) * Math.sin(th) * rad * 1.6, Math.cos(ph) * rad], i * 3);
    a.set([r(), r(), r(), r()], i * 4);
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(a, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uCollapse: { value: 0 },
      uTarget: { value: new THREE.Vector3() },
      uBurst: { value: -1 },
      uSize: { value: 1 },
      uFlow: { value: 0 },
      uScale: { value: SCALE },
    },
    vertexShader: /* glsl */ `
      ${ROT}
      uniform float uTime, uAlpha, uCollapse, uBurst, uSize, uFlow, uScale; uniform vec3 uTarget;
      attribute vec4 aRand; varying float vA; varying float vHot;
      void main(){
        vec3 p = position;
        p += vec3(sin(uTime*0.6 + aRand.x*40.0), cos(uTime*0.5 + aRand.y*40.0), sin(uTime*0.4 + aRand.z*40.0)) * (0.6 + aRand.w);
        p.z += uFlow * (aRand.w*0.5+0.5);
        if (uCollapse > 0.0) {
          float c = pow(uCollapse, 1.6 + aRand.x);
          vec3 d = p - uTarget;
          d = rotAxis(d, vec3(0.0,0.0,1.0), c*7.0*(0.5+aRand.y));
          p = uTarget + d * (1.0 - c);
        }
        if (uBurst >= 0.0) {
          vec3 dir = normalize(aRand.xyz*2.0-1.0 + vec3(0.0001));
          float spd = 6.0 + aRand.w*40.0;
          float r = spd * (1.0 - exp(-uBurst*2.2)) / 2.2 * 1.6;
          p = uTarget + dir * r + vec3(0.0, -uBurst*uBurst*0.15, 0.0);
        }
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.7 + aRand.w*aRand.w*2.6) * uSize;
        gl_PointSize = min(sz * uScale * (110.0 / max(-mv.z, 0.5)), 18.0 * uScale);
        vA = uAlpha * (0.35 + 0.65*fract(aRand.x*13.0 + uTime*(0.4+aRand.y)));
        vHot = step(0.86, aRand.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vHot;
      void main(){
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q);
        float a = smoothstep(0.5, 0.0, d);
        vec3 col = mix(vec3(1.0,0.06,0.16), vec3(1.0,0.75,0.75), vHot);
        gl_FragColor = vec4(col * a, a * vA);
      }`,
  });
  return new THREE.Points(g, mat);
}
const dust = buildDust(16000, 90, 3);

// ================================================================ SCENE B — the city
const sceneB = new THREE.Scene();
sceneB.fog = new THREE.FogExp2(0x050001, 0.0085);
const CORRIDOR = 520;

const collapseChunk = /* glsl */ `
  uniform float uCollapse; uniform vec3 uTarget;
  vec3 collapseP(vec3 w, float k){
    if (uCollapse <= 0.0) return w;
    float c = pow(clamp(uCollapse * (0.75 + k*0.5), 0.0, 1.0), 1.7);
    vec3 d = w - uTarget;
    float ang = c * 5.5;
    d.xy = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d.xy;
    return uTarget + d * (1.0 - c);
  }`;

// Radial monolith architecture lining a tunnel.
function buildPillars() {
  const count = 1100;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPulse: { value: 0 }, uCollapse: { value: 0 }, uTarget: { value: new THREE.Vector3() }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      ${collapseChunk}
      attribute float aSeed;
      varying vec3 vL; varying vec3 vW; varying float vSeed; varying vec3 vS;
      void main(){
        vL = position; vSeed = aSeed;
        vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
        w.xyz = collapseP(w.xyz, aSeed);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uPulse; uniform float uTime;
      varying vec3 vL; varying vec3 vW; varying float vSeed; varying vec3 vS;
      void main(){
        vec3 a = abs(vL) * 2.0;
        vec3 px = (1.0 - a) * vS * 0.5;
        float m = min(min(px.x,px.y),px.z);
        float edge = 1.0 - smoothstep(0.0, 0.12, m);
        float stripes = smoothstep(0.92, 1.0, sin(vL.y * vS.y * 1.2 + vSeed*30.0 - uTime*6.0*(vSeed-0.5)));
        vec3 red = vec3(1.0, 0.04, 0.15);
        vec3 col = vec3(0.01, 0.004, 0.006);
        col += red * edge * (0.2 + uPulse * 1.1);
        col += red * stripes * 0.45 * step(0.55, vSeed) * (0.5 + uPulse);
        float d = length(vW - cameraPosition);
        col *= exp(-d * 0.013);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const seeds = new Float32Array(count);
  const r = rng(21);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const ang = r() * Math.PI * 2;
    const rad = 11 + Math.pow(r(), 1.5) * 34;
    const z = 30 - r() * CORRIDOR;
    const h = 10 + r() * 70;
    const w = 0.8 + r() * 3.5;
    // Point the long axis toward the tunnel centre (spikes of architecture).
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const centreR = rad + h / 2;
    m4.compose(new THREE.Vector3(dir.x * centreR, dir.y * centreR, z), q, new THREE.Vector3(w, h, w * (0.6 + r() * 2)));
    mesh.setMatrixAt(i, m4);
    seeds[i] = r();
  }
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  return mesh;
}
const pillars = buildPillars();
sceneB.add(pillars);

// Gate rings and hexagonal frames along the tunnel.
const gateMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: { uPulse: { value: 0 }, uCollapse: { value: 0 }, uTarget: { value: new THREE.Vector3() }, uI: { value: 1 } },
  vertexShader: /* glsl */ `
    ${collapseChunk}
    attribute float aSeed;
    void main(){
      vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
      w.xyz = collapseP(w.xyz, aSeed);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uPulse; uniform float uI;
    void main(){ gl_FragColor = vec4(vec3(1.0,0.04,0.15) * (0.35 + uPulse*1.4) * uI, 1.0); }`,
});
const gates = (() => {
  const n = 22;
  const geo = new THREE.TorusGeometry(9.5, 0.09, 6, 6);
  const mesh = new THREE.InstancedMesh(geo, gateMat, n);
  const seeds = new Float32Array(n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const s = 1 + (i % 3) * 0.35;
    m4.compose(new THREE.Vector3(0, 0, -20 - i * 22), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, i * 0.4)), new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m4);
    seeds[i] = i / n;
  }
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  return mesh;
})();
sceneB.add(gates);

// Light streaks rushing past the camera (particle trails).
const streaks = (() => {
  const n = 1800;
  const r = rng(31);
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 2 * 3);
  const a = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const rad = 2.5 + Math.pow(r(), 0.7) * 26;
    const z = r();
    const sp = r();
    for (let k = 0; k < 2; k++) {
      p.set([Math.cos(ang) * rad, Math.sin(ang) * rad, 0], (i * 2 + k) * 3);
      a.set([z, sp, k], (i * 2 + k) * 3);
    }
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("aInfo", new THREE.BufferAttribute(a, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTravel: { value: 0 }, uSpeed: { value: 1 }, uAlpha: { value: 0 }, uCollapse: { value: 0 }, uTarget: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */ `
      ${collapseChunk}
      uniform float uTravel, uSpeed;
      attribute vec3 aInfo; varying float vK; varying float vS;
      void main(){
        float L = 160.0;
        float z = -mod(aInfo.x*L + uTravel*(0.6+aInfo.y*0.8), L) - 2.0;
        float len = 0.8 + uSpeed * (2.0 + aInfo.y*6.0);
        vec3 p = vec3(position.xy, z - aInfo.z*len);
        vec4 w = modelMatrix * vec4(p,1.0);
        w.xyz = collapseP(w.xyz, aInfo.y);
        vK = aInfo.z; vS = aInfo.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; varying float vK; varying float vS;
      void main(){
        vec3 col = mix(vec3(1.0,0.05,0.16), vec3(1.0,0.8,0.8), step(0.9, vS));
        gl_FragColor = vec4(col*1.1, (1.0 - vK) * uAlpha * 0.75);
      }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  return lines;
})();
sceneB.add(streaks);

// Real YORU screens floating through the architecture.
const panelMat = (tex) =>
  new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: { uMap: { value: tex }, uAlpha: { value: 0 }, uGlitch: { value: 0 }, uCollapse: { value: 0 }, uTarget: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */ `
      ${collapseChunk}
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 w = modelMatrix * vec4(position,1.0);
        w.xyz = collapseP(w.xyz, 0.5);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uAlpha; uniform float uGlitch;
      varying vec2 vUv;
      float h(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        vec2 uv = vUv;
        float row = floor(uv.y * 40.0);
        uv.x += (h(row + floor(uGlitch*30.0)) - 0.5) * 0.12 * uGlitch;
        vec4 c = texture2D(uMap, uv);
        float rr = texture2D(uMap, uv + vec2(0.01*uGlitch, 0.0)).r;
        c.r = max(c.r, rr);
        float border = step(uv.x, 0.012) + step(0.988, uv.x) + step(uv.y, 0.007) + step(0.993, uv.y);
        vec3 col = mix(c.rgb, vec3(1.6,0.06,0.22), clamp(border,0.0,1.0));
        gl_FragColor = vec4(col, uAlpha);
      }`,
  });
const panels = screenTex.map((tex, i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2 * (16 / 9)), panelMat(tex));
  const side = i % 2 === 0 ? -1 : 1;
  m.position.set(side * (4.2 + (i % 3) * 0.9), (i % 2 ? 1.6 : -1.4) + (i % 3 - 1) * 1.1, -46 - i * 27);
  m.rotation.set(0.05 * side, -side * 0.42, side * 0.08);
  m.userData.appear = C.words3.length ? 7.0 + i * 0.6 : 7;
  sceneB.add(m);
  return m;
});

const singularity = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.12, 0.4), transparent: true }));
sceneB.add(singularity);

// ================================================================ SCENE C — the logo
const sceneC = new THREE.Scene();
const LOGO_W = 7.0;
const LOGO_Y = 0.85;
const CAM_Z = 20;
const FOV_C = 40;
const logoAspect = logoImg.width / logoImg.height;
const LOGO_H = LOGO_W / logoAspect;

function buildLogoTiles() {
  const cv = document.createElement("canvas");
  cv.width = logoImg.width;
  cv.height = logoImg.height;
  const ctx = cv.getContext("2d");
  ctx.drawImage(logoImg, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const tile = 7;
  const r = rng(77);
  const targets = [];
  for (let y = 0; y < cv.height; y += tile) {
    for (let x = 0; x < cv.width; x += tile) {
      let alpha = 0;
      for (let yy = y; yy < Math.min(y + tile, cv.height); yy += 2) for (let xx = x; xx < Math.min(x + tile, cv.width); xx += 2) alpha = Math.max(alpha, data[(yy * cv.width + xx) * 4 + 3]);
      if (alpha > 18) targets.push([x, y]);
    }
  }
  const n = targets.length;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.getAttribute("position"));
  g.setAttribute("uv", base.getAttribute("uv"));
  const aT = new Float32Array(n * 3);
  const aS = new Float32Array(n * 3);
  const aU = new Float32Array(n * 4);
  const aR = new Float32Array(n * 4);
  const unit = LOGO_W / cv.width;
  targets.forEach(([x, y], i) => {
    const cx = (x + tile / 2) / cv.width;
    const cy = (y + tile / 2) / cv.height;
    aT.set([(cx - 0.5) * LOGO_W, LOGO_Y + (0.5 - cy) * LOGO_H, 0], i * 3);
    const th = r() * Math.PI * 2;
    const ph = Math.acos(2 * r() - 1);
    const rad = 7 + r() * 16;
    aS.set([Math.sin(ph) * Math.cos(th) * rad, Math.sin(ph) * Math.sin(th) * rad * 1.4, -Math.abs(Math.cos(ph)) * rad * 1.2 - 4], i * 3);
    aU.set([x / cv.width, 1 - (y + tile) / cv.height, (x + tile) / cv.width, 1 - y / cv.height], i * 4);
    aR.set([r(), r(), r(), cx * 0.42 + r() * 0.26], i * 4);
  });
  g.setAttribute("aTarget", new THREE.InstancedBufferAttribute(aT, 3));
  g.setAttribute("aStart", new THREE.InstancedBufferAttribute(aS, 3));
  g.setAttribute("aUv", new THREE.InstancedBufferAttribute(aU, 4));
  g.setAttribute("aRand", new THREE.InstancedBufferAttribute(aR, 4));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uT: { value: -1 }, uMap: { value: logoTex }, uSize: { value: unit * tile }, uLock: { value: 0 }, uDur: { value: 0.72 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      ${ROT}
      uniform float uT, uSize, uDur;
      attribute vec3 aTarget; attribute vec3 aStart; attribute vec4 aUv; attribute vec4 aRand;
      varying vec2 vUv; varying float vP;
      void main(){
        float p = clamp((uT - aRand.w) / uDur, 0.0, 1.0);
        float e = 1.0 - pow(1.0 - p, 4.0);
        vec3 ctrl = aTarget + (aStart - aTarget) * 0.35 + vec3(0.0, 0.0, 4.0 + aRand.x*6.0);
        vec3 pos = mix(mix(aStart, ctrl, e), mix(ctrl, aTarget, e), e);
        vec3 local = position * uSize * (1.0 + (1.0 - e) * aRand.y * 1.6);
        vec3 axis = normalize(aRand.xyz * 2.0 - 1.0 + vec3(0.001));
        local = rotAxis(local, axis, (1.0 - e) * (4.0 + aRand.z * 10.0));
        vUv = mix(aUv.xy, aUv.zw, uv);
        vP = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + local, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uLock; uniform float uAlpha;
      varying vec2 vUv; varying float vP;
      void main(){
        vec4 c = texture2D(uMap, vUv);
        float k = smoothstep(0.55, 1.0, vP);
        vec3 hot = vec3(2.4, 0.12, 0.3);
        vec3 col = mix(hot, c.rgb, k) + vec3(1.0,0.5,0.55) * uLock * c.a;
        float a = mix(0.85, c.a, k) * smoothstep(0.0, 0.08, vP) * uAlpha;
        if (vP <= 0.0) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}
const logoTiles = buildLogoTiles();
sceneC.add(logoTiles);

const shock = [0, 1, 2].map((i) => {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.985, 1.0, 200),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.08, 0.3), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  m.position.set(0, LOGO_Y, -0.5 - i);
  sceneC.add(m);
  return m;
});
const burstCore = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.5), transparent: true }));
burstCore.position.set(0, LOGO_Y, 0);
sceneC.add(burstCore);

// ================================================================ post
const composer = new EffectComposer(renderer);
composer.setPixelRatio(SCALE);
composer.setSize(W, H);
const renderPass = new RenderPass(sceneA, camera);
composer.addPass(renderPass);
const after = new AfterimagePass(0.0);
composer.addPass(after);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 1.0, 0.55, 0.42);
composer.addPass(bloom);
const glitch = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uAmt: { value: 0 },
    uSeed: { value: 0 },
    uShift: { value: 0 },
    uGrain: { value: 0.06 },
    uVig: { value: 1 },
    uInvert: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uAmt, uSeed, uShift, uGrain, uVig, uInvert, uTime;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed*7.13) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // Block displacement
      vec2 blk = floor(uv * vec2(6.0, 48.0));
      float r = h(blk);
      float on = step(1.0 - uAmt*0.55, r);
      uv.x += (h(blk + 3.1) - 0.5) * 0.18 * on * uAmt;
      // Horizontal tear lines
      float line = step(0.985 - uAmt*0.05, h(vec2(floor(uv.y*260.0), uSeed)));
      uv.x += line * (h(vec2(uv.y, uSeed)) - 0.5) * 0.06 * uAmt;
      float s = uShift + uAmt * 0.012;
      vec2 dir = normalize(uv - 0.5 + 0.0001) * s;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;
      col = mix(col, vec3(1.0) - col, uInvert);
      // Grain + vignette
      float g = h(uv * vec2(1080.0, 1920.0) + uTime) - 0.5;
      col += g * uGrain;
      float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(1.0, 1.25)));
      col *= mix(1.0, v, uVig);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
});
composer.addPass(glitch);
composer.addPass(new OutputPass());

// ================================================================ type layer
const typeLayer = document.getElementById("type");
const flash = document.getElementById("flash");
const hud = document.getElementById("hud");
const tc = document.getElementById("tc");
const hudState = document.getElementById("hudState");
const logoEl = document.getElementById("logo");
const taglineEl = document.getElementById("tagline");
const urlEl = document.getElementById("url");
const redline = document.getElementById("redline");

// Pixel-exact placement of the HTML logo over the 3D tile logo.
const pxPerUnit = H / (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV_C / 2)));
const logoPxW = LOGO_W * pxPerUnit;
const logoPxH = LOGO_H * pxPerUnit;
const logoTop = H / 2 - LOGO_Y * pxPerUnit - logoPxH / 2;
logoEl.style.width = `${logoPxW}px`;
logoEl.style.top = `${logoTop}px`;
taglineEl.style.top = `${logoTop + logoPxH + 70}px`;
redline.style.top = `${logoTop + logoPxH + 34}px`;
urlEl.style.top = `${logoTop + logoPxH + 150}px`;

function makeWord(text, cls = "") {
  const el = document.createElement("div");
  el.className = `word ${cls}`;
  el.textContent = text;
  typeLayer.appendChild(el);
  return el;
}
const words2 = C.words2.map((w) => {
  const el = makeWord(w.text, w.style === "kanji" ? "jp" : "");
  const size = w.style === "giant" ? 330 : w.style === "kanji" ? 980 : w.text.length > 5 ? 190 : 260;
  el.style.fontSize = `${size}px`;
  if (w.style === "giant") {
    el.style.color = "#f20d2f";
  }
  return { ...w, el, size };
});
const JP3 = { ANIME: "アニメ", MANGA: "漫画", VOCALOID: "ボカロ", GAMING: "ゲーム", ART: "アート" };
const words3 = C.words3.map((w, i) => {
  const el = makeWord(w.text);
  el.style.fontSize = `${w.text.length > 6 ? 150 : 190}px`;
  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = JP3[w.text] ?? "";
  sub.style.fontSize = "52px";
  typeLayer.appendChild(sub);
  return { ...w, el, sub, i };
});
const yoruLetters = "YORU".split("").map((ch) => {
  const el = makeWord(ch);
  el.style.fontSize = "300px";
  return el;
});
const findEl = makeWord("FIND YOUR PEOPLE.");
findEl.style.fontSize = "112px";
findEl.style.letterSpacing = "-0.02em";

function setWord(el, { x = 0, y = 0, scale = 1, rot = 0, skew = 0, opacity = 1, blur = 0, split = 0, color }) {
  el.style.opacity = String(opacity);
  el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg) skewX(${skew}deg) scale(${scale})`;
  el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
  el.style.textShadow =
    split > 0.2
      ? `${split}px 0 rgba(242,13,47,0.95), ${-split * 0.8}px 0 rgba(255,255,255,0.55), 0 0 ${30 + split * 3}px rgba(242,13,47,0.6)`
      : "0 0 30px rgba(242,13,47,0.45)";
  if (color) el.style.color = color;
}

// Hard-cut camera setups for the fracture section.
const CUTS_A = [
  { p: [0, 0, 15], l: [0, 0, 0], fov: 55, roll: 0 },
  { p: [9, 3, 7], l: [0, 0, 0], fov: 40, roll: -0.2 },
  { p: [-4, -10, 9], l: [0, 1, 0], fov: 60, roll: 0.5 },
  { p: [0, 0, 6], l: [0, 0, -10], fov: 75, roll: 0.1 },
  { p: [16, -2, -6], l: [0, 0, 0], fov: 35, roll: -0.35 },
  { p: [-2, 14, 4], l: [0, 0, 0], fov: 50, roll: 0.9 },
  { p: [0, 0, 26], l: [0, 0, 0], fov: 32, roll: 0 },
  { p: [3, 1, 3], l: [-6, 0, -8], fov: 80, roll: -0.15 },
  { p: [-12, 4, 14], l: [0, 0, 0], fov: 45, roll: 0.25 },
];

// ================================================================ frame
window.renderFrame = (t) => {
  const beat = (t - C.grid) / BEAT;
  let scene = sceneA;

  // Defaults per frame.
  let flashCol = "#fff";
  let flashA = 0;
  let glAmt = 0;
  let shift = 0.0015;
  let bloomS = 1.1;
  let afterDamp = 0.0;
  let invert = 0;
  let grain = 0.07;
  let vig = 1;
  hud.style.opacity = t < 0.3 || t >= C.silence[0] ? "0" : "0.9";
  for (const w of [...words2, ...words3]) w.el.style.opacity = "0";
  for (const w of words3) w.sub.style.opacity = "0";
  for (const l of yoruLetters) l.style.opacity = "0";
  findEl.style.opacity = "0";

  // HUD timecode.
  const f = Math.floor(t * C.fps);
  tc.textContent = `00:00:${String(Math.floor(t)).padStart(2, "0")}:${String(f % C.fps).padStart(2, "0")}`;
  hudState.textContent = t < C.impact1 ? "SIGNAL" : t < C.section3 ? "FRACTURE" : t < C.collapse ? "夜 // CITY" : "COLLAPSE";

  // ------------------------------------------------ 0–3 s: signal + rush
  if (t < C.section3) {
    scene = sceneA;
    if (!dust.parent || dust.parent !== sceneA) sceneA.add(dust);
    const rushK = ramp(t, C.rush[0], C.rush[1]);
    const camZ = lerp(95, 12.5, easeIn(rushK) * 0.85 + rushK * 0.15);
    const pre = t < C.impact1;

    // Signal blinks before anything else is visible.
    const sig = hits(t, C.signal, 5);
    signal.visible = pre;
    signalRing.visible = pre;
    signal.material.opacity = Math.min(1, sig * 1.4 + ramp(t, 0.3, 1.3) * 0.4) * (1 - ramp(t, 2.4, 3.0));
    signal.position.set(0, 0, 6.5);
    const lastSig = lastCue(t, C.signal);
    const ringK = lastSig >= 0 ? t - C.signal[lastSig] : 0;
    signalRing.position.set(0, 0, 6.4);
    signalRing.scale.setScalar(0.4 + ringK * 6);
    signalRing.material.opacity = lastSig >= 0 ? Math.max(0, 0.9 - ringK * 1.4) : 0;
    signal.lookAt(0, 0, 200);
    signalRing.lookAt(0, 0, 200);

    // Structure reveal (lit by the signal), then fracture at impact.
    const reveal = ramp(t, 0.9, 2.4);
    const explode = Math.max(0, t - C.impact1);
    const shardsU = crystal.material.uniforms;
    shardsU.uExplode.value = explode;
    shardsU.uGlow.value = pre ? reveal * 0.6 + sig * 0.8 : Math.exp(-explode * 3.5) * 0.9;
    shardsU.uScan.value = pre ? lerp(-7, 7, ramp(t, 1.0, 2.9)) : -50;
    shardsU.uHeat.value = pre ? 0 : Math.exp(-explode * 1.2);
    shardsU.uFade.value = pre ? reveal : 1 - ramp(t, 6.2, 6.85) * 0.6;
    crystal.rotation.set(t * 0.12, t * 0.35, 0);
    core.visible = pre || explode < 0.08;
    core.material.opacity = pre ? reveal * 0.55 + sig * 0.15 : 1;
    core.scale.setScalar(pre ? 0.6 + 0.4 * reveal + Math.sin(t * 14) * 0.03 * reveal : 1.6);
    lattice.rotation.set(-t * 0.2, -t * 0.27, 0);
    lattice.scale.setScalar(pre ? 1 : 1 + explode * 6);
    lattice.material.opacity = pre ? reveal * 0.5 : Math.max(0, 0.8 - explode * 0.7);
    ringsA.forEach((r, i) => {
      r.rotation.z = t * (0.4 + i * 0.15) * (i % 2 ? -1 : 1);
      r.scale.setScalar(pre ? 0.6 + reveal * 0.4 : 1 + explode * (2 + i));
      r.material.opacity = pre ? reveal * 0.8 : Math.max(0, 1 - explode * 0.6);
    });
    monoA.visible = t > 0.9;
    monoA.children.forEach((m) => {
      if (m.material.opacity !== undefined) m.material.opacity = 0.6 * ramp(t, 0.9, 2.5);
    });

    const du = dust.material.uniforms;
    du.uTime.value = t;
    du.uAlpha.value = pre ? ramp(t, 1.3, 3.0) * 0.7 : 0.75;
    du.uCollapse.value = 0;
    du.uBurst.value = -1;
    du.uSize.value = 1;
    du.uFlow.value = pre ? easeIn(rushK) * 40 : 0;

    if (pre) {
      const sh = rushK * rushK * 0.35;
      camera.fov = lerp(42, 70, easeIn(rushK));
      camera.position.set(shake(t, 9, 1) * sh, shake(t, 8, 2) * sh, camZ);
      camera.up.set(Math.sin(rushK * rushK * 0.5), 1, 0).normalize();
      camera.lookAt(0, 0, 0);
      afterDamp = 0.55 * rushK;
      bloomS = 0.7 + rushK * 0.5 + sig * 0.5;
      glAmt = t > 2.6 ? ramp(t, 2.6, 3.0) * 0.6 : 0;
      shift = 0.001 + rushK * rushK * 0.01;
      grain = 0.09;
    } else {
      // ------------------------------------------------ 3–6.9 s: fracture, cuts, type
      const ci = Math.max(0, lastCue(t, C.cuts2));
      const cut = CUTS_A[ci % CUTS_A.length];
      const local = t - C.cuts2[ci];
      const drift = local * 1.6;
      const imp = hits(t, C.cuts2, 10);
      camera.fov = cut.fov + imp * 10;
      camera.position.set(cut.p[0] + drift * 0.6 + shake(t, 14, ci) * imp * 0.8, cut.p[1] + drift * 0.2 + shake(t, 13, ci + 3) * imp * 0.8, cut.p[2] + drift);
      camera.up.set(Math.sin(cut.roll + local * 0.3), Math.cos(cut.roll + local * 0.3), 0);
      camera.lookAt(...cut.l);
      flashA = hits(t, C.cuts2, 28) * 0.85;
      flashCol = ci % 3 === 1 ? "#f20d2f" : "#fff";
      glAmt = hits(t, C.cuts2, 9) * 0.9 + (ci === 7 ? 0.5 : 0);
      shift = 0.002 + imp * 0.012;
      bloomS = 0.9 + imp * 0.6;
      afterDamp = 0.35;
      invert = t >= C.impact1 && t < C.impact1 + 1 / 30 ? 1 : 0;

      // Kinetic words
      const wi = lastCue(t, C.words2.map((w) => w.t));
      if (wi >= 0) {
        const w = words2[wi];
        const dt = t - w.t;
        const slam = Math.exp(-dt * 16);
        const jit = (k) => shake(t, 40, k) * 10 * Math.exp(-dt * 6);
        if (w.style === "kanji") {
          setWord(w.el, { scale: 1 + slam * 0.6 + dt * 0.08, opacity: 0.92, blur: slam * 18, split: 14 * Math.exp(-dt * 5) + 4, x: jit(1), y: jit(2) - 40, color: "#f20d2f" });
        } else {
          setWord(w.el, {
            scale: (w.style === "giant" ? 1.0 : 0.95) + slam * 1.8 + dt * 0.06,
            skew: -14 * slam + (w.style === "giant" ? -6 : 0),
            rot: w.style === "giant" ? -4 : (wi % 2 ? 3 : -3) * (1 - slam),
            blur: slam * 22,
            split: 18 * Math.exp(-dt * 7) + 3,
            x: jit(3),
            y: jit(4) + (w.style === "giant" ? 0 : 120),
          });
        }
      }
    }
    scene = sceneA;
  }

  // ------------------------------------------------ 6.9–16 s: the city, collapse, silence
  else if (t < C.impactFinal) {
    scene = sceneB;
    if (dust.parent !== sceneB) sceneB.add(dust);
    const s = t - C.section3;
    const collapseK = ramp(t, C.collapse, C.silence[0] - 0.05);
    const travel = 18 * s + 9 * s * s * 0.5; // accelerating flight
    const camZ = 20 - Math.min(travel, 300);
    const target = new THREE.Vector3(0, 0, camZ - 32);
    const pulse = t < C.collapse ? beatEnv(t, C.grid, 7) : beatEnv(t, C.grid, 12) * 1.5;

    pillars.material.uniforms.uPulse.value = pulse;
    pillars.material.uniforms.uTime.value = t;
    gateMat.uniforms.uPulse.value = pulse;
    gateMat.uniforms.uI.value = 1;
    for (const mat of [pillars.material, gateMat, streaks.material, ...panels.map((p) => p.material)]) {
      mat.uniforms.uCollapse.value = collapseK;
      mat.uniforms.uTarget.value.copy(target);
    }
    streaks.material.uniforms.uTravel.value = travel * 1.3;
    streaks.material.uniforms.uSpeed.value = 1 + s * 0.7;
    streaks.material.uniforms.uAlpha.value = ramp(t, C.section3, C.section3 + 0.4) * (1 - collapseK * 0.3);
    streaks.position.set(0, 0, camZ);

    const du = dust.material.uniforms;
    du.uTime.value = t;
    du.uAlpha.value = 0.7 * (1 - collapseK * 0.75) * (1 - ramp(t, C.silence[0] - 0.1, C.silence[0]));
    du.uFlow.value = 0;
    du.uBurst.value = -1;
    du.uSize.value = 1;
    du.uCollapse.value = collapseK;
    du.uTarget.value.copy(target);
    dust.position.set(0, 0, camZ - 30);
    du.uTarget.value.set(0, 0, -2);

    // Panels with the real app screens.
    panels.forEach((p, i) => {
      const appear = 7.05 + i * 0.62;
      const vis = t >= appear && t < C.silence[0];
      p.visible = vis;
      const dt = t - appear;
      p.material.uniforms.uAlpha.value = vis ? Math.min(1, dt * 6) * (0.95 - collapseK * 0.2) : 0;
      p.material.uniforms.uGlitch.value = vis ? Math.max(Math.exp(-dt * 8), hits(t, [appear + 0.43], 20)) : 0;
      // Keep each panel ahead of the camera while it is on screen.
      p.position.z = camZ - 26 + Math.max(0, 1.4 - dt) * -18 + dt * 4 - (i % 2) * 2;
    });

    // Camera: flight with roll, beat punches, and accelerating cuts during collapse.
    let roll = s * 0.32 + Math.sin(s * 1.3) * 0.25;
    let fov = 62 + beatEnv(t, C.grid, 10) * 6;
    let off = [Math.sin(s * 0.9) * 2.2, Math.cos(s * 0.7) * 1.6];
    if (t >= C.collapse) {
      const ri = lastCue(t, C.roll);
      roll += ri * 1.13;
      fov = [55, 85, 40, 95, 48, 75][ri % 6] + collapseK * 10;
      off = [((ri * 7) % 5) - 2, ((ri * 3) % 5) - 2];
      flashA = hits(t, C.roll, 30) * 0.9 * (t < C.silence[0] ? 1 : 0);
      flashCol = ri % 2 ? "#f20d2f" : "#ffffff";
      invert = ri % 4 === 2 && t - C.roll[ri] < 1 / 30 ? 1 : 0;
      glAmt = hits(t, C.roll, 12) * (0.6 + collapseK);
    } else {
      flashA = hits(t, [C.yoruWord[0]], 20) * 0.9 + beatEnv(t, C.grid, 30) * 0.12;
      flashCol = "#f20d2f";
      glAmt = hits(t, [C.section3, C.yoruWord[0], C.findPeople[0]], 8) * 0.8 + beatEnv(t, C.grid, 20) * 0.15;
    }
    camera.fov = fov;
    camera.position.set(off[0] * (1 - collapseK), off[1] * (1 - collapseK), camZ);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(off[0] * 0.3 * (1 - collapseK), off[1] * 0.3 * (1 - collapseK), camZ - 40);
    bloomS = 0.85 + pulse * 0.45 + collapseK * 0.5;
    afterDamp = 0.55 + collapseK * 0.2;
    shift = 0.002 + pulse * 0.004 + collapseK * 0.01;

    // The single crimson point.
    singularity.position.copy(target);
    singularity.visible = t >= C.collapse;
    const sil = ramp(t, C.silence[0], C.silence[1]);
    singularity.scale.setScalar(t < C.silence[0] ? 0.4 + collapseK * 2.4 : lerp(1.3, 0.25, easeOut(sil)) + hits(t, [15.62], 9) * 0.5);
    singularity.material.opacity = t < C.silence[0] ? 1 : 1 - sil * 0.55;

    // Silence: everything but the point goes dark.
    const dark = t >= C.silence[0];
    pillars.visible = !dark;
    gates.visible = !dark;
    streaks.visible = !dark;
    if (dark) {
      hud.style.opacity = "0";
      flashA = 0;
      glAmt = 0;
      afterDamp = 0;
      bloomS = 1.6;
      grain = 0.03;
      camera.position.set(0, 0, target.z + 26);
      camera.up.set(0, 1, 0);
      camera.fov = 50;
      camera.lookAt(target);
    }

    // Kinetic type in the city.
    const wi = lastCue(t, C.words3.map((w) => w.t));
    if (wi >= 0 && t < C.yoruWord[0] - 0.43) {
      const w = words3[wi];
      const dt = t - w.t;
      if (dt < 0.43) {
        const slam = Math.exp(-dt * 18);
        const side = wi % 2 ? 1 : -1;
        setWord(w.el, { x: side * 60 * (1 - slam), y: -520 + wi * 240, scale: 1 + slam * 1.2, skew: -10 * side, rot: side * -6, blur: slam * 16, split: 10 * Math.exp(-dt * 8) + 2 });
        w.sub.style.opacity = String(Math.min(1, dt * 10));
        w.sub.style.top = `${960 - 520 + wi * 240 + 100}px`;
        w.sub.style.transform = `translateX(-50%) translateX(${side * 40}px)`;
      }
    }
    if (t >= C.yoruWord[0] && t < C.yoruWord[1]) {
      const dt = t - C.yoruWord[0];
      yoruLetters.forEach((el, i) => {
        const st = i * (BEAT / 2);
        const k = dt - st;
        if (k < 0) return;
        const slam = Math.exp(-k * 14);
        const x = (i - 1.5) * 235;
        const glitchy = hits(t, [C.yoruWord[0] + BEAT * 2.5], 16);
        setWord(el, { x: x + shake(t, 50, i) * glitchy * 40, y: shake(t, 30, i + 9) * slam * 30, scale: 1 + slam * 2.2, blur: slam * 20, split: 16 * Math.exp(-k * 6) + 4 + glitchy * 30, skew: -8 * slam, opacity: 1 - ramp(t, C.yoruWord[1] - 0.12, C.yoruWord[1]) });
      });
    }
    if (t >= C.findPeople[0] && t < C.findPeople[1]) {
      const dt = t - C.findPeople[0];
      const slam = Math.exp(-dt * 14);
      setWord(findEl, { y: 0, scale: 0.92 + slam * 1.4 + dt * 0.1, blur: slam * 14, split: 8 * Math.exp(-dt * 6) + 2, skew: -10 * slam, opacity: 1 - ramp(t, C.findPeople[1] - 0.1, C.findPeople[1]) });
    }
  }

  // ------------------------------------------------ 16–20 s: the logo
  else {
    scene = sceneC;
    if (dust.parent !== sceneC) sceneC.add(dust);
    hud.style.opacity = "0";
    const e = t - C.impactFinal;
    camera.fov = FOV_C + hits(t, [C.impactFinal], 6) * 14;
    camera.position.set(shake(t, 22, 1) * hits(t, [C.impactFinal], 3) * 0.6, shake(t, 21, 2) * hits(t, [C.impactFinal], 3) * 0.6, CAM_Z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    const lu = logoTiles.material.uniforms;
    lu.uT.value = t - C.assemble[0];
    lu.uLock.value = hits(t, [C.lock], 7) * 1.2;
    const crisp = ramp(t, C.lock + 0.05, C.lock + 0.3);
    lu.uAlpha.value = 1 - crisp;
    logoTiles.visible = crisp < 1;

    const du = dust.material.uniforms;
    dust.position.set(0, 0, 0);
    du.uTime.value = t;
    du.uCollapse.value = 0;
    du.uBurst.value = e;
    du.uTarget.value.set(0, LOGO_Y, 0);
    du.uFlow.value = 0;
    du.uSize.value = 1.1;
    du.uAlpha.value = (1 - ramp(t, 17.6, 18.9)) * 0.85;

    shock.forEach((m, i) => {
      const k = e - i * 0.08;
      m.visible = k > 0 && k < 1.6;
      m.scale.setScalar(0.3 + easeOut(clamp(k / 1.4)) * (16 + i * 6));
      m.material.opacity = 0.75 * Math.max(0, 1 - k / 1.2);
    });
    const lockRing = hits(t, [C.lock], 5);
    burstCore.visible = e < 0.5;
    burstCore.scale.setScalar(1 + e * 6);
    burstCore.material.opacity = Math.max(0, 1 - e * 3);

    flashA = t < C.impactFinal + 2 / 30 ? 1 : hits(t, [C.lock], 18) * 0.35;
    flashCol = t < C.impactFinal + 1 / 30 ? "#ffffff" : "#f20d2f";
    glAmt = hits(t, [C.impactFinal], 6) * 0.9 + hits(t, [C.lock], 16) * 0.4;
    shift = 0.0015 + hits(t, [C.impactFinal], 4) * 0.02;
    bloomS = 1.1 * (1 - ramp(t, 18.0, 19.0) * 0.6) + lockRing * 0.5;
    afterDamp = e < 0.5 ? 0.3 : t < C.lock + 0.2 ? 0.72 : lerp(0.72, 0, ramp(t, C.lock + 0.2, C.lock + 0.6));
    grain = lerp(0.06, 0.0, ramp(t, 18.2, 19.0));
    vig = 1;

    // Crisp HTML logo, tagline and the real site address.
    logoEl.style.opacity = String(crisp);
    logoEl.style.filter = `drop-shadow(0 0 ${40 + lockRing * 60}px rgba(242,13,47,${0.55 + lockRing * 0.4}))`;
    const lineK = easeOut(ramp(t, C.lock, C.lock + 0.6));
    redline.style.width = `${lineK * logoPxW * 0.9}px`;
    redline.style.opacity = String(1 - ramp(t, 18.6, 19.4) * 0.5);
    const tagK = ramp(t, C.tagline, C.tagline + 0.45);
    taglineEl.style.opacity = String(easeOut(tagK));
    taglineEl.style.letterSpacing = `${lerp(0.9, 0.42, easeOut(tagK))}em`;
    const url = "yoru-social.vercel.app";
    const n = Math.round(url.length * ramp(t, C.url[0], C.url[1]));
    const blink = t > C.url[1] && Math.floor(t * 3) % 2 === 1;
    if (t >= C.url[0]) {
      const typed = url.slice(0, n);
      const dom = typed.length > 4 ? `<span>${typed.slice(0, 4)}</span><span class="dom">${typed.slice(4, Math.min(typed.length, 11))}</span><span>${typed.slice(11)}</span>` : typed;
      urlEl.innerHTML = `${dom}<span class="cursor" style="opacity:${blink ? 0 : 1}"></span>`;
    } else {
      urlEl.innerHTML = "";
    }
  }

  if (scene !== sceneC) {
    logoEl.style.opacity = "0";
    taglineEl.style.opacity = "0";
    urlEl.innerHTML = "";
    redline.style.width = "0";
  }

  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderPass.scene = scene;
  after.uniforms.damp.value = afterDamp;
  bloom.strength = bloomS;
  glitch.uniforms.uAmt.value = clamp(glAmt, 0, 1.2);
  glitch.uniforms.uSeed.value = Math.floor(t * 30) % 97;
  glitch.uniforms.uShift.value = shift;
  glitch.uniforms.uGrain.value = grain;
  glitch.uniforms.uVig.value = vig;
  glitch.uniforms.uInvert.value = invert;
  glitch.uniforms.uTime.value = t;
  flash.style.background = flashCol;
  flash.style.opacity = String(clamp(flashA));
  composer.render();
  return true;
};

await document.fonts.ready;
await document.fonts.load('900 100px "Inter"');
window.ready = true;
