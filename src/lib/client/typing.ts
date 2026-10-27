"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useApp } from "@/components/providers/AppProvider";
import { useLive } from "@/components/providers/LiveProvider";
import { get, post } from "./api";
import { shardClient, type Shard } from "./shards";

// Typing indicators. Supabase: Realtime broadcast on a per-channel topic.
// Sharded: the same, on the chat's assigned project under a secret topic name
// (only members get it from /api/live/topics). Demo: POST to /api/live/typing,
// delivered back over the SSE stream.
export function useTyping(channelId: string, me: { id: string; display_name: string }) {
  const { config, supabase } = useApp();
  const [typists, setTypists] = useState<Record<string, { name: string; until: number }>>({});
  const lastSent = useRef(0);
  const rt = useRef<RealtimeChannel | null>(null);

  const note = useCallback(
    (userId: string, name: string) => {
      if (userId === me.id) return;
      setTypists((t) => ({ ...t, [userId]: { name, until: Date.now() + 4000 } }));
    },
    [me.id],
  );

  useEffect(() => {
    if (config.realtime !== "sharded") return;
    let cancelled = false;
    let cleanup = () => {};
    get<{ project: Shard; topic: string }>(`/api/live/topics?channel=${channelId}`)
      .then(({ project, topic }) => {
        if (cancelled) return;
        const sc = shardClient(project);
        const ch = sc.channel(topic, { config: { broadcast: { self: false } } });
        ch.on("broadcast", { event: "typing" }, ({ payload }) => note(payload.user_id, payload.name)).subscribe();
        rt.current = ch;
        cleanup = () => {
          sc.removeChannel(ch);
          rt.current = null;
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [config.realtime, channelId, note]);

  useEffect(() => {
    if (config.mode !== "supabase" || config.realtime === "sharded") return;
    const sb = supabase();
    if (!sb) return;
    const ch = sb.channel(`typing:${channelId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => note(payload.user_id, payload.name)).subscribe();
    rt.current = ch;
    return () => {
      sb.removeChannel(ch);
      rt.current = null;
    };
  }, [config.mode, config.realtime, supabase, channelId, note]);

  useLive((e) => {
    if (e.type === "typing" && e.channel_id === channelId) note(e.user_id, e.name);
    if (e.type === "message" && e.channel_id === channelId) setTypists({});
  });

  useEffect(() => {
    const t = setInterval(() => {
      setTypists((all) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(all).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(all).length ? all : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const ping = useCallback(() => {
    if (Date.now() - lastSent.current < 2500) return;
    lastSent.current = Date.now();
    if (config.mode === "supabase" || config.realtime === "sharded") {
      rt.current?.send({ type: "broadcast", event: "typing", payload: { user_id: me.id, name: me.display_name } });
    } else {
      post("/api/live/typing", { channel_id: channelId }).catch(() => {});
    }
  }, [config.mode, config.realtime, channelId, me.id, me.display_name]);

  return { typing: Object.values(typists).map((t) => t.name), ping };
}
