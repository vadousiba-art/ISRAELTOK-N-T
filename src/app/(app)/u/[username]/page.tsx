"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Ban, Bot, CalendarDays, Flag, MessageCircle, MoreHorizontal, Pencil, Settings } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { byFn, refreshFeeds, useRpc } from "@/lib/client/hooks";
import { ai, rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, VerifiedBadge } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { Feed } from "@/components/feed/Feed";
import { ReportDialog } from "@/components/feed/ReportDialog";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { BADGES } from "@/lib/jokes";
import type { Profile } from "@/lib/types";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { me } = useShell();
  const { toast, toastError } = useApp();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: p, error, mutate: mutateProfile } = useRpc<Profile>("get_profile", { p_username: username });
  const [tab, setTab] = useState<"user" | "media">("user");
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [roast, setRoast] = useState<string | null>(null);
  const [roasting, setRoasting] = useState(false);

  if (error) return <Empty emoji="👻" text={error.message} />;
  if (!p) return <ChaosLoader />;

  async function dm() {
    try {
      const id = await rpc<string>("start_dm", { p_user_id: p!.id });
      router.push(`/chat/${id}`);
    } catch (err) {
      toastError(err);
    }
  }

  async function block() {
    if (!p!.blocked && !confirm(`Block @${p!.username}? You won't see each other's posts, comments or messages.`)) return;
    try {
      const r = await rpc<{ blocked: boolean }>("toggle_block", { p_user_id: p!.id });
      toast(r.blocked ? "Blocked. Peace and quiet." : "Unblocked. Chaos resumes.", "success", r.blocked ? "🚫" : "🕊️");
      mutateProfile();
      refreshFeeds();
    } catch (err) {
      toastError(err);
    }
  }

  async function roastThem() {
    setRoasting(true);
    try {
      // Roast their latest post (the API enforces their opt-in + intensity cap).
      const posts = await rpc<{ id: string }[]>("get_feed", { p_mode: "user", p_arg: p!.username, p_limit: 1 });
      if (!posts.length) {
        toast("They haven't posted anything to roast. Suspicious.", "info", "🤔");
        return;
      }
      const r = await ai("roast_post", { post_id: posts[0].id });
      setRoast(r.text);
      mutate(byFn("get_comments"));
    } catch (err) {
      toastError(err);
    } finally {
      setRoasting(false);
    }
  }

  const stats = [
    { label: "Posts", value: p.stats.posts },
    { label: "Likes", value: p.stats.likes },
    { label: "Awards", value: p.stats.awards },
    { label: "Chaos", value: p.stats.chaos_points },
  ];

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="relative h-28 bg-gradient-to-br from-brand via-volt to-hot">
          <div className="absolute inset-0 opacity-30 [background:repeating-linear-gradient(45deg,transparent_0_12px,rgba(0,0,0,.25)_12px_24px)]" />
          <span className="sticker absolute right-3 top-3 rotate-6 rounded bg-lime px-2 py-0.5 text-sm text-black">
            {p.role === "owner" ? "FOUNDER" : p.role === "admin" ? "ADMIN" : p.is_bot ? "AI" : "MEMBER"}
          </span>
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-12 flex items-end justify-between">
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
              <Avatar src={p.avatar_url} name={p.display_name} size={96} ring="gradient" online={p.online} />
            </motion.div>
            <div className="flex gap-2 pb-1">
              {p.is_me ? (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil size={16} /> Edit
                  </Button>
                  <Link href="/settings" className="rounded-full border border-line p-2.5 hover:bg-card-2" aria-label="Settings">
                    <Settings size={18} />
                  </Link>
                </>
              ) : p.is_bot ? (
                <Link href="/menace">
                  <Button variant="chaos">
                    <Bot size={16} /> Talk to it
                  </Button>
                </Link>
              ) : (
                <>
                  {!p.blocked && (
                    <Button onClick={dm}>
                      <MessageCircle size={16} /> Message
                    </Button>
                  )}
                  <Menu
                    trigger={<MoreHorizontal size={20} />}
                    items={[
                      { label: roasting ? "Roasting..." : "Get the Menace to roast them", icon: <Bot size={16} />, onSelect: roastThem, hidden: !p.roast_opt_in || p.blocked },
                      { label: "Report", icon: <Flag size={16} />, onSelect: () => setReporting(true) },
                      { label: p.blocked ? "Unblock" : "Block", icon: <Ban size={16} />, onSelect: block, danger: !p.blocked },
                    ]}
                  />
                </>
              )}
            </div>
          </div>
          <div className="mt-2">
            <h1 className="flex items-center gap-1.5 text-2xl font-black">
              {p.display_name} {p.badge && !p.is_bot && <span>{p.badge}</span>}
              {p.verified && <VerifiedBadge size={20} />}
            </h1>
            <div className="text-muted">@{p.username}</div>
            {p.status && <div className="mt-1 text-sm font-semibold text-online">● {p.status}</div>}
            {p.bio && <p className="mt-2 whitespace-pre-wrap text-[15px]">{p.bio}</p>}
            <div className="mt-2 flex items-center gap-1 text-xs text-muted">
              <CalendarDays size={14} /> Joined {new Date(p.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              {p.roast_opt_in && <span className="ml-2 rounded-full bg-roast/15 px-2 py-0.5 font-bold text-roast">🔥 roastable</span>}
              {p.banned && <span className="ml-2 rounded-full bg-hot px-2 py-0.5 font-bold text-white">BANNED</span>}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="rounded-2xl bg-card-2 py-2 text-center"
              >
                <div className="text-lg font-black">{s.value}</div>
                <div className="text-[11px] font-bold uppercase text-muted">{s.label}</div>
              </motion.div>
            ))}
          </div>
          {p.badges.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-muted">Achievements</div>
              <div className="flex flex-wrap gap-1.5">
                {p.badges.map((b, i) => (
                  <motion.span
                    key={b}
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.04 * i, type: "spring", stiffness: 500, damping: 15 }}
                    title={BADGES[b]?.blurb}
                    className="rounded-full border border-line bg-card-2 px-2.5 py-1 text-xs font-bold"
                  >
                    {BADGES[b]?.emoji} {BADGES[b]?.label ?? b}
                  </motion.span>
                ))}
              </div>
            </div>
          )}
          {p.inside_jokes.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-black uppercase tracking-widest text-muted">Inside jokes</div>
              <div className="flex flex-wrap gap-1.5">
                {p.inside_jokes.map((j) => (
                  <span key={j} className="rounded-full bg-volt/15 px-2.5 py-1 text-xs font-bold text-ink">
                    🤫 {j}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {p.blocked ? (
        <Empty emoji="🚫" text="You blocked this person. Their posts are hidden." />
      ) : (
        <>
          <div className="flex gap-1 rounded-full border border-line bg-card p-1" role="tablist">
            {(
              [
                ["user", "Posts"],
                ["media", "Media"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={clsx("flex-1 rounded-full py-2 text-sm font-bold", tab === id ? "bg-brand text-white" : "text-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          <Feed key={tab} mode={tab} arg={p.username} emptyText={p.is_me ? "You haven't posted yet. The timeline awaits your nonsense." : "Nothing here yet."} />
        </>
      )}
      {p.is_me && <EditProfileDialog me={me} open={editing} onClose={() => setEditing(false)} />}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={p.id} />
      <Modal open={roast !== null} onClose={() => setRoast(null)} title="🔥 The Menace has spoken">
        <p className="text-lg font-semibold">{roast}</p>
        <p className="mt-3 text-xs text-muted">Posted as a comment on their latest post.</p>
      </Modal>
    </div>
  );
}
