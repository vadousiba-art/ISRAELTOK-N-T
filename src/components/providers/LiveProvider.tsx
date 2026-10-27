"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { useApp } from "./AppProvider";
import { byFn, refreshFeeds } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import type { LiveEvent } from "@/lib/types";
import { celebrateLevelUp } from "@/lib/progress";

type Listener = (e: LiveEvent) => void;
type LiveCtx = { subscribe: (l: Listener) => () => void };
const Ctx = createContext<LiveCtx | null>(null);

// Realtime fan-out. Events only carry ids; components refetch through the RPCs.
//   postgres_changes  data on Supabase: one channel, RLS decides what each user receives
//   broadcast         data on Neon: the server relays committed changes to two private
//                     Broadcast topics (this user's own, and all members); Realtime
//                     Authorization only lets a user join their own user topic
//   sse               demo login: the /api/live Server-Sent Events stream
export function LiveProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { config, supabase, toast } = useApp();
  const listeners = useRef(new Set<Listener>());
  const { mutate } = useSWRConfig();

  const emit = useCallback(
    (e: LiveEvent) => {
      if (e.type === "notification") {
        mutate(byFn("get_me", "get_notifications"));
        if (e.kind === "level_up") {
          mutate(byFn("get_my_progress"));
          celebrateLevelUp(Number(e.body));
        }
        if (e.kind === "announcement") toast(e.body ?? "New announcement", "info", "📣");
        if (e.kind === "system") {
          mutate(byFn("get_my_progress"));
          toast(e.body ?? "Notice from the admins", "info", "🛡️");
        }
      }
      if (e.type === "message") mutate(byFn("get_me", "get_channels"));
      if (e.type === "story") mutate(byFn("get_stories"));
      if (e.type === "resync") {
        mutate(byFn("get_me", "get_notifications", "get_channels", "get_stories", "get_my_progress"));
        refreshFeeds();
      }
      for (const l of listeners.current) l(e);
    },
    [mutate, toast],
  );

  useEffect(() => {
    if (config.realtime === "sse") {
      let es: EventSource | null = null;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      const connect = () => {
        es = new EventSource("/api/live");
        es.onmessage = (m) => {
          try {
            emit(JSON.parse(m.data));
          } catch {
            /* ignore malformed */
          }
        };
        es.onerror = () => {
          es?.close();
          if (!closed) retry = setTimeout(connect, 3000);
        };
      };
      connect();
      return () => {
        closed = true;
        clearTimeout(retry);
        es?.close();
      };
    }
    const sb = supabase();
    if (!sb) return;
    if (config.realtime === "broadcast") {
      let cancelled = false;
      const channels: ReturnType<typeof sb.channel>[] = [];
      const onLive = ({ payload }: { payload: { events?: LiveEvent[] } }) => {
        for (const e of payload?.events ?? []) emit(e);
      };
      (async () => {
        await sb.realtime.setAuth(); // private topics need the user's access token
        if (cancelled) return;
        for (const topic of [`yoru:u:${userId}`, "yoru:all"]) {
          channels.push(sb.channel(topic, { config: { private: true } }).on("broadcast", { event: "live" }, onLive).subscribe());
        }
      })().catch(() => {});
      return () => {
        cancelled = true;
        for (const ch of channels) sb.removeChannel(ch);
      };
    }
    const ch = sb
      .channel(`itn-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
        const row = (p.new ?? p.old) as { id: string; channel_id: string };
        if (row?.channel_id) emit({ type: "message", channel_id: row.channel_id, id: row.id, op: p.eventType });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (p) => {
        const row = (p.new ?? p.old) as { message_id: string };
        if (row?.message_id) emit({ type: "message", channel_id: "*", id: row.message_id, op: "UPDATE" });
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => {
          const n = p.new as { id: string; kind: string; body: string };
          emit({ type: "notification", id: n.id, kind: n.kind, body: n.body });
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (p) => {
        const row = p.new as { id: string; author_id: string; kind: string };
        if (row.kind !== "repost") emit({ type: "post", id: row.id, author_id: row.author_id });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, (p) =>
        emit({ type: "story", id: (p.new as { id: string }).id }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [config.realtime, supabase, userId, emit]);

  // Presence heartbeat while the tab is visible.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") rpc("touch_presence").catch(() => {});
    };
    beat();
    const t = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  return <Ctx.Provider value={{ subscribe }}>{children}</Ctx.Provider>;
}

export function useLive(handler: Listener) {
  const ctx = useContext(Ctx);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((e) => ref.current(e));
  }, [ctx]);
}
