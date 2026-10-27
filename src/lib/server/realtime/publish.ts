import "server-only";
import { realtimeTransport, supabaseServiceKey, supabaseUrl } from "@/lib/config";
import { liveBus } from "./bus";
import { byTopic, type Delivery } from "./routing";

// Sends routed live events. Best effort: the write already committed, and
// every screen also refreshes on its own, so a failed send is logged and never
// turned into an error for the person who made the change.
export async function publish(deliveries: Delivery[]): Promise<void> {
  if (!deliveries.length) return;
  const transport = realtimeTransport();
  if (transport === "sse") {
    for (const d of deliveries) liveBus().emit("delivery", d);
    return;
  }
  if (transport === "broadcast") await broadcast(deliveries);
}

let warned = false;

// Supabase Realtime Broadcast over REST, one message per private topic:
// POST {SUPABASE_URL}/realtime/v1/api/broadcast/{topic}/events/{event}?private=true
// https://supabase.com/docs/guides/realtime/broadcast
async function broadcast(deliveries: Delivery[]) {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) {
    if (!warned) console.warn("[yoru] realtime relay disabled: SUPABASE_SERVICE_ROLE_KEY is not set");
    warned = true;
    return;
  }
  const jobs = [...byTopic(deliveries)].map(([topic, events]) => () => send(url, key, topic, events));
  let failed = 0;
  const workers = Array.from({ length: Math.min(6, jobs.length) }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) if (!(await job())) failed++;
  });
  await Promise.all(workers);
  if (failed) console.warn(`[yoru] realtime relay: ${failed} topic(s) not delivered`);
}

async function send(base: string, key: string, topic: string, events: unknown[]): Promise<boolean> {
  const endpoint = `${base.replace(/\/$/, "")}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/live?private=true`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
      if (res.status < 500 && res.status !== 429) {
        console.warn(`[yoru] realtime relay rejected (${res.status}) for ${topic.startsWith("yoru:u:") ? "a user topic" : topic}`);
        return false;
      }
    } catch {
      /* network error or timeout: retry once */
    }
  }
  return false;
}
