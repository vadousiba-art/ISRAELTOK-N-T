"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRpc } from "@/lib/client/hooks";
import { Avatar } from "@/components/ui/Avatar";
import { ChaosLoader, Empty, TimeAgo } from "@/components/ui/bits";
import type { AuditEntry } from "@/lib/types";

const LABEL: Record<string, string> = {
  "member.role": "changed the role of",
  "member.ban": "banned",
  "member.unban": "unbanned",
  "member.verify": "verified",
  "member.unverify": "removed verification from",
  "member.mute": "muted",
  "member.unmute": "unmuted",
  "member.flair": "set flair for",
  "member.xp": "adjusted XP for",
  "invite.create": "created an invite",
  "invite.revoke": "revoked an invite",
  "post.feature": "featured a post by",
  "post.unfeature": "unfeatured a post by",
  "post.delete": "deleted a post by",
  "report.dismiss": "dismissed a report",
  "report.delete": "removed reported content",
  "report.ban": "removed content and banned the author",
  "site.announcement": "updated the announcement",
  "site.lockdown": "changed quiet mode",
  "site.slow_mode": "changed slow mode",
  "site.word_filter": "updated the word filter",
  "site.nightly_prompt": "changed tonight's prompt",
  "site.broadcast": "sent a broadcast",
  "site.recalculate_xp": "rebuilt everyone's XP",
  "site.open_signup": "changed who can join",
  "support.close": "closed a support message",
  "support.reopen": "reopened a support message",
};

function detail(e: AuditEntry) {
  const d = e.details as Record<string, unknown>;
  if (e.action === "member.role") return `${d.from} → ${d.to}`;
  if (e.action === "member.xp") return `${Number(d.amount) > 0 ? "+" : ""}${d.amount} XP`;
  if (e.action === "member.flair") return d.flair ? `“${d.flair}”` : "cleared";
  if (e.action === "member.mute" && d.until) return `until ${new Date(String(d.until)).toLocaleString()}`;
  if (e.action === "site.lockdown") return d.value ? "on" : "off";
  if (e.action === "site.open_signup") return d.value ? "anyone can sign up" : "invite-only";
  if (e.action === "site.slow_mode") return Number(d.value) ? `${d.value}s` : "off";
  if (e.action === "site.word_filter") return `${d.words} words`;
  if (e.action === "site.broadcast") return `“${d.body}” · ${d.recipients} recipients`;
  if (e.action === "site.recalculate_xp") return `${d.updated} updated`;
  if (e.action.startsWith("invite.")) return e.target_id ?? "";
  if (typeof d.body === "string" && d.body) return `“${d.body}”`;
  if (e.action === "site.announcement" || e.action === "site.nightly_prompt") {
    const v = d.value as { text?: string } | string | null;
    return v ? `“${typeof v === "string" ? v : v.text}”` : "cleared";
  }
  if (typeof d.reason === "string") return `${d.target_type}: “${d.reason}”`;
  return "";
}

export function AuditLog() {
  const { data } = useRpc<AuditEntry[]>("admin_audit", { p_limit: 100 }, { refreshInterval: 30_000 });
  if (!data) return <ChaosLoader />;
  if (data.length === 0) return <Empty text="No admin actions yet." />;
  return (
    <ol className="relative space-y-1 border-l border-line pl-4">
      {data.map((e, i) => (
        <motion.li
          key={e.id}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.2) }}
          className="relative py-1.5"
        >
          <span className="absolute -left-[21px] top-3 h-2 w-2 rounded-full bg-brand" aria-hidden />
          <div className="flex items-start gap-2 text-sm">
            <Avatar src={e.actor?.avatar_url} name={e.actor?.display_name ?? "?"} size={24} />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{e.actor?.display_name ?? "Someone"}</span> <span className="text-ink-2">{LABEL[e.action] ?? e.action}</span>{" "}
              {e.target && (
                <Link href={`/u/${e.target.username}`} className="font-semibold hover:underline">
                  {e.target.display_name}
                </Link>
              )}
              {e.action.startsWith("post.") && e.target_id && (
                <Link href={`/post/${e.target_id}`} className="ml-1 text-xs text-brand">
                  view
                </Link>
              )}
              {detail(e) && <div className="truncate text-xs text-muted">{detail(e)}</div>}
            </div>
            <TimeAgo iso={e.created_at} className="shrink-0 text-xs text-muted" />
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
