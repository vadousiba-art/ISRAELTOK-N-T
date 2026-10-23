"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("OFFLINE", "You're offline. The internet finally fought back.", 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(e?.code ?? "HTTP", e?.message ?? `Request failed (${res.status})`, res.status);
  }
  return json?.data as T;
}

export function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function get<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return post<T>(`/api/rpc/${fn}`, args);
}

export function ai<T = AiResponse>(tool: string, input: Record<string, unknown> = {}): Promise<T> {
  return post<T>(`/api/ai/${tool}`, input);
}

export type AiResponse = {
  text: string;
  data?: Record<string, unknown>;
  source: "claude" | "offline";
  degraded?: boolean;
  remaining: number | null;
  post_id?: string;
  comment_id?: string;
  message_id?: string;
  kind?: string;
};

type SignResult =
  | { mode: "supabase"; path: string; token: string; kind: "image" | "video" | "gif" }
  | { mode: "demo"; path: string; uploadUrl: string; kind: "image" | "video" | "gif" };

// Two-step upload: the server validates + hands out a one-time slot, then the
// browser sends the bytes straight to storage (or the demo endpoint).
export async function uploadFile(
  file: File,
  getSupabase: () => SupabaseClient | null,
): Promise<{ path: string; kind: "image" | "video" | "gif" }> {
  const slot = await post<SignResult>("/api/upload/sign", { type: file.type, size: file.size });
  if (slot.mode === "supabase") {
    const sb = getSupabase();
    if (!sb) throw new ApiError("NOT_CONFIGURED", "Supabase client unavailable.", 500);
    const { error } = await sb.storage.from("media").uploadToSignedUrl(slot.path, slot.token, file, {
      contentType: file.type,
    });
    if (error) throw new ApiError("UPLOAD", `Upload failed: ${error.message}`, 400);
  } else {
    await request(slot.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  }
  return { path: slot.path, kind: slot.kind };
}

export function mediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/") || url.startsWith("http")) return url;
  return `/api/media/${url}`;
}
