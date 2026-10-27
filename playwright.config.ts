import { defineConfig, devices } from "@playwright/test";

// End-to-end flows against the production build in demo mode (embedded DB,
// fresh data directory per run). Run `npm run build` first.
// E2E_DATABASE_URL runs the same flows on a real Postgres through the Neon
// adapter instead (DATA_BACKEND=neon), e.g. the rehearsal target database.
const PORT = 3100;
const pgEnv: Record<string, string> = process.env.E2E_DATABASE_URL
  ? { DATA_BACKEND: "neon", DATABASE_URL: process.env.E2E_DATABASE_URL }
  : {};
// Optional: run the flows with live updates spread over real Supabase projects
// (SUPABASE_PROJECT_n_* and REALTIME_SHARDS=on in the environment).
const shardEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k, v]) => v && (k.startsWith("SUPABASE_PROJECT_") || k.startsWith("REALTIME_"))),
) as Record<string, string>;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node -e "require('fs').rmSync('.data-e2e',{recursive:true,force:true})" && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DEMO_MODE: "true", DEMO_DATA_DIR: ".data-e2e", ANTHROPIC_API_KEY: "", ...pgEnv, ...shardEnv },
  },
});
