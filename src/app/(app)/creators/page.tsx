"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ChaosLoader, Empty, PageTitle } from "@/components/ui/bits";
import { Gate } from "@/components/yoru/Gate";
import { CREATOR_CATEGORIES, type CreatorCategory } from "@/lib/opengates";
import type { ProfileLite } from "@/lib/types";

type Application = {
  id: string;
  category: CreatorCategory;
  portfolio_url: string;
  statement: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "revoked";
  review_note: string;
  created_at: string;
};
type Mine = { creator_category: CreatorCategory | null; application: Application | null };
type Creator = ProfileLite & { creator: CreatorCategory; bio: string };

export default function CreatorsPage() {
  return (
    <Gate>
      <Creators />
    </Gate>
  );
}

function Creators() {
  const t = useT();
  const [cat, setCat] = useState<CreatorCategory | null>(null);
  const { data: creators } = useRpc<Creator[]>("get_discover", { p_creators_only: true, p_limit: 50 });
  const shown = (creators ?? []).filter((c) => !cat || c.creator === cat);
  const chip = (on: boolean) =>
    clsx("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium", on ? "border-brand bg-brand text-white" : "border-line bg-card hover:border-brand");

  return (
    <div className="space-y-4">
      <PageTitle sub={t("cr.sub")}>{t("cr.title")}</PageTitle>
      <MyApplication />
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button className={chip(cat === null)} onClick={() => setCat(null)} aria-pressed={cat === null}>
          {t("disc.allInterests")}
        </button>
        {CREATOR_CATEGORIES.map((c) => (
          <button key={c} className={chip(cat === c)} onClick={() => setCat(c)} aria-pressed={cat === c}>
            {t(`creator.${c}` as const)}
          </button>
        ))}
      </div>
      {!creators ? (
        <ChaosLoader />
      ) : shown.length === 0 ? (
        <Empty text={t("cr.empty")} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((c) => (
            <Link key={c.id} href={`/u/${c.username}`} className="card flex gap-3 p-4 transition-colors duration-150 hover:border-brand">
              <Avatar src={c.avatar_url} name={c.display_name} size={56} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold">{c.display_name}</div>
                <div className="text-xs font-semibold uppercase tracking-wider text-brand">{t(`creator.${c.creator}` as const)}</div>
                {c.bio && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-2" dir="auto">
                    {c.bio}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MyApplication() {
  const t = useT();
  const { toast, toastError } = useApp();
  const { data, mutate } = useRpc<Mine>("get_my_creator_application", {});
  const [form, setForm] = useState({ p_category: "artist" as CreatorCategory, p_portfolio_url: "", p_statement: "" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const app = data.application;
  const field = "w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm outline-none focus:border-brand";

  if (data.creator_category) {
    return <div className="card p-4 text-sm font-semibold">{t("cr.approved", { category: t(`creator.${data.creator_category}` as const) })}</div>;
  }
  if (app?.status === "pending") {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-sm">{t("cr.pending")}</span>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await rpc("withdraw_creator_application");
              mutate();
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("cr.withdraw")}
        </Button>
      </div>
    );
  }
  return (
    <div className="card p-4">
      {app?.status === "rejected" && (
        <p className="mb-3 text-sm text-muted">
          {t("cr.rejected")}
          {app.review_note ? ` “${app.review_note}”` : ""}
        </p>
      )}
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-ink-2">{t("settings.creatorDesc")}</p>
          <Button onClick={() => setOpen(true)}>{t("cr.apply")}</Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await rpc("apply_creator", form);
              toast(t("cr.sent"), "success", "🎨");
              setOpen(false);
              mutate();
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-muted">{t("cr.requirements")}</p>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("cr.category")}</span>
            <select value={form.p_category} onChange={(e) => setForm({ ...form, p_category: e.target.value as CreatorCategory })} className={field}>
              {CREATOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`creator.${c}` as const)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("cr.portfolio")}</span>
            <input type="url" required placeholder="https://" value={form.p_portfolio_url} onChange={(e) => setForm({ ...form, p_portfolio_url: e.target.value.slice(0, 300) })} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t("cr.statement")}</span>
            <textarea required minLength={20} maxLength={600} rows={4} value={form.p_statement} onChange={(e) => setForm({ ...form, p_statement: e.target.value })} className={field} />
            <span className="mt-1 block text-xs text-muted">{t("cr.statementHint")}</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t("cr.submit")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
