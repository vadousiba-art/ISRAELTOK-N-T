"use client";

import { Check, Moon } from "lucide-react";
import { useIdentity } from "@/lib/client/gates";
import { useI18n } from "@/components/providers/I18nProvider";
import { Gate } from "@/components/yoru/Gate";
import { ProfileBanner } from "@/components/yoru/ProfileLook";
import type { MessageKey } from "@/lib/i18n/messages/en";

const BENEFITS: MessageKey[] = ["pro.b.cosmetics", "pro.b.themes", "pro.b.badge", "pro.b.shield", "pro.b.early"];
const FREE: MessageKey[] = ["pro.f.social", "pro.f.privacy", "pro.f.progress", "pro.f.collections", "pro.f.discover"];

export default function ProPage() {
  return (
    <Gate>
      <Pro />
    </Gate>
  );
}

function Pro() {
  const { t, formatDate } = useI18n();
  const { data: me } = useIdentity();
  const until = me?.pro_until && me.pro_until !== "infinity" ? me.pro_until : null;

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <ProfileBanner style="crimson_moon" accent="#e5102f" className="h-36">
          <div className="absolute inset-0 flex flex-col justify-end p-5">
            <div className="flex items-center gap-2 text-white">
              <Moon size={20} className="text-brand" />
              <h1 className="text-3xl font-black tracking-tight">{t("pro.title")}</h1>
            </div>
            <p className="mt-1 max-w-[58%] text-sm text-white/80 sm:max-w-[65%]">{t("pro.tagline")}</p>
          </div>
        </ProfileBanner>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <div className="text-2xl font-black">{t("pro.price")}</div>
            <div className="text-xs text-muted">{t("pro.priceNote")}</div>
          </div>
          {me?.pro ? (
            <div className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">
              {until ? t("pro.active", { date: formatDate(until) }) : t("pro.activeForever")}
            </div>
          ) : (
            <button disabled className="cursor-not-allowed rounded-full border border-line px-4 py-2 text-sm font-bold text-muted" aria-describedby="pro-not-open">
              {t("pro.unavailable")}
            </button>
          )}
        </div>
        {!me?.pro && (
          <p id="pro-not-open" className="mx-5 mb-5 rounded-xl border border-line bg-card-2 p-3 text-sm text-ink-2">
            {t("pro.notOpen")}
          </p>
        )}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t("pro.included")}</h2>
        <ul className="space-y-2.5">
          {BENEFITS.map((k) => (
            <li key={k} className="flex gap-2.5 text-[15px]">
              <Check size={18} className="mt-0.5 shrink-0 text-brand" /> {t(k)}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{t("pro.alwaysFree")}</h2>
        <ul className="space-y-2.5">
          {FREE.map((k) => (
            <li key={k} className="flex gap-2.5 text-[15px] text-ink-2">
              <Check size={18} className="mt-0.5 shrink-0 text-online" /> {t(k)}
            </li>
          ))}
        </ul>
      </section>

      <p className="px-1 text-xs leading-relaxed text-muted">{t("pro.terms")}</p>
    </div>
  );
}
