import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appMode } from "@/lib/config";
import { serviceRpc } from "@/lib/server/db";
import { AppError, errorResponse } from "@/lib/server/errors";
import { supabaseAdmin } from "@/lib/server/supabase";
import { UPLOAD_PATH_RE } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Abandoned uploads: files someone uploaded but never attached to a post,
// story, message or avatar (closed the composer, upload error, ...).
// Runs daily from Vercel Cron (vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
//
// Report-only unless UPLOAD_CLEANUP_MODE=delete. Only files older than
// UPLOAD_CLEANUP_MIN_AGE_HOURS (default 48) that no row refers to are removed,
// at most 300 per run.
const MAX_CANDIDATES = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  try {
    if (!authorized(req)) throw new AppError("NOT_FOUND", "Not found.", 404);
    if (appMode() !== "supabase") throw new AppError("NOT_FOUND", "Uploads are local files in demo mode.", 404);
    const deleting = process.env.UPLOAD_CLEANUP_MODE === "delete";
    const minAgeHours = Math.max(24, Number(process.env.UPLOAD_CLEANUP_MIN_AGE_HOURS ?? 48) || 48);
    const cutoff = Date.now() - minAgeHours * 3600_000;
    const bucket = supabaseAdmin().storage.from("media");
    const started = Date.now();

    const candidates: string[] = [];
    let folders = 0;
    for (let offset = 0; candidates.length < MAX_CANDIDATES && Date.now() - started < 30_000; offset += 100) {
      const { data: users, error } = await bucket.list("u", { limit: 100, offset });
      if (error) throw new AppError("INTERNAL", "Could not list the media bucket.", 500);
      if (!users?.length) break;
      for (const u of users) {
        if (candidates.length >= MAX_CANDIDATES) break;
        folders++;
        const { data: files } = await bucket.list(`u/${u.name}`, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
        for (const f of files ?? []) {
          const path = `u/${u.name}/${f.name}`;
          const created = Date.parse(f.created_at ?? "");
          if (UPLOAD_PATH_RE.test(path) && Number.isFinite(created) && created < cutoff) candidates.push(path);
        }
      }
      if (users.length < 100) break;
    }

    const inUse = new Set(candidates.length ? await serviceRpc<string[]>("media_paths_in_use", { p_paths: candidates }) : []);
    const abandoned = candidates.filter((p) => !inUse.has(p));
    let removed = 0;
    if (deleting && abandoned.length) {
      const { data, error } = await bucket.remove(abandoned);
      if (error) throw new AppError("INTERNAL", "Could not remove abandoned uploads.", 500);
      removed = data?.length ?? 0;
    }
    const summary = { mode: deleting ? "delete" : "report", folders_scanned: folders, checked: candidates.length, abandoned: abandoned.length, removed };
    console.log("[yoru] upload cleanup", JSON.stringify(summary));
    return NextResponse.json({ data: summary });
  } catch (err) {
    return errorResponse(err);
  }
}
