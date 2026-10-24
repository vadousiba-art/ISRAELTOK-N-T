"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import { INTENSITY } from "@/lib/jokes";

export function IntensityPicker({ value, onChange }: { value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Roast intensity">
      {INTENSITY.map((lvl) => (
        <motion.button
          key={lvl.level}
          role="radio"
          aria-checked={value === lvl.level}
          whileTap={{ scale: 0.92 }}
          onClick={() => onChange(lvl.level)}
          className={clsx(
            "rounded-2xl border px-2 py-2 text-left transition",
            value === lvl.level
              ? lvl.level === 3
                ? "border-hot bg-hot/15 shadow-[0_0_20px_-6px_var(--hot)]"
                : "border-brand bg-brand/15"
              : "border-line hover:bg-card-2",
          )}
        >
          <div className="text-base leading-none">{lvl.emoji}</div>
          <div className="mt-1 text-[12px] font-bold leading-tight">{lvl.name}</div>
          <div className="text-[10.5px] text-muted">{lvl.blurb}</div>
        </motion.button>
      ))}
    </div>
  );
}
