import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { realtimeTransport } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { AppError, errorResponse } from "@/lib/server/errors";
import { shardsReady, typingTopic, userTopics } from "@/lib/server/realtime/shards";

export const dynamic = "force-dynamic";

const Channel = z.uuid();

// Sharded realtime: which Supabase project this person listens on and the
// secret topic names. With ?channel=<id>, the typing topic of a chat the
// person belongs to. Never cached, never shared between people.
export async function GET(req: NextRequest) {
  try {
    if (realtimeTransport() !== "sharded" || !shardsReady()) throw new AppError("NOT_FOUND", "Not available.", 404);
    const db = await getUserDb();
    const channel = req.nextUrl.searchParams.get("channel");
    let data;
    if (channel) {
      const id = Channel.safeParse(channel);
      if (!id.success) throw new AppError("INVALID", "Bad channel.", 400);
      await db.rpc("get_messages", { p_channel_id: id.data, p_limit: 1 }); // throws unless a member
      data = typingTopic(id.data);
    } else {
      data = userTopics(db.userId);
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
