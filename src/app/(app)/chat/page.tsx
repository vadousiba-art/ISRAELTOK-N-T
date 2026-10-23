"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Lock, MessageSquarePlus } from "lucide-react";
import { useRpc } from "@/lib/client/hooks";
import { useLive } from "@/components/providers/LiveProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, PageTitle, TimeAgo } from "@/components/ui/bits";
import { NewChatDialog } from "@/components/chat/NewChatDialog";
import { EMPTY_LINES } from "@/lib/jokes";
import type { Channel } from "@/lib/types";

export default function ChatListPage() {
  const { data, mutate } = useRpc<Channel[]>("get_channels");
  const [open, setOpen] = useState(false);
  useLive((e) => e.type === "message" && mutate());

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageTitle emoji="💬" sub="Private group chats. What happens here stays here (until screenshots).">
          Chats
        </PageTitle>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <MessageSquarePlus size={18} /> New
        </Button>
      </div>
      {!data && <ChaosLoader />}
      {data && data.length === 0 && <Empty text={EMPTY_LINES.chats} />}
      <div className="space-y-2">
        {data?.map((c, i) => {
          const title = c.kind === "dm" ? (c.dm_user?.display_name ?? "Direct message") : c.name;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <Link href={`/chat/${c.id}`} className="card flex items-center gap-3 p-3 transition hover:border-brand">
                {c.kind === "dm" && c.dm_user ? (
                  <Avatar src={c.dm_user.avatar_url} name={c.dm_user.display_name} size={50} online={c.dm_user.online} />
                ) : (
                  <span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/30 to-volt/30 text-2xl">
                    {c.emoji}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-bold">{title}</span>
                    {c.is_private && c.kind === "group" && <Lock size={13} className="text-muted" />}
                    {c.last_message && <TimeAgo iso={c.last_message.created_at} className="ml-auto shrink-0 text-xs text-muted" />}
                  </div>
                  <p className="truncate text-sm text-muted">
                    {c.last_message ? (
                      <>
                        <b className="font-semibold text-ink-2">{c.last_message.author}:</b> {c.last_message.body}
                      </>
                    ) : c.is_member ? (
                      "No messages yet. Be the first menace."
                    ) : (
                      `${c.member_count} members · tap to join`
                    )}
                  </p>
                </div>
                {c.unread > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white"
                  >
                    {c.unread}
                  </motion.span>
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>
      <NewChatDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
