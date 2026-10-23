import { NextRequest } from "next/server";
import { serviceRpc } from "@/lib/server/db";
import { AppError, handle } from "@/lib/server/errors";
import { clientIp, limit } from "@/lib/server/ratelimit";

// Public: tells the join page whether an invite is usable. Rate limited per IP
// so codes cannot be brute-forced.
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    if (!limit(`invite:${clientIp(req)}`, 30, 60_000)) {
      throw new AppError("RATE_LIMIT", "Easy there, code breaker.", 429);
    }
    const { code } = await ctx.params;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) return { valid: false, reason: "not_found" };
    return serviceRpc("check_invite", { p_code: code });
  });
}
