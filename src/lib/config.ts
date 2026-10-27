// Runtime configuration. Server-only values are never sent to the browser;
// the client only learns the mode and the public Supabase URL/key.

export type AppMode = "supabase" | "demo" | "unconfigured";

export const BOT_ID = "00000000-0000-4000-8000-00000000a1e7";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const supabaseUrl = () => env("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () =>
  env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
export const supabaseServiceKey = () =>
  env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY");

export function appMode(): AppMode {
  if (supabaseUrl() && supabaseAnonKey()) return "supabase";
  const demo = env("DEMO_MODE");
  if (demo === "false") return "unconfigured";
  if (demo === "true" || process.env.NODE_ENV !== "production") return "demo";
  return "unconfigured";
}

// Where application data lives. Auth stays with Supabase (or the demo account
// picker) whichever is chosen:
//   supabase  Supabase Postgres through PostgREST (the original setup)
//   postgres  Neon (or any Postgres) through a pooled server-side connection.
//             Opt-in with DATA_BACKEND=neon, so a DATABASE_URL injected by a
//             Vercel integration never switches production by accident.
//   pglite    the embedded demo database
export type DataBackend = "supabase" | "postgres" | "pglite" | "none";

export const databaseUrl = () => env("DATABASE_URL");

export function dataBackend(): DataBackend {
  const mode = appMode();
  if (mode === "unconfigured") return "none";
  const wanted = env("DATA_BACKEND")?.toLowerCase();
  if (wanted === "neon" || wanted === "postgres") return "postgres";
  return mode === "supabase" ? "supabase" : "pglite";
}

// How the browser receives live updates:
//   postgres_changes  Supabase Realtime streams table changes (data on Supabase)
//   broadcast         the server relays changes over Supabase Realtime Broadcast
//                     to private per-user topics (data on Neon, auth on Supabase)
//   sse               /api/live Server-Sent Events (demo login, single server)
export type RealtimeTransport = "postgres_changes" | "broadcast" | "sse";

export function realtimeTransport(): RealtimeTransport {
  if (appMode() !== "supabase") return "sse";
  return dataBackend() === "postgres" ? "broadcast" : "postgres_changes";
}

// Configuration mistakes that stop the selected backend from working. Shown
// on /setup and /api/health (names only, never values).
export function configProblems(): string[] {
  const problems: string[] = [];
  const wanted = env("DATA_BACKEND")?.toLowerCase();
  if (wanted && !["neon", "postgres", "supabase"].includes(wanted)) {
    problems.push(`DATA_BACKEND must be "neon" or "supabase" (got an unknown value).`);
  }
  if (dataBackend() === "postgres") {
    if (!databaseUrl()) problems.push("DATA_BACKEND=neon needs DATABASE_URL (Neon pooled connection string).");
    if (appMode() === "supabase" && !supabaseServiceKey()) {
      problems.push("DATA_BACKEND=neon with Supabase Auth needs SUPABASE_SERVICE_ROLE_KEY (sign-up, media and realtime relay).");
    }
  }
  return problems;
}

export const aiConfig = () => ({
  apiKey: env("ANTHROPIC_API_KEY"),
  model: env("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
  dailyLimit: Number(env("AI_DAILY_LIMIT_PER_USER") ?? 40),
  burstLimit: Number(env("AI_BURST_LIMIT_PER_MINUTE") ?? 6),
});

export const uploadConfig = {
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  videoTypes: ["video/mp4", "video/webm", "video/quicktime"],
  perHour: 30,
};

export const demoDataDir = () => env("DEMO_DATA_DIR") ?? ".data";
