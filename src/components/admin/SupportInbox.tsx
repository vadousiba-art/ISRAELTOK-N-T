"use client";

import Link from "next/link";
import clsx from "clsx";
import { Mail } from "lucide-react";
import { useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, TimeAgo } from "@/components/ui/bits";
import { TOPIC_LABELS } from "@/lib/support";
import type { SupportMessage } from "@/lib/types";

// Messages from the public contact form (/support) and in-app help.
export function SupportInbox() {
  const { toastError } = useApp();
  const { data, mutate } = useRpc<SupportMessage[]>("admin_support_inbox", { p_limit: 150 }, { refreshInterval: 60_000 });
  if (!data) return <ChaosLoader />;
  if (data.length === 0) return <Empty text="No support messages yet." />;

  const toggle = async (m: SupportMessage) => {
    try {
      await rpc("admin_close_support", { p_id: m.id, p_closed: m.status === "open" });
      mutate();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="space-y-2">
      {data.map((m) => (
        <div key={m.id} className={clsx("card p-3", m.status === "closed" && "opacity-60", m.topic === "deletion" && m.status === "open" && "border-brand/60")}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-brand/15 px-2 py-0.5 font-semibold text-brand-2">{TOPIC_LABELS[m.topic]}</span>
            {m.user ? (
              <Link href={`/u/${m.user.username}`} className="flex items-center gap-1.5 font-semibold">
                <Avatar src={m.user.avatar_url} name={m.user.display_name} size={18} /> {m.user.display_name}
              </Link>
            ) : (
              <span className="text-muted">Signed out</span>
            )}
            <TimeAgo iso={m.created_at} className="ml-auto text-muted" />
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {m.email && (
              <a href={`mailto:${m.email}?subject=${encodeURIComponent("YORU support")}`} className="flex items-center gap-1 text-xs text-brand">
                <Mail size={13} /> {m.email}
              </a>
            )}
            <Button variant="outline" className="ml-auto py-1 text-xs" onClick={() => toggle(m)}>
              {m.status === "open" ? "Mark done" : "Reopen"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
