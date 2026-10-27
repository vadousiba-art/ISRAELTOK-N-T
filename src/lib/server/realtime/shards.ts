import "server-only";
import crypto from "node:crypto";
import { realtimeShards, supabaseServiceKey, type SupabaseProject } from "@/lib/config";
import type { LiveEvent } from "@/lib/types";
import { ALL_TOPIC, type Delivery } from "./routing";

// Live updates spread over the Supabase projects (REALTIME_SHARDS=on).
//
// Each person is assigned to ONE project by a stable hash of their id and
// opens a single websocket there, so concurrent connections and messages are
// shared between all projects instead of hitting one project's limits.
// Topics are public Broadcast channels on those projects, named with an HMAC
// of the logical topic under a server-only secret: unguessable, and only
// handed to the signed-in person they belong to (/api/live/topics). Events
// carry ids only (plus a person's own notification text); clients refetch
// through the RPCs, which re-check access.

const g = globalThis as unknown as { __yoruTopicSecret?: string };

function topicSecret(): string | null {
  if (g.__yoruTopicSecret) return g.__yoruTopicSecret;
  const explicit = process.env.REALTIME_TOPIC_SECRET?.trim();
  const service = supabaseServiceKey();
  if (explicit) g.__yoruTopicSecret = explicit;
  else if (service) g.__yoruTopicSecret = crypto.createHmac("sha256", service).update("yoru-realtime-topics").digest("hex");
  // Local demo only: a per-process secret (single server).
  else if (process.env.NODE_ENV !== "production") g.__yoruTopicSecret = crypto.randomBytes(32).toString("hex");
  return g.__yoruTopicSecret ?? null;
}

export function shardsReady(): boolean {
  return realtimeShards().length > 0 && topicSecret() !== null;
}

export function physicalTopic(logical: string): string {
  const secret = topicSecret();
  if (!secret) throw new Error("no realtime topic secret");
  return `yoru:${crypto.createHmac("sha256", secret).update(logical).digest("hex").slice(0, 32)}`;
}

// Stable assignment: the same key always lands on the same project while the
// project list is unchanged.
export function shardFor(key: string, shards = realtimeShards()): SupabaseProject {
  const sorted = [...shards].sort((a, b) => a.n - b.n);
  const h = crypto.createHash("sha256").update(key).digest().readUInt32BE(0);
  return sorted[h % sorted.length];
}

export const publicShard = (p: SupabaseProject) => ({ n: p.n, url: p.url, key: p.publishableKey });

export function userTopics(userId: string) {
  return {
    project: publicShard(shardFor(`u:${userId}`)),
    userTopic: physicalTopic(`u:${userId}`),
    allTopic: physicalTopic("all"),
  };
}

export function typingTopic(channelId: string) {
  return { project: publicShard(shardFor(`c:${channelId}`)), topic: physicalTopic(`typing:${channelId}`) };
}

type Message = { topic: string; event: "live"; payload: { events: LiveEvent[] } };

// Maps logical deliveries to (project, physical topic) and sends one batched
// request per project. The all-members topic goes to every project, because
// each person listens on their own project only.
export function planSharded(deliveries: Delivery[], shards = realtimeShards()) {
  const perProject = new Map<number, { project: SupabaseProject; topics: Map<string, LiveEvent[]> }>();
  const add = (project: SupabaseProject, topic: string, e: LiveEvent) => {
    const slot = perProject.get(project.n) ?? { project, topics: new Map() };
    slot.topics.set(topic, [...(slot.topics.get(topic) ?? []), e]);
    perProject.set(project.n, slot);
  };
  for (const d of deliveries) {
    if (d.topic === ALL_TOPIC) {
      const topic = physicalTopic("all");
      for (const p of shards) add(p, topic, d.event);
    } else if (d.topic.startsWith("yoru:u:")) {
      const uid = d.topic.slice("yoru:u:".length);
      add(shardFor(`u:${uid}`, shards), physicalTopic(`u:${uid}`), d.event);
    }
  }
  return [...perProject.values()].map(({ project, topics }) => ({
    project,
    messages: [...topics].map(([topic, events]): Message => ({ topic, event: "live", payload: { events } })),
  }));
}

// Supabase Realtime Broadcast REST, batch form (public channels accept the
// project's publishable key): POST {url}/realtime/v1/api/broadcast
// https://supabase.com/docs/guides/realtime/broadcast
export async function publishSharded(deliveries: Delivery[]): Promise<void> {
  if (!deliveries.length || !shardsReady()) return;
  const jobs = planSharded(deliveries).flatMap(({ project, messages }) => {
    const chunks: Message[][] = [];
    for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));
    return chunks.map((chunk) => () => send(project, chunk));
  });
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(7, jobs.length) }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) if (!(await job())) failed++;
    }),
  );
  if (failed) console.warn(`[yoru] realtime: ${failed} batch(es) not delivered`);
}

async function send(project: SupabaseProject, messages: Message[]): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${project.url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { apikey: project.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
      if (res.status < 500 && res.status !== 429) {
        console.warn(`[yoru] realtime project ${project.n} rejected a batch (${res.status})`);
        return false;
      }
    } catch {
      /* network error or timeout: retry once */
    }
  }
  return false;
}
