"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { mediaSrc } from "@/lib/client/api";
import { STORY_BG } from "@/lib/jokes";
import { useShell } from "@/components/shell/AppShell";
import { useLive } from "@/components/providers/LiveProvider";
import type { StoryGroup } from "@/lib/types";
import { StoryViewer } from "./StoryViewer";

const SIZE = 70;

function Bubble({ group, onOpen, index }: { group: StoryGroup; onOpen: () => void; index: number }) {
  const latest = group.items[group.items.length - 1];
  const label = group.channel_id ? group.label : (group.author?.username ?? group.label);
  // People are shown by their avatar (as in the reference); group stories by their latest media.
  const thumb = !group.channel_id && group.author?.avatar_url ? group.author.avatar_url : latest.media_url;
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(0.03 * index, 0.2), duration: 0.2 }}
      whileTap={{ scale: 0.94 }}
      onClick={onOpen}
      className="flex w-[80px] shrink-0 flex-col items-center gap-1"
      aria-label={`View ${group.label}'s story`}
    >
      <span
        className={clsx("relative rounded-full p-[2.5px]", group.all_viewed ? "bg-line" : "story-ring-new bg-brand")}
        style={{ width: SIZE, height: SIZE }}
      >
        <span className="block h-full w-full overflow-hidden rounded-full border-[3px] border-bg bg-card-2">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] font-bold leading-tight text-white"
              style={{ background: STORY_BG[latest.bg] }}
            >
              {latest.text.slice(0, 40)}
            </span>
          )}
        </span>
      </span>
      <span className="max-w-full truncate text-[13px] text-muted">{label}</span>
    </motion.button>
  );
}

export function StoriesBar() {
  const { openStoryComposer } = useShell();
  const { data, mutate } = useRpc<StoryGroup[]>("get_stories", {}, { refreshInterval: 120_000 });
  const [open, setOpen] = useState<number | null>(null);
  useLive((e) => e.type === "story" && mutate());

  return (
    <div className="-mx-3 sm:-mx-4">
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-1 pt-1 sm:px-3">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={openStoryComposer}
          className="flex w-[80px] shrink-0 flex-col items-center gap-1"
          aria-label="Add story"
        >
          <span
            className="flex items-center justify-center rounded-full border-2 border-brand bg-card text-ink transition-colors duration-150 hover:bg-card-2"
            style={{ width: SIZE, height: SIZE }}
          >
            <Plus size={30} strokeWidth={1.6} />
          </span>
          <span className="text-[13px] font-semibold text-ink">Add Story</span>
        </motion.button>
        {!data &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex w-[80px] shrink-0 flex-col items-center gap-2" aria-hidden>
              <div className="skeleton rounded-full" style={{ width: SIZE, height: SIZE }} />
              <div className="skeleton h-3 w-14" />
            </div>
          ))}
        {data?.map((g, i) => <Bubble key={g.key} group={g} index={i} onOpen={() => setOpen(i)} />)}
      </div>
      {open !== null && data && (
        <StoryViewer
          groups={data}
          startIndex={open}
          onClose={() => {
            setOpen(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}
