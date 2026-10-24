import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appMode } from "@/lib/config";
import { DEMO_COOKIE, requireConfigured } from "@/lib/server/db";
import { demoDb } from "@/lib/server/demo/pglite";
import { AppError, errorResponse } from "@/lib/server/errors";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { supabaseForRequest } from "@/lib/server/supabase";

const SupabaseLogin = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });
const DemoLogin = z.object({ user_id: z.uuid() });

export async function POST(req: NextRequest) {
  try {
    requireConfigured();
    if (!limit(`login:${clientIp(req)}`, 10, 60_000)) {
      throw new AppError("RATE_LIMIT", "Too many login attempts. Please wait a minute.", 429);
    }
    const body = await req.json().catch(() => ({}));

    if (appMode() === "demo") {
      const { user_id } = DemoLogin.parse(body);
      const db = await demoDb();
      const ok = await db.query("select 1 from public.profiles where id = $1 and not banned and not is_bot", [user_id]);
      if (!ok.rows.length) throw new AppError("NOT_FOUND", "That demo account does not exist (or got banned).", 404);
      const res = NextResponse.json({ data: { ok: true } });
      res.cookies.set(DEMO_COOKIE, user_id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }

    const parsed = SupabaseLogin.safeParse(body);
    if (!parsed.success) throw new AppError("INVALID", "Enter an email and password.", 400);
    const sb = await supabaseForRequest();
    const { error } = await sb.auth.signInWithPassword(parsed.data);
    if (error) throw new AppError("INVALID", "Wrong email or password. Skill issue.", 401);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    if (err instanceof z.ZodError) return errorResponse(new AppError("INVALID", "Bad login request.", 400));
    return errorResponse(err);
  }
}
