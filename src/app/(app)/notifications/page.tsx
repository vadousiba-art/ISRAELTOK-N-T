"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CheckCheck } from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { byFn, useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useLive } from "@/components/providers/LiveProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, PageTitle, TimeAgo } from "@/components/ui/bits";
import { AWARD_INFO, EMPTY_LINES, NOTIFICATION_TEXT, REACTION_EMOJI } from "@/lib/jokes";
import type { AppNotification, AwardKind, ReactionKind } from "@/lib/types";

const ICON: Record<string, string> = {
  like: "❤️",
  comment: "💬",
  reply: "↩️",
  mention: "📣",
  repost: "🔁",
  award: "🏆",
  message: "✉️",
  friend_post: "🆕",
  roast: "🔥",
};

function href(n: AppNotification) {
  if (n.post_id) return `/post/${n.post_id}`;
  if (n.channel_id) return `/chat/${n.channel_id}`;
  if (n.actor) return `/u/${n.actor.username}`;
  return "#";
}

export default function NotificationsPage() {
  const { data, mutate } = useRpc<AppNotification[]>("get_notifications", { p_limit: 60 });
  const { mutate: mutateAll } = useSWRConfig();
  useLive((e) => e.type === "notification" && mutate());

  const unread = (data ?? []).filter((n) => !n.read).length;

  async function markAll() {
    await rpc("mark_notifications_read", { p_ids: null }).catch(() => null);
    mutate();
    mutateAll(byFn("get_me"));
  }

  // Opening the page marks things read after a short beat so the badges flash first.
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(markAll, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageTitle emoji="🔔" sub="People who thought about you (rare).">
          Notifications
        </PageTitle>
        {unread > 0 && (
          <Button variant="outline" onClick={markAll} className="text-xs">
            <CheckCheck size={16} /> Mark all read
          </Button>
        )}
      </div>
      {!data && <ChaosLoader />}
      {data && data.length === 0 && <Empty emoji="🧘" text={EMPTY_LINES.notifications} />}
      <div className="space-y-2">
        {data?.map((n, i) => {
          let detail = n.body;
          if (n.kind === "reaction") detail = REACTION_EMOJI[n.body as ReactionKind] ?? n.body;
          if (n.kind === "award") detail = `${AWARD_INFO[n.body as AwardKind]?.emoji ?? "🏆"} ${AWARD_INFO[n.body as AwardKind]?.label ?? n.body}`;
          return (
            <motion.div key={n.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
              <Link
                href={href(n)}
                className={clsx("card flex items-start gap-3 p-3 transition hover:border-brand", !n.read && "border-brand/60 bg-brand/5")}
              >
                <div className="relative">
                  <Avatar src={n.actor?.avatar_url} name={n.actor?.display_name ?? "?"} size={44} />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-card px-0.5 text-base leading-none">{ICON[n.kind] ?? "📢"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">
                    <b>{n.actor?.display_name ?? "Someone"}</b> {NOTIFICATION_TEXT[n.kind] ?? n.kind}
                    {n.kind === "reaction" && ` ${detail}`}
                  </p>
                  {detail && n.kind !== "reaction" && n.kind !== "like" && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted">{detail}</p>
                  )}
                  <TimeAgo iso={n.created_at} className="text-xs text-muted" />
                </div>
                {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="unread" />}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
