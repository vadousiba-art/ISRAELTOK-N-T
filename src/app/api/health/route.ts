import { NextResponse } from "next/server";
import { aiConfig, appMode, supabaseServiceKey } from "@/lib/config";

// Public, non-sensitive configuration status (no secrets, just booleans).
export async function GET() {
  const mode = appMode();
  return NextResponse.json({
    ok: mode !== "unconfigured",
    mode,
    ai: Boolean(aiConfig().apiKey),
    serviceRole: mode === "supabase" ? Boolean(supabaseServiceKey()) : null,
  });
}
