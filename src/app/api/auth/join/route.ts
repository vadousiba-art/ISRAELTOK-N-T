import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appMode } from "@/lib/config";
import { DEMO_COOKIE, requireConfigured, serviceRpc } from "@/lib/server/db";
import { demoDb } from "@/lib/server/demo/pglite";
import { AppError, errorResponse, toAppError } from "@/lib/server/errors";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { supabaseAdmin, supabaseForRequest } from "@/lib/server/supabase";

const Join = z.object({
  code: z.string().max(40).optional().default(""),
  email: z.email().max(200),
  password: z.string().min(8, "Password needs 8+ characters").max(200),
  username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/, "Username: 3-20 letters, numbers or _"),
  display_name: z.string().trim().min(1).max(40),
});

export async function POST(req: NextRequest) {
  try {
    requireConfigured();
    if (!limit(`join:${clientIp(req)}`, 5, 60_000)) {
      throw new AppError("RATE_LIMIT", "Slow down. One identity crisis at a time.", 429);
    }
    const body = await req.json().catch(() => ({}));
    // Demo accounts have no password (demo login is an account picker).
    const parsed = Join.safeParse(appMode() === "demo" ? { ...body, password: "demo-mode-no-password" } : body);
    if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Invalid sign-up.", 400);
    const input = parsed.data;

    const invite = await serviceRpc<{ valid: boolean; first_user?: boolean; reason?: string }>("check_invite", {
      p_code: input.code,
    });
    if (!invite.valid) throw new AppError("INVALID_INVITE", "That invite is dead. Like your social life.", 400);
    const free = await serviceRpc<boolean>("username_available", { p_username: input.username });
    if (!free) throw new AppError("USERNAME_TAKEN", "Username already taken. Be original for once.", 409);

    const meta = { username: input.username, display_name: input.display_name, invite_code: input.code };

    if (appMode() === "demo") {
      const db = await demoDb();
      let id: string;
      try {
        const r = await db.query<{ id: string }>(
          "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
          [input.email.toLowerCase(), JSON.stringify(meta)],
        );
        id = r.rows[0].id;
      } catch (err) {
        const e = toAppError(err);
        if (e.status === 409) throw new AppError("INVALID", "That email already has an account.", 409);
        throw e;
      }
      const res = NextResponse.json({ data: { ok: true } });
      res.cookies.set(DEMO_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      return res;
    }

    // The handle_new_user trigger re-validates and consumes the invite
    // atomically, so a race between two sign-ups cannot exceed max_uses.
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) {
      if (/already/i.test(error.message)) throw new AppError("INVALID", "That email already has an account.", 409);
      throw new AppError("INVALID_INVITE", "Sign-up failed. The invite may have just run out — ask for a fresh one.", 400);
    }
    const sb = await supabaseForRequest();
    const { error: loginError } = await sb.auth.signInWithPassword({ email: input.email, password: input.password });
    if (loginError) throw new AppError("INTERNAL", "Account created, but auto-login failed. Try logging in.", 500);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return errorResponse(err);
  }
}
