import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { appMode } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { AppError, handle } from "@/lib/server/errors";
import { demoUploadFile, maxBytesFor, sniffMatches, UPLOAD_PATH_RE, verifyDemoUpload } from "@/lib/server/uploads";

// Step 2 (demo mode only): receive the bytes for a signed upload slot.
export async function PUT(req: NextRequest) {
  return handle(async () => {
    if (appMode() !== "demo") throw new AppError("NOT_FOUND", "Not available.", 404);
    const q = req.nextUrl.searchParams;
    const p = q.get("path") ?? "";
    const type = q.get("type") ?? "";
    const exp = Number(q.get("exp"));
    if (!UPLOAD_PATH_RE.test(p) || !verifyDemoUpload(p, type, exp, q.get("sig") ?? "")) {
      throw new AppError("FORBIDDEN", "Upload link expired or forged.", 403);
    }
    const db = await getUserDb();
    if (!p.startsWith(`u/${db.userId}/`)) throw new AppError("FORBIDDEN", "Not your upload slot.", 403);

    const max = maxBytesFor(type);
    if (Number(req.headers.get("content-length") ?? 0) > max) throw new AppError("INVALID", "File too large.", 413);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > max) throw new AppError("INVALID", "File empty or too large.", 413);
    if (!sniffMatches(type, buf.slice(0, 16))) {
      throw new AppError("INVALID", "That file is not what it claims to be. Suspicious.", 400);
    }
    const file = demoUploadFile(p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf, { flag: "wx" });
    return { path: p };
  });
}
