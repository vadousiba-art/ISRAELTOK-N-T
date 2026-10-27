import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appMode, dataBackend, demoDataDir } from "@/lib/config";
import { DEMO_COOKIE, getUserDb, serviceQuery, serviceRpc } from "@/lib/server/db";
import { AppError, assertWritable, errorResponse } from "@/lib/server/errors";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { supabaseAdmin, supabaseForRequest } from "@/lib/server/supabase";
import { allMediaBuckets } from "@/lib/server/storage";

const Body = z.object({ confirm: z.string().max(40) });

// Self-serve account deletion. The person must be signed in and type their
// username. Removes the profile (cascading to all their content), their
// uploaded files and the login itself, then signs them out.
export async function POST(req: NextRequest) {
  try {
    assertWritable();
    if (!limit(`delete:${clientIp(req)}`, 5, 60_000)) throw new AppError("RATE_LIMIT", "Too many attempts. Please wait a minute.", 429);
    const db = await getUserDb();
    const me = await db.rpc<{ username: string; role: string }>("get_me");
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success || parsed.data.confirm.trim().toLowerCase() !== me.username.toLowerCase()) {
      throw new AppError("INVALID", "Type your username exactly to confirm.", 400);
    }

    await serviceRpc("delete_account", { p_user: db.userId });

    const res = NextResponse.json({ data: { ok: true } });
    if (appMode() === "demo") {
      await serviceQuery("delete from auth.users where id = $1", [db.userId]);
      await fs.rm(path.join(/*turbopackIgnore: true*/ process.cwd(), demoDataDir(), "uploads", "u", db.userId), { recursive: true, force: true });
      res.cookies.delete(DEMO_COOKIE);
      return res;
    }

    // Neon keeps a mirror of the identity (no password); remove it too.
    if (dataBackend() === "postgres") await serviceQuery("delete from auth.users where id = $1", [db.userId]);
    const admin = supabaseAdmin();
    const folder = `u/${db.userId}`;
    // Files may be spread over several Supabase projects.
    for (const { bucket } of allMediaBuckets()) {
      for (let i = 0; i < 20; i++) {
        const { data: files } = await bucket.list(folder, { limit: 100 });
        if (!files?.length) break;
        await bucket.remove(files.map((f) => `${folder}/${f.name}`));
      }
    }
    const { error } = await admin.auth.admin.deleteUser(db.userId);
    if (error) console.error("[yoru] auth user delete failed", error.message);
    const sb = await supabaseForRequest();
    await sb.auth.signOut().catch(() => null);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
