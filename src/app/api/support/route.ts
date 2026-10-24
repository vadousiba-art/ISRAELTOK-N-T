import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserId, requireConfigured, serviceRpc } from "@/lib/server/db";
import { AppError, errorResponse } from "@/lib/server/errors";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { SUPPORT_TOPICS } from "@/lib/support";

const Body = z.object({
  email: z.union([z.email().max(200), z.literal("")]).optional(),
  topic: z.enum(SUPPORT_TOPICS),
  message: z.string().trim().min(5, "Please write a little more.").max(2000),
  // Honeypot: real people never fill this hidden field.
  website: z.string().max(0).optional(),
});

// Public contact form (works signed out, e.g. for deletion requests).
export async function POST(req: NextRequest) {
  try {
    requireConfigured();
    if (!limit(`support:${clientIp(req)}`, 5, 10 * 60_000)) {
      throw new AppError("RATE_LIMIT", "You've sent a few messages already. Please try again later.", 429);
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Please check the form.", 400);
    const userId = await getUserId().catch(() => null);
    if (!userId && !parsed.data.email) throw new AppError("INVALID", "Add an email so we can reply.", 400);
    await serviceRpc("submit_support", {
      p_user: userId,
      p_email: parsed.data.email || null,
      p_topic: parsed.data.topic,
      p_message: parsed.data.message,
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return errorResponse(err);
  }
}
