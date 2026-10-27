/**
 * Check every configured Supabase project (docs/seven-projects.md):
 *
 *   npm run shards:check
 *
 * For each project: the URL and publishable key belong together (Auth settings
 * endpoint answers 200), a Realtime Broadcast message really arrives on a
 * throwaway topic, and with a secret key, that the private "media" bucket
 * exists. Reads .env.local / .env. Prints refs, never keys.
 */
import { createRequire } from "node:module";
import "./db/lib.mjs"; // loads .env.local / .env
import { configWarnings, supabaseProjects, type SupabaseProject } from "../src/lib/config";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");

async function pairing(p: SupabaseProject) {
  const r = await fetch(`${p.url}/auth/v1/settings`, { headers: { apikey: p.publishableKey }, signal: AbortSignal.timeout(10000) });
  return r.status;
}

async function realtimeRoundTrip(p: SupabaseProject): Promise<number | string> {
  const sb = createClient(p.url, p.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const topic = `yoru-check-${Math.random().toString(36).slice(2)}`;
  try {
    return await new Promise<number | string>((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), 15000);
      const ch = sb.channel(topic).on("broadcast", { event: "check" }, (m) => {
        clearTimeout(timer);
        resolve(Date.now() - (m.payload as { t: number }).t);
      });
      ch.subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const r = await fetch(`${p.url}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: { apikey: p.publishableKey, "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ topic, event: "check", payload: { t: Date.now() } }] }),
        });
        if (!r.ok) {
          clearTimeout(timer);
          resolve(`send HTTP ${r.status}`);
        }
      });
    });
  } finally {
    await sb.removeAllChannels();
  }
}

async function bucket(p: SupabaseProject) {
  if (!p.secretKey) return "no secret key (storage off)";
  const sb = createClient(p.url, p.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.storage.getBucket("media");
  if (error || !data) return `missing (${error?.message ?? "not found"}): run npm run shards:setup`;
  return data.public ? "PUBLIC (must be private!)" : "ok (private)";
}

for (const w of configWarnings()) console.log(`! ${w}`);
const projects = supabaseProjects();
if (!projects.length) {
  console.error("No Supabase projects configured. See docs/seven-projects.md.");
  process.exit(1);
}
let bad = 0;
for (const p of projects) {
  const label = `project ${p.n}${p.primary ? " (original)" : ""} ${p.ref}`;
  const status = await pairing(p).catch(() => 0);
  if (status !== 200) {
    bad++;
    console.log(`✗ ${label}: key does not belong to this project (HTTP ${status})`);
    continue;
  }
  const rt = await realtimeRoundTrip(p).catch((e) => String(e));
  const store = await bucket(p).catch((e) => String(e));
  if (typeof rt !== "number") bad++;
  console.log(`${typeof rt === "number" ? "✓" : "✗"} ${label}: key ok · realtime ${typeof rt === "number" ? `${rt} ms` : rt} · storage ${store}`);
}
process.exit(bad ? 1 : 0);
