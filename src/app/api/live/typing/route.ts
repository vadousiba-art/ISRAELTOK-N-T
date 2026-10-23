import { NextRequest } from "next/server";
import { z } from "zod";
import { appMode } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { demoEvents } from "@/lib/server/demo/pglite";
import { AppError, handle } from "@/lib/server/errors";
import { limit } from "@/lib/server/ratelimit";

const Body = z.object({ channel_id: z.uuid() });

// Demo-mode typing indicator relay (Supabase mode uses Realtime broadcast).
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (appMode() !== "demo") throw new AppError("NOT_FOUND", "Not available.", 404);
    const { channel_id } = Body.parse(await req.json().catch(() => ({})));
    const db = await getUserDb();
    if (!limit(`typing:${db.userId}`, 40, 60_000)) return { ok: false };
    await db.rpc("get_messages", { p_channel_id: channel_id, p_limit: 1 }); // throws unless a member
    const me = await db.rpc<{ display_name: string }>("get_me");
    demoEvents().emit("typing", { channel_id, user_id: db.userId, name: me.display_name });
    return { ok: true };
  });
}
