"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Loader2, Megaphone, Send } from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { ai, rpc, type AiResponse } from "@/lib/client/api";
import { byFn, refreshFeeds } from "@/lib/client/hooks";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { Button, PageTitle } from "@/components/ui/bits";
import { IntensityPicker } from "@/components/menace/IntensityPicker";
import { AWARDS, todaysChallenge } from "@/lib/jokes";
import { playSynth, SOUNDS, type SoundName } from "@/lib/client/sounds";

function Card({ title, emoji, sub, children, accent = "brand" }: { title: string; emoji: string; sub: string; children: React.ReactNode; accent?: "brand" | "hot" | "volt" | "lime" }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="card relative overflow-hidden p-4"
    >
      <div
        className={clsx(
          "absolute -right-8 -top-8 h-28 w-28 rounded-full blur-3xl",
          accent === "brand" && "bg-brand/25",
          accent === "hot" && "bg-hot/25",
          accent === "volt" && "bg-volt/25",
          accent === "lime" && "bg-lime/20",
        )}
        aria-hidden
      />
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span className="inline-block text-xl">{emoji}</span> {title}
      </h2>
      <p className="mb-3 text-sm text-muted">{sub}</p>
      {children}
    </motion.section>
  );
}

function useTool() {
  const { toastError } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const run = async (tool: string, input: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await ai(tool, input);
      setResult(r);
      return r;
    } catch (err) {
      toastError(err);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, result, run, setResult };
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 text-sm outline-none focus:border-brand" />;
}

function Result({ r, children }: { r: AiResponse | null; children?: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      {r && (
        <motion.div
          key={JSON.stringify(r).slice(0, 80)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-3 rounded-2xl border border-roast/40 bg-gradient-to-br from-roast/10 to-volt/10 p-3"
        >
          {children ?? <p className="whitespace-pre-wrap text-[15px]">{r.text}</p>}
          {r.source === "offline" && <p className="mt-2 text-[11px] text-muted">⚡ Menace Lite (offline mode)</p>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShareButton({ text }: { text: string }) {
  const { toast, toastError } = useApp();
  const { mutate } = useSWRConfig();
  const [done, setDone] = useState(false);
  return (
    <button
      disabled={done}
      onClick={async () => {
        try {
          await rpc("create_post", { p_body: text.slice(0, 2000) });
          setDone(true);
          toast("Posted to the feed. No take-backs.", "success", "📢");
          mutate(byFn("get_me"));
          refreshFeeds();
        } catch (err) {
          toastError(err);
        }
      }}
      className="mt-2 flex items-center gap-1.5 text-xs font-bold text-brand disabled:text-muted"
    >
      <Send size={13} /> {done ? "Shared" : "Share to feed"}
    </button>
  );
}

function RoastMe() {
  const { me } = useShell();
  const [level, setLevel] = useState<1 | 2 | 3>(me.roast_intensity);
  const [extra, setExtra] = useState("");
  const t = useTool();
  return (
    <Card title="Roast Me" emoji="🔥" sub="Ask for it. Get it. Regret it." accent="hot">
      <IntensityPicker value={level} onChange={setLevel} />
      <div className="mt-2">
        <Field value={extra} onChange={(e) => setExtra(e.target.value.slice(0, 300))} placeholder="Optional: give it ammo (e.g. 'I own 4 crypto wallets')" />
      </div>
      <Button variant="chaos" className="mt-3 w-full" disabled={t.busy} onClick={() => t.run("roast_me", { intensity: level, extra: extra || undefined })}>
        {t.busy ? <Loader2 className="animate-spin" size={16} /> : "🔥"} {t.busy ? "Preheating the roast oven..." : "Roast me"}
      </Button>
      {!me.ai_context_opt_in && (
        <p className="mt-2 text-[11px] text-muted">
          Tip: turn on Personalized roasts on the{" "}
          <Link href="/menace" className="underline">
            Menace page
          </Link>{" "}
          for roasts based on your bio and posts.
        </p>
      )}
      <Result r={t.result}>
        {t.result && (
          <>
            <p className="text-[15px] font-semibold">{t.result.text}</p>
            <ShareButton text={`🤖🔥 The Menace roasted me: “${t.result.text}”`} />
          </>
        )}
      </Result>
    </Card>
  );
}

function SkillIssue() {
  const [text, setText] = useState("");
  const t = useTool();
  const d = t.result?.data as { score?: number; verdict?: string; diagnosis?: string } | undefined;
  return (
    <Card title="Skill Issue Detector" emoji="📉" sub="Describe what went wrong. Science will decide whose fault it is." accent="volt">
      <Field value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="I lost my 9th game in a row because of lag" />
      <Button className="mt-3 w-full" disabled={t.busy || !text.trim()} onClick={() => t.run("skill_issue", { text })}>
        {t.busy ? "Running diagnostics..." : "Scan for skill issues"}
      </Button>
      <Result r={t.result}>
        {d && (
          <div>
            <div className="flex items-end justify-between">
              <span className="sticker text-4xl text-hot">{d.score}%</span>
              <span className="text-right text-sm font-bold uppercase">{d.verdict}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-line">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${d.score}%` }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            </div>
            <p className="mt-2 text-sm">{d.diagnosis}</p>
            <ShareButton text={`📉 Skill Issue Detector: ${d.score}% skill issue — ${d.verdict}. ${d.diagnosis}`} />
          </div>
        )}
      </Result>
    </Card>
  );
}

function RateTake() {
  const [take, setTake] = useState("");
  const t = useTool();
  const d = t.result?.data as { rating?: number; verdict?: string; reason?: string } | undefined;
  return (
    <Card title="Rate My Take" emoji="⚖️" sub="Submit your opinion to the tribunal.">
      <Field value={take} onChange={(e) => setTake(e.target.value.slice(0, 500))} placeholder="Cereal is a soup" />
      <Button className="mt-3 w-full" disabled={t.busy || !take.trim()} onClick={() => t.run("rate_take", { take })}>
        {t.busy ? "The tribunal is deliberating..." : "Rate it"}
      </Button>
      <Result r={t.result}>
        {d && (
          <div>
            <div className="flex items-baseline gap-2">
              <span className={clsx("sticker text-5xl", (d.rating ?? 0) >= 6 ? "text-lime" : "text-hot")}>{d.rating}</span>
              <span className="text-lg font-bold text-muted">/10</span>
              <span className="ml-auto text-sm font-bold uppercase">{d.verdict}</span>
            </div>
            <p className="mt-1 text-sm">{d.reason}</p>
            <ShareButton text={`⚖️ My take "${take}" got rated ${d.rating}/10 by the Menace: ${d.verdict}. ${d.reason}`} />
          </div>
        )}
      </Result>
    </Card>
  );
}

function Propaganda() {
  const [topic, setTopic] = useState("");
  const t = useTool();
  const d = t.result?.data as { headline?: string; slogan?: string; decree?: string; ministry?: string } | undefined;
  return (
    <Card title="Propaganda Generator" emoji="📯" sub="Satirical posters from a ministry that should not exist." accent="hot">
      <Field value={topic} onChange={(e) => setTopic(e.target.value.slice(0, 120))} placeholder="Mandatory naps" />
      <Button className="mt-3 w-full" disabled={t.busy || !topic.trim()} onClick={() => t.run("propaganda", { topic })}>
        {t.busy ? "Printing posters..." : "Generate propaganda"}
      </Button>
      <Result r={t.result}>
        {d && <PropagandaPoster d={d} />}
        {d && <ShareButton text={`📯 ${d.headline}\n“${d.slogan}”\n${d.decree}\n— ${d.ministry}`} />}
      </Result>
    </Card>
  );
}

function PropagandaPoster({ d }: { d: { headline?: string; slogan?: string; decree?: string; ministry?: string } }) {
  return (
    <div className="overflow-hidden rounded-xl border-4 border-brand bg-[#f4e4c1] p-4 text-center text-[#1b1b1b]">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand">{d.ministry}</div>
      <div className="sticker mt-2 text-3xl leading-none text-brand" style={{ textShadow: "2px 2px 0 #1b1b1b" }}>
        {d.headline}
      </div>
      <div className="mx-auto my-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-3xl">📢</div>
      <div className="font-bold italic">“{d.slogan}”</div>
      <p className="mt-2 text-xs">{d.decree}</p>
    </div>
  );
}

function Crisis() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [incident, setIncident] = useState("");
  const t = useTool();
  return (
    <Card title="Diplomatic Crisis Simulator" emoji="🗺️" sub="Two parties. One incident. Total escalation." accent="volt">
      <div className="grid grid-cols-2 gap-2">
        <Field value={a} onChange={(e) => setA(e.target.value.slice(0, 60))} placeholder="Party A (e.g. Ethan)" />
        <Field value={b} onChange={(e) => setB(e.target.value.slice(0, 60))} placeholder="Party B (e.g. Canada)" />
      </div>
      <div className="mt-2">
        <Field value={incident} onChange={(e) => setIncident(e.target.value.slice(0, 200))} placeholder="Inciting incident (optional)" />
      </div>
      <Button className="mt-3 w-full" disabled={t.busy || !a.trim() || !b.trim()} onClick={() => t.run("crisis", { a, b, incident: incident || undefined })}>
        {t.busy ? "Recalling ambassadors..." : "Start an international incident"}
      </Button>
      <Result r={t.result}>
        {t.result && (
          <>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-hot">🚨 Official bulletins</div>
            <p className="whitespace-pre-wrap text-sm">{t.result.text}</p>
            <ShareButton text={`🗺️ DIPLOMATIC CRISIS: ${a} vs ${b}\n\n${t.result.text}`} />
          </>
        )}
      </Result>
    </Card>
  );
}

function BreakingNews() {
  const { toast } = useApp();
  const [topic, setTopic] = useState("");
  const t = useTool();
  return (
    <Card title="Fake Breaking News" emoji="🚨" sub="Hysterical headlines. 0% journalism. Can be broadcast to the feed by the Menace." accent="hot">
      <Field value={topic} onChange={(e) => setTopic(e.target.value.slice(0, 120))} placeholder="Topic (leave empty for a random one)" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={t.busy} onClick={() => t.run("headline", { topic: topic || undefined })}>
          Generate
        </Button>
        <Button
          variant="danger"
          disabled={t.busy}
          onClick={async () => {
            const r = await t.run("headline", { topic: topic || undefined, post: true });
            if (r?.post_id) {
              toast("Broadcast live on the feed by the Menace.", "chaos", "📺");
              refreshFeeds();
            }
          }}
        >
          <Megaphone size={16} /> Broadcast
        </Button>
      </div>
      <Result r={t.result}>{t.result && <p className="text-[15px] font-bold">{t.result.text}</p>}</Result>
    </Card>
  );
}

function Comeback() {
  const { me } = useShell();
  const [insult, setInsult] = useState("");
  const t = useTool();
  return (
    <Card title="Comeback Generator" emoji="🎤" sub="Someone came for you. Return fire.">
      <Field value={insult} onChange={(e) => setInsult(e.target.value.slice(0, 300))} placeholder="What did they say?" />
      <Button className="mt-3 w-full" disabled={t.busy || !insult.trim()} onClick={() => t.run("comeback", { insult, intensity: me.roast_intensity })}>
        {t.busy ? "Loading ammunition..." : "Fire back"}
      </Button>
      <Result r={t.result}>
        {t.result && (
          <>
            <p className="text-[15px] font-bold">{t.result.text}</p>
            <button
              onClick={() => navigator.clipboard?.writeText(t.result!.text)}
              className="mt-2 text-xs font-bold text-brand"
            >
              Copy comeback
            </button>
          </>
        )}
      </Result>
    </Card>
  );
}

function ChaosButton() {
  const { toastError } = useApp();
  const { mutate } = useSWRConfig();
  const controls = useAnimationControls();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<AiResponse | null>(null);
  const press = async () => {
    setBusy(true);
    playSynth("alarm");
    controls.start({ x: [0, -4, 4, 0], transition: { duration: 0.2 } });
    try {
      setOut(await ai("chaos"));
      mutate(byFn("get_me"));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  const d = out?.data as { headline?: string; slogan?: string; decree?: string; ministry?: string } | undefined;
  return (
    <motion.div animate={controls}>
      <Card title="The Random Chaos Button" emoji="🔴" sub="Do not press. (+1 chaos point if you press.)" accent="hot">
        <div className="flex justify-center py-2">
          <motion.button
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.12 }}
            onClick={press}
            disabled={busy}
            className="relative h-32 w-32 rounded-full bg-brand text-white ring-8 ring-brand/15 transition-colors duration-150 hover:bg-brand-2"
            aria-label="Press the chaos button"
          >
            <span className="sticker text-2xl">{busy ? "..." : "DO NOT PRESS"}</span>
          </motion.button>
        </div>
        <Result r={out}>
          {out && (d?.headline ? <PropagandaPoster d={d} /> : <p className="whitespace-pre-wrap text-[15px] font-semibold">{out.text}</p>)}
        </Result>
      </Card>
    </motion.div>
  );
}

function Soundboard() {
  const names = (Object.keys(SOUNDS) as SoundName[]).filter((n) => n !== "pop" && n !== "boop");
  return (
    <Card title="Soundboard" emoji="🔊" sub="Synthesized in your browser. Annoy responsibly." accent="lime">
      <div className="grid grid-cols-4 gap-2">
        {names.map((n) => (
          <motion.button
            key={n}
            whileTap={{ scale: 0.95 }}
            onClick={() => playSynth(n)}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-card-2 p-1 text-center transition hover:border-lime"
          >
            <span className="text-2xl">{SOUNDS[n].emoji}</span>
            <span className="text-[10px] font-bold leading-tight">{SOUNDS[n].label}</span>
          </motion.button>
        ))}
      </div>
    </Card>
  );
}

function DailyChallenge() {
  const { openComposer } = useShell();
  return (
    <Card title="Daily Challenge" emoji="🎯" sub="New one every day. +5 chaos points for completing it." accent="lime">
      <p className="rounded-2xl bg-lime/10 p-3 font-bold">{todaysChallenge()}</p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={() => openComposer({ tab: "text" })}>
          Accept challenge
        </Button>
        <Link href="/explore?tag=dailychallenge" className="flex flex-1 items-center justify-center rounded-full border border-line text-sm font-bold hover:bg-card-2">
          See entries
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-muted">Tip: use the 🎯 button in the composer to tag your post #dailychallenge.</p>
    </Card>
  );
}

function RoastOfTheDay() {
  const { toast } = useApp();
  const t = useTool();
  return (
    <Card title="Roast of the Day" emoji="🏆" sub="The Menace picks a random opted-in member's latest post and roasts it on the feed. Once a day." accent="volt">
      <Button
        variant="chaos"
        className="w-full"
        disabled={t.busy}
        onClick={async () => {
          const r = await t.run("roast_of_the_day", {});
          if (r?.post_id) {
            toast("Roast of the Day served. Check the feed.", "chaos", "🔥");
            refreshFeeds();
          }
        }}
      >
        {t.busy ? "Choosing..." : "Serve today's roast"}
      </Button>
      <p className="mt-2 text-[11px] text-muted">Only members who opted into roasts in Settings can be picked.</p>
    </Card>
  );
}

function AwardsInfo() {
  return (
    <Card title="Community Awards" emoji="🏅" sub="Give up to 5 a day from any post's ••• menu.">
      <div className="grid grid-cols-2 gap-2">
        {AWARDS.map((a) => (
          <div key={a.kind} className="rounded-2xl border border-line p-2.5">
            <div className="text-2xl">{a.emoji}</div>
            <div className="text-sm font-bold">{a.label}</div>
            <div className="text-xs text-muted">{a.blurb}</div>
          </div>
        ))}
      </div>
      <Link href="/leaderboard" className="mt-3 block text-center text-sm font-bold text-brand">
        See the leaderboards →
      </Link>
    </Card>
  );
}

export default function ChaosPage() {
  const { me } = useShell();
  return (
    <div>
      <PageTitle emoji="🌀" sub={`Games, roasts and prompts for tonight. You have ${me.chaos_points} points.`}>
        Chaos Tools
      </PageTitle>
      <div className="space-y-4">
        <ChaosButton />
        <RoastMe />
        <SkillIssue />
        <RateTake />
        <Propaganda />
        <Crisis />
        <BreakingNews />
        <Comeback />
        <Soundboard />
        <DailyChallenge />
        <RoastOfTheDay />
        <AwardsInfo />
      </div>
    </div>
  );
}
