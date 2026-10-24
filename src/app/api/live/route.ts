import { NextRequest } from "next/server";
import { appMode } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { demoDb, demoEvents } from "@/lib/server/demo/pglite";
import { AppError, errorResponse } from "@/lib/server/errors";
import type { LiveEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

type Change = { table: string; op: string; row: Record<string, unknown> };

// Demo-mode realtime: Server-Sent Events fed by Postgres NOTIFY from PGlite.
// Events only carry ids; clients refetch through the RPCs, which re-check
// access. Supabase mode uses Supabase Realtime directly instead.
export async function GET(req: NextRequest) {
  try {
    if (appMode() !== "demo") throw new AppError("NOT_FOUND", "Realtime runs through Supabase in this mode.", 404);
    const { userId } = await getUserDb();
    const db = await demoDb();
    const events = demoEvents();
    const membership = new Map<string, { ok: boolean; at: number }>();

    const isMember = async (channelId: string) => {
      const hit = membership.get(channelId);
      if (hit && Date.now() - hit.at < 15_000) return hit.ok;
      const r = await db.query("select 1 from public.channel_members where channel_id = $1 and user_id = $2", [
        channelId,
        userId,
      ]);
      const ok = r.rows.length > 0;
      membership.set(channelId, { ok, at: Date.now() });
      return ok;
    };

    const toEvent = async (c: Change): Promise<LiveEvent | null> => {
      const row = c.row;
      switch (c.table) {
        case "messages":
          return (await isMember(String(row.channel_id)))
            ? { type: "message", channel_id: String(row.channel_id), id: String(row.id), op: c.op }
            : null;
        case "message_reactions": {
          const m = await db.query<{ channel_id: string }>("select channel_id from public.messages where id = $1", [
            row.message_id,
          ]);
          const ch = m.rows[0]?.channel_id;
          return ch && (await isMember(ch))
            ? { type: "message", channel_id: ch, id: String(row.message_id), op: "UPDATE" }
            : null;
        }
        case "notifications":
          return row.user_id === userId ? { type: "notification", id: String(row.id), kind: String(row.kind), body: String(row.body ?? "") } : null;
        case "posts":
          return row.kind === "repost" ? null : { type: "post", id: String(row.id), author_id: String(row.author_id) };
        case "stories":
          return { type: "story", id: String(row.id) };
        default:
          return null;
      }
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
        const onChange = (c: Change) => {
          toEvent(c)
            .then((e) => e && send(e))
            .catch(() => {});
        };
        const onTyping = async (t: { channel_id: string; user_id: string; name: string }) => {
          if (t.user_id !== userId && (await isMember(t.channel_id))) send({ type: "typing", ...t });
        };
        events.on("change", onChange);
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
          events.off("change", onChange);
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
