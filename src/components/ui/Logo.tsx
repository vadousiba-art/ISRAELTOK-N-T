"use client";

import clsx from "clsx";

/* eslint-disable @next/next/no-img-element */

export const BRAND = "YORU";
export const BRAND_JP = "夜";
export const TAGLINE = "THE INTERNET AFTER DARK.";
export const TAGLINE_JP = "夜は、まだ終わらない。";

// The YORU | 夜 wordmark, cut from the official logo artwork.
export function Logo({ width = 170, className }: { width?: number; className?: string; spinOnTap?: boolean }) {
  const height = Math.round((width * 213) / 868);
  return (
    <span className={clsx("hue-follow relative inline-block select-none", className)} style={{ width, height }} role="img" aria-label="YORU 夜">
      <img src="/brand/yoru/wordmark.png" alt="" className="absolute inset-0 hidden h-full w-full dark:block" draggable={false} />
      <img src="/brand/yoru/wordmark-light.png" alt="" className="absolute inset-0 h-full w-full dark:hidden" draggable={false} />
    </span>
  );
}

export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/yoru/mark.png"
      alt=""
      width={size}
      height={Math.round((size * 148) / 159)}
      className={clsx("hue-follow select-none", className)}
      draggable={false}
    />
  );
}

export function Tagline({ className, size = "sm" }: { className?: string; size?: "sm" | "lg" }) {
  return (
    <div className={clsx("tagline text-center text-ink", size === "lg" ? "text-[12px]" : "text-[8.5px]", className)}>
      {TAGLINE}
    </div>
  );
}
