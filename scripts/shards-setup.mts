/**
 * Create (or fix) the private "media" bucket in every project that has a
 * secret key, with the same limits as the original project
 * (supabase/migrations/0002_storage.sql). Idempotent.
 *
 *   npm run shards:setup
 */
import { createRequire } from "node:module";
import "./db/lib.mjs";
import { supabaseProjects } from "../src/lib/config";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");

const options = {
  public: false,
  fileSizeLimit: 52428800,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"],
};

for (const p of supabaseProjects().filter((x) => !x.primary)) {
  if (!p.secretKey) {
    console.log(`project ${p.n} ${p.ref}: skipped (no SUPABASE_PROJECT_${p.n}_SECRET_KEY)`);
    continue;
  }
  const sb = createClient(p.url, p.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = await sb.storage.getBucket("media");
  const { error } = existing.data ? await sb.storage.updateBucket("media", options) : await sb.storage.createBucket("media", options);
  console.log(`project ${p.n} ${p.ref}: ${error ? `FAILED ${error.message}` : existing.data ? "bucket updated" : "bucket created"}`);
}
