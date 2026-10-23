import { NextResponse } from "next/server";
import { appMode } from "@/lib/config";
import { DEMO_COOKIE } from "@/lib/server/db";
import { supabaseForRequest } from "@/lib/server/supabase";

export async function POST() {
  const res = NextResponse.json({ data: { ok: true } });
  if (appMode() === "supabase") {
    const sb = await supabaseForRequest();
    await sb.auth.signOut();
  }
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
