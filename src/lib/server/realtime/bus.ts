import "server-only";
import { EventEmitter } from "node:events";

// In-process event bus for the SSE transport (demo login, one server process).
// "delivery": a routed live event for a topic. "typing": a typing ping.
const g = globalThis as unknown as { __yoruBus?: EventEmitter };

export function liveBus(): EventEmitter {
  if (!g.__yoruBus) {
    g.__yoruBus = new EventEmitter();
    g.__yoruBus.setMaxListeners(1000);
  }
  return g.__yoruBus;
}
