"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView } from "motion/react";
import { Flame, Heart } from "lucide-react";
import clsx from "clsx";
import { DEFAULT_HUE, HUE_PRESETS, hueColor, hueName, levelTitle } from "@/lib/progress";
import { sfx } from "./sfx";

// Hands-on mini demos of real YORU features. Nothing here is saved.
export function Demos() {
  return (
    <section id="try" className="px-4 py-24" aria-labelledby="try-title">
      <div className="mx-auto max-w-6xl">
        <p className="tagline text-center text-xs text-brand-2">Try it right here</p>
        <h2 id="try-title" className="mt-3 text-center text-3xl font-bold sm:text-5xl">
          Play with it before you join.
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Card>
            <ColorDemo />
          </Card>
          <Card>
            <XpDemo />
          </Card>
          <Card>
            <ChatDemo />
          </Card>
          <Card>
            <PostDemo />
          </Card>
        </div>
      </div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className="group relative overflow-hidden rounded-3xl border border-line bg-card p-6"
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--mx) var(--my), color-mix(in srgb, var(--brand) 16%, transparent), transparent 60%)" }}
        aria-hidden
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function Title({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <>
      <p className="tagline text-[10px] text-brand-2">{kicker}</p>
      <h3 className="mt-1.5 text-xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-ink-2">{sub}</p>
    </>
  );
}

function ColorDemo() {
  const [hue, setHue] = useState(DEFAULT_HUE);
  const last = useRef(0);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--accent-h");
    },
    [],
  );
  const apply = (h: number) => {
    setHue(h);
    if (h === DEFAULT_HUE) document.documentElement.style.removeProperty("--accent-h");
    else document.documentElement.style.setProperty("--accent-h", String(h));
    if (Math.abs(h - last.current) >= 12) {
      last.current = h;
      sfx.tick(Math.round(h / 30));
    }
  };
  return (
    <>
      <Title kicker="色 · Your color" title="Recolor everything." sub="Drag it. This whole page changes, just like the app does." />
      <div className="mt-6 flex items-center gap-4">
        <motion.div
          key={hue}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.12 }}
          className="h-14 w-14 shrink-0 rounded-2xl"
          style={{ background: hueColor(hue), boxShadow: `0 0 30px ${hueColor(hue)}` }}
          aria-hidden
        />
        <div className="text-sm">
          <div className="font-semibold">{hueName(hue)}</div>
          <div className="text-muted">{hue}°</div>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={359}
        value={hue}
        onChange={(e) => apply(Number(e.target.value))}
        className="hue-slider mt-5 w-full"
        aria-label="Try a color"
      />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {HUE_PRESETS.map((p) => (
          <button
            key={p.hue}
            onClick={() => {
              apply(p.hue);
              sfx.click();
            }}
            className={clsx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", hue === p.hue ? "border-ink" : "border-line text-ink-2")}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: hueColor(p.hue) }} aria-hidden />
            {p.jp} {p.label}
          </button>
        ))}
      </div>
    </>
  );
}

function XpDemo() {
  const [xp, setXp] = useState(118);
  const [streak, setStreak] = useState(6);
  const [shown, setShown] = useState(118);
  const [levelUp, setLevelUp] = useState(false);
  const levelOf = (n: number) => Math.floor(Math.sqrt(n / 40)) + 1;
  const level = levelOf(shown);
  const floor = 40 * (level - 1) ** 2;
  const next = 40 * level ** 2;
  const pct = (shown - floor) / (next - floor);

  const checkIn = () => {
    const gain = 20 + Math.min(streak, 7) * 5;
    const to = xp + gain;
    const before = levelOf(xp);
    setXp(to);
    setStreak((s) => s + 1);
    sfx.click();
    animate(shown, to, { duration: 0.8, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    if (levelOf(to) > before) {
      setTimeout(() => {
        setLevelUp(true);
        sfx.levelUp();
      }, 650);
      setTimeout(() => setLevelUp(false), 2600);
    }
  };

  return (
    <>
      <Title kicker="昇 · Levels" title="Check in every night." sub="Earn XP, keep your streak alive, climb the titles." />
      <div className="relative mt-6 rounded-2xl border border-line bg-bg-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">
              Lv {level} · {levelTitle(level).en} <span className="text-muted">{levelTitle(level).jp}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <Flame size={13} className="text-brand" /> {streak} night streak
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={checkIn}
            className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
          >
            <Flame size={16} /> Check in
          </motion.button>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-card-2">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2" animate={{ width: `${Math.max(pct * 100, 3)}%` }} transition={{ duration: 0.3 }} />
        </div>
        <div className="mt-1.5 text-right text-xs tabular-nums text-muted">
          {shown} / {next} XP
        </div>
        <AnimatePresence>
          {levelUp && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/85 backdrop-blur"
            >
              <span className="text-5xl font-bold text-brand [text-shadow:0_0_30px_var(--brand)]">昇</span>
              <span className="mt-1 text-lg font-bold">Level {level}!</span>
              <span className="text-sm text-ink-2">{levelTitle(level).en}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

const CHAT: { who: string; text: string; me?: boolean }[] = [
  { who: "Ari", text: "Movie pick for Friday? 🍿", me: true },
  { who: "Ethan", text: "Your Name. Every time." },
  { who: "Tyler", text: "Suzume! The soundtrack alone 🎧" },
  { who: "Zach", text: "Perfect Blue if we want to be up all night" },
  { who: "Ari", text: "Poll's on the feed. Vote before midnight 🌙", me: true },
];

function ChatDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView || count >= CHAT.length) return;
    const t = setTimeout(() => {
      setCount((c) => c + 1);
      sfx.pop();
    }, count === 0 ? 400 : 1300);
    return () => clearTimeout(t);
  }, [inView, count]);
  const typing = inView && count < CHAT.length;
  return (
    <>
      <Title kicker="話 · Chats" title="Group chats that feel alive." sub="Realtime messages, typing dots, reactions and media." />
      <div ref={ref} className="mt-6 h-[264px] overflow-hidden rounded-2xl border border-line bg-bg-2 p-3">
        <div className="mb-2 flex items-center gap-2 border-b border-line pb-2 text-sm font-semibold">
          🌙 Anime Night <span className="text-xs font-normal text-muted">5 online</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {CHAT.slice(0, count).map((m, n) => (
              <motion.div
                key={n}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
                className={clsx("max-w-[80%] rounded-2xl px-3 py-1.5 text-sm", m.me ? "self-end rounded-br-md bg-brand text-white" : "self-start rounded-bl-md bg-card-2")}
              >
                {!m.me && <div className="text-[10px] font-semibold text-brand-2">{m.who}</div>}
                {m.text}
              </motion.div>
            ))}
          </AnimatePresence>
          {typing && (
            <div className="flex items-center gap-1 self-start rounded-2xl bg-card-2 px-3 py-2.5" aria-label="Someone is typing">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-muted"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.12 }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {count >= CHAT.length && (
        <button
          onClick={() => setCount(0)}
          className="mt-3 text-xs text-brand-2 underline-offset-4 hover:underline"
        >
          Replay
        </button>
      )}
    </>
  );
}

function PostDemo() {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(41);
  const [hearts, setHearts] = useState(0);
  const [open, setOpen] = useState(false);
  const like = () => {
    if (!liked) {
      setHearts((h) => h + 1);
      sfx.pop();
    }
    setLiked((l) => !l);
    setLikes((n) => n + (liked ? -1 : 1));
  };
  return (
    <>
      <Title kicker="投稿 · Posts" title="Double-tap. Spoil nothing." sub="Like with a double-tap and hide spoilers until someone taps them." />
      <div className="mt-6 rounded-2xl border border-line bg-bg-2 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[var(--ring-b)] font-bold text-white">Z</span>
          <span className="font-semibold">Zach</span>
          <span className="rounded-md border border-brand/40 bg-brand/10 px-1 text-[10px] font-semibold text-brand-2">Lv6</span>
          <span className="text-muted">· now</span>
        </div>
        <p className="mt-2 text-[15px]">
          Finished Chainsaw Man vol 18.{" "}
          <button
            onClick={() => {
              if (!open) sfx.whoosh();
              setOpen(true);
            }}
            className="spoiler"
            data-open={open}
            aria-label={open ? undefined : "Spoiler, tap to reveal"}
          >
            Denji finally gets his toast
          </button>{" "}
          #manga
        </p>
        <div
          className="relative mt-3 flex h-28 cursor-pointer select-none items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--brand)_40%,transparent),#111_70%)] text-5xl font-bold text-white/20"
          onDoubleClick={like}
          role="img"
          aria-label="Post image. Double-tap to like."
        >
          夜
          <AnimatePresence>
            {hearts > 0 && (
              <motion.span
                key={hearts}
                className="absolute"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.2, 1, 1.1] }}
                transition={{ duration: 0.8 }}
                aria-hidden
              >
                <Heart size={64} className="fill-brand text-brand drop-shadow-[0_0_20px_var(--brand)]" />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="absolute bottom-2 right-3 text-[11px] font-normal text-white/50">double-tap me</span>
        </div>
        <button onClick={like} className="mt-3 flex items-center gap-1.5 text-sm" aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}>
          <motion.span key={String(liked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
            <Heart size={20} className={liked ? "fill-brand text-brand" : "text-ink-2"} />
          </motion.span>
          <span className="tabular-nums">{likes}</span>
        </button>
      </div>
    </>
  );
}
