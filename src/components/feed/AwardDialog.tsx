"use client";

import { useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { AWARDS, pickLine, SUCCESS_TOASTS } from "@/lib/jokes";
import { playSound } from "@/lib/client/sounds";
import type { AwardKind, PostCore } from "@/lib/types";

export function AwardDialog({
  open,
  onClose,
  post,
  onGiven,
}: {
  open: boolean;
  onClose: () => void;
  post: PostCore;
  onGiven: (kind: AwardKind) => void;
}) {
  const { toast, toastError } = useApp();
  const [busy, setBusy] = useState<AwardKind | null>(null);

  async function give(kind: AwardKind) {
    setBusy(kind);
    try {
      const r = await rpc<{ remaining: number }>("give_award", { p_post_id: post.id, p_kind: kind });
      onGiven(kind);
      playSound("victory");
      toast(`${pickLine(SUCCESS_TOASTS.award)} (${r.remaining} left today)`, "chaos", "🏆");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Community Awards">
      <p className="mb-4 text-sm text-muted">5 awards per day. Use them wisely (you won&apos;t).</p>
      <div className="grid grid-cols-2 gap-2">
        {AWARDS.map((a, i) => {
          const given = post.my_awards.includes(a.kind);
          return (
            <motion.button
              key={a.kind}
              initial={{ opacity: 0, scale: 0.8, rotate: i % 2 ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 20 }}
              whileHover={{ scale: 1.04, rotate: i % 2 ? 1.5 : -1.5 }}
              whileTap={{ scale: 0.94 }}
              disabled={given || busy !== null}
              onClick={() => give(a.kind)}
              className={clsx(
                "flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition",
                given ? "border-lime/50 bg-lime/10 opacity-60" : "border-line hover:border-lime/60 hover:bg-card-2",
              )}
            >
              <span className="text-3xl">{a.emoji}</span>
              <span className="text-sm font-black">{a.label}</span>
              <span className="text-xs text-muted">{given ? "Already given" : busy === a.kind ? "Awarding..." : a.blurb}</span>
            </motion.button>
          );
        })}
      </div>
    </Modal>
  );
}
