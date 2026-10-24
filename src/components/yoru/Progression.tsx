"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Flame, Megaphone, Moon, Sparkles, TriangleAlert, X } from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { byFn, useProgress, useRpc, useSite } from "@/lib/client/hooks";
import { mediaSrc, rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { burst } from "@/components/ui/EmojiBurst";
import { RichText } from "@/components/ui/RichText";
import { ACCENT_COLORS, celebrateLevelUp, greeting, levelProgress, levelTitle, tzOffsetMinutes } from "@/lib/progress";
import type { Accent, CheckinResult, Post } from "@/lib/types";

// Applies the member's chosen accent to the whole app (brand color, rings).
export function AccentStyle() {
  const { data } = useProgress();
  const accent = data?.accent ?? "crimson";
  useEffect(() => {
    const root = document.documentElement;
    if (accent === "crimson") {
      root.style.removeProperty("--brand");
      root.style.removeProperty("--brand-2");
      root.style.removeProperty("--ring-a");
      return;
    }
    const c = ACCENT_COLORS[accent as Accent] ?? ACCENT_COLORS.crimson;
    root.style.setProperty("--brand", c.brand);
    root.style.setProperty("--brand-2", c.brand2);
    root.style.setProperty("--ring-a", c.brand);
  }, [accent]);
  return null;
}

export function LevelChip({ level, className }: { level?: number; className?: string }) {
  if (!level) return null;
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center rounded-md border border-brand/40 bg-brand/10 px-1 text-[10.5px] font-semibold leading-[1.45] text-brand-2", className)}
      title={`Level ${level} · ${levelTitle(level).en}`}
    >
      Lv{level}
    </span>
  );
}

export function XpBar({ xp, className }: { xp: number; className?: string }) {
  const { level, next, pct } = levelProgress(xp);
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-ink">
          Lv {level} · {levelTitle(level).en} <span className="text-muted">{levelTitle(level).jp}</span>
        </span>
        <span className="tabular-nums text-muted">
          {xp} / {next} XP
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-card-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct * 100, 2)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function dismissedKey(id: string) {
  return `yoru-ann-${id}`;
}

export function AnnouncementBanner() {
  const { data: site } = useSite();
  const ann = site?.announcement;
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!ann) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(dismissedKey(ann.id))) setHidden(ann.id);
    } catch {
      /* storage unavailable */
    }
  }, [ann]);
  const show = ann && hidden !== ann.id;
  const Icon = ann?.tone === "alert" ? TriangleAlert : ann?.tone === "event" ? Sparkles : Megaphone;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key={ann.id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
          role="status"
        >
          <div
            className={clsx(
              "relative mb-3 flex items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3",
              ann.tone === "alert" ? "border-brand/60 bg-brand/15" : ann.tone === "event" ? "border-brand/40 bg-gradient-to-r from-brand/20 via-card to-card" : "border-line bg-card",
            )}
          >
            {ann.tone === "event" && <span className="shimmer pointer-events-none absolute inset-0" aria-hidden />}
            <Icon size={18} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="tagline text-[10px] text-brand-2">{ann.tone === "alert" ? "Alert" : ann.tone === "event" ? "Event" : "Announcement"}</div>
              <RichText text={ann.text} className="mt-0.5 text-sm text-ink" />
            </div>
            <button
              onClick={() => {
                setHidden(ann.id);
                try {
                  localStorage.setItem(dismissedKey(ann.id), "1");
                } catch {
                  /* storage unavailable */
                }
              }}
              className="-mr-1 rounded-full p-1 text-muted hover:text-ink"
              aria-label="Dismiss announcement"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Greeting + nightly check-in + XP bar, at the top of home.
export function NightlyCard() {
  const { me, openComposer } = useShell();
  const { data: p, mutate } = useProgress();
  const { data: site } = useSite();
  const { toast, toastError } = useApp();
  const { mutate: mutateAll } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [hello, setHello] = useState<{ jp: string; en: string } | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHello(greeting()), []);

  if (!p) return null;

  async function checkin() {
    setBusy(true);
    try {
      const r = await rpc<CheckinResult>("daily_checkin", { p_offset_minutes: tzOffsetMinutes() });
      if (r.already) {
        toast("Already checked in tonight.", "info", "🌙");
      } else {
        burst("🔥", btn.current);
        toast(`Night ${r.streak} · +${r.gained} XP`, "success", "🔥");
        if (r.leveled_up) celebrateLevelUp(r.level);
      }
      mutate();
      mutateAll(byFn("get_me", "get_level_board"));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card relative overflow-hidden px-4 py-3.5"
      aria-label="Nightly check-in"
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand/15 blur-3xl" aria-hidden />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">
            {hello ? `${hello.jp}, ${me.display_name.split(" ")[0]}` : me.display_name}
            <span className="ml-1.5 text-xs font-normal text-muted">{hello?.en}</span>
          </div>
          {site?.nightly_prompt ? (
            <button onClick={() => openComposer({ tab: "text", text: `${site.nightly_prompt}\n\n#dailychallenge` })} className="mt-0.5 block max-w-full truncate text-left text-xs text-muted hover:text-ink">
              <Moon size={11} className="mr-1 inline text-brand" />
              Tonight: {site.nightly_prompt}
            </button>
          ) : (
            <div className="mt-0.5 text-xs text-muted">夜は、まだ終わらない。</div>
          )}
        </div>
        <motion.button
          ref={btn}
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.12 }}
          onClick={checkin}
          disabled={busy || p.checked_in_today}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150",
            p.checked_in_today ? "bg-card-2 text-ink-2" : "bg-brand text-white hover:bg-brand-2",
          )}
          aria-label={p.checked_in_today ? `Checked in, ${p.streak} night streak` : "Check in for tonight"}
        >
          <Flame size={16} className={clsx(!p.checked_in_today && "motion-safe:animate-pulse", p.checked_in_today && "text-brand")} />
          {p.checked_in_today ? `${p.streak} night${p.streak === 1 ? "" : "s"}` : "Check in"}
        </motion.button>
      </div>
      <XpBar xp={p.xp} className="mt-3" />
    </motion.section>
  );
}

// "Tonight's picks": posts featured by admins.
export function FeaturedStrip() {
  const { data } = useRpc<Post[]>("get_featured");
  if (!data?.length) return null;
  return (
    <section aria-label="Tonight's picks">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">
          Tonight&apos;s picks <span className="ml-1 text-xs font-normal text-muted">今夜の推し</span>
        </h2>
      </div>
      <div className="no-scrollbar -mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4">
        {data.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.2) }}
            className="snap-start"
          >
            <Link href={`/post/${p.id}`} className="card group relative flex h-36 w-56 flex-col justify-end overflow-hidden p-3 transition-colors duration-150 hover:border-brand">
              {p.media_url && p.media_type !== "video" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(p.media_url)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-300 group-hover:scale-105" loading="lazy" />
              ) : (
                <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--brand),transparent_70%)] opacity-25" aria-hidden />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" aria-hidden />
              <span className="sticker absolute left-3 top-3 rounded-full bg-brand px-2 py-0.5 text-white">推し</span>
              <span className="relative line-clamp-2 text-sm font-medium text-white">{p.body || "📷"}</span>
              <span className="relative mt-1 text-xs text-white/70">{p.author.display_name}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function SiteNotices() {
  const { data: site } = useSite();
  const { data: p } = useProgress();
  const muted = p?.muted_until && new Date(p.muted_until) > new Date();
  if (!site?.lockdown && !site?.slow_mode && !muted) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {muted && <span className="rounded-full border border-brand/50 bg-brand/10 px-3 py-1 text-brand-2">You&apos;re muted until {new Date(p!.muted_until!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
      {site?.lockdown && <span className="rounded-full border border-line bg-card px-3 py-1 text-muted">🤫 Quiet mode: only admins can post. Chat is open.</span>}
      {!!site?.slow_mode && <span className="rounded-full border border-line bg-card px-3 py-1 text-muted">🐢 Slow mode: one post every {site.slow_mode}s</span>}
    </div>
  );
}
