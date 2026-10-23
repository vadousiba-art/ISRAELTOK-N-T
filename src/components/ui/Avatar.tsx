"use client";

import clsx from "clsx";
import { mediaSrc } from "@/lib/client/api";

const GRADIENTS = [
  "linear-gradient(135deg,#1f6bff,#9d4dff)",
  "linear-gradient(135deg,#ff2d95,#ff9f1c)",
  "linear-gradient(135deg,#21c55d,#c6ff00)",
  "linear-gradient(135deg,#9d4dff,#ff2d95)",
  "linear-gradient(135deg,#00c2ff,#1f6bff)",
  "linear-gradient(135deg,#ff6a00,#ff2d55)",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type Props = {
  src?: string | null;
  name: string;
  size?: number;
  ring?: "none" | "gradient" | "brand" | "story" | "seen";
  online?: boolean;
  className?: string;
};

export function Avatar({ src, name, size = 44, ring = "none", online, className }: Props) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const ringPad = ring === "none" ? 0 : ring === "story" || ring === "seen" ? 3 : 2.5;
  const inner = size - ringPad * 2 - (ring === "none" ? 0 : 3);
  const image = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaSrc(src)}
      alt=""
      width={inner}
      height={inner}
      className="h-full w-full rounded-full object-cover"
      loading="lazy"
      draggable={false}
    />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center rounded-full font-bold text-white"
      style={{ background: GRADIENTS[hash(name) % GRADIENTS.length], fontSize: Math.max(10, inner * 0.38) }}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );

  return (
    <div className={clsx("relative shrink-0", className)} style={{ width: size, height: size }}>
      {ring === "none" ? (
        <div className="h-full w-full overflow-hidden rounded-full">{image}</div>
      ) : (
        <div
          className={clsx(
            "h-full w-full rounded-full",
            ring === "gradient" && "ring-gradient",
            ring === "brand" && "bg-brand",
            ring === "story" && "bg-brand",
            ring === "seen" && "bg-line",
          )}
          style={{ padding: ringPad }}
        >
          <div className="h-full w-full rounded-full bg-bg p-[2px]">{image}</div>
        </div>
      )}
      {online && (
        <span
          className="absolute rounded-full border-[2.5px] border-bg bg-online"
          style={{ width: size * 0.24, height: size * 0.24, right: size * 0.02, bottom: size * 0.02 }}
          aria-label="online"
        />
      )}
    </div>
  );
}
