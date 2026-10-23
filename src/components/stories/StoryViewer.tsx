"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Eye, Flag, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TimeAgo } from "@/components/ui/bits";
import { mediaSrc, rpc } from "@/lib/client/api";
import { STORY_BG } from "@/lib/jokes";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { ReportDialog } from "@/components/feed/ReportDialog";
import type { StoryGroup } from "@/lib/types";

const DURATION = 5500;

export function StoryViewer({ groups, startIndex, onClose }: { groups: StoryGroup[]; startIndex: number; onClose: () => void }) {
  const { me } = useShell();
  const { toast, toastError } = useApp();
  const [g, setG] = useState(startIndex);
  const [i, setI] = useState(() => {
    const first = groups[startIndex].items.findIndex((it) => !it.viewed);
    return first === -1 ? 0 : first;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reporting, setReporting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const group = groups[g];
  const item = group?.items[i];

  const next = useCallback(() => {
    setProgress(0);
    if (i < group.items.length - 1) setI(i + 1);
    else if (g < groups.length - 1) {
      setG(g + 1);
      setI(0);
    } else onClose();
  }, [g, i, group, groups.length, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (i > 0) setI(i - 1);
    else if (g > 0) {
      setG(g - 1);
      setI(groups[g - 1].items.length - 1);
    }
  }, [g, i, groups]);

  useEffect(() => {
    if (item && !item.viewed) rpc("view_story", { p_story_id: item.id }).catch(() => {});
  }, [item]);

  useEffect(() => {
    if (!item || paused || reporting || item.media_type === "video") return;
    const started = Date.now() - progress * DURATION;
    const t = setInterval(() => {
      const p = (Date.now() - started) / DURATION;
      if (p >= 1) next();
      else setProgress(p);
    }, 50);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, paused, reporting, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [next, prev, onClose]);

  if (!item) return null;
  const isMine = item.author.id === me.id;

  async function remove() {
    if (!confirm("Delete this story?")) return;
    try {
      await rpc("delete_story", { p_story_id: item.id });
      toast("Story deleted. It never happened.", "success", "🗑️");
      onClose();
    } catch (err) {
      toastError(err);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Story">
      <motion.div
        key={group.key}
        initial={{ opacity: 0, scale: 0.9, rotateY: 30 }}
        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative h-full w-full max-w-[480px] overflow-hidden sm:h-[92dvh] sm:rounded-3xl"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        onDragEnd={(_, info) => info.offset.y > 120 && onClose()}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: item.media_url ? "#000" : STORY_BG[item.bg] }}
          >
            {item.media_url ? (
              item.media_type === "video" ? (
                <video
                  ref={videoRef}
                  src={mediaSrc(item.media_url)}
                  autoPlay
                  playsInline
                  className="max-h-full w-full object-contain"
                  onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
                  onEnded={next}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(item.media_url)} alt="" className="max-h-full w-full object-contain" />
              )
            ) : null}
            {item.text && (
              <p
                className={
                  item.media_url
                    ? "absolute inset-x-6 bottom-24 rounded-2xl bg-black/60 p-3 text-center text-lg font-bold text-white"
                    : "sticker px-8 text-center text-4xl leading-tight text-black"
                }
                dir="auto"
              >
                {item.text}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* tap zones */}
        <button className="absolute inset-y-0 left-0 z-10 w-1/3" aria-label="Previous" onClick={prev}
          onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />
        <button className="absolute inset-y-0 right-0 z-10 w-2/3" aria-label="Next" onClick={next}
          onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />

        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent p-3 pb-10">
          <div className="flex gap-1">
            {group.items.map((it, idx) => (
              <div key={it.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full bg-white"
                  style={{ width: idx < i ? "100%" : idx === i ? `${Math.min(progress, 1) * 100}%` : "0%" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-white">
            <Avatar src={item.author.avatar_url} name={item.author.display_name} size={36} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-bold">
                {item.author.display_name}
                {group.channel_id && <span className="font-normal text-white/70"> in {group.label}</span>}
              </div>
              <TimeAgo iso={item.created_at} className="text-xs text-white/70" />
            </div>
            {isMine ? (
              <>
                <span className="flex items-center gap-1 text-xs font-bold" aria-label={`${item.views ?? 0} views`}>
                  <Eye size={16} /> {item.views ?? 0}
                </span>
                <button onClick={remove} className="rounded-full p-2 hover:bg-white/10" aria-label="Delete story">
                  <Trash2 size={18} />
                </button>
              </>
            ) : (
              <button onClick={() => setReporting(true)} className="rounded-full p-2 hover:bg-white/10" aria-label="Report story">
                <Flag size={18} />
              </button>
            )}
            <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close stories">
              <X size={22} />
            </button>
          </div>
        </div>
      </motion.div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="story" targetId={item.id} />
    </div>,
    document.body,
  );
}
