"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { Megaphone, RefreshCw, Send } from "lucide-react";
import { byFn, useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { Button, ChaosLoader, Toggle } from "@/components/ui/bits";
import type { AdminSite, Announcement } from "@/lib/types";

const field = "w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand";

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

const SLOW = [
  [0, "Off"],
  [30, "30s"],
  [60, "1 min"],
  [300, "5 min"],
  [900, "15 min"],
] as const;

export function SiteControls() {
  const { toast, toastError } = useApp();
  const { mutate: mutateAll } = useSWRConfig();
  const { data, mutate } = useRpc<AdminSite>("admin_get_site");
  const [ann, setAnn] = useState<{ text: string; tone: Announcement["tone"] }>({ text: "", tone: "info" });
  const [prompt, setPrompt] = useState("");
  const [words, setWords] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setAnn({ text: data.announcement?.text ?? "", tone: data.announcement?.tone ?? "info" });
    setPrompt(data.nightly_prompt ?? "");
    setWords(data.word_filter.join(", "));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data]);

  if (!data) return <ChaosLoader />;

  async function save(p: Record<string, unknown>, msg: string, key: string) {
    setBusy(key);
    try {
      const next = await rpc<AdminSite>("admin_update_site", { p });
      mutate(next, { revalidate: false });
      mutateAll(byFn("get_site"));
      toast(msg, "success", "🛡️");
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  const updated = (k: string) =>
    data.updated[k] ? (
      <span className="text-[11px] text-muted">
        Last changed {new Date(data.updated[k].at).toLocaleString()} {data.updated[k].by && `by ${data.updated[k].by}`}
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      <Panel title="Announcement" sub="A banner at the top of everyone's app. Members can dismiss it.">
        <textarea
          value={ann.text}
          onChange={(e) => setAnn((a) => ({ ...a, text: e.target.value.slice(0, 280) }))}
          placeholder="Movie night Friday 9pm in #The Boys. Bring snacks."
          className={clsx(field, "h-20 resize-none")}
          aria-label="Announcement text"
        />
        <div className="flex flex-wrap items-center gap-2">
          {(["info", "event", "alert"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setAnn((a) => ({ ...a, tone: t }))}
              aria-pressed={ann.tone === t}
              className={clsx("rounded-full border px-3 py-1 text-xs capitalize", ann.tone === t ? "border-brand bg-brand/15 text-brand-2" : "border-line text-muted")}
            >
              {t}
            </button>
          ))}
          <span className="ml-auto text-xs tabular-nums text-muted">{ann.text.length}/280</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save({ announcement: ann.text.trim() ? ann : null }, ann.text.trim() ? "Announcement is live." : "Announcement cleared.", "ann")} disabled={busy === "ann"}>
            <Megaphone size={16} /> {data.announcement ? "Update banner" : "Publish banner"}
          </Button>
          {data.announcement && (
            <Button variant="outline" onClick={() => save({ announcement: null }, "Announcement cleared.", "ann")}>
              Clear
            </Button>
          )}
        </div>
        {updated("announcement")}
      </Panel>

      <Panel title="Broadcast notification" sub="Sends a notification to every member right now. Max 10 a day.">
        <div className="flex gap-2">
          <input value={broadcast} onChange={(e) => setBroadcast(e.target.value.slice(0, 280))} placeholder="Server maintenance at 2am, back in 10." className={field} aria-label="Broadcast text" />
          <Button
            disabled={!broadcast.trim() || busy === "bc"}
            onClick={async () => {
              if (!confirm(`Notify every member?\n\n"${broadcast.trim()}"`)) return;
              setBusy("bc");
              try {
                const n = await rpc<number>("admin_broadcast", { p_body: broadcast.trim() });
                toast(`Sent to ${n} member${n === 1 ? "" : "s"}.`, "success", "📣");
                setBroadcast("");
              } catch (err) {
                toastError(err);
              } finally {
                setBusy(null);
              }
            }}
          >
            <Send size={16} /> Send
          </Button>
        </div>
      </Panel>

      <Panel title="Who can join">
        <Toggle
          checked={!!data.open_signup}
          onChange={(v) => save({ open_signup: v }, v ? "Sign-ups are open to everyone." : "Invite-only. New people need an invite link.", "signup")}
          label="Open sign-ups"
          description="On: anyone can create an account from the app or website. Off: invite links only (existing members are not affected)."
        />
        {updated("open_signup")}
      </Panel>

      <Panel title="Posting rules">
        <div className="divide-y divide-line">
          <Toggle
            checked={data.lockdown}
            onChange={(v) => save({ lockdown: v }, v ? "Quiet mode on. Only admins can post." : "Quiet mode off.", "lock")}
            label="Quiet mode"
            description="Pauses posts and comments for members. Chat stays open. Admins can still post."
          />
          <div className="py-3">
            <div className="mb-2 text-sm font-semibold">Slow mode</div>
            <div className="flex gap-1 rounded-full border border-line p-1" role="radiogroup" aria-label="Slow mode">
              {SLOW.map(([v, l]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={data.slow_mode === v}
                  onClick={() => save({ slow_mode: v }, v ? `Slow mode: one post every ${l}.` : "Slow mode off.", "slow")}
                  className={clsx("flex-1 rounded-full py-1.5 text-xs font-semibold", data.slow_mode === v ? "bg-brand text-white" : "text-muted")}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">Minimum time between posts for each member. Admins are exempt.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Tonight's prompt" sub="Replaces the rotating daily prompt on home, the composer and the sidebar.">
        <div className="flex gap-2">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 200))} placeholder="Best anime opening of 2026?" className={field} aria-label="Nightly prompt" />
          <Button variant="outline" onClick={() => save({ nightly_prompt: prompt.trim() || null }, prompt.trim() ? "Prompt set." : "Back to the rotating prompt.", "prompt")}>
            Save
          </Button>
        </div>
        {updated("nightly_prompt")}
      </Panel>

      <Panel title="Word filter" sub="Whole words, letters or numbers only. Matches are masked as ✱✱✱ in new posts, comments and messages.">
        <textarea value={words} onChange={(e) => setWords(e.target.value)} placeholder="word1, word2, word3" className={clsx(field, "h-20 resize-none font-mono")} aria-label="Filtered words" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              save(
                { word_filter: words.split(/[\s,]+/).map((w) => w.trim()).filter(Boolean) },
                "Word filter saved.",
                "words",
              )
            }
          >
            Save filter
          </Button>
          <span className="text-xs text-muted">{data.word_filter.length} words</span>
        </div>
      </Panel>

      <Panel title="XP" sub="Everyone started at 0 XP when levels launched. This rebuilds XP from past posts, comments, likes and awards. It never lowers anyone's XP.">
        <Button
          variant="outline"
          disabled={busy === "xp"}
          onClick={async () => {
            if (!confirm("Rebuild XP for all members from their history?")) return;
            setBusy("xp");
            try {
              const n = await rpc<number>("admin_recalculate_xp");
              toast(`XP rebuilt for ${n} member${n === 1 ? "" : "s"}.`, "success", "⬆️");
              mutateAll(byFn("get_my_progress", "get_level_board", "get_me", "admin_member_extras"));
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(null);
            }
          }}
        >
          <RefreshCw size={16} /> Rebuild XP from history
        </Button>
      </Panel>
    </div>
  );
}
