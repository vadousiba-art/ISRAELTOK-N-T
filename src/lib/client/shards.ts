"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Realtime-only clients for the extra Supabase projects (sharded live
// updates). No login state: they only join public Broadcast topics whose
// names the server hands out. One client per project, shared by the page.
export type Shard = { n: number; url: string; key: string };

const clients = new Map<string, SupabaseClient>();

export function shardClient(shard: Shard): SupabaseClient {
  let c = clients.get(shard.url);
  if (!c) {
    c = createClient(shard.url, shard.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `yoru-shard-${shard.n}` },
    });
    clients.set(shard.url, c);
  }
  return c;
}
