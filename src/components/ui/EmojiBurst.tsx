"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

type Burst = { id: number; x: number; y: number; emoji: string };
let push: ((b: Omit<Burst, "id">) => void) | null = null;
let seq = 1;

// Fire-and-forget emoji explosion at a screen position (likes, awards...).
export function burst(emoji: string, el: Element | null) {
  if (!el || !push) return;
  if (document.documentElement.dataset.motion === "reduce") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.motion !== "full") return;
  const r = el.getBoundingClientRect();
  push({ x: r.left + r.width / 2, y: r.top + r.height / 2, emoji });
}

export function EmojiBurstLayer() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  useEffect(() => {
    push = (b) => {
      const id = seq++;
      setBursts((all) => [...all.slice(-6), { ...b, id }]);
      setTimeout(() => setBursts((all) => all.filter((x) => x.id !== id)), 1100);
    };
    return () => {
      push = null;
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-hidden>
      {bursts.map((b) =>
        Array.from({ length: 9 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 9 + (b.id % 3) * 0.3;
          const dist = 48 + (i % 3) * 22;
          return (
            <motion.span
              key={`${b.id}-${i}`}
              className="absolute text-xl"
              style={{ left: b.x, top: b.y }}
              initial={{ x: "-50%", y: "-50%", scale: 0.4, opacity: 1 }}
              animate={{
                x: `calc(-50% + ${Math.cos(angle) * dist}px)`,
                y: `calc(-50% + ${Math.sin(angle) * dist - 30}px)`,
                scale: [0.4, 1.3, 0.9],
                opacity: [1, 1, 0],
                rotate: (i % 2 ? 1 : -1) * 90,
              }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              {b.emoji}
            </motion.span>
          );
        }),
      )}
    </div>,
    document.body,
  );
}
