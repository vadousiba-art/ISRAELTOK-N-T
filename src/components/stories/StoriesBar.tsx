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
  const label = group.channel_id ? group.label.replace(/\b\w/g, (c) => c.toUpperCase()) : group.label.split(" ")[0];
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.6, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.04 * index, type: "spring", stiffness: 420, damping: 22 }}
      whileTap={{ scale: 0.9 }}
      onClick={onOpen}
      className="flex w-[80px] shrink-0 flex-col items-center gap-1"
      aria-label={`View ${group.label}'s story`}
    >
      <span
        className={clsx("relative rounded-full p-[3px]", group.all_viewed ? "bg-line" : "bg-brand")}
        style={{ width: SIZE, height: SIZE }}
      >
        <span className="block h-full w-full overflow-hidden rounded-full border-[2.5px] border-bg bg-card-2">
          {latest.media_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(latest.media_url)} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : group.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(group.author.avatar_url)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] font-black leading-tight text-black"
              style={{ background: STORY_BG[latest.bg] }}
            >
              {latest.text.slice(0, 40)}
            </span>
          )}
        </span>
        {group.online && (
          <span className="absolute bottom-[3px] right-[3px] h-[16px] w-[16px] rounded-full border-[2.5px] border-bg bg-online" aria-label="online" />
        )}
      </span>
      <span className="max-w-full truncate text-[13.5px] font-medium text-ink">{label}</span>
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
          whileTap={{ scale: 0.9 }}
          onClick={openStoryComposer}
          className="flex w-[80px] shrink-0 flex-col items-center gap-1"
          aria-label="Add story"
        >
          <span className="relative rounded-full bg-brand p-[3px]" style={{ width: SIZE, height: SIZE }}>
            <span className="block h-full w-full overflow-hidden rounded-full border-[2.5px] border-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/seed/story-add.png" alt="" className="h-full w-full object-cover" />
            </span>
            <span className="absolute -bottom-[1px] -right-[1px] flex h-[24px] w-[24px] items-center justify-center rounded-full border-[2.5px] border-bg bg-brand text-white">
              <Plus size={14} strokeWidth={3.5} />
            </span>
          </span>
          <span className="text-[13.5px] font-medium text-ink">Add Story</span>
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
