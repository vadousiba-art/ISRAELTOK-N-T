"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { Avatar } from "@/components/ui/Avatar";
import { ChaosLoader } from "@/components/ui/bits";
import type { AdminStats } from "@/lib/types";

const METRICS = [
  { id: "posts", label: "Posts" },
  { id: "comments", label: "Comments" },
  { id: "messages", label: "Messages" },
  { id: "joins", label: "New members" },
] as const;
type Metric = (typeof METRICS)[number]["id"];

const TILES: { key: keyof AdminStats["totals"]; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "active_24h", label: "Active today" },
  { key: "active_7d", label: "Active this week" },
  { key: "posts", label: "Posts" },
  { key: "messages", label: "Messages" },
  { key: "open_reports", label: "Open reports" },
];

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

export function AdminOverviewPanel({ onGoto }: { onGoto: (tab: "reports" | "members") => void }) {
  const { data } = useRpc<AdminStats>("admin_stats", {}, { refreshInterval: 60_000 });
  const [metric, setMetric] = useState<Metric>("posts");
  const [hover, setHover] = useState<number | null>(null);
  if (!data) return <ChaosLoader />;

  const series = data.daily.map((d) => d[metric]);
  const max = Math.max(1, ...series);
  const total = series.reduce((a, b) => a + b, 0);
  const shown = hover ?? series.length - 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TILES.map((t, i) => (
          <motion.button
            key={t.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.03 }}
            onClick={() => (t.key === "open_reports" ? onGoto("reports") : t.key === "members" ? onGoto("members") : undefined)}
            className={clsx("card p-3 text-left", t.key === "open_reports" && data.totals.open_reports > 0 && "border-brand/60")}
          >
            <div className="text-2xl font-semibold tabular-nums">{data.totals[t.key]}</div>
            <div className="text-xs text-muted">{t.label}</div>
          </motion.button>
        ))}
      </div>

      <section className="card p-4" aria-labelledby="activity-title">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="activity-title" className="mr-auto text-sm font-semibold">
            {METRICS.find((m) => m.id === metric)!.label} per day <span className="font-normal text-muted">· last 14 days · {total} total</span>
          </h2>
          <div className="flex gap-1 rounded-full border border-line p-0.5" role="radiogroup" aria-label="Metric">
            {METRICS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={metric === m.id}
                onClick={() => setMetric(m.id)}
                className={clsx("rounded-full px-2.5 py-1 text-xs", metric === m.id ? "bg-brand text-white" : "text-muted hover:text-ink")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-1 h-5 text-xs text-muted" aria-live="polite">
          <span className="font-semibold text-ink tabular-nums">{series[shown]}</span> on {day(data.daily[shown].day)}
        </div>
        <div className="relative flex h-40 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
          {series.map((v, i) => (
            <button
              key={data.daily[i].day}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${day(data.daily[i].day)}: ${v}`}
            >
              <motion.span
                className={clsx("w-full rounded-t-[4px]", hover === i ? "bg-brand-2" : "bg-brand")}
                initial={{ height: 0 }}
                animate={{ height: `${v === 0 ? 0 : Math.max((v / max) * 100, 3)}%` }}
                transition={{ duration: 0.35, delay: i * 0.015, ease: "easeOut" }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{day(data.daily[0].day)}</span>
          <span>{day(data.daily[data.daily.length - 1].day)}</span>
        </div>
        <table className="sr-only">
          <caption>{METRICS.find((m) => m.id === metric)!.label} per day</caption>
          <tbody>
            {data.daily.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{d[metric]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Top posters this week</h2>
          {data.top_posters.length === 0 && <p className="text-sm text-muted">It&apos;s quiet tonight.</p>}
          {data.top_posters.map((r) => (
            <Link key={r.profile.id} href={`/u/${r.profile.username}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-card-2">
              <Avatar src={r.profile.avatar_url} name={r.profile.display_name} size={28} />
              <span className="flex-1 truncate text-sm">{r.profile.display_name}</span>
              <span className="text-xs tabular-nums text-muted">{r.score} posts</span>
            </Link>
          ))}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Top tags this week</h2>
          {data.top_tags.length === 0 && <p className="text-sm text-muted">No tags yet.</p>}
          <div className="flex flex-wrap gap-1.5">
            {data.top_tags.map((t) => (
              <Link key={t.tag} href={`/explore?tag=${encodeURIComponent(t.tag)}`} className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-brand">
                #{t.tag} <span className="text-muted">{t.count}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
