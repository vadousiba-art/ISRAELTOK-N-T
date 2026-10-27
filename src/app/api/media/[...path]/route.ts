import fs from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { appMode, dataBackend } from "@/lib/config";
import { getUserDb, serviceQuery } from "@/lib/server/db";
import { errorResponse, AppError } from "@/lib/server/errors";
import { supabaseAdmin, supabaseForRequest } from "@/lib/server/supabase";
import { demoUploadFile, MIME_BY_EXT, UPLOAD_PATH_RE } from "@/lib/server/uploads";

// Members-only media. Supabase: redirect to a short-lived signed URL (the
// bucket's RLS policy re-checks membership). Neon: membership lives in Neon,
// so it is checked there and the URL is signed with the server key. Demo:
// stream from disk with Range support so videos can seek.
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const p = path.join("/");
    if (!UPLOAD_PATH_RE.test(p)) throw new AppError("NOT_FOUND", "No such file.", 404);
    const db = await getUserDb();

    if (appMode() === "supabase") {
      let storage;
      if (dataBackend() === "postgres") {
        const ok = await serviceQuery("select 1 from public.profiles where id = $1 and not banned and not is_bot", [db.userId]);
        if (!ok.rows.length) throw new AppError("NOT_MEMBER", "Members only.", 401);
        storage = supabaseAdmin().storage;
      } else {
        storage = (await supabaseForRequest()).storage;
      }
      const { data, error } = await storage.from("media").createSignedUrl(p, 3600);
      if (error || !data) throw new AppError("NOT_FOUND", "That file vanished.", 404);
      return NextResponse.redirect(data.signedUrl, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=3000" },
      });
    }

    const file = demoUploadFile(p);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat) throw new AppError("NOT_FOUND", "That file vanished.", 404);
    const type = MIME_BY_EXT[p.split(".").pop()!] ?? "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    };
    const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      }
      const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
      });
    }
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new NextResponse(stream, {
      headers: { ...headers, "Content-Length": String(stat.size) },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
