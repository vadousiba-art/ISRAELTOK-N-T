import { NextRequest } from "next/server";
import { realtimeTransport } from "@/lib/config";
import { getUserDb, serviceQuery } from "@/lib/server/db";
import { AppError, errorResponse } from "@/lib/server/errors";
import { liveBus } from "@/lib/server/realtime/bus";
import { ALL_TOPIC, userTopic, type Delivery } from "@/lib/server/realtime/routing";

export const dynamic = "force-dynamic";

// SSE realtime for demo login (one server process). Committed changes are
// routed to topics (see realtime/routing.ts) and this stream forwards only the
// signed-in member's own topic and the all-members topic. Events only carry
// ids; clients refetch through the RPCs, which re-check access. With Supabase
// Auth, Supabase Realtime is used instead.
export async function GET(req: NextRequest) {
  try {
    if (realtimeTransport() !== "sse") throw new AppError("NOT_FOUND", "Realtime runs through Supabase in this mode.", 404);
    const { userId } = await getUserDb();
    const mine = userTopic(userId);
    const events = liveBus();
    const membership = new Map<string, { ok: boolean; at: number }>();

    const isMember = async (channelId: string) => {
      const hit = membership.get(channelId);
      if (hit && Date.now() - hit.at < 15_000) return hit.ok;
      const r = await serviceQuery("select 1 from public.channel_members where channel_id = $1 and user_id = $2", [
        channelId,
        userId,
      ]);
      const ok = r.rows.length > 0;
      membership.set(channelId, { ok, at: Date.now() });
      return ok;
    };

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            cleanup();
          }
        };
        const onDelivery = (d: Delivery) => {
          if (d.topic === mine || d.topic === ALL_TOPIC) send(d.event);
        };
        const onTyping = async (t: { channel_id: string; user_id: string; name: string }) => {
          if (t.user_id !== userId && (await isMember(t.channel_id).catch(() => false))) send({ type: "typing", ...t });
        };
        events.on("delivery", onDelivery);
        events.on("typing", onTyping);
        const ping = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            cleanup();
          }
        }, 20_000);
        send({ type: "hello" });
        cleanup = () => {
          clearInterval(ping);
          events.off("delivery", onDelivery);
          events.off("typing", onTyping);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        req.signal.addEventListener("abort", () => cleanup());
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
