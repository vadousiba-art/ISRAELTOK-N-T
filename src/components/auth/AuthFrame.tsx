"use client";

import { motion } from "motion/react";
import { Logo, Tagline } from "@/components/ui/Logo";
import { TICKER } from "@/lib/jokes";
import { AppDownload } from "./AppDownload";

const STICKERS = [
  { t: "INVITE ONLY", c: "bg-lime text-black", r: -8, x: "6%", y: "12%" },
  { t: "NO NORMIES", c: "bg-hot text-white", r: 6, x: "72%", y: "8%" },
  { t: "SKILL ISSUE?", c: "bg-volt text-white", r: -4, x: "78%", y: "78%" },
  { t: "TOUCH GRASS", c: "bg-brand text-white", r: 9, x: "4%", y: "82%" },
];

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(31,107,255,0.25),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(255,45,149,0.18),transparent_55%)]" />
      {STICKERS.map((s, i) => (
        <motion.div
          key={s.t}
          className={`sticker pointer-events-none absolute hidden rounded-lg px-3 py-1 text-lg shadow-xl sm:block ${s.c}`}
          style={{ left: s.x, top: s.y }}
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: s.r }}
          transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 300, damping: 12 }}
          aria-hidden
        >
          {s.t}
        </motion.div>
      ))}
      <div className="overflow-hidden border-b border-line bg-hot/90 py-1.5 text-xs font-bold text-white">
        <div className="marquee flex w-max gap-10 whitespace-nowrap">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-10">
        <motion.div
          initial={{ y: -30, opacity: 0, rotate: -6 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="flex flex-col items-center"
        >
          <Logo width={290} />
          <Tagline size="lg" className="mt-2" />
        </motion.div>
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 20 }}
          className="card mt-8 w-full p-5"
        >
          {children}
        </motion.div>
        <AppDownload className="mt-4" />
      </main>
    </div>
  );
}
