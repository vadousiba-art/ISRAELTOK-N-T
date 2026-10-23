"use client";

import Link from "next/link";
import { useRpc } from "@/lib/client/hooks";
import { TICKER, todaysChallenge } from "@/lib/jokes";
import { Avatar } from "@/components/ui/Avatar";
import type { Leaderboard } from "@/lib/types";
import { useShell } from "./AppShell";

// Desktop-only right rail: news ticker, trending tags, daily challenge, mini leaderboard.
export function RightRail() {
  const { openComposer } = useShell();
  const { data: tags } = useRpc<{ tag: string; count: number }[]>("get_trending_tags", { p_limit: 8 });
  const { data: board } = useRpc<Leaderboard>("get_leaderboard");

  return (
    <aside className="sticky top-0 hidden h-dvh w-[320px] shrink-0 flex-col gap-4 overflow-y-auto py-6 xl:flex" aria-label="Trending">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 bg-hot px-3 py-1.5 text-xs font-black tracking-widest text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE · FAKE NEWS NETWORK
        </div>
        <div className="overflow-hidden py-2.5">
          <div className="marquee flex w-max gap-10 whitespace-nowrap text-sm font-semibold">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="card relative overflow-hidden p-4">
        <div className="sticker absolute right-3 top-3 rotate-12 rounded bg-lime px-2 py-0.5 text-sm text-black">DAILY</div>
        <div className="text-xs font-black uppercase tracking-widest text-hot">Today&apos;s challenge</div>
        <p className="mt-2 font-bold">{todaysChallenge()}</p>
        <button
          onClick={() => openComposer({ tab: "text" })}
          className="mt-3 rounded-full bg-card-2 px-3 py-1.5 text-sm font-bold text-brand hover:bg-line"
        >
          Accept challenge (+5 🌀)
        </button>
      </div>

      <div className="card p-4">
        <div className="mb-2 font-black">🔥 Trending in the bunker</div>
        {(tags ?? []).length === 0 && <p className="text-sm text-muted">Nothing trending. Start a movement.</p>}
        {(tags ?? []).map((t, i) => (
          <Link
            key={t.tag}
            href={`/explore?tag=${encodeURIComponent(t.tag)}`}
            className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-card-2"
          >
            <span className="text-sm font-bold">
              <span className="mr-2 text-muted">{i + 1}</span>#{t.tag}
            </span>
            <span className="text-xs text-muted">{t.count} posts</span>
          </Link>
        ))}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-black">🏆 Biggest menaces</span>
          <Link href="/leaderboard" className="text-xs font-bold text-brand">
            See all
          </Link>
        </div>
        {(board?.chaos ?? []).slice(0, 5).map((e, i) => (
          <Link key={e.profile.id} href={`/u/${e.profile.username}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-card-2">
            <span className="w-4 text-sm font-black text-muted">{i + 1}</span>
            <Avatar src={e.profile.avatar_url} name={e.profile.display_name} size={30} />
            <span className="flex-1 truncate text-sm font-bold">{e.profile.display_name}</span>
            <span className="text-xs font-black text-lime">{e.score} 🌀</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
