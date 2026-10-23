import fs from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { appMode } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { errorResponse, AppError } from "@/lib/server/errors";
import { supabaseForRequest } from "@/lib/server/supabase";
import { demoUploadFile, MIME_BY_EXT, UPLOAD_PATH_RE } from "@/lib/server/uploads";

// Members-only media. Supabase: redirect to a short-lived signed URL (the
// bucket's RLS policy re-checks membership). Demo: stream from disk with
// Range support so videos can seek.
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const p = path.join("/");
    if (!UPLOAD_PATH_RE.test(p)) throw new AppError("NOT_FOUND", "No such file.", 404);
    await getUserDb();

    if (appMode() === "supabase") {
      const sb = await supabaseForRequest();
      const { data, error } = await sb.storage.from("media").createSignedUrl(p, 3600);
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
