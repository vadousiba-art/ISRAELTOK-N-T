"use client";

import { useState } from "react";
import { motion, useAnimationControls } from "motion/react";
import clsx from "clsx";
import { TAGLINE_1, TAGLINE_2 } from "@/lib/jokes";

/* eslint-disable @next/next/no-img-element */

// The wordmark and the Star of David are separate layers (both cut from the
// supplied logo) so the star can spin without touching the lettering.
export function Logo({ width = 210, className, spinOnTap = true }: { width?: number; className?: string; spinOnTap?: boolean }) {
  const controls = useAnimationControls();
  const [spins, setSpins] = useState(0);
  const height = (width * 94) / 416;

  const spin = () => {
    if (!spinOnTap) return;
    const next = spins + 1;
    setSpins(next);
    controls.start({ rotate: next * 360, transition: { type: "spring", stiffness: 120, damping: 12 } });
  };

  return (
    <span
      className={clsx("relative inline-block select-none", className)}
      style={{ width, height }}
      onClick={spin}
      role="img"
      aria-label="IsraelTokn't"
    >
      <img src="/brand/wordmark.png" alt="" className="absolute inset-0 hidden h-full w-full dark:block" draggable={false} />
      <img src="/brand/wordmark-light.png" alt="" className="absolute inset-0 h-full w-full dark:hidden" draggable={false} />
      <motion.img
        src="/brand/star-layer.png"
        alt=""
        animate={controls}
        className="absolute inset-0 h-full w-full"
        style={{ transformOrigin: "89.8% 52.1%" }}
        draggable={false}
      />
    </span>
  );
}

export function Tagline({ className, size = "sm" }: { className?: string; size?: "sm" | "lg" }) {
  return (
    <div className={clsx("text-center leading-tight text-ink", size === "lg" ? "text-lg" : "text-[13px]", className)}>
      <div>{TAGLINE_1}</div>
      <div className="relative inline-block">
        {TAGLINE_2}
        <svg
          viewBox="0 0 140 12"
          className="absolute -bottom-[7px] left-[2%] h-[9px] w-[96%] text-brand"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M2 8 C 30 3, 70 2, 138 5 M 22 10.5 C 55 7.5, 90 7, 118 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
