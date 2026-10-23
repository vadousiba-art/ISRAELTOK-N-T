"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { Me } from "@/lib/types";

export const rpcKey = (fn: string, args: Record<string, unknown> = {}) => ["rpc", fn, args] as const;

export function useRpc<T>(fn: string | null, args: Record<string, unknown> = {}, opts?: SWRConfiguration<T>) {
  return useSWR<T>(fn ? rpcKey(fn, args) : null, opts);
}

export function useMe() {
  return useRpc<Me>("get_me", {}, { refreshInterval: 60_000 });
}

// Matches any cached RPC key with this function name (for broad revalidation).
export const byFn =
  (...fns: string[]) =>
  (key: unknown) =>
    Array.isArray(key) && key[0] === "rpc" && fns.includes(key[1] as string);

// Infinite feeds are skipped by SWR key filters, so they listen for this event.
export const FEED_REFRESH_EVENT = "itn:feeds";
export function refreshFeeds() {
  window.dispatchEvent(new Event(FEED_REFRESH_EVENT));
}
