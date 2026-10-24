"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Heart, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { byFn, useProgress } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { DEFAULT_HUE, HUE_PRESETS, applyHue, hueColor, hueName } from "@/lib/progress";

// The personal color slider: drag to recolor the whole app live (buttons,
// rings, badges, charts, logo, effects and animations). Saved to the profile
// shortly after you let go, so it follows you to every device.
export function ColorSlider() {
  const { data: progress, mutate } = useProgress();
  const { mutate: mutateAll } = useSWRConfig();
  const { toastError } = useApp();
  const saved = progress?.accent_hue ?? DEFAULT_HUE;
  const [hue, setHue] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const value = hue ?? saved;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: number, immediate = false) {
    const h = Math.round(Math.min(359, Math.max(0, next)));
    setHue(h);
    applyHue(h);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(h), immediate ? 0 : 450);
  }

  async function save(h: number) {
    try {
      const next = await rpc<typeof progress>("update_my_style", { p: { accent_hue: h } });
      mutate(next, { revalidate: false });
      mutateAll(byFn("get_me", "get_profile_extras"));
    } catch (err) {
      applyHue(saved);
      setHue(null);
      toastError(err);
    }
  }

  return (
    <div className="py-3">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor="hue" className="text-sm font-semibold">
          App color
        </label>
        <span className="text-xs text-muted">
          {hueName(value)} · {value}°
        </span>
      </div>
      <p className="mb-3 text-xs text-muted">Recolors everything: buttons, rings, badges, the logo and all the effects. Your profile wears it too.</p>

      <div className="mb-4 flex items-center gap-3">
        <motion.div
          key={value}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.12 }}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{ background: hueColor(value), boxShadow: `0 0 24px ${hueColor(value)}` }}
          aria-hidden
        >
          <Heart size={20} className="fill-white text-white" />
        </motion.div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">Button</span>
          <span className="rounded-full border border-brand/50 bg-brand/10 px-2.5 py-1 text-xs text-brand-2">Lv 7</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-xs">
            <span className="text-brand">#</span>anime
          </span>
          <span className="h-6 w-6 rounded-full border-2 border-brand" />
        </div>
      </div>

      <input
        id="hue"
        type="range"
        min={0}
        max={359}
        step={1}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        className="hue-slider w-full"
        aria-valuetext={`${hueName(value)}, ${value} degrees`}
      />

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Color presets">
        {HUE_PRESETS.map((p) => (
          <button
            key={p.hue}
            onClick={() => change(p.hue, true)}
            aria-pressed={value === p.hue}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150",
              value === p.hue ? "border-ink text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: hueColor(p.hue) }} aria-hidden />
            {p.label} <span className="opacity-70">{p.jp}</span>
          </button>
        ))}
        {value !== DEFAULT_HUE && (
          <button onClick={() => change(DEFAULT_HUE, true)} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:text-ink">
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>
    </div>
  );
}
