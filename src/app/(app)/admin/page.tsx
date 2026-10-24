"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Ban, Check, Copy, Shield, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, PageTitle, TimeAgo } from "@/components/ui/bits";
import type { AdminOverview } from "@/lib/types";

export default function AdminPage() {
  const { me } = useShell();
  const { toast, toastError } = useApp();
  const { data, error, mutate } = useRpc<AdminOverview>(me.role === "member" ? null : "admin_overview");
  const [tab, setTab] = useState<"invites" | "members" | "reports">("invites");
  const [maxUses, setMaxUses] = useState(5);
  const [hours, setHours] = useState(168);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (me.role === "member") return <Empty emoji="🛂" text="Admins only. Nice try, intern." />;
  if (error) return <Empty emoji="🛂" text={error.message} />;
  if (!data) return <ChaosLoader />;

  const link = (code: string) => `${location.origin}/join/${code}`;
  const act = async (fn: string, args: Record<string, unknown>, msg: string, emoji = "✅") => {
    try {
      await rpc(fn, args);
      toast(msg, "success", emoji);
      mutate();
    } catch (err) {
      toastError(err);
    }
  };

  async function createInvite() {
    setBusy(true);
    try {
      const r = await rpc<{ code: string }>("admin_create_invite", { p_max_uses: maxUses, p_expires_hours: hours, p_note: note });
      await navigator.clipboard?.writeText(link(r.code)).catch(() => null);
      toast("Invite created & copied. Choose your recruits wisely.", "chaos", "🎟️");
      setNote("");
      mutate();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  const openReports = data.reports.filter((r) => r.status === "open").length;
  const inviteState = (i: AdminOverview["invites"][number]) =>
    i.revoked ? "revoked" : i.uses >= i.max_uses ? "used up" : i.expires_at && new Date(i.expires_at) < new Date() ? "expired" : "active";

  return (
    <div className="space-y-4">
      <PageTitle emoji="🛡️" sub="Invite links, members and moderation. With great power comes great pettiness.">
        Admin
      </PageTitle>
      <div className="flex gap-1 rounded-full border border-line bg-card p-1" role="tablist">
        {(
          [
            ["invites", `🎟️ Invites`],
            ["members", `👥 Members (${data.members.length})`],
            ["reports", `🚩 Reports${openReports ? ` (${openReports})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx("flex-1 rounded-full py-2 text-xs font-bold sm:text-sm", tab === id ? "bg-brand text-white" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "invites" && (
        <>
          <div className="card space-y-3 p-4">
            <div className="font-bold">Create invite link</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-muted">
                Max uses
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="text-xs font-bold text-muted">
                Expires
                <select
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value={24}>24 hours</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                  <option value={0}>Never</option>
                </select>
              </label>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 80))}
              placeholder="Note (e.g. 'for Ethan's cousin, God help us')"
              className="w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <Button variant="chaos" onClick={createInvite} disabled={busy} className="w-full">
              {busy ? "Forging..." : "Create & copy link"}
            </Button>
          </div>
          {data.invites.length === 0 && <Empty emoji="🎟️" text="No invites yet. It's a very exclusive club of you." />}
          <div className="space-y-2">
            {data.invites.map((i) => {
              const state = inviteState(i);
              return (
                <div key={i.code} className={clsx("card p-3", state !== "active" && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <code className="rounded-lg bg-card-2 px-2 py-1 font-mono text-sm">{i.code}</code>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase",
                        state === "active" ? "bg-online/15 text-online" : "bg-hot/15 text-hot",
                      )}
                    >
                      {state}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {i.uses}/{i.max_uses} used
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {i.note && <>“{i.note}” · </>}by {i.created_by ?? "?"} · <TimeAgo iso={i.created_at} />
                    {i.expires_at && <> · expires {new Date(i.expires_at).toLocaleDateString()}</>}
                  </div>
                  {state === "active" && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        className="py-1.5 text-xs"
                        onClick={async () => {
                          await navigator.clipboard?.writeText(link(i.code)).catch(() => null);
                          toast("Invite link copied.", "success", "🔗");
                        }}
                      >
                        <Copy size={14} /> Copy link
                      </Button>
                      <Button variant="ghost" className="py-1.5 text-xs text-hot" onClick={() => act("admin_revoke_invite", { p_code: i.code }, "Invite revoked.", "🚫")}>
                        <X size={14} /> Revoke
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "members" && (
        <div className="space-y-2">
          {data.members.map((m) => (
            <motion.div key={m.id} layout className={clsx("card flex flex-wrap items-center gap-3 p-3", m.banned && "border-hot/50")}>
              <Link href={`/u/${m.username}`}>
                <Avatar src={m.avatar_url} name={m.display_name} size={42} online={m.online} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">
                  {m.display_name} {m.verified && "✅"} {m.banned && <span className="text-xs text-hot">BANNED</span>}
                </div>
                <div className="truncate text-xs text-muted">
                  @{m.username} · {m.role} · {m.posts} posts · seen {m.last_seen_at ? <TimeAgo iso={m.last_seen_at} /> : "never"}
                </div>
              </div>
              {m.role !== "owner" && m.id !== me.id && (
                <div className="flex flex-wrap gap-1.5">
                  {data.my_role === "owner" && (
                    <Button
                      variant="outline"
                      className="py-1.5 text-xs"
                      onClick={() =>
                        act("admin_set_role", { p_user_id: m.id, p_role: m.role === "admin" ? "member" : "admin" }, m.role === "admin" ? "Demoted. Humbled." : "Promoted to admin. Power corrupts.", "👑")
                      }
                    >
                      <Shield size={14} /> {m.role === "admin" ? "Demote" : "Make admin"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="py-1.5 text-xs"
                    onClick={() => act("admin_set_verified", { p_user_id: m.id, p_verified: !m.verified }, m.verified ? "Verification revoked." : "Verified. Officially real.", "✅")}
                  >
                    <Check size={14} /> {m.verified ? "Unverify" : "Verify"}
                  </Button>
                  <Button
                    variant={m.banned ? "outline" : "danger"}
                    className="py-1.5 text-xs"
                    onClick={() => {
                      if (!m.banned && !confirm(`Ban @${m.username}? They lose all access immediately.`)) return;
                      act("admin_set_banned", { p_user_id: m.id, p_banned: !m.banned }, m.banned ? "Unbanned. Second chances." : "Member banned.", "🔨");
                    }}
                  >
                    <Ban size={14} /> {m.banned ? "Unban" : "Ban"}
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-2">
          {data.reports.length === 0 && <Empty emoji="😇" text="No reports. Suspiciously wholesome." />}
          {data.reports.map((r) => (
            <div key={r.id} className={clsx("card p-3", r.status !== "open" && "opacity-60")}>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-hot/15 px-2 py-0.5 font-bold uppercase text-hot">{r.target_type}</span>
                <span className="text-muted">
                  reported by <b className="text-ink">{r.reporter.display_name}</b> · <TimeAgo iso={r.created_at} />
                </span>
                <span className="ml-auto font-bold uppercase text-muted">{r.status}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold">“{r.reason}”</p>
              {r.target ? (
                <div className="mt-2 rounded-xl border border-line bg-card-2 p-2 text-sm">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <Avatar src={r.target.author.avatar_url} name={r.target.author.display_name} size={20} />
                    <b>{r.target.author.display_name}</b>
                    {r.target.deleted && <span className="text-hot">(already removed)</span>}
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap">{r.target.body || (r.target.media_url ? "[media]" : "[empty]")}</p>
                  {r.target_type === "post" && (
                    <Link href={`/post/${r.target_id}`} className="mt-1 inline-block text-xs font-bold text-brand">
                      Open post
                    </Link>
                  )}
                  {r.target_type === "comment" && r.target.post_id && (
                    <Link href={`/post/${r.target.post_id}`} className="mt-1 inline-block text-xs font-bold text-brand">
                      Open thread
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">Target no longer exists.</p>
              )}
              {r.status === "open" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" className="py-1.5 text-xs" onClick={() => act("admin_resolve_report", { p_report_id: r.id, p_action: "dismiss" }, "Dismissed.", "🙄")}>
                    Dismiss
                  </Button>
                  {r.target_type !== "user" && (
                    <Button variant="outline" className="py-1.5 text-xs text-hot" onClick={() => act("admin_resolve_report", { p_report_id: r.id, p_action: "delete" }, "Content deleted.", "🗑️")}>
                      <Trash2 size={14} /> Delete content
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    className="py-1.5 text-xs"
                    onClick={() => confirm("Delete the content and ban the author?") && act("admin_resolve_report", { p_report_id: r.id, p_action: "ban" }, "Removed and banned.", "🔨")}
                  >
                    <Ban size={14} /> {r.target_type === "user" ? "Ban user" : "Delete + ban"}
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">Action: {r.action}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
