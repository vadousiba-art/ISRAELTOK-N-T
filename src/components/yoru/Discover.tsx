"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { useIdentity } from "@/lib/client/gates";
import { useT } from "@/components/providers/I18nProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ChaosLoader, Empty } from "@/components/ui/bits";
import { LOCALES } from "@/lib/i18n/locales";
import { INTERESTS, INTEREST_EMOJI, type CreatorCategory, type Interest } from "@/lib/opengates";
import type { ProfileLite } from "@/lib/types";

type Person = ProfileLite & {
  interests: Interest[];
  locale: string | null;
  bio: string;
  shared: Interest[];
  same_language: boolean;
  creator: CreatorCategory | null;
};

// Global Community Bridge: people beyond your circle who share your interests
// or language. Each card says why it is suggested. Only members who left
// "Show me in Discover" on appear; blocked and banned accounts never do.
export function Discover({ initialInterest }: { initialInterest?: Interest | null }) {
  const t = useT();
  const { data: me } = useIdentity();
  const [interest, setInterest] = useState<Interest | null>(initialInterest ?? null);
  const [locale, setLocale] = useState<string | null>(null);
  const [creators, setCreators] = useState(false);
  const { data, error } = useRpc<Person[]>("get_discover", { p_interest: interest, p_locale: locale, p_creators_only: creators, p_limit: 30 });
  const chip = (active: boolean) =>
    clsx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150", active ? "border-brand bg-brand text-white" : "border-line bg-card hover:border-brand");

  return (
    <div className="space-y-3">
      {me && me.interests.length === 0 && (
        <Link href="/settings#interests" className="card block p-3 text-sm text-ink-2 hover:border-brand">
          {t("disc.setInterests")} →
        </Link>
      )}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t("settings.interests")}>
        <button className={chip(interest === null)} onClick={() => setInterest(null)} aria-pressed={interest === null}>
          {t("disc.allInterests")}
        </button>
        {INTERESTS.map((i) => (
          <button key={i} className={chip(interest === i)} onClick={() => setInterest(i)} aria-pressed={interest === i}>
            {INTEREST_EMOJI[i]} {t(`interest.${i}` as const)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={locale ?? ""}
          onChange={(e) => setLocale(e.target.value || null)}
          aria-label={t("settings.language")}
          className="rounded-full border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-brand"
        >
          <option value="">{t("disc.anyLanguage")}</option>
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <button className={chip(creators)} onClick={() => setCreators((c) => !c)} aria-pressed={creators}>
          {t("disc.creatorsOnly")}
        </button>
      </div>
      {error ? (
        <Empty text={t("common.error")} />
      ) : !data ? (
        <ChaosLoader />
      ) : data.length === 0 ? (
        <Empty text={t("disc.empty")} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.map((p, n) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: Math.min(n * 0.02, 0.25) }}>
              <Link href={`/u/${p.username}`} className="card flex h-full gap-3 p-3 transition-colors duration-150 hover:border-brand">
                <Avatar src={p.avatar_url} name={p.display_name} size={48} online={p.online} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {p.display_name} {p.badge}
                  </div>
                  <div className="truncate text-xs text-muted">
                    @{p.username}
                    {p.creator ? ` · ${t("cr.label")}: ${t(`creator.${p.creator}` as const)}` : ""}
                  </div>
                  {p.bio && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-2" dir="auto">
                      {p.bio}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.shared.length > 0 && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-ink">
                        {t("disc.shares", { list: p.shared.map((i) => t(`interest.${i}` as const)).join(", ") })}
                      </span>
                    )}
                    {p.same_language && <span className="rounded-full bg-card-2 px-2 py-0.5 text-[11px] font-semibold">{t("disc.sameLanguage")}</span>}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
