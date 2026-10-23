"use client";

import { useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { rpc } from "@/lib/client/api";
import { FEED_REFRESH_EVENT } from "@/lib/client/hooks";
import { useLive } from "@/components/providers/LiveProvider";
import { useShell } from "@/components/shell/AppShell";
import { Empty, PostSkeleton } from "@/components/ui/bits";
import { EMPTY_LINES } from "@/lib/jokes";
import type { Post } from "@/lib/types";
import { PostCard } from "./PostCard";

const PAGE = 10;

type Mode = "latest" | "trending" | "user" | "media" | "tag" | "search" | "bookmarks";

// Infinite feed. Chronological modes page by created_at cursor; trending
// pages by offset (scores shift, so duplicates are filtered client-side).
export function Feed({ mode = "latest", arg, emptyText, live = false }: { mode?: Mode; arg?: string; emptyText?: string; live?: boolean }) {
  const { me } = useShell();
  const sentinel = useRef<HTMLDivElement>(null);
  const [fresh, setFresh] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Post[]>(
    (index, prev) => {
      if (prev && prev.length < PAGE) return null;
      if (mode === "trending") return ["feed", mode, arg ?? null, index * PAGE];
      const cursor = index === 0 ? null : prev?.[prev.length - 1]?.created_at;
      return ["feed", mode, arg ?? null, cursor];
    },
    ([, m, a, c]: [string, Mode, string | null, string | number | null]) =>
      rpc<Post[]>("get_feed", {
        p_mode: m,
        p_arg: a,
        p_limit: PAGE,
        ...(m === "trending" ? { p_offset: c ?? 0 } : { p_before: c }),
      }),
    { revalidateFirstPage: true, revalidateOnFocus: false },
  );

  const seen = new Set<string>();
  const posts = (data ?? []).flat().filter((p) => {
    if (seen.has(p.id) || hidden.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  const done = data && data[data.length - 1]?.length < PAGE;
  const loadingMore = !done && (isValidating || (data && typeof data[size - 1] === "undefined"));

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isValidating) setSize((s) => s + 1);
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, isValidating, setSize]);

  useEffect(() => {
    const onRefresh = () => mutate();
    window.addEventListener(FEED_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(FEED_REFRESH_EVENT, onRefresh);
  }, [mutate]);

  useLive((e) => {
    if (!live || e.type !== "post") return;
    if (e.author_id === me.id) {
      mutate();
    } else {
      setFresh((n) => n + 1);
    }
  });

  if (error && !data) {
    return <Empty emoji="🛰️" text={`The feed fell over: ${error.message}`} />;
  }

  return (
    <div className="relative space-y-4">
      <AnimatePresence>
        {fresh > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            onClick={() => {
              setFresh(0);
              mutate();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="sticky top-[118px] z-20 mx-auto flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand/40"
          >
            <ArrowUp size={16} /> {fresh} new {fresh === 1 ? "post" : "posts"} of pure chaos
          </motion.button>
        )}
      </AnimatePresence>
      {!data && (
        <>
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}
      {data && posts.length === 0 && <Empty text={emptyText ?? EMPTY_LINES.feed} />}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onDeleted={(id) => setHidden((h) => new Set(h).add(id))} />
      ))}
      <div ref={sentinel} />
      {loadingMore && data && <PostSkeleton />}
      {done && posts.length > 3 && (
        <p className="py-6 text-center text-sm font-semibold text-muted">
          🏁 You reached the end. Go touch grass. <span className="text-xs">(or post something)</span>
        </p>
      )}
    </div>
  );
}
