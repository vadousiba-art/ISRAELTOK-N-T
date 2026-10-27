import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseProjects } from "@/lib/config";
import { errorResponse, AppError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily (vercel.json): touches every Supabase project so the extra projects,
// which only carry realtime and files, keep showing activity (Supabase Free
// pauses projects after a week without it), and reports which ones answer.
// Requires "Authorization: Bearer $CRON_SECRET" (Vercel sends it).
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
    const results = await Promise.all(
      supabaseProjects().map(async (p) => {
        const started = Date.now();
        try {
          const r = await fetch(`${p.url}/auth/v1/settings`, { headers: { apikey: p.publishableKey }, signal: AbortSignal.timeout(10_000) });
          return { project: p.n, ref: p.ref, ok: r.ok, status: r.status, ms: Date.now() - started };
        } catch {
          return { project: p.n, ref: p.ref, ok: false, status: 0, ms: Date.now() - started };
        }
      }),
    );
    const down = results.filter((r) => !r.ok);
    if (down.length) console.warn("[yoru] supabase projects not answering:", down.map((d) => `${d.project}:${d.status}`).join(", "));
    return NextResponse.json({ data: results });
  } catch (err) {
    return errorResponse(err);
  }
}
