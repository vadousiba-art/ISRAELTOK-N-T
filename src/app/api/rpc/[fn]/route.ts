import { NextRequest } from "next/server";
import { getUserDb } from "@/lib/server/db";
import { AppError, handle } from "@/lib/server/errors";
import { limit } from "@/lib/server/ratelimit";
import { RPC_SCHEMAS, isRpcName } from "@/lib/server/rpc-registry";

export async function POST(req: NextRequest, ctx: { params: Promise<{ fn: string }> }) {
  return handle(async () => {
    const { fn } = await ctx.params;
    if (!isRpcName(fn)) throw new AppError("NOT_FOUND", "Unknown action. Are you hacking? Cute.", 404);
    const body = await req.json().catch(() => ({}));
    const parsed = RPC_SCHEMAS[fn].safeParse(body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError("INVALID", `Invalid input${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "nope"}`, 400);
    }
    const db = await getUserDb();
    if (!limit(`rpc:${db.userId}`, 900, 60_000)) {
      throw new AppError("RATE_LIMIT", "You are clicking faster than a bot. Breathe.", 429);
    }
    return db.rpc(fn, parsed.data as Record<string, unknown>);
  });
}
