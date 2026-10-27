import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "@/lib/config";
import { AppError } from "./errors";

// Per-request client bound to the signed-in user's cookies (RLS applies).
export async function supabaseForRequest(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; the
          // proxy refreshes the session instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

// Service-role client. Bypasses RLS — only used for invite checks, sign-up,
// signed upload URLs and the AI Menace bot account.
export function supabaseAdmin(): SupabaseClient {
  const key = supabaseServiceKey();
  if (!key) {
    throw new AppError(
      "NOT_CONFIGURED",
      "SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it to your environment.",
      503,
    );
  }
  admin ??= createClient(supabaseUrl()!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
