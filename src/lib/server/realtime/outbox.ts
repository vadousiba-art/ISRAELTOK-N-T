import "server-only";
import { waitUntil } from "@vercel/functions";
import { dataBackend, realtimeTransport } from "@/lib/config";
import { supabaseAdmin } from "../supabase";
import { routeChanges, type CapturedChange, type RoutingLookup } from "./routing";
import { publish } from "./publish";

// Supabase data + sharded realtime: changes wait in public.realtime_outbox
// (migration 0006) until a server drains them after a write and relays them
// to the realtime projects. One drain at a time per server instance; requests
// that arrive meanwhile are folded into one more pass.

type Drained = {
  events: (CapturedChange & { t: string })[];
  messages: { id: string; channel_id: string }[];
  channels: { id: string; kind: string; is_private: boolean }[];
  members: { channel_id: string; user_id: string }[];
};

const g = globalThis as unknown as { __yoruDrain?: { running: boolean; again: boolean } };

export function outboxActive() {
  return realtimeTransport() === "sharded" && dataBackend() === "supabase";
}

export function scheduleDrain() {
  if (!outboxActive()) return;
  const state = (g.__yoruDrain ??= { running: false, again: false });
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  const job = (async () => {
    try {
      do {
        state.again = false;
        await drainOnce();
      } while (state.again);
    } catch (err) {
      console.warn("[yoru] realtime outbox drain failed:", (err as Error).message);
    } finally {
      state.running = false;
    }
  })();
  try {
    waitUntil(job);
  } catch {
    /* outside a request the promise simply runs */
  }
}

export function lookupFrom(d: Drained): RoutingLookup {
  return {
    channels: async (ids) => d.channels.filter((c) => ids.includes(c.id)),
    members: async (ids) => d.members.filter((m) => ids.includes(m.channel_id)),
    messageChannels: async (ids) => d.messages.filter((m) => ids.includes(m.id)),
  };
}

export async function relayDrained(d: Drained) {
  const overflow = d.events.some((e) => e.t === "resync");
  const deliveries = await routeChanges(d.events.filter((e) => e.t !== "resync"), overflow, lookupFrom(d));
  await publish(deliveries);
  return deliveries.length;
}

async function drainOnce() {
  for (let round = 0; round < 5; round++) {
    const { data, error } = await supabaseAdmin().rpc("drain_realtime_outbox", { p_limit: 300 });
    if (error) throw new Error(error.message);
    const d = data as Drained;
    if (!d?.events?.length) return;
    await relayDrained(d);
    if (d.events.length < 300) return;
  }
}
