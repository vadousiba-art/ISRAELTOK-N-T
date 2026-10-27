import { NextRequest } from "next/server";
import { z } from "zod";
import { realtimeTransport } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { liveBus } from "@/lib/server/realtime/bus";
import { AppError, handle } from "@/lib/server/errors";
import { limit } from "@/lib/server/ratelimit";

const Body = z.object({ channel_id: z.uuid() });

// Typing indicator relay for the SSE transport (Supabase Auth uses Realtime broadcast).
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (realtimeTransport() !== "sse") throw new AppError("NOT_FOUND", "Not available.", 404);
    const { channel_id } = Body.parse(await req.json().catch(() => ({})));
    const db = await getUserDb();
    if (!limit(`typing:${db.userId}`, 40, 60_000)) return { ok: false };
    await db.rpc("get_messages", { p_channel_id: channel_id, p_limit: 1 }); // throws unless a member
    const me = await db.rpc<{ display_name: string }>("get_me");
    liveBus().emit("typing", { channel_id, user_id: db.userId, name: me.display_name });
    return { ok: true };
  });
}
