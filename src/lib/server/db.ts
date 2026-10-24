import "server-only";
import { cookies } from "next/headers";
import { appMode } from "@/lib/config";
import { AppError, toAppError } from "./errors";
import { supabaseAdmin, supabaseForRequest } from "./supabase";
import { demoDb, demoRpc } from "./demo/pglite";

export const DEMO_COOKIE = "itn_demo_uid";

// One interface over both backends. Every call runs a Postgres function from
// supabase/migrations — through PostgREST on Supabase, or inside the embedded
// PGlite database in demo mode. RLS and the function's own checks apply.
export interface Db {
  userId: string;
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export function requireConfigured() {
  if (appMode() === "unconfigured") {
    throw new AppError("NOT_CONFIGURED", "This server has no database configured. See the setup page.", 503);
  }
}

async function currentDemoUser(): Promise<string | null> {
  const store = await cookies();
  const uid = store.get(DEMO_COOKIE)?.value;
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  const db = await demoDb();
  const r = await db.query<{ id: string }>(
    "select id from public.profiles where id = $1 and not banned and not is_bot",
    [uid],
  );
  return r.rows[0]?.id ?? null;
}

export async function getUserId(): Promise<string | null> {
  const mode = appMode();
  if (mode === "demo") return currentDemoUser();
  if (mode === "supabase") {
    const sb = await supabaseForRequest();
    const { data } = await sb.auth.getUser();
    return data.user?.id ?? null;
  }
  return null;
}

export async function getUserDb(): Promise<Db> {
  requireConfigured();
  const mode = appMode();
  if (mode === "demo") {
    const uid = await currentDemoUser();
    if (!uid) throw new AppError("UNAUTHENTICATED", "Please log in first.", 401);
    return {
      userId: uid,
      rpc: async (fn, args) => {
        try {
          return await demoRpc(uid, fn, args);
        } catch (err) {
          throw toAppError(err);
        }
      },
    };
  }
  const sb = await supabaseForRequest();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new AppError("UNAUTHENTICATED", "Please log in first.", 401);
  return {
    userId: data.user.id,
    rpc: async (fn, args) => {
      const { data: out, error } = await sb.rpc(fn, args ?? {});
      if (error) throw toAppError(error);
      return out;
    },
  };
}

// Service-level calls (bot posts, invite checks). Never exposed to clients.
export async function serviceRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  requireConfigured();
  try {
    if (appMode() === "demo") return await demoRpc<T>(null, fn, args);
    const { data, error } = await supabaseAdmin().rpc(fn, args);
    if (error) throw error;
    return data as T;
  } catch (err) {
    throw toAppError(err);
  }
}
