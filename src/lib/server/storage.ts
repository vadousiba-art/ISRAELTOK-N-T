import "server-only";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseProjects, uploadProjects, type SupabaseProject } from "@/lib/config";
import { AppError } from "./errors";
import { supabaseAdmin } from "./supabase";

// Media spread over the Supabase projects. A stored path says where the file
// lives:
//   u/<user>/<file>        the original project (every file before this change)
//   s<n>/u/<user>/<file>   project n (new uploads, when it has a secret key)
// Inside each project's private "media" bucket the object is always
// u/<user>/<file>. Files never move; only new uploads are spread.

const g = globalThis as unknown as { __yoruStorage?: Map<number, SupabaseClient> };

export function splitMediaPath(path: string): { n: number | null; objectPath: string } {
  const m = path.match(/^s([1-7])\/(u\/.+)$/);
  return m ? { n: Number(m[1]), objectPath: m[2] } : { n: null, objectPath: path };
}

function projectFor(n: number | null): SupabaseProject | null {
  if (n === null) return null;
  const p = supabaseProjects().find((x) => x.n === n);
  return p && !p.primary ? p : null;
}

// Service-level storage client for the project that holds `path`.
export function storageFor(path: string) {
  const { n, objectPath } = splitMediaPath(path);
  if (n === null) return { bucket: supabaseAdmin().storage.from("media"), objectPath, project: null };
  const p = projectFor(n);
  if (!p?.secretKey) throw new AppError("NOT_FOUND", "That file's storage project is not configured.", 404);
  const cache = (g.__yoruStorage ??= new Map());
  let client = cache.get(p.n);
  if (!client) {
    client = createClient(p.url, p.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    cache.set(p.n, client);
  }
  return { bucket: client.storage.from("media"), objectPath, project: p };
}

// Where a new upload goes: an even random spread over the projects that
// accept uploads (the original included). Stored paths carry the choice.
export function newMediaLocation(objectPath: string): { path: string; project: SupabaseProject | null } {
  const targets = uploadProjects();
  if (!targets.length) return { path: objectPath, project: null };
  const pick = targets[crypto.randomInt(targets.length)];
  return pick.primary ? { path: objectPath, project: null } : { path: `s${pick.n}/${objectPath}`, project: pick };
}

// Every project that may hold someone's files (deletion, cleanup).
export function allMediaBuckets() {
  const out: { prefix: string; bucket: ReturnType<SupabaseClient["storage"]["from"]> }[] = [
    { prefix: "", bucket: supabaseAdmin().storage.from("media") },
  ];
  for (const p of supabaseProjects()) {
    if (p.primary || !p.secretKey) continue;
    out.push({ prefix: `s${p.n}/`, bucket: storageFor(`s${p.n}/u/x`).bucket });
  }
  return out;
}
