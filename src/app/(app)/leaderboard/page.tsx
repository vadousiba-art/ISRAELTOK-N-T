"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { byFn, useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, PageTitle } from "@/components/ui/bits";
import { EMPTY_LINES } from "@/lib/jokes";
import type { Leaderboard } from "@/lib/types";

const BOARDS = [
  { id: "likes", label: "Most Liked", emoji: "❤️", unit: "likes", blurb: "All-time hearts received" },
  { id: "chaos", label: "Biggest Menace", emoji: "🌀", unit: "chaos", blurb: "Chaos points from tools, awards & challenges" },
  { id: "awards", label: "Most Awarded", emoji: "🏆", unit: "awards", blurb: "Community awards received" },
  { id: "roasted", label: "Most Roasted", emoji: "🔥", unit: "roasts", blurb: "Times the Menace cooked them" },
  { id: "yappers", label: "Top Yapper", emoji: "🗣️", unit: "posts", blurb: "Posts in the last 7 days" },
] as const;

const PODIUM = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { toastError, toast } = useApp();
  const { mutate } = useSWRConfig();
  const { data, mutate: refresh } = useRpc<Leaderboard>("get_leaderboard");
  const [board, setBoard] = useState<(typeof BOARDS)[number]["id"]>("likes");
  const info = BOARDS.find((b) => b.id === board)!;
  const rows = data?.[board] ?? [];

  async function optIn() {
    try {
      await rpc("update_my_profile", { p: { leaderboard_opt_in: true } });
      toast("You're on the board. May the odds be ever in your favor.", "chaos", "🏆");
      refresh();
      mutate(byFn("get_me"));
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div>
      <PageTitle emoji="🏆" sub="Opt-in comedy rankings. Glory is temporary. Screenshots are forever.">
        Leaderboards
      </PageTitle>
      {data && !data.opted_in && (
        <div className="card mb-4 flex items-center gap-3 p-3">
          <span className="text-2xl">🙈</span>
          <p className="flex-1 text-sm">You&apos;re hidden from leaderboards.</p>
          <Button onClick={optIn} className="text-xs">
            Opt in
          </Button>
        </div>
      )}
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoard(b.id)}
            className={clsx(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold transition",
              board === b.id ? "border-brand bg-brand text-white" : "border-line bg-card hover:bg-card-2",
            )}
          >
            {b.emoji} {b.label}
          </button>
        ))}
      </div>
      <p className="mb-3 px-1 text-xs text-muted">{info.blurb}</p>
      {!data && <ChaosLoader />}
      {data && rows.length === 0 && <Empty emoji="🪑" text={EMPTY_LINES.leaderboard} />}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={`${board}-${r.profile.id}`}
            initial={{ opacity: 0, x: -20, rotate: i < 3 ? -2 : 0 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 22 }}
          >
            <Link
              href={`/u/${r.profile.username}`}
              className={clsx(
                "card flex items-center gap-3 p-3 transition hover:border-brand",
                i === 0 && "border-lime/60 bg-gradient-to-r from-lime/10 to-transparent",
              )}
            >
              <span className={clsx("w-8 text-center font-black", i < 3 ? "text-2xl" : "text-muted")}>{PODIUM[i] ?? i + 1}</span>
              <Avatar src={r.profile.avatar_url} name={r.profile.display_name} size={44} ring={i === 0 ? "gradient" : "none"} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">
                  {r.profile.display_name} {r.profile.badge}
                </div>
                <div className="truncate text-xs text-muted">@{r.profile.username}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black">{r.score}</div>
                <div className="text-[10px] font-bold uppercase text-muted">{info.unit}</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
