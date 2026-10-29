"use client";

import { ApiError, get, post } from "./api";

// Push notifications in the browser (website, installed web app and the
// Android app, which runs YORU in Chrome). The permission prompt is only ever
// shown from a tap on a YORU button, never on page load.

export type PushStatus =
  | "unsupported" // this browser can't do push
  | "needs-install" // iPhone/iPad: works once YORU is added to the Home Screen
  | "blocked" // the member said no in the browser's prompt or settings
  | "off"
  | "on"
  | "unavailable"; // the server isn't set up for push

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const ios = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : ios() ? "iPhone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const app = /YORU-App|wv\)/.test(ua) || (standalone() && /Android/.test(ua)) ? "YORU app" : /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${app} on ${os}`;
}

let reg: Promise<ServiceWorkerRegistration> | null = null;
export function registration() {
  reg ??= navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready);
  return reg;
}

let key: Promise<{ publicKey: string | null; enabled: boolean }> | null = null;
const serverKey = () => (key ??= get<{ publicKey: string | null; enabled: boolean }>("/api/push"));

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return ios() && !standalone() ? "needs-install" : "unsupported";
  if (ios() && !standalone()) return "needs-install";
  if (Notification.permission === "denied") return "blocked";
  const k = await serverKey().catch(() => null);
  if (!k?.enabled || !k.publicKey) return "unavailable";
  if (Notification.permission !== "granted") return "off";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub ? "on" : "off";
}

function urlBase64ToBytes(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Must be called from a tap: asks permission, subscribes this device and
// tells YORU where to send. Optionally sends a test straight away.
export async function enablePush(test = true): Promise<PushStatus> {
  if (!supported()) throw new ApiError("UNSUPPORTED", ios() ? "On iPhone, add YORU to your Home Screen first (Share → Add to Home Screen), then turn notifications on from there." : "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.", 0);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const k = await serverKey();
  if (!k.enabled || !k.publicKey) throw new ApiError("NOT_CONFIGURED", "Push notifications aren't switched on for YORU yet.", 503);
  const r = await registration();
  let sub = await r.pushManager.getSubscription();
  if (sub && sub.options.applicationServerKey) {
    // A subscription made for a different key (e.g. after a key change) has to be replaced.
    const have = new Uint8Array(sub.options.applicationServerKey);
    const want = urlBase64ToBytes(k.publicKey);
    if (have.length !== want.length || have.some((b, i) => b !== want[i])) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  sub ??= await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(k.publicKey) });
  await post("/api/push", { subscription: sub.toJSON(), device: deviceName(), test });
  sessionStorage.setItem("yoru-push-synced", "1");
  return "on";
}

export async function sendTestPush() {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) throw new ApiError("INVALID", "Notifications aren't on for this device yet.", 400);
  await post("/api/push", { subscription: sub.toJSON(), device: deviceName(), test: true });
}

export async function disablePush(): Promise<PushStatus> {
  if (!supported()) return "unsupported";
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

// Quietly, once per visit: make sure this device's subscription belongs to the
// member who is signed in now (another account may have used this browser),
// and clear the app icon badge while YORU is open.
export async function syncPush() {
  if (!supported() || Notification.permission !== "granted") return;
  if ("clearAppBadge" in navigator) (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
  if (sessionStorage.getItem("yoru-push-synced")) return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await post("/api/push", { subscription: sub.toJSON(), device: deviceName() }).catch(() => {});
  sessionStorage.setItem("yoru-push-synced", "1");
}
