"use client";

import { useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import type { Post, PostCore } from "@/lib/types";

export function PollView({ post, onVoted }: { post: PostCore; onVoted: (p: PostCore) => void }) {
  const { toastError } = useApp();
  const [busy, setBusy] = useState(false);
  const poll = post.poll!;
  const voted = Boolean(poll.my_vote);
  const max = Math.max(...poll.options.map((o) => o.votes), 1);

  async function vote(optionId: string) {
    if (busy || optionId === poll.my_vote) return;
    setBusy(true);
    try {
      const updated = await rpc<Post>("vote_poll", { p_post_id: post.id, p_option_id: optionId });
      onVoted(updated);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {poll.options.map((o) => {
        const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
        const mine = poll.my_vote === o.id;
        return (
          <button
            key={o.id}
            disabled={busy}
            onClick={() => vote(o.id)}
            className={clsx(
              "relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-[15px] font-semibold transition",
              mine ? "border-brand" : "border-line hover:border-brand/60",
            )}
            aria-pressed={mine}
          >
            {voted && (
              <motion.span
                className={clsx("absolute inset-y-0 left-0", o.votes === max ? "bg-brand/30" : "bg-card-2")}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
            <span className="relative flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {mine && <Check size={16} className="text-brand" />}
                {o.label}
              </span>
              {voted && <span className="text-sm text-muted">{pct}%</span>}
            </span>
          </button>
        );
      })}
      <p className="pl-1 text-xs text-muted">
        {poll.total} {poll.total === 1 ? "vote" : "votes"} · {voted ? "you can change your vote" : "vote to see results"}
      </p>
    </div>
  );
}
