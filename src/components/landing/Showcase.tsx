"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import clsx from "clsx";
import { sfx } from "./sfx";

const SCREENS = [
  { src: "/brand/yoru/screens/1-home.png", label: "Home", jp: "ホーム" },
  { src: "/brand/yoru/screens/1b-feed.png", label: "Feed", jp: "フィード" },
  { src: "/brand/yoru/screens/2-profile.png", label: "Profile", jp: "プロフィール" },
  { src: "/brand/yoru/screens/4-chat.png", label: "Chats", jp: "チャット" },
  { src: "/brand/yoru/screens/5-explore.png", label: "Explore", jp: "探す" },
  { src: "/brand/yoru/screens/3-color.png", label: "Your color", jp: "色" },
  { src: "/brand/yoru/screens/6-levelup.png", label: "Level up", jp: "昇" },
];

const CHIPS = [
  { text: "❤️ +1 like", cls: "left-[-34%] top-[10%]", d: 0 },
  { text: "Lv 5 · 常連", cls: "right-[-30%] top-[26%]", d: 0.6 },
  { text: "🔥 7 night streak", cls: "left-[-40%] top-[56%]", d: 1.2 },
  { text: "推し Tonight's pick", cls: "right-[-38%] top-[76%]", d: 1.8 },
];

// The promo image with a 3D tilt that follows the pointer, plus a shine sweep.
export function Promo() {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 150, damping: 18 });
  const sry = useSpring(ry, { stiffness: 150, damping: 18 });
  return (
    <section className="px-4 py-20" aria-label="YORU promo">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-5xl [perspective:1400px]"
      >
        <motion.div
          ref={ref}
          style={{ rotateX: srx, rotateY: sry }}
          onPointerMove={(e) => {
            const r = ref.current!.getBoundingClientRect();
            ry.set(((e.clientX - r.left) / r.width - 0.5) * 10);
            rx.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
          }}
          onPointerLeave={() => {
            rx.set(0);
            ry.set(0);
          }}
          onPointerEnter={() => sfx.sparkle()}
          className="group relative overflow-hidden rounded-[28px] border border-line shadow-[0_40px_120px_-40px_var(--brand)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/yoru/feature-graphic.png" alt="YORU — The internet after dark. Anime, manga, Vocaloid, gaming and art." width={1024} height={500} className="block w-full" />
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full" aria-hidden />
        </motion.div>
      </motion.div>
    </section>
  );
}

// A phone cycling through real screenshots, with floating badges.
export function Showcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start end", "end start"] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const phoneRot = useTransform(scrollYProgress, [0, 1], [-4, 4]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % SCREENS.length), 2800);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <section ref={section} id="tour" className="relative overflow-hidden px-4 py-24" aria-label="App tour">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--brand)_14%,transparent),transparent_60%)]" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 md:grid-cols-2">
        <div>
          <p className="tagline text-xs text-brand-2">Take the tour</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">Everything the night needs. In your pocket.</h2>
          <p className="mt-4 max-w-md text-ink-2">Feed, stories, group chats, levels and your own colors. Same account on the web and in the Android app.</p>
          <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Screens">
            {SCREENS.map((s, n) => (
              <button
                key={s.label}
                role="tab"
                aria-selected={i === n}
                onClick={() => {
                  setI(n);
                  setPaused(true);
                  sfx.tick(n);
                }}
                className={clsx(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150",
                  i === n ? "border-brand bg-brand text-white" : "border-line text-ink-2 hover:border-brand/60 hover:text-ink",
                )}
              >
                {s.label} <span className={i === n ? "text-white/70" : "text-muted"}>{s.jp}</span>
              </button>
            ))}
          </div>
        </div>

        <motion.div style={{ y: phoneY, rotate: phoneRot }} className="relative mx-auto w-[min(78vw,300px)]">
          <div className="absolute -inset-10 rounded-[60px] bg-brand/25 blur-3xl" aria-hidden />
          <div className="relative aspect-[9/16] overflow-hidden rounded-[42px] border-[7px] border-[#1c1c1c] bg-black shadow-2xl ring-1 ring-white/10">
            <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={SCREENS[i].src}
                src={SCREENS[i].src}
                alt={`YORU ${SCREENS[i].label} screen`}
                initial={{ opacity: 0, scale: 1.06, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </AnimatePresence>
          </div>
          {CHIPS.map((c) => (
            <motion.span
              key={c.text}
              className={clsx("absolute z-20 hidden whitespace-nowrap rounded-full border border-line bg-card/90 px-3 py-1.5 text-xs font-semibold shadow-xl backdrop-blur lg:block", c.cls)}
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              animate={{ y: [0, -10, 0] }}
              transition={{ y: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: c.d }, opacity: { delay: 0.3 + c.d * 0.3 }, scale: { delay: 0.3 + c.d * 0.3 } }}
            >
              {c.text}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
