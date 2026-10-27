"use client";

import Link from "next/link";
import { useProgress, useRpc, useSite } from "@/lib/client/hooks";
import { XpBar } from "@/components/yoru/Progression";
import { CATEGORIES, todaysChallenge } from "@/lib/jokes";
import { Avatar } from "@/components/ui/Avatar";
import type { Leaderboard } from "@/lib/types";
import { useShell } from "./AppShell";

// Desktop-only right rail: categories, nightly prompt, trending tags, mini leaderboard.
export function RightRail() {
  const { openComposer } = useShell();
  const { data: site } = useSite();
  const { data: progress } = useProgress();
  const prompt = site?.nightly_prompt || todaysChallenge();
  const { data: tags } = useRpc<{ tag: string; count: number }[]>("get_trending_tags", { p_limit: 8 });
  const { data: board } = useRpc<Leaderboard>("get_leaderboard");

  return (
    <aside className="no-scrollbar sticky top-0 hidden h-dvh w-[320px] shrink-0 flex-col gap-4 overflow-y-auto py-6 xl:flex [&>*]:shrink-0" aria-label="Trending">
      {progress && (
        <Link href="/leaderboard" className="card block p-4 transition-colors duration-150 hover:border-brand">
          <XpBar xp={progress.xp} />
          <div className="mt-2 text-xs text-muted">
            🔥 {progress.streak} night streak · best {progress.best_streak}
          </div>
        </Link>
      )}

      <div className="card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-semibold">Find your people.</span>
          <span className="text-xs text-muted">カテゴリー</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.tag}
              href={`/explore?tag=${c.tag}`}
              className="rounded-full border border-line px-3 py-1 text-sm text-ink-2 transition-colors duration-150 hover:border-brand hover:text-ink"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card relative overflow-hidden p-4">
        <div className="sticker absolute right-4 top-4 text-muted">今夜</div>
        <div className="text-xs font-semibold uppercase tracking-widest text-brand">Tonight&apos;s prompt</div>
        <p className="mt-2 font-medium">{prompt}</p>
        <button
          onClick={() => openComposer({ tab: "text", text: `${prompt}\n\n#dailychallenge` })}
          className="mt-3 rounded-full bg-card-2 px-3 py-1.5 text-sm font-bold text-brand hover:bg-line"
        >
          Drop a post
        </button>
      </div>

      <div className="card p-4">
        <div className="mb-2 font-semibold">Trending tonight</div>
        {(tags ?? []).length === 0 && <p className="text-sm text-muted">It&apos;s quiet tonight.</p>}
        {(tags ?? []).map((t, i) => (
          <Link
            key={t.tag}
            href={`/explore?tag=${encodeURIComponent(t.tag)}`}
            className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-card-2"
          >
            <span className="text-sm font-bold">
              <span className="mr-2 text-muted">{i + 1}</span>#{t.tag}
            </span>
            <span className="text-xs text-muted">{t.count} {t.count === 1 ? "post" : "posts"}</span>
          </Link>
        ))}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">Most active</span>
          <Link href="/leaderboard" className="text-xs font-bold text-brand">
            See all
          </Link>
        </div>
        {(board?.chaos ?? []).slice(0, 5).map((e, i) => (
          <Link key={e.profile.id} href={`/u/${e.profile.username}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-card-2">
            <span className="w-4 text-sm font-bold text-muted">{i + 1}</span>
            <Avatar src={e.profile.avatar_url} name={e.profile.display_name} size={30} />
            <span className="flex-1 truncate text-sm font-bold">{e.profile.display_name}</span>
            <span className="text-xs font-semibold text-muted">{e.score}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
