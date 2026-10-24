"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/providers/AppProvider";
import { LEVEL_UP_EVENT, NIGHT_MODE_EVENT, levelTitle, prefersReducedMotion } from "@/lib/progress";
import { playSynth } from "@/lib/client/sounds";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const KANJI = "夜月星闇夢影光桜雨風雷火刀魂";

// Full-screen moments: level-ups and the hidden 夜 mode (Konami code, or tap
// the logo five times).
export function Celebrations() {
  const { sound, toast } = useApp();
  const [level, setLevel] = useState<number | null>(null);
  const [night, setNight] = useState(false);

  useEffect(() => {
    const onLevel = (e: Event) => {
      const lvl = Number((e as CustomEvent<{ level: number }>).detail?.level);
      if (!Number.isFinite(lvl)) return;
      setLevel(lvl);
      if (sound) playSynth("victory");
    };
    const onNight = () => {
      setNight(true);
      toast("夜モード unlocked. The night is yours.", "chaos", "🌙");
    };
    const seq: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      seq.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (seq.length > KONAMI.length) seq.shift();
      if (seq.join() === KONAMI.join()) {
        seq.length = 0;
        window.dispatchEvent(new Event(NIGHT_MODE_EVENT));
      }
    };
    window.addEventListener(LEVEL_UP_EVENT, onLevel);
    window.addEventListener(NIGHT_MODE_EVENT, onNight);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(LEVEL_UP_EVENT, onLevel);
      window.removeEventListener(NIGHT_MODE_EVENT, onNight);
      window.removeEventListener("keydown", onKey);
    };
  }, [sound, toast]);

  useEffect(() => {
    if (level === null) return;
    const t = setTimeout(() => setLevel(null), 3600);
    return () => clearTimeout(t);
  }, [level]);

  useEffect(() => {
    if (!night) return;
    const t = setTimeout(() => setNight(false), 5200);
    return () => clearTimeout(t);
  }, [night]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <AnimatePresence>{level !== null && <LevelUp key={level} level={level} onClose={() => setLevel(null)} />}</AnimatePresence>
      <AnimatePresence>{night && <KanjiRain key="night" onClose={() => setNight(false)} />}</AnimatePresence>
    </>,
    document.body,
  );
}

function LevelUp({ level, onClose }: { level: number; onClose: () => void }) {
  const title = levelTitle(level);
  const sparks = Array.from({ length: 18 }, (_, i) => i);
  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-label={`Level up: level ${level}`}
    >
      <div className="relative flex flex-col items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-[38%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand"
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{ duration: 1.4, delay: i * 0.25, ease: "easeOut" }}
            aria-hidden
          />
        ))}
        {sparks.map((i) => {
          const a = (i / sparks.length) * Math.PI * 2;
          return (
            <motion.span
              key={`s${i}`}
              className="absolute left-1/2 top-[38%] h-1.5 w-1.5 rounded-full bg-brand-2"
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos(a) * 170, y: Math.sin(a) * 170, opacity: 0 }}
              transition={{ duration: 0.9, delay: 0.1, ease: "easeOut" }}
              aria-hidden
            />
          );
        })}
        <motion.div
          className="text-[120px] font-bold leading-none text-brand [text-shadow:0_0_40px_var(--brand)]"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          昇
        </motion.div>
        <motion.div
          className="tagline mt-4 text-sm text-white/70"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
        >
          Level up
        </motion.div>
        <motion.div
          className="mt-1 text-5xl font-bold text-white"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.2 }}
        >
          Lv {level}
        </motion.div>
        <motion.div
          className="mt-2 text-lg text-white/85"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32, duration: 0.2 }}
        >
          {title.en} · <span className="text-brand-2">{title.jp}</span>
        </motion.div>
        <p className="mt-6 text-xs text-white/50">Tap anywhere to continue</p>
      </div>
    </motion.div>
  );
}

function KanjiRain({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const w = (c.width = window.innerWidth);
    const h = (c.height = window.innerHeight);
    const size = 22;
    const cols = Math.ceil(w / size);
    const drops = Array.from({ length: cols }, () => Math.random() * -40);
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#f20d2f";
    if (prefersReducedMotion()) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    let raf = 0;
    const tick = () => {
      ctx.fillStyle = "rgba(8,8,8,0.16)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px "Noto Sans JP", sans-serif`;
      for (let i = 0; i < cols; i++) {
        const ch = KANJI[Math.floor(Math.random() * KANJI.length)];
        ctx.fillStyle = Math.random() > 0.94 ? "#ffffff" : brand;
        ctx.fillText(ch, i * size, drops[i] * size);
        if (drops[i] * size > h && Math.random() > 0.96) drops[i] = 0;
        drops[i] += 0.55;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <motion.div
      className="fixed inset-0 z-[110] cursor-pointer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      onClick={onClose}
      aria-hidden
    >
      <canvas ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          className="text-[160px] font-bold leading-none text-white [text-shadow:0_0_60px_var(--brand)]"
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
        >
          夜
        </motion.div>
        <motion.p className="tagline mt-3 text-sm text-white/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
          夜は、まだ終わらない。
        </motion.p>
      </div>
    </motion.div>
  );
}
