"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { byFn, useProgress, useRpc } from "@/lib/client/hooks";
import { post, rpc } from "@/lib/client/api";
import { useApp, type MotionPref, type ThemePref } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button, PageTitle, Toggle } from "@/components/ui/bits";
import { IntensityPicker } from "@/components/menace/IntensityPicker";
import { AMBIENCE_MODES } from "@/components/fx/Ambience";
import { CURRENTLY, PALETTE_EVENT } from "@/lib/progress";
import { ColorSlider } from "@/components/yoru/ColorSlider";
import type { CurrentlyKind, Me, NotificationPrefs, ProfileLite } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">{title}</h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="py-3">
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <div className="flex gap-1 rounded-full border border-line p-1" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={clsx("flex-1 rounded-full py-1.5 text-sm font-bold", value === v ? "bg-brand text-white" : "text-muted")}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

const NOTIF: [keyof NotificationPrefs, string, string][] = [
  ["likes", "Likes & reactions", "When someone reacts to your posts"],
  ["comments", "Comments & replies", "Includes Menace roasts on your posts"],
  ["mentions", "Mentions", "When someone @'s you"],
  ["reposts", "Reposts", "When your post gets spread"],
  ["messages", "Direct messages", "New DMs"],
  ["awards", "Awards", "When your post wins something"],
  ["friend_posts", "Friend activity", "Every time anyone posts"],
];

export default function SettingsPage() {
  const { me } = useShell();
  const { theme, setTheme, motionPref, setMotionPref, sound, setSound, ambience, setAmbience, toastError, toast, config } = useApp();
  const { data: progress, mutate: mutateProgress } = useProgress();
  const [currently, setCurrently] = useState<{ kind: CurrentlyKind | ""; title: string }>({ kind: "", title: "" });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (progress) setCurrently({ kind: progress.currently_kind ?? "", title: progress.currently_title ?? "" });
  }, [progress]);

  async function saveStyle(p: { currently_kind?: CurrentlyKind | ""; currently_title?: string }) {
    try {
      await rpc("update_my_style", { p });
      mutateProgress();
      mutate(byFn("get_me", "get_profile_extras"));
    } catch (err) {
      toastError(err);
    }
  }
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const { data: blocked, mutate: mutateBlocked } = useRpc<ProfileLite[]>("get_blocked");

  async function save(p: Partial<Me> | { notification_prefs: Partial<NotificationPrefs> }) {
    // Optimistic: reflect immediately in the cached profile.
    mutate(byFn("get_me"), (cur?: Me) => (cur ? ({ ...cur, ...p, notification_prefs: { ...cur.notification_prefs, ...("notification_prefs" in p ? p.notification_prefs : {}) } } as Me) : cur), { revalidate: false });
    try {
      await rpc("update_my_profile", { p });
      mutate(byFn("get_me"));
    } catch (err) {
      toastError(err);
      mutate(byFn("get_me"));
    }
  }

  async function unblock(id: string) {
    try {
      await rpc("toggle_block", { p_user_id: id });
      mutateBlocked();
      toast("Unblocked.", "success", "🕊️");
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle sub="Make YORU yours.">
        Settings
      </PageTitle>

      <Section title="Appearance">
        <Segmented<ThemePref> label="Theme" value={theme} onChange={setTheme} options={[["dark", "Dark"], ["light", "Light"], ["system", "System"]]} />
        <Segmented<MotionPref>
          label="Motion"
          value={motionPref}
          onChange={setMotionPref}
          options={[["system", "System"], ["reduce", "Reduced"], ["full", "Full"]]}
        />
        <Toggle checked={sound} onChange={setSound} label="Sound effects" description="Pops and fanfares on likes, posts and awards" />
      </Section>

      <Section title="Style">
        <ColorSlider />
        <div className="py-3">
          <div className="mb-2 text-sm font-semibold">Currently</div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              saveStyle({ currently_kind: currently.kind, currently_title: currently.title.trim() });
              toast("Saved.", "success", "📺");
            }}
          >
            <select
              value={currently.kind}
              onChange={(e) => setCurrently((c) => ({ ...c, kind: e.target.value as CurrentlyKind | "" }))}
              className="rounded-xl border border-line bg-card-2 px-3 py-2 text-sm outline-none focus:border-brand"
              aria-label="Activity"
            >
              <option value="">Nothing</option>
              {(Object.keys(CURRENTLY) as CurrentlyKind[]).map((k) => (
                <option key={k} value={k}>
                  {CURRENTLY[k].emoji} {CURRENTLY[k].verb}
                </option>
              ))}
            </select>
            <input
              value={currently.title}
              onChange={(e) => setCurrently((c) => ({ ...c, title: e.target.value.slice(0, 60) }))}
              placeholder="Frieren, Chainsaw Man, Ado, Persona 5..."
              className="min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-3 py-2 text-sm outline-none focus:border-brand"
              aria-label="Title"
            />
            <Button type="submit" className="py-2">
              Save
            </Button>
          </form>
        </div>
        <Segmented
          label="Ambience"
          value={ambience}
          onChange={setAmbience}
          options={AMBIENCE_MODES.map((m) => [m.id, `${m.label} ${m.jp}`] as [typeof m.id, string])}
        />
        <div className="py-3 text-xs text-muted">
          Tip: press <kbd className="rounded border border-line px-1">Ctrl</kbd> + <kbd className="rounded border border-line px-1">K</kbd> anywhere (or{" "}
          <button className="text-brand underline" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}>
            tap here
          </button>
          ) for quick jump.
        </div>
      </Section>

      <Section title="The AI Menace">
        <Toggle
          checked={me.roast_opt_in}
          onChange={(v) => save({ roast_opt_in: v })}
          label="Let others roast me"
          description="Others can summon Menace roasts on your posts and you can be picked for Roast of the Day."
        />
        <div className="py-3">
          <div className="mb-2 text-sm font-semibold">Max roast intensity</div>
          <IntensityPicker value={me.roast_intensity} onChange={(v) => save({ roast_intensity: v })} />
          <p className="mt-1.5 text-xs text-muted">Roasts aimed at you never go above this level.</p>
        </div>
        <Toggle
          checked={me.ai_context_opt_in}
          onChange={(v) => save({ ai_context_opt_in: v })}
          label="Personalized roasts"
          description="Let the Menace read your bio, status, inside jokes and your recent public posts. Never DMs or chats."
        />
      </Section>

      <Section title="Notifications">
        {NOTIF.map(([key, label, desc]) => (
          <Toggle key={key} checked={me.notification_prefs[key] ?? true} onChange={(v) => save({ notification_prefs: { [key]: v } })} label={label} description={desc} />
        ))}
      </Section>

      <Section title="Privacy">
        <Toggle
          checked={me.leaderboard_opt_in}
          onChange={(v) => save({ leaderboard_opt_in: v })}
          label="Appear on leaderboards"
          description="Comedy rankings are opt-in."
        />
        <div className="py-3">
          <div className="mb-2 text-sm font-semibold">Blocked people</div>
          {blocked?.length === 0 && <p className="text-xs text-muted">Nobody blocked.</p>}
          {blocked?.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-1.5">
              <Avatar src={b.avatar_url} name={b.display_name} size={32} />
              <span className="flex-1 text-sm font-bold">{b.display_name}</span>
              <Button variant="outline" className="py-1.5 text-xs" onClick={() => unblock(b.id)}>
                Unblock
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Account">
        <div className="py-3 text-sm text-muted">
          Signed in as <b className="text-ink">@{me.username}</b> · role {me.role} · {config.mode} mode
        </div>
        <div className="py-3">
          <Button
            variant="danger"
            onClick={async () => {
              await post("/api/auth/logout").catch(() => null);
              router.replace("/login");
              router.refresh();
            }}
          >
            Log out
          </Button>
        </div>
      </Section>
    </div>
  );
}
