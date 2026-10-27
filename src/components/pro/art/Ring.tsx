"use client";

import { useId } from "react";
import type { RingP } from "@/lib/pro/catalog";

// Profile rings, drawn in SVG around the avatar. The avatar fills r=40
// of a 100×100 box; every ring stays in the band outside it, so the face is
// never covered. Motion is CSS (pro-spin/pulse/flicker/drift) and stops for
// reduced motion (see pro.css).

const TAU = Math.PI * 2;
const pt = (deg: number, r: number) => [50 + r * Math.cos((deg * TAU) / 360), 50 + r * Math.sin((deg * TAU) / 360)] as const;
function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function Art({ p, uid }: { p: RingP; uid: string }) {
  const { a, b } = p;
  const g = `${uid}g`;
  switch (p.style) {
    case "eclipse":
      return (
        <>
          <defs>
            <radialGradient id={g}>
              <stop offset="70%" stopColor={a} stopOpacity="0" />
              <stop offset="80%" stopColor={a} stopOpacity="0.9" />
              <stop offset="100%" stopColor={b} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill={`url(#${g})`} />
          <circle cx="50" cy="50" r="40.5" fill="none" stroke={a} strokeWidth="2" />
          <g className="pro-spin-slow" style={{ transformOrigin: "50px 50px" }}>
            <circle cx={pt(-60, 43)[0]} cy={pt(-60, 43)[1]} r="5.5" fill={b} stroke={a} strokeWidth="0.8" />
          </g>
        </>
      );
    case "halo":
      return (
        <g className="pro-pulse">
          <circle cx="50" cy="50" r="45" fill="none" stroke={a} strokeWidth="1.6" style={{ filter: `drop-shadow(0 0 2.5px ${a})` }} />
          <circle cx="50" cy="50" r="41" fill="none" stroke={a} strokeOpacity="0.35" strokeWidth="3" />
        </g>
      );
    case "circuit":
      return (
        <>
          <circle cx="50" cy="50" r="41" fill="none" stroke={b} strokeOpacity="0.4" strokeWidth="1" />
          {range(12).map((i) => {
            const d = i * 30;
            const [x1, y1] = pt(d, 41);
            const [x2, y2] = pt(d, 46);
            const [x3, y3] = pt(d + 12, 46);
            return (
              <g key={i}>
                <polyline points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill="none" stroke={a} strokeWidth="1.3" />
                <circle cx={x3} cy={y3} r="1.6" fill={i % 3 ? a : b} style={{ filter: `drop-shadow(0 0 1.5px ${a})` }} />
              </g>
            );
          })}
        </>
      );
    case "panel":
      return (
        <>
          <rect x="7" y="7" width="86" height="86" fill="none" stroke={b} strokeWidth="5" />
          <rect x="7" y="7" width="86" height="86" fill="none" stroke={a} strokeWidth="2.2" />
          <polyline points="78,7 82,14 79,19 86,24 93,22" fill="none" stroke={b} strokeWidth="2.2" />
          <polyline points="7,70 13,73 10,79" fill="none" stroke={b} strokeWidth="1.6" />
        </>
      );
    case "flame":
      return (
        <g className="pro-flicker">
          {range(18).map((i) => {
            const d = i * 20;
            const h = 6 + ((i * 7) % 5);
            const [bx1, by1] = pt(d - 7, 39);
            const [bx2, by2] = pt(d + 7, 39);
            const [tx, ty] = pt(d + 3, 39 + h);
            return <path key={i} d={`M${bx1},${by1} Q${pt(d - 4, 43)[0]},${pt(d - 4, 43)[1]} ${tx},${ty} Q${pt(d + 6, 43)[0]},${pt(d + 6, 43)[1]} ${bx2},${by2} Z`} fill={i % 2 ? a : "#000"} stroke={b} strokeWidth="0.7" />;
          })}
          <circle cx="50" cy="50" r="39.5" fill="none" stroke={b} strokeWidth="1.2" />
        </g>
      );
    case "orbit":
      return (
        <g className="pro-spin" style={{ transformOrigin: "50px 50px" }}>
          <ellipse cx="50" cy="50" rx="48" ry="40" fill="none" stroke={a} strokeWidth="0.9" transform="rotate(-25 50 50)" />
          <ellipse cx="50" cy="50" rx="48" ry="40" fill="none" stroke={a} strokeOpacity="0.5" strokeWidth="0.9" transform="rotate(35 50 50)" />
          <circle cx="94" cy="38" r="3.4" fill={b} />
          <path d="M10,64 l1.2,2.8 3,0.3 -2.3,2 0.7,3 -2.6,-1.6 -2.6,1.6 0.7,-3 -2.3,-2 3,-0.3z" fill={a} />
        </g>
      );
    case "roses":
      return (
        <>
          <circle cx="50" cy="50" r="41" fill="none" stroke={b} strokeWidth="2.4" />
          {range(8).map((i) => {
            const [x, y] = pt(i * 45 + 22, 43);
            const [lx, ly] = pt(i * 45, 44);
            return (
              <g key={i}>
                <ellipse cx={lx} cy={ly} rx="3.4" ry="1.4" fill="#2f6b3a" transform={`rotate(${i * 45 + 90} ${lx} ${ly})`} />
                <circle cx={x} cy={y} r="5" fill={a} />
                <path d={`M${x - 2.5},${y} a2.5,2.5 0 1,1 2.5,2.5 a1.6,1.6 0 1,1 -1.6,-1.6`} fill="none" stroke={b} strokeWidth="0.9" />
              </g>
            );
          })}
        </>
      );
    case "glitch":
      return (
        <g className="pro-flicker">
          <circle cx="48.6" cy="50" r="43" fill="none" stroke={a} strokeWidth="2" strokeDasharray="14 3 6 2" />
          <circle cx="51.4" cy="50.6" r="43" fill="none" stroke={b} strokeWidth="2" strokeDasharray="9 4 18 2" />
          <rect x="83" y="28" width="12" height="3" fill={a} />
          <rect x="4" y="66" width="10" height="2.4" fill={b} />
        </g>
      );
    case "crescent":
      return (
        <>
          <circle cx="50" cy="50" r="41.5" fill="none" stroke={a} strokeWidth="2.2" />
          <circle cx="50" cy="50" r="44.5" fill="none" stroke={b} strokeWidth="0.6" />
          <path d="M44,2.5 a9,9 0 1,0 12,0 a7,7 0 1,1 -12,0z" fill={a} />
        </>
      );
    case "electric":
      return (
        <g className="pro-pulse">
          <circle cx="50" cy="50" r="42" fill="none" stroke={a} strokeWidth="2.2" style={{ filter: `drop-shadow(0 0 2px ${a})` }} />
          {[[-40, 1], [140, -1]].map(([d, s], i) => {
            const pts = range(5).map((k) => pt(d + k * 6 * s, 42 + (k % 2 ? 5 : -1)));
            return <polyline key={i} points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={b} strokeWidth="1.4" />;
          })}
        </g>
      );
    case "splatter": {
      const r = rand(7);
      return (
        <>
          <circle cx="50" cy="50" r="41" fill="none" stroke={a} strokeWidth="3" />
          {range(16).map((i) => {
            const d = r() * 360;
            const [x, y] = pt(d, 43 + r() * 5);
            return <circle key={i} cx={x} cy={y} r={0.8 + r() * 3} fill={i % 5 === 0 ? b : a} />;
          })}
          {range(5).map((i) => {
            const d = i * 72 + 10;
            const [x1, y1] = pt(d, 42);
            const [x2, y2] = pt(d + 4, 49);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={a} strokeWidth="1.6" strokeLinecap="round" />;
          })}
        </>
      );
    }
    case "prism":
      return (
        <g className="pro-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          {["#ff2bd6", "#ffd23f", "#39ff88", "#2ee6ff", "#7c5cff", "#ff3b6b"].map((c, i) => {
            const [x1, y1] = pt(i * 60, 43);
            const [x2, y2] = pt(i * 60 + 58, 43);
            return <path key={c} d={`M${x1},${y1} A43,43 0 0,1 ${x2},${y2}`} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />;
          })}
          <circle cx="50" cy="50" r="47" fill="none" stroke={a} strokeOpacity="0.6" strokeWidth="0.6" />
        </g>
      );
    case "chains":
      return (
        <>
          {range(14).map((i) => {
            const d = i * (360 / 14);
            const [x, y] = pt(d, 43.5);
            return (
              <ellipse key={i} cx={x} cy={y} rx="5.2" ry="3" fill="none" stroke={i === 10 ? b : a} strokeWidth="1.8"
                transform={`rotate(${d + 90} ${x} ${y})`} />
            );
          })}
        </>
      );
    case "mist":
      return (
        <g className="pro-drift" style={{ transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke={a} strokeOpacity="0.55" strokeWidth="6" strokeDasharray="40 14 22 18" strokeLinecap="round" style={{ filter: "blur(1.6px)" }} />
          <circle cx="50" cy="50" r="41" fill="none" stroke={b} strokeOpacity="0.5" strokeWidth="2" strokeDasharray="20 30" style={{ filter: "blur(0.8px)" }} />
        </g>
      );
    case "rain":
      return (
        <g className="pro-flicker">
          {range(24).map((i) => {
            const d = i * 15;
            const [x, y] = pt(d, 40 + (i % 3) * 2.5);
            return <rect key={i} x={x - 0.6} y={y - 2.5} width="1.2" height={3 + (i % 4) * 1.5} fill={i % 4 === 0 ? "#d6ffe6" : a} opacity={0.5 + (i % 3) * 0.25} />;
          })}
          <circle cx="50" cy="50" r="39.5" fill="none" stroke={b} strokeWidth="1.5" />
        </g>
      );
    case "shards":
      return (
        <g className="pro-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          {range(9).map((i) => {
            const d = i * 40;
            const p1 = pt(d, 41);
            const p2 = pt(d + 9, 48);
            const p3 = pt(d + 17, 42);
            return <polygon key={i} points={`${p1} ${p2} ${p3}`} fill={i % 2 ? a : b} opacity={0.95} />;
          })}
        </g>
      );
    case "starfall": {
      const r = rand(11);
      return (
        <>
          {range(22).map((i) => {
            const [x, y] = pt(i * (360 / 22), 41 + r() * 6);
            return <circle key={i} cx={x} cy={y} r={0.5 + r() * 1.1} fill={a} />;
          })}
          <g className="pro-drift">
            <line x1="70" y1="6" x2="90" y2="20" stroke={b} strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="90" cy="20" r="1.8" fill="#fff" />
          </g>
        </>
      );
    }
    case "crown":
      return (
        <>
          <circle cx="50" cy="50" r="42" fill="none" stroke={a} strokeWidth="5" />
          <circle cx="50" cy="50" r="44.5" fill="none" stroke={b} strokeWidth="0.8" />
          <path d="M38,9 L40,-1 L45,5 L50,-3 L55,5 L60,-1 L62,9 Z" fill={b} stroke="#7a5a12" strokeWidth="0.6" transform="translate(0 2)" />
        </>
      );
    case "dashed":
      return <circle className="pro-pulse" cx="50" cy="50" r="43" fill="none" stroke={a} strokeWidth="1.6" strokeDasharray="3 3" />;
    case "galaxy": {
      const r = rand(21);
      return (
        <g className="pro-spin-slow" style={{ transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke={a} strokeOpacity="0.55" strokeWidth="9" />
          {range(30).map((i) => {
            const [x, y] = pt(r() * 360, 40 + r() * 8);
            return <circle key={i} cx={x} cy={y} r={0.3 + r() * 0.8} fill={b} />;
          })}
          <circle cx="50" cy="50" r="48.6" fill="none" stroke="#e0b54f" strokeWidth="0.9" />
        </g>
      );
    }
    default:
      return <circle cx="50" cy="50" r="43" fill="none" stroke={a} strokeWidth="2" />;
  }
}

// Absolutely positioned around a square avatar of `size` px.
export function RingOverlay({ p, size, still }: { p: RingP; size: number; still?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const box = size * 1.3;
  return (
    <svg
      aria-hidden
      viewBox="-2 -2 104 104"
      width={box}
      height={box}
      className={still || p.anim === "none" ? "pro-still pointer-events-none absolute" : "pointer-events-none absolute"}
      style={{ left: (size - box) / 2, top: (size - box) / 2, overflow: "visible" }}
    >
      <Art p={p} uid={uid} />
    </svg>
  );
}
