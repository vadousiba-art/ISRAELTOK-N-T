import "server-only";
import webpush from "web-push";
import { waitUntil } from "@vercel/functions";
import { pushConfig } from "@/lib/config";
import { wordPush, type PushItem, type PushPayload } from "@/lib/push";
import { serviceRpc } from "./db";

// Sends queued notifications to members' devices (Web Push). Runs in the
// background after a request that may have created notifications, one pass
// at a time per server instance; the daily cron is a backstop. Payloads are
// encrypted for each device (only that browser can read them) and signed with
// YORU's VAPID key so push services know they come from us.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://yoru-social.vercel.app";
let configured = false;

export function pushReady() {
  const cfg = pushConfig();
  if (!cfg.publicKey || !cfg.privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    configured = true;
  }
  return true;
}

type Claimed = PushItem & { devices: { endpoint: string; p256dh: string; auth: string }[] };
const g = globalThis as unknown as { __yoruPush?: { running: boolean; again: boolean } };

export function schedulePush() {
  if (!pushReady()) return;
  const state = (g.__yoruPush ??= { running: false, again: false });
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  const job = (async () => {
    try {
      do {
        state.again = false;
        await sendQueued();
      } while (state.again);
    } catch (err) {
      console.warn("[yoru] push send failed:", (err as Error).message);
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

export async function sendQueued(): Promise<{ sent: number; gone: number; failed: number }> {
  const total = { sent: 0, gone: 0, failed: 0 };
  if (!pushReady()) return total;
  for (let round = 0; round < 5; round++) {
    const items = await serviceRpc<Claimed[]>("push_claim", { p_limit: 100 });
    if (!items?.length) break;
    const r = await deliver(items.flatMap((n) => n.devices.map((d) => ({ device: d, payload: wordPush(n, SITE), urgent: n.kind === "message" }))));
    total.sent += r.ok.length;
    total.gone += r.gone.length;
    total.failed += r.failed.length;
    if (items.length < 100) break;
  }
  return total;
}

type Job = { device: { endpoint: string; p256dh: string; auth: string }; payload: PushPayload; urgent?: boolean };

export async function deliver(jobs: Job[]) {
  const ok: string[] = [];
  const gone: string[] = [];
  const failed: string[] = [];
  // A handful at a time keeps memory and sockets low on small servers.
  for (let i = 0; i < jobs.length; i += 20) {
    await Promise.all(jobs.slice(i, i + 20).map(async ({ device, payload, urgent }) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: urgent ? "high" : "normal", topic: topic(payload.tag), timeout: 10_000 },
        );
        ok.push(device.endpoint);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(device.endpoint);
        else {
          failed.push(device.endpoint);
          console.warn("[yoru] push to", new URL(device.endpoint).host, "failed:", status ?? (err as Error).message);
        }
      }
    }));
  }
  if (ok.length || gone.length || failed.length) {
    await serviceRpc("push_report", { p_ok: ok, p_gone: gone, p_failed: failed }).catch(() => null);
  }
  return { ok, gone, failed };
}

// Push services accept a topic of up to 32 URL-safe characters; pushes with
// the same topic replace each other while waiting for an offline device.
function topic(tag: string) {
  return tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined;
}
