"use client";

import clsx from "clsx";
import type { AvatarFrame, BannerStyle } from "@/lib/opengates";

// Profile banners: drawn with CSS only (no image downloads), tinted by the
// member's own color where it fits the style.
export function ProfileBanner({ style = "aurora", accent, className, children }: { style?: BannerStyle; accent: string; className?: string; children?: React.ReactNode }) {
  const bg: Record<BannerStyle, string> = {
    aurora: `radial-gradient(ellipse at top right, color-mix(in srgb, ${accent} 40%, transparent), transparent 65%), linear-gradient(160deg, #1a1a1a, #080808)`,
    ink: `radial-gradient(120% 90% at 15% 110%, #000 30%, transparent 31%), radial-gradient(80% 70% at 85% -10%, #1d1d1d 40%, transparent 41%), radial-gradient(40% 50% at 60% 60%, color-mix(in srgb, ${accent} 22%, transparent), transparent 70%), #0d0d0d`,
    minimal: `linear-gradient(#0b0b0b, #0b0b0b)`,
    sakura_night: `radial-gradient(circle at 82% 30%, #f6e9ee 0 7%, transparent 7.5%), radial-gradient(2px 2px at 20% 30%, #ffb7cf 99%, transparent), radial-gradient(3px 3px at 35% 70%, #ff9ec0 99%, transparent), radial-gradient(2px 2px at 55% 20%, #ffc7d9 99%, transparent), radial-gradient(3px 3px at 70% 75%, #ffb0c9 99%, transparent), radial-gradient(2px 2px at 10% 80%, #ffd0e0 99%, transparent), linear-gradient(160deg, #1b1030, #07060d)`,
    crimson_moon: `radial-gradient(circle at 78% 55%, #e5102f 0 22%, color-mix(in srgb, #e5102f 35%, transparent) 23%, transparent 40%), linear-gradient(180deg, #120305, #050505)`,
    manga_panel: `radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1.6px) 0 0 / 7px 7px, repeating-conic-gradient(from 0deg at 80% 50%, rgba(255,255,255,0.08) 0deg 1deg, transparent 1deg 9deg), linear-gradient(135deg, #141414, #050505)`,
  };
  return (
    <div className={clsx("relative overflow-hidden", className)} style={{ background: bg[style] ?? bg.aurora }} data-banner={style}>
      {style === "minimal" && <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: accent }} />}
      {style === "manga_panel" && <div aria-hidden className="pointer-events-none absolute inset-2 border-2 border-white/25" />}
      {style === "crimson_moon" && (
        <span aria-hidden className="pointer-events-none absolute bottom-1 end-4 select-none text-[11px] font-bold tracking-[0.3em] text-white/40">
          紅月
        </span>
      )}
      {children}
    </div>
  );
}

// Avatar frames wrap the avatar (and the level ring when present).
export function AvatarFrameWrap({ frame = "none", accent, children }: { frame?: AvatarFrame; accent: string; children: React.ReactNode }) {
  if (frame === "ring") {
    return <div className="rounded-full p-[3px]" style={{ background: accent }}>{children}</div>;
  }
  if (frame === "neon") {
    return (
      <div className="rounded-full p-[3px]" style={{ background: `conic-gradient(${accent}, #fff, ${accent})`, boxShadow: `0 0 18px -2px ${accent}` }}>
        {children}
      </div>
    );
  }
  if (frame === "hanko") {
    return (
      <div className="relative">
        {children}
        <span
          aria-hidden
          className="absolute -bottom-1 -end-2 flex h-7 w-7 rotate-[-8deg] items-center justify-center rounded-[6px] border-2 border-[#e5102f] bg-[#e5102f]/10 text-[13px] font-black text-[#e5102f]"
        >
          夜
        </span>
      </div>
    );
  }
  return <>{children}</>;
}
