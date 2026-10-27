import { NextRequest } from "next/server";
import { appMode } from "@/lib/config";
import { getUserDb } from "@/lib/server/db";
import { AppError, assertWritable, handle } from "@/lib/server/errors";
import { limit } from "@/lib/server/ratelimit";
import { READ_RPCS, RPC_SCHEMAS, isRpcName } from "@/lib/server/rpc-registry";
import { supabaseAdmin } from "@/lib/server/supabase";
import { uploadPathsIn, verifyUploads } from "@/lib/server/uploads";

// First bytes of an object in the private media bucket (signed URL + Range).
// null = the object does not exist; throws when storage cannot be reached.
async function storedHead(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin().storage.from("media").createSignedUrl(path, 60);
  if (error || !data) {
    if (/not found/i.test(error?.message ?? "")) return null;
    throw new Error(error?.message ?? "no signed url");
  }
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-15" }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`storage responded ${res.status}`);
  return new Uint8Array(await res.arrayBuffer()).slice(0, 16);
}


export async function POST(req: NextRequest, ctx: { params: Promise<{ fn: string }> }) {
  return handle(async () => {
    const { fn } = await ctx.params;
    if (!isRpcName(fn)) throw new AppError("NOT_FOUND", "Unknown action. Are you hacking? Cute.", 404);
    if (!READ_RPCS.has(fn)) assertWritable();
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
    const args = parsed.data as Record<string, unknown>;
    const uploads = uploadPathsIn(fn, args);
    if (uploads.length) {
      const problem = await verifyUploads(uploads, db.userId, appMode() === "supabase" ? storedHead : null);
      if (problem) throw new AppError("INVALID", problem, 400);
    }
    return db.rpc(fn, args);
  });
}
