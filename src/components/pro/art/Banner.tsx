"use client";

import { useId } from "react";
import clsx from "clsx";
import type { BannerP } from "@/lib/pro/catalog";

// Profile banners: twenty original scenes in SVG (no downloads, crisp at any
// width). The 600×200 scene is cropped to fit (slice). Animated scenes move
// slowly and stop for reduced motion.

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function Skyline({ y, fill, seed, lit }: { y: number; fill: string; seed: number; lit?: string }) {
  const r = rand(seed);
  let x = 0;
  const out: React.ReactNode[] = [];
  while (x < 600) {
    const w = 18 + r() * 34;
    const h = 30 + r() * 80;
    out.push(<rect key={x} x={x} y={y - h} width={w} height={h + 200} fill={fill} />);
    if (lit)
      for (let wy = y - h + 8; wy < y - 4; wy += 9)
        for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() > 0.72) out.push(<rect key={`${wx}-${wy}`} x={wx} y={wy} width="2.6" height="3.4" fill={lit} opacity={0.5 + r() * 0.5} />);
    x += w + 1;
  }
  return <>{out}</>;
}

function Stars({ n, seed, color = "#fff", h = 200 }: { n: number; seed: number; color?: string; h?: number }) {
  const r = rand(seed);
  return (
    <>
      {range(n).map((i) => (
        <circle key={i} cx={r() * 600} cy={r() * h} r={0.3 + r() * 1.1} fill={color} opacity={0.3 + r() * 0.7} />
      ))}
    </>
  );
}

function Scene({ scene, uid }: { scene: string; uid: string }) {
  const g = (n: string) => `${uid}${n}`;
  switch (scene) {
    case "afterdark":
      return (
        <>
          <defs>
            <linearGradient id={g("s")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0a0a0a" />
              <stop offset="1" stopColor="#1a0408" />
            </linearGradient>
          </defs>
          <rect width="600" height="200" fill={`url(#${g("s")})`} />
          <rect y="150" width="600" height="2" fill="#e5102f" />
          <rect y="152" width="600" height="48" fill="#050505" />
          <text x="560" y="140" fontSize="64" fill="#fff" opacity="0.05" fontWeight="900" textAnchor="end">夜</text>
        </>
      );
    case "crimson_rain": {
      const r = rand(3);
      return (
        <>
          <rect width="600" height="200" fill="#120205" />
          <circle cx="470" cy="70" r="46" fill="#e5102f" opacity="0.25" />
          <Skyline y={170} fill="#050102" seed={5} lit="#ff4d6a" />
          <g className="pro-rain">
            {range(70).map((i) => {
              const x = r() * 640;
              const y = r() * 200;
              return <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 16} stroke="#ff3b4e" strokeWidth="1" opacity={0.3 + r() * 0.5} />;
            })}
          </g>
        </>
      );
    }
    case "neon_tokyo":
      return (
        <>
          <rect width="600" height="200" fill="#07040f" />
          <Skyline y={150} fill="#120a24" seed={9} lit="#28f0ff" />
          {[["#ff2bd6", 60, "夜"], ["#28f0ff", 190, "東京"], ["#ffd23f", 330, "酒"], ["#ff2bd6", 470, "ネオン"]].map(([c, x, t], i) => (
            <g key={i} className={i % 2 ? "pro-neon" : "pro-neon-b"}>
              <rect x={Number(x)} y={40 + (i % 2) * 22} width={String(t).length * 20 + 14} height="34" rx="4" fill="none" stroke={String(c)} strokeWidth="2" style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
              <text x={Number(x) + 7} y={64 + (i % 2) * 22} fontSize="20" fill={String(c)} fontWeight="700" style={{ filter: `drop-shadow(0 0 3px ${c})` }}>{t}</text>
            </g>
          ))}
          <rect y="165" width="600" height="35" fill="#0b0618" />
          <rect y="165" width="600" height="35" fill="#ff2bd6" opacity="0.08" />
        </>
      );
    case "station":
      return (
        <>
          <rect width="600" height="200" fill="#0b0b0b" />
          <polygon points="0,200 600,200 420,120 180,120" fill="#151515" />
          <rect x="0" y="118" width="600" height="3" fill="#2a2a2a" />
          {range(6).map((i) => <rect key={i} x={110 + i * 80} y="30" width="6" height="90" fill="#1d1d1d" />)}
          <rect x="268" y="18" width="64" height="5" fill="#e8e8e8" className="pro-flicker" />
          <polygon points="270,23 330,23 380,200 220,200" fill="#ffffff" opacity="0.05" />
          <rect x="290" y="135" width="6" height="40" fill="#2b2b2b" />
          <circle cx="293" cy="130" r="5" fill="#2b2b2b" />
        </>
      );
    case "skyline":
      return (
        <>
          <defs>
            <linearGradient id={g("k")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#050a1c" />
              <stop offset="1" stopColor="#122046" />
            </linearGradient>
          </defs>
          <rect width="600" height="200" fill={`url(#${g("k")})`} />
          <Stars n={40} seed={4} h={90} />
          <Skyline y={150} fill="#070b17" seed={12} lit="#ffd27a" />
          <rect y="185" width="600" height="15" fill="#05070f" />
        </>
      );
    case "impact":
      return (
        <>
          <rect width="600" height="200" fill="#f4f2ee" />
          {range(60).map((i) => {
            const a = (i / 60) * Math.PI * 2;
            return <polygon key={i} points={`300,100 ${300 + Math.cos(a) * 700},${100 + Math.sin(a) * 700} ${300 + Math.cos(a + 0.03) * 700},${100 + Math.sin(a + 0.03) * 700}`} fill="#0a0a0a" />;
          })}
          <polygon points="300,40 318,78 360,60 336,96 380,112 330,118 344,160 306,128 276,166 278,124 228,128 262,98 226,66 270,76" fill="#e5102f" stroke="#0a0a0a" strokeWidth="4" />
          <text x="300" y="110" fontSize="26" fontWeight="900" fill="#fff" textAnchor="middle" stroke="#0a0a0a" strokeWidth="1">ドン</text>
        </>
      );
    case "abyss":
      return (
        <>
          <rect width="600" height="200" fill="#07050d" />
          <radialGradient id={g("v")} cx="50%" cy="38%" r="40%">
            <stop offset="0" stopColor="#7c5cff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#07050d" stopOpacity="0" />
          </radialGradient>
          <rect width="600" height="200" fill={`url(#${g("v")})`} />
          <g className="pro-scroll-y" stroke="#7c5cff" strokeOpacity="0.55" strokeWidth="1">
            {range(13).map((i) => <line key={i} x1="300" y1="76" x2={-300 + i * 100} y2="220" />)}
            {range(8).map((i) => {
              const y = 80 + Math.pow(i / 7, 2) * 140;
              return <line key={`h${i}`} x1="0" y1={y} x2="600" y2={y} />;
            })}
          </g>
        </>
      );
    case "shrine":
      return (
        <>
          <rect width="600" height="200" fill="#06070c" />
          <circle cx="300" cy="96" r="74" fill="#e9edf5" />
          <circle cx="300" cy="96" r="90" fill="#e9edf5" opacity="0.08" />
          <g fill="#090a10">
            <rect x="205" y="58" width="190" height="12" rx="3" />
            <rect x="196" y="50" width="208" height="10" rx="4" />
            <rect x="222" y="82" width="156" height="8" />
            <rect x="232" y="60" width="12" height="140" />
            <rect x="356" y="60" width="12" height="140" />
          </g>
          <rect y="180" width="600" height="20" fill="#090a10" />
        </>
      );
    case "cathedral":
      return (
        <>
          <rect width="600" height="200" fill="#08060f" />
          <g className="pro-scan">
            {range(7).map((i) => {
              const x = 30 + i * 85;
              return (
                <g key={i}>
                  <path d={`M${x},200 L${x},80 Q${x + 30},20 ${x + 60},80 L${x + 60},200`} fill="none" stroke={i % 2 ? "#7c5cff" : "#2ee6ff"} strokeWidth="2" />
                  <circle cx={x + 30} cy="70" r="10" fill="none" stroke="#ff3b6b" strokeWidth="1.5" />
                </g>
              );
            })}
          </g>
          {range(50).map((i) => <rect key={i} y={i * 4} width="600" height="1" fill="#000" opacity="0.35" />)}
        </>
      );
    case "horizon":
      return (
        <>
          <defs>
            <linearGradient id={g("h")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#14020a" />
              <stop offset="1" stopColor="#4a0714" />
            </linearGradient>
          </defs>
          <rect width="600" height="200" fill={`url(#${g("h")})`} />
          <circle cx="300" cy="140" r="60" fill="#e5102f" />
          {range(5).map((i) => <rect key={i} x="230" y={118 + i * 9} width="140" height={2 + i} fill="#14020a" />)}
          <path d="M0,160 Q120,120 240,158 T480,150 T600,140 L600,200 L0,200z" fill="#0c0105" />
          <path d="M0,180 Q150,150 300,178 T600,170 L600,200 L0,200z" fill="#050002" />
        </>
      );
    case "blackout":
      return (
        <>
          <rect width="600" height="200" fill="#050505" />
          {range(14).map((i) => <polygon key={i} points={`${i * 46},0 ${i * 46 + 46},0 ${i * 46 + 23},40`} fill="#0e0e0e" stroke="#1a1a1a" />)}
          {range(14).map((i) => <polygon key={`b${i}`} points={`${i * 46 - 23},200 ${i * 46 + 23},200 ${i * 46},160`} fill="#0e0e0e" stroke="#1a1a1a" />)}
          <rect y="99" width="600" height="2" fill="#c8a24a" />
          <rect x="285" y="88" width="30" height="24" fill="#050505" stroke="#c8a24a" strokeWidth="1.5" transform="rotate(45 300 100)" />
        </>
      );
    case "alley": {
      const r = rand(8);
      return (
        <>
          <rect width="600" height="200" fill="#08060f" />
          <polygon points="0,0 230,40 230,200 0,200" fill="#120d1f" />
          <polygon points="600,0 370,40 370,200 600,200" fill="#120d1f" />
          {range(10).map((i) => (
            <rect key={i} className={i % 3 ? "pro-blink" : ""} x={i < 5 ? 20 + i * 40 : 400 + (i - 5) * 38} y={30 + r() * 100} width={18 + r() * 14} height="12"
              fill={["#39ff88", "#ffd23f", "#ff3b6b"][i % 3]} opacity="0.85" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
          <rect x="230" y="40" width="140" height="160" fill="#05040a" />
          <rect x="228" y="150" width="144" height="4" fill="#39ff88" opacity="0.4" />
        </>
      );
    }
    case "collapse":
      return (
        <>
          <rect width="600" height="200" fill="#03030a" />
          <Stars n={60} seed={2} />
          <circle cx="300" cy="110" r="50" fill="#5b6cff" />
          <circle cx="285" cy="98" r="50" fill="#03030a" opacity="0.35" />
          <ellipse cx="300" cy="110" rx="110" ry="18" fill="none" stroke="#e9e6ff" strokeWidth="3" transform="rotate(-12 300 110)" />
          <g className="pro-drift">
            {[[420, 60, 10], [450, 90, 6], [180, 150, 8], [140, 120, 5], [470, 140, 4]].map(([x, y, s], i) => (
              <polygon key={i} points={`${x},${y} ${x + s},${y + s / 2} ${x + s / 3},${y + s}`} fill="#9aa7ff" />
            ))}
          </g>
        </>
      );
    case "shattered":
      return (
        <>
          <rect width="600" height="200" fill="#0a0a0a" />
          {[
            ["0,0 220,0 180,120 0,90", "#1b1030"], ["220,0 420,0 360,90 180,120", "#2a0207"], ["420,0 600,0 600,110 360,90", "#061a24"],
            ["0,90 180,120 140,200 0,200", "#0b2a17"], ["180,120 360,90 420,200 140,200", "#1a1408"], ["360,90 600,110 600,200 420,200", "#160d22"],
          ].map(([pts, c], i) => <polygon key={i} points={pts} fill={c} stroke="#f4f2ee" strokeWidth="4" />)}
          <circle cx="90" cy="45" r="16" fill="#e9edf5" />
          <circle cx="300" cy="50" r="12" fill="#e5102f" />
          <Stars n={20} seed={6} h={90} />
        </>
      );
    case "phantom":
      return (
        <>
          <rect width="600" height="200" fill="#0c0d0f" />
          <Skyline y={160} fill="#202328" seed={14} />
          <rect width="600" height="200" fill="#c9ced6" opacity="0.08" />
          <Skyline y={180} fill="#15171a" seed={15} />
          <rect y="120" width="600" height="80" fill="#d9d9d9" opacity="0.07" />
        </>
      );
    case "violet_static": {
      const r = rand(13);
      return (
        <>
          <rect width="600" height="200" fill="#120a1c" />
          {range(400).map((i) => <rect key={i} x={r() * 600} y={r() * 200} width="1.5" height="1.5" fill="#c48cff" opacity={r() * 0.4} />)}
          <g className="pro-petals">
            {range(9).map((i) => {
              const x = 40 + i * 64 + r() * 20;
              const y = 20 + r() * 150;
              return <ellipse key={`p${i}`} cx={x} cy={y} rx="5" ry="3" fill="#ff8fb4" opacity="0.8" transform={`rotate(${r() * 180} ${x} ${y})`} />;
            })}
          </g>
        </>
      );
    }
    case "train":
      return (
        <>
          <rect width="600" height="200" fill="#060814" />
          <Stars n={30} seed={7} h={80} />
          <rect y="120" width="600" height="6" fill="#141a2e" />
          {range(9).map((i) => <rect key={i} x={i * 70 + 20} y="126" width="8" height="80" fill="#0e1222" />)}
          <rect x="90" y="92" width="420" height="28" rx="6" fill="#151b33" />
          {range(14).map((i) => <rect key={`w${i}`} x={100 + i * 29} y="98" width="20" height="12" rx="2" fill="#ffd27a" opacity="0.9" />)}
          <rect x="90" y="120" width="420" height="3" fill="#ff2bd6" opacity="0.6" />
        </>
      );
    case "inkstorm": {
      const strokes = [
        "M-20,150 C80,40 220,180 330,80 S520,20 640,110",
        "M-20,60 C100,120 200,10 320,70 S500,170 640,60",
        "M-20,190 C120,150 260,200 380,150 S560,120 640,170",
      ];
      return (
        <>
          <rect width="600" height="200" fill="#f4f2ee" />
          {strokes.map((d, i) => <path key={i} d={d} fill="none" stroke="#0a0a0a" strokeWidth={26 - i * 6} strokeLinecap="round" opacity={0.92 - i * 0.15} />)}
          <path d="M380,40 C430,30 470,70 520,50" fill="none" stroke="#e5102f" strokeWidth="9" strokeLinecap="round" />
          <circle cx="120" cy="40" r="6" fill="#0a0a0a" />
          <circle cx="140" cy="28" r="3" fill="#0a0a0a" />
        </>
      );
    }
    case "eclipse":
      return (
        <>
          <rect width="600" height="200" fill="#04050a" />
          <circle cx="300" cy="80" r="52" fill="#d8dde6" opacity="0.15" />
          <circle cx="300" cy="80" r="44" fill="#000" stroke="#e6ebf2" strokeWidth="2" style={{ filter: "drop-shadow(0 0 10px #c9d1e0)" }} />
          <rect y="140" width="600" height="60" fill="#070a12" />
          <ellipse cx="300" cy="160" rx="40" ry="5" fill="#e6ebf2" opacity="0.25" />
          {range(6).map((i) => <rect key={i} x={260 + i * 3} y={150 + i * 7} width={80 - i * 6} height="1" fill="#e6ebf2" opacity={0.2 - i * 0.03} />)}
        </>
      );
    case "nightfall":
      return (
        <>
          <rect width="600" height="200" fill="#03030a" />
          <Stars n={120} seed={1} />
          <g className="pro-aurora">
            <path d="M-20,90 C120,30 240,120 360,60 S560,40 640,80 L640,120 C520,90 420,150 300,110 S80,80 -20,130z" fill="#39ffb0" opacity="0.18" />
            <path d="M-20,70 C140,40 260,90 380,50 S560,60 640,40 L640,70 C520,90 400,80 300,90 S100,60 -20,100z" fill="#7c5cff" opacity="0.2" />
          </g>
          <line x1="430" y1="30" x2="480" y2="55" stroke="#f3e2a9" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="480" cy="55" r="2" fill="#fff6d6" />
        </>
      );
    default:
      return <rect width="600" height="200" fill="#111" />;
  }
}

export function BannerArt({ p, className, still, children }: { p: BannerP; className?: string; still?: boolean; children?: React.ReactNode }) {
  const uid = useId().replace(/:/g, "");
  return (
    <div className={clsx("relative overflow-hidden bg-black", className)} data-banner={p.scene}>
      <svg aria-hidden viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" className={clsx("absolute inset-0 h-full w-full", (still || !p.anim) && "pro-still")}>
        <Scene scene={p.scene} uid={uid} />
      </svg>
      {children}
    </div>
  );
}
