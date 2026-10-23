"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { ImageIcon, SquarePlay, SquarePlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useShell } from "@/components/shell/AppShell";

// The "What's on your mind, soldier?" card from the home screen.
export function InlineComposer() {
  const { me, openComposer } = useShell();
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const pick = (input: HTMLInputElement | null) => input?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) openComposer({ tab: "media", file });
  };

  return (
    <div className="card flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5">
      <Avatar src={me.avatar_url} name={me.display_name} size={42} ring="brand" />
      <button
        onClick={() => openComposer({ tab: "text" })}
        className="min-w-0 flex-1 truncate rounded-2xl border border-line bg-card-2/60 px-2.5 py-2.5 text-left text-[13px] text-muted transition hover:border-brand/50"
      >
        What&apos;s on your mind, soldier?
      </button>
      <div className="flex items-center gap-1.5 text-brand">
        <motion.button whileTap={{ scale: 0.8 }} whileHover={{ y: -2 }} onClick={() => pick(imageRef.current)} className="px-0.5 py-1" aria-label="Post a photo">
          <ImageIcon size={23} strokeWidth={1.8} />
        </motion.button>
        <span className="h-7 w-px bg-line" aria-hidden />
        <motion.button whileTap={{ scale: 0.8 }} whileHover={{ y: -2 }} onClick={() => pick(videoRef.current)} className="px-0.5 py-1" aria-label="Post a video">
          <SquarePlay size={23} strokeWidth={1.8} />
        </motion.button>
        <span className="h-7 w-px bg-line" aria-hidden />
        <motion.button
          whileTap={{ scale: 0.8, rotate: 90 }}
          whileHover={{ y: -2 }}
          onClick={() => openComposer({ tab: "poll" })}
          className="py-1 pl-0.5"
          aria-label="More post types (poll, link)"
        >
          <SquarePlus size={23} strokeWidth={1.8} />
        </motion.button>
      </div>
      <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onFile} />
      <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onFile} />
    </div>
  );
}
