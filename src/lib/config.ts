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
