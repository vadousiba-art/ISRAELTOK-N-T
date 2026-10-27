"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Hash, Search, X } from "lucide-react";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { Feed } from "@/components/feed/Feed";
import { Avatar } from "@/components/ui/Avatar";
import { ChaosLoader, Empty } from "@/components/ui/bits";
import { CATEGORIES, EMPTY_LINES } from "@/lib/jokes";
import type { ProfileLite } from "@/lib/types";
import { useOpenGates } from "@/lib/client/gates";
import { useT } from "@/components/providers/I18nProvider";
import { Discover } from "@/components/yoru/Discover";
import { INTERESTS, type Interest } from "@/lib/opengates";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ExploreInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tag = params.get("tag");
  const [q, setQ] = useState(params.get("q") ?? "");
  const interestParam = params.get("interest");
  const initialInterest = (INTERESTS as readonly string[]).includes(interestParam ?? "") ? (interestParam as Interest) : null;
  const { available } = useOpenGates();
  const t = useT();
  const [tab, setTab] = useState<"trending" | "latest" | "squad" | "discover">(initialInterest ? "discover" : "trending");
  const dq = useDebounced(q.trim(), 300);
  const { data: tags } = useRpc<{ tag: string; count: number }[]>("get_trending_tags", { p_limit: 15 });
  const { data: people } = useRpc<ProfileLite[]>(dq.length >= 1 ? "search_profiles" : null, { p_q: dq });
  const { data: members } = useRpc<ProfileLite[]>(tab === "squad" ? "get_members" : null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Find your people.</h1>
        <p className="mt-1 text-sm text-muted">Your next conversation starts here.</p>
      </div>

      <div className="relative">
        <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 40))}
          placeholder="Search people, posts, #tags"
          className="w-full rounded-full border border-line bg-card py-3 pe-10 ps-12 outline-none focus:border-brand"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim().startsWith("#")) router.push(`/explore?tag=${encodeURIComponent(q.trim().slice(1).toLowerCase())}`);
          }}
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted" aria-label="Clear search">
            <X size={18} />
          </button>
        )}
      </div>

      {dq ? (
        <div className="space-y-4">
          {(people ?? []).length > 0 && (
            <div className="card p-3">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-muted">People</div>
              {people!.map((p) => (
                <Link key={p.id} href={`/u/${p.username}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-card-2">
                  <Avatar src={p.avatar_url} name={p.display_name} size={40} online={p.online} />
                  <div>
                    <div className="font-bold">
                      {p.display_name} {p.badge}
                    </div>
                    <div className="text-sm text-muted">@{p.username}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {dq.length >= 2 ? <Feed mode="search" arg={dq.replace(/^#/, "")} emptyText={EMPTY_LINES.search} /> : null}
        </div>
      ) : tag ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-1 text-2xl font-semibold">
              <Hash className="text-brand" /> {tag}
            </h1>
            <Link href="/explore" className="text-sm font-bold text-brand">
              Clear
            </Link>
          </div>
          <Feed mode="tag" arg={tag} emptyText={`Nothing in #${tag} yet. Drop a post.`} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map((c) => (
              <Link
                key={c.tag}
                href={`/explore?tag=${c.tag}`}
                className="card flex flex-col items-center gap-0.5 px-1 py-3 text-center transition-colors duration-150 hover:border-brand"
              >
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="text-[11px] text-muted">{c.jp}</span>
              </Link>
            ))}
          </div>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(tags ?? []).map((t, i) => (
              <motion.div key={t.tag} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.2) }}>
                <Link
                  href={`/explore?tag=${encodeURIComponent(t.tag)}`}
                  className="block whitespace-nowrap rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:border-brand hover:text-brand"
                >
                  #{t.tag} <span className="text-xs text-muted">{t.count}</span>
                </Link>
              </motion.div>
            ))}
          </div>
          <div className="flex gap-1 rounded-full border border-line bg-card p-1" role="tablist">
            {(
              [
                ["trending", "Trending"],
                ["latest", "Latest"],
                ["squad", "People"],
                ...(available ? ([["discover", t("disc.tab")]] as const) : []),
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={clsx("flex-1 rounded-full py-2 text-sm font-semibold transition-colors duration-150", tab === id ? "bg-brand text-white" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "trending" && <Feed mode="trending" />}
          {tab === "latest" && <Feed mode="latest" live />}
          {tab === "discover" && available && <Discover initialInterest={initialInterest} />}
          {tab === "squad" &&
            (!members ? (
              <ChaosLoader />
            ) : members.length === 0 ? (
              <Empty text="It's quiet tonight." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {members.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.2) }}>
                    <Link href={`/u/${m.username}`} className="card flex flex-col items-center gap-1.5 p-3 text-center transition hover:border-brand">
                      <Avatar src={m.avatar_url} name={m.display_name} size={56} online={m.online}  />
                      <div className="w-full truncate text-sm font-bold">
                        {m.display_name} {m.badge}
                      </div>
                      <div className="w-full truncate text-xs text-muted">{m.status || `@${m.username}`}</div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<ChaosLoader />}>
      <ExploreInner />
    </Suspense>
  );
}
