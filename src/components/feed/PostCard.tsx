"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  Bookmark,
  Bot,
  Flag,
  Heart,
  Pin,
  Sparkles,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Quote,
  Repeat2,
  SquareArrowOutUpRight,
  SmilePlus,
  Trash2,
  Trophy,
} from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { Avatar } from "@/components/ui/Avatar";
import { NameLink, TimeAgo, VerifiedBadge } from "@/components/ui/bits";
import { RichText } from "@/components/ui/RichText";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { burst } from "@/components/ui/EmojiBurst";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { ai, mediaSrc, rpc } from "@/lib/client/api";
import { byFn, refreshFeeds, useProgress, useRpc } from "@/lib/client/hooks";
import { LevelChip } from "@/components/yoru/Progression";
import { pickLine, REACTION_EMOJI, REACTIONS, SUCCESS_TOASTS, AWARD_INFO } from "@/lib/jokes";
import type { Post, PostCore, ReactionKind } from "@/lib/types";
import { PollView } from "./PollView";
import { ReportDialog } from "./ReportDialog";
import { AwardDialog } from "./AwardDialog";
import { QuoteDialog } from "./QuoteDialog";
import { playSound } from "@/lib/client/sounds";

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

export function PostMedia({ post, className }: { post: PostCore; className?: string }) {
  if (!post.media_url) return null;
  const src = mediaSrc(post.media_url);
  return (
    <div className={clsx("overflow-hidden rounded-xl border border-line bg-black", className)}>
      {post.media_type === "video" ? (
        <video src={src} controls playsInline preload="metadata" className="max-h-[560px] w-full" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={post.body ? post.body.slice(0, 120) : "Post media"} className="max-h-[620px] w-full object-cover" loading="lazy" />
      )}
    </div>
  );
}

export function RoastBox({ label, roast }: { label: string | null; roast: string }) {
  return (
    <div className="roast-box flex items-center gap-3.5 p-3">
      <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl border-2 border-roast/80 text-roast">
        <Bot size={28} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-extrabold uppercase tracking-wide text-roast-label">{label || "ROAST"}</div>
        <p className="mt-0.5 text-[15px] leading-snug text-ink">{roast}</p>
      </div>
    </div>
  );
}

function LinkCard({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-3 rounded-xl border border-line bg-card-2 p-3 transition hover:border-brand"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-brand">
        <Link2 size={20} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{host}</span>
        <span className="block truncate text-xs text-muted">{url}</span>
      </span>
    </a>
  );
}

function EmbeddedPost({ post }: { post: PostCore }) {
  return (
    <Link href={`/post/${post.id}`} className="block rounded-xl border border-line p-3 transition hover:bg-card-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 text-sm">
        <Avatar src={post.author.avatar_url} name={post.author.display_name} size={22} />
        <span className="font-bold">{post.author.display_name}</span>
        <span className="text-muted">@{post.author.username}</span>
      </div>
      {post.body && <RichText text={post.body} className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-[15px]" />}
      {post.roast && <p className="mt-1 text-sm italic text-roast-label">“{post.roast}”</p>}
      {post.media_url && <PostMedia post={post} className="mt-2" />}
    </Link>
  );
}

type Props = {
  post: Post;
  detail?: boolean;
  onDeleted?: (id: string) => void;
};

export function PostCard({ post: initial, detail, onDeleted }: Props) {
  const { toast, toastError } = useApp();
  const { me } = useShell();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [post, setPost] = useState(initial);
  const [picker, setPicker] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [awardOpen, setAwardOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [roasting, setRoasting] = useState(false);
  const heartRef = useRef<HTMLButtonElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bigHeart, setBigHeart] = useState(0);
  const { data: progress, mutate: mutateProgress } = useProgress();
  const isStaff = me.role === "owner" || me.role === "admin";
  const { data: featured, mutate: mutateFeatured } = useRpc<{ id: string }[]>(isStaff ? "get_featured" : null);

  // Reset local optimistic state when the server copy changes.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setPost(initial);
  }

  // Plain reposts render the original with a "reposted" header.
  const isRepost = post.kind === "repost" && post.repost_of;
  const shown: PostCore = isRepost ? post.repost_of! : post;
  const liked = shown.my_reactions.includes("heart");
  const mine = post.author.id === me.id;
  const canModerate = isStaff;

  const patchShown = (fn: (p: PostCore) => PostCore) =>
    setPost((p) => (isRepost ? { ...p, repost_of: fn(p.repost_of!) } : (fn(p) as Post)));

  async function react(kind: ReactionKind) {
    const had = shown.my_reactions.includes(kind);
    if (!had) {
      burst(REACTION_EMOJI[kind], heartRef.current);
      playSound(kind === "heart" ? "pop" : "boop");
    }
    patchShown((p) => ({
      ...p,
      my_reactions: had ? p.my_reactions.filter((k) => k !== kind) : [...p.my_reactions, kind],
      reactions: { ...p.reactions, [kind]: Math.max(0, (p.reactions[kind] ?? 0) + (had ? -1 : 1)) },
      counts: kind === "heart" ? { ...p.counts, likes: Math.max(0, p.counts.likes + (had ? -1 : 1)) } : p.counts,
    }));
    try {
      await rpc("toggle_reaction", { p_post_id: shown.id, p_kind: kind });
    } catch (err) {
      setPost(initial);
      toastError(err);
    }
  }

  async function repost() {
    const was = shown.reposted;
    patchShown((p) => ({ ...p, reposted: !was, counts: { ...p.counts, reposts: p.counts.reposts + (was ? -1 : 1) } }));
    try {
      await rpc("toggle_repost", { p_post_id: shown.id });
      toast(pickLine(was ? SUCCESS_TOASTS.unrepost : SUCCESS_TOASTS.repost), "success", "🔁");
      refreshFeeds();
    } catch (err) {
      setPost(initial);
      toastError(err);
    }
  }

  async function bookmark() {
    const was = shown.bookmarked;
    patchShown((p) => ({ ...p, bookmarked: !was }));
    try {
      await rpc("toggle_bookmark", { p_post_id: shown.id });
      toast(pickLine(was ? SUCCESS_TOASTS.unbookmark : SUCCESS_TOASTS.bookmark), "success", "🔖");
    } catch (err) {
      setPost(initial);
      toastError(err);
    }
  }

  async function share() {
    const url = `${location.origin}/post/${shown.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "YORU", text: shown.body.slice(0, 100), url });
        return;
      }
    } catch {
      return; // user cancelled the share sheet
    }
    await navigator.clipboard?.writeText(url).catch(() => null);
    toast(pickLine(SUCCESS_TOASTS.copy), "success", "🔗");
  }

  async function summonMenace() {
    setRoasting(true);
    toast("Summoning the Menace... 🤖", "chaos");
    try {
      await ai("roast_post", { post_id: shown.id });
      toast("The Menace has spoken. Check the comments.", "chaos", "🔥");
      mutate(byFn("get_comments"));
      patchShown((p) => ({ ...p, counts: { ...p.counts, comments: p.counts.comments + 1 } }));
      if (!detail) router.push(`/post/${shown.id}`);
    } catch (err) {
      toastError(err);
    } finally {
      setRoasting(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this post? It will be gone forever (like your dignity).")) return;
    try {
      await rpc("delete_post", { p_id: post.id });
      toast("Post deleted. The evidence is gone.", "success", "🗑️");
      onDeleted?.(post.id);
      refreshFeeds();
    } catch (err) {
      toastError(err);
    }
  }

  async function block() {
    if (!confirm(`Block @${shown.author.username}? You won't see each other's stuff.`)) return;
    try {
      await rpc("toggle_block", { p_user_id: shown.author.id });
      toast(`Blocked @${shown.author.username}. Peace restored.`, "success", "🚫");
      refreshFeeds();
    } catch (err) {
      toastError(err);
    }
  }

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setPicker(true);
    }, 420);
  };
  const endPress = () => pressTimer.current && clearTimeout(pressTimer.current);

  const open = () => {
    if (!detail) router.push(`/post/${shown.id}`);
  };

  // Double-tap media to like (single tap still opens the post).
  const onMediaTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      setBigHeart((n) => n + 1);
      if (!liked) react("heart");
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      open();
    }, 260);
  };

  const pinned = progress?.pinned_post_id === shown.id;
  async function togglePin() {
    try {
      await rpc("pin_post", { p_post_id: pinned ? null : shown.id });
      toast(pinned ? "Unpinned from your profile." : "Pinned to your profile.", "success", "📌");
      mutateProgress();
      mutate(byFn("get_profile_extras"));
    } catch (err) {
      toastError(err);
    }
  }

  const isFeatured = !!featured?.some((f) => f.id === shown.id);
  async function toggleFeature() {
    try {
      await rpc("admin_feature_post", { p_post_id: shown.id, p_featured: !isFeatured });
      toast(isFeatured ? "Removed from tonight's picks." : "Added to tonight's picks.", "success", "✨");
      mutateFeatured();
      mutate(byFn("get_featured"));
    } catch (err) {
      toastError(err);
    }
  }

  const menuItems: MenuItem[] = [
                {
                  label: shown.reposted ? "Undo repost" : "Repost",
                  icon: <Repeat2 size={16} />,
                  onSelect: repost,
                },
                {
                  label: "Copy link",
                  icon: <Link2 size={16} />,
                  onSelect: async () => {
                    await navigator.clipboard?.writeText(`${location.origin}/post/${shown.id}`).catch(() => null);
                    toast(pickLine(SUCCESS_TOASTS.copy), "success", "🔗");
                  },
                },
                { label: roasting ? "Menace is cooking..." : "Summon Menace roast", icon: <Bot size={16} />, onSelect: summonMenace },
                { label: "React...", icon: <SmilePlus size={16} />, onSelect: () => setPicker(true) },
                { label: "Give an award", icon: <Trophy size={16} />, onSelect: () => setAwardOpen(true), hidden: shown.author.id === me.id },
                { label: "Quote post", icon: <Quote size={16} />, onSelect: () => setQuoteOpen(true) },
                {
                  label: pinned ? "Unpin from profile" : "Pin to profile",
                  icon: <Pin size={16} />,
                  onSelect: togglePin,
                  hidden: shown.author.id !== me.id || post.kind === "repost",
                },
                {
                  label: isFeatured ? "Remove from tonight's picks" : "Feature in tonight's picks",
                  icon: <Sparkles size={16} />,
                  onSelect: toggleFeature,
                  hidden: !isStaff,
                },
                { label: "Report", icon: <Flag size={16} />, onSelect: () => setReportOpen(true), hidden: mine },
                {
                  label: `Block @${shown.author.username}`,
                  icon: <Ban size={16} />,
                  onSelect: block,
                  hidden: shown.author.id === me.id || shown.author.is_bot,
                  danger: true,
                },
                {
                  label: isRepost ? "Undo repost" : "Delete post",
                  icon: <Trash2 size={16} />,
                  onSelect: isRepost && mine ? repost : remove,
                  hidden: !(mine || canModerate),
                  danger: true,
                },
              ];

  const otherReactions = Object.entries(shown.reactions)
    .filter(([k, n]) => k !== "heart" && (n ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const awards = Object.entries(shown.awards).filter(([, n]) => (n ?? 0) > 0);

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={clsx("card relative px-4 pb-2 pt-4", !detail && "cursor-pointer")}
      onClick={open}
    >
      {isRepost && (
        <div className="-mt-1 mb-2 flex items-center gap-2 pl-1 text-[13px] font-semibold text-muted">
          <Repeat2 size={15} />
          <NameLink username={post.author.username}>{post.author.id === me.id ? "You" : post.author.display_name}</NameLink>
          reposted
        </div>
      )}
      <div className="flex gap-3">
        <Link href={`/u/${shown.author.username}`} onClick={(e) => e.stopPropagation()} aria-label={shown.author.display_name}>
          <Avatar src={shown.author.avatar_url} name={shown.author.display_name} size={detail ? 52 : 50} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-x-1.5 whitespace-nowrap text-[14px]">
              <NameLink username={shown.author.username} className="shrink-0 text-[16px] font-semibold text-ink">
                {shown.author.display_name}
              </NameLink>
              {shown.author.badge && <span className="text-[15px] leading-none">{shown.author.badge !== "🤖" && shown.author.badge}</span>}
              {shown.author.verified && <VerifiedBadge size={17} />}
              {!shown.author.is_bot && <LevelChip level={shown.author.level} />}
              {shown.author.flair && <span className="hidden shrink-0 text-xs text-brand-2 sm:inline">{shown.author.flair}</span>}
              <span className="min-w-0 truncate text-muted">@{shown.author.username}</span>
              <span className="text-muted">·</span>
              <TimeAgo iso={shown.created_at} className="shrink-0 text-muted" />
              {shown.kind === "news" && (
                <span className="sticker ml-1 rounded bg-brand px-1.5 py-0.5 text-white">Breaking</span>
              )}
            </div>
            <Menu trigger={<MoreHorizontal size={20} />} items={menuItems} />
          </div>
          {shown.body && (
            <RichText
              text={shown.body}
              className={clsx("mt-0.5 whitespace-pre-wrap break-words leading-[1.45] text-ink", detail ? "text-[16.5px]" : "text-[15.5px]")}
            />
          )}
        </div>
      </div>

      {post.kind !== "repost" && post.repost_of && (
        <div className="mt-3">
          <EmbeddedPost post={post.repost_of} />
        </div>
      )}
      {shown.media_url && (
        <div className="relative" onClick={shown.media_type === "video" ? undefined : onMediaTap}>
          <PostMedia post={shown} className="mt-3" />
          <AnimatePresence>
            {bigHeart > 0 && (
              <motion.span
                key={bigHeart}
                className="pointer-events-none absolute inset-0 mt-3 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.15, 1, 1.1] }}
                transition={{ duration: 0.8, times: [0, 0.25, 0.7, 1] }}
                onAnimationComplete={() => setBigHeart(0)}
                aria-hidden
              >
                <Heart size={96} className="fill-brand text-brand drop-shadow-[0_0_24px_var(--brand)]" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
      {shown.roast && (
        <div className="mt-3">
          <RoastBox label={shown.roast_label} roast={shown.roast} />
        </div>
      )}
      {shown.poll && (
        <div className="mt-3">
          <PollView post={shown} onVoted={(p) => patchShown(() => p)} />
        </div>
      )}
      {shown.link_url && (
        <div className="mt-3">
          <LinkCard url={shown.link_url} />
        </div>
      )}

      {detail && (otherReactions.length > 0 || awards.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {otherReactions.map(([k, n]) => (
            <button
              key={k}
              onClick={(e) => {
                e.stopPropagation();
                react(k as ReactionKind);
              }}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-sm font-bold transition",
                shown.my_reactions.includes(k as ReactionKind) ? "border-brand bg-brand/15" : "border-line bg-card-2",
              )}
            >
              {REACTION_EMOJI[k as ReactionKind]} {n}
            </button>
          ))}
          {awards.map(([k, n]) => (
            <span key={k} className="rounded-full border border-line bg-card-2 px-2.5 py-1 text-sm font-bold" title={AWARD_INFO[k as keyof typeof AWARD_INFO]?.label}>
              {AWARD_INFO[k as keyof typeof AWARD_INFO]?.emoji} {n}
            </span>
          ))}
        </div>
      )}
      <div className="relative mt-1.5 flex items-center gap-4 pl-1 text-ink-2 sm:gap-6" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <motion.button
            ref={heartRef}
            whileTap={{ scale: 0.88 }}
            transition={{ duration: 0.12 }}
            onClick={() => {
              if (longPressed.current) return;
              react("heart");
            }}
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            onContextMenu={(e) => {
              e.preventDefault();
              setPicker(true);
            }}
            className="flex items-center gap-2 rounded-full py-2 pr-1 text-[15px]"
            aria-label={liked ? "Unlike" : "Like (hold for reactions)"}
            aria-pressed={liked}
          >
            <motion.span key={String(liked)} initial={liked ? { scale: 0.6 } : false} animate={{ scale: 1 }} transition={{ duration: 0.18 }}>
              <Heart size={22} strokeWidth={1.9} className={liked ? "fill-heart text-heart" : "text-ink-2"} />
            </motion.span>
            <span className="text-ink-2">{compact(shown.counts.likes)}</span>
          </motion.button>
          <AnimatePresence>
            {picker && (
              <ReactionPicker
                mine={shown.my_reactions}
                onPick={(k) => {
                  setPicker(false);
                  react(k);
                }}
                onClose={() => setPicker(false)}
              />
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={open}
          className="flex items-center gap-2 rounded-full py-2 pr-1 text-[15px] transition-colors duration-150 hover:text-ink"
          aria-label={`${shown.counts.comments} comments`}
        >
          <MessageCircle size={21} strokeWidth={1.8} className="-scale-x-100" />
          {compact(shown.counts.comments)}
        </button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          transition={{ duration: 0.12 }}
          onClick={share}
          className={clsx("rounded-full p-2 transition-colors duration-150 hover:text-ink", shown.reposted ? "text-brand" : "text-ink-2")}
          aria-label="Share"
        >
          <SquareArrowOutUpRight size={21} strokeWidth={1.8} />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          transition={{ duration: 0.12 }}
          onClick={bookmark}
          className={clsx("rounded-full p-2 transition-colors duration-150", shown.bookmarked ? "text-brand" : "text-ink-2 hover:text-ink")}
          aria-label={shown.bookmarked ? "Remove bookmark" : "Bookmark"}
          aria-pressed={shown.bookmarked}
        >
          <Bookmark size={21} strokeWidth={1.8} className={shown.bookmarked ? "fill-brand" : undefined} />
        </motion.button>
        <span className="flex-1" />
        <Menu trigger={<MoreHorizontal size={20} />} items={menuItems} label="More actions" />
      </div>

      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="post" targetId={post.id} />
      <AwardDialog
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        post={shown}
        onGiven={(kind) => patchShown((p) => ({ ...p, awards: { ...p.awards, [kind]: (p.awards[kind] ?? 0) + 1 }, my_awards: [...p.my_awards, kind] }))}
      />
      <QuoteDialog open={quoteOpen} onClose={() => setQuoteOpen(false)} post={shown} />
    </motion.article>
  );
}

function ReactionPicker({ mine, onPick, onClose }: { mine: ReactionKind[]; onPick: (k: ReactionKind) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10, scale: 0.6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.7 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute bottom-12 left-0 z-30 flex origin-bottom-left gap-0.5 rounded-full border border-line bg-card p-1.5 shadow-2xl"
      role="menu"
      aria-label="Reactions"
    >
      {REACTIONS.map((r, i) => (
        <motion.button
          key={r.kind}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: i * 0.025, duration: 0.2, ease: "easeOut" }}
          whileHover={{ scale: 1.45, y: -6 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onPick(r.kind)}
          className={clsx("rounded-full p-1 text-[24px] leading-none", mine.includes(r.kind) && "bg-brand/25")}
          aria-label={r.label}
          title={r.label}
        >
          {r.emoji}
        </motion.button>
      ))}
    </motion.div>
  );
}
