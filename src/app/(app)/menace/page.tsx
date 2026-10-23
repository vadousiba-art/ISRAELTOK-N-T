"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Send, ShieldCheck, Trash2 } from "lucide-react";
import { useSWRConfig } from "swr";
import { ai, rpc, type AiResponse } from "@/lib/client/api";
import { byFn, useRpc } from "@/lib/client/hooks";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Toggle, VerifiedBadge } from "@/components/ui/bits";
import { IntensityPicker } from "@/components/menace/IntensityPicker";
import { randomLoading } from "@/lib/jokes";
import type { AiMessage } from "@/lib/types";

const PROMPTS = [
  "Roast me. I can take it (I can't).",
  "Rate my take: pineapple on pizza is a war crime",
  "Invent a diplomatic crisis between me and my alarm clock",
  "Write breaking news about my sleep schedule",
  "Explain the group chat like it's a UN security briefing",
  "Give me a comeback for 'touch grass'",
];

export default function MenacePage() {
  const { me } = useShell();
  const { toastError, toast } = useApp();
  const { mutate } = useSWRConfig();
  const { data: history, mutate: mutateHistory } = useRpc<AiMessage[]>("get_ai_history", { p_limit: 60 });
  const [pending, setPending] = useState<{ q: string } | null>(null);
  const [text, setText] = useState("");
  const [level, setLevel] = useState<1 | 2 | 3>(me.roast_intensity);
  const [offline, setOffline] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [thinking, setThinking] = useState(randomLoading());

  useLayoutEffect(() => {
    if (history?.length || pending) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [history?.length, pending]);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setThinking(randomLoading()), 1800);
    return () => clearInterval(t);
  }, [pending]);

  async function send(msg: string) {
    const q = msg.trim();
    if (!q || pending) return;
    setPending({ q });
    setText("");
    try {
      const r = await ai<AiResponse>("chat", { message: q, intensity: level });
      setOffline(r.source === "offline");
      setRemaining(r.remaining);
      await mutateHistory();
      mutate(byFn("get_me"));
    } catch (err) {
      toastError(err);
      setText(q);
    } finally {
      setPending(null);
    }
  }

  async function setContext(v: boolean) {
    try {
      await rpc("update_my_profile", { p: { ai_context_opt_in: v } });
      mutate(byFn("get_me"));
      toast(v ? "The Menace can now read your bio, status, inside jokes & recent posts." : "Personal context revoked. The Menace knows nothing.", "info", v ? "🔓" : "🔒");
    } catch (err) {
      toastError(err);
    }
  }

  async function clear() {
    if (!confirm("Wipe your Menace chat history?")) return;
    await rpc("clear_ai_history").catch(toastError);
    mutateHistory();
  }

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-4">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-roast/20 blur-3xl" aria-hidden />
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
            <Avatar src="/seed/avatar-menace.png" name="The AI Menace" size={60} ring="gradient" online />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-lg font-black">
              The AI Menace <VerifiedBadge />
            </div>
            <div className="text-sm text-muted">@UNHatingAmbassador · online and unhinged</div>
          </div>
          {history && history.length > 0 && (
            <button onClick={clear} className="rounded-full p-2 text-muted hover:bg-card-2 hover:text-hot" aria-label="Clear chat history">
              <Trash2 size={18} />
            </button>
          )}
        </div>
        <div className="mt-4">
          <IntensityPicker value={level} onChange={setLevel} />
        </div>
        <div className="mt-3 rounded-2xl border border-line bg-card-2/60 px-3">
          <Toggle
            checked={me.ai_context_opt_in}
            onChange={setContext}
            label="Personalized roasts"
            description="Let the Menace read your bio, status, inside jokes and your own recent posts. Never your DMs or chats."
          />
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
          <ShieldCheck size={14} className="mt-px shrink-0 text-online" />
          The Menace only sees what you type here (plus your profile if you opt in). Others can only be roasted if they opted in at{" "}
          <Link href="/settings" className="underline">
            settings
          </Link>
          .
        </p>
      </div>

      <div className="space-y-3">
        {history?.length === 0 && !pending && (
          <div className="card p-4 text-center">
            <div className="text-4xl">🤖</div>
            <p className="mt-2 font-bold">Say something. The Menace is bored and dangerous.</p>
          </div>
        )}
        {history?.map((m) => (
          <ChatLine key={m.id} role={m.role} content={m.content} me={me} />
        ))}
        {pending && (
          <>
            <ChatLine role="user" content={pending.q} me={me} />
            <div className="flex items-center gap-2 pl-11 text-sm text-muted">
              <Loader2 size={16} className="animate-spin text-roast" /> {thinking}
            </div>
          </>
        )}
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={!!pending}
            className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold hover:border-roast hover:text-roast"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
        <div className="flex items-end gap-2 rounded-3xl border border-roast/40 bg-card p-2 shadow-2xl shadow-roast/10">
          <textarea
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder="Talk to the Menace..."
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
            aria-label="Message the AI Menace"
          />
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => send(text)}
            disabled={!text.trim() || !!pending}
            className="rounded-full bg-gradient-to-r from-hot to-volt p-2.5 text-white disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={18} />
          </motion.button>
        </div>
        <AnimatePresence>
          {(offline || remaining !== null) && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 px-3 text-center text-[11px] text-muted">
              {offline ? "⚡ Menace Lite (offline mode — no API key configured). " : ""}
              {remaining !== null ? `${remaining} Menace calls left today.` : ""}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ChatLine({ role, content, me }: { role: "user" | "assistant"; content: string; me: { avatar_url: string | null; display_name: string } }) {
  const mine = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
    >
      {mine ? (
        <Avatar src={me.avatar_url} name={me.display_name} size={32} />
      ) : (
        <Avatar src="/seed/avatar-menace.png" name="AI Menace" size={32} />
      )}
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[15px] leading-snug ${
          mine ? "rounded-br-lg bg-brand text-white" : "rounded-bl-lg border border-roast/40 bg-gradient-to-br from-roast/15 to-volt/15"
        }`}
      >
        {content}
      </div>
    </motion.div>
  );
}
