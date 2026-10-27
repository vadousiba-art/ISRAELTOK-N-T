import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { aiConfig, appMode, configProblems, dataBackend, realtimeTransport, supabaseServiceKey } from "@/lib/config";
import { pgHealth } from "@/lib/server/postgres";

export const dynamic = "force-dynamic";

// Public, non-sensitive configuration status (no secrets, just booleans).
// With "Authorization: Bearer $CRON_SECRET" it also checks the database
// connection. That probe is not public: anyone polling it would keep a
// scale-to-zero database (Neon) awake and burn its free compute hours.
function deep(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  const mode = appMode();
  const problems = configProblems();
  const body: Record<string, unknown> = {
    ok: mode !== "unconfigured" && problems.length === 0,
    mode,
    database: dataBackend(),
    realtime: realtimeTransport(),
    ai: Boolean(aiConfig().apiKey),
    serviceRole: mode === "supabase" ? Boolean(supabaseServiceKey()) : null,
    problems,
  };
  if (deep(req) && dataBackend() === "postgres" && problems.length === 0) {
    try {
      body.db = await pgHealth();
    } catch (err) {
      body.ok = false;
      body.db = { error: (err as { code?: string }).code ?? "unreachable" };
    }
  }
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
