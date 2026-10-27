/**
 * Lightweight load test for a running YORU server (no extra dependencies).
 *
 *   npx tsx scripts/load-test.mts --url http://localhost:3101 --concurrency 20 --seconds 20 [--writes]
 *
 * Logs in as several demo accounts (demo login only, so run it against a local
 * or staging server with DEMO_MODE=true), then hammers a realistic mix of
 * reads (feed, notifications, channels, profile) and optionally writes
 * (posts, likes). Reports throughput, latency percentiles per action, HTTP
 * status counts (429 = rate limited, 503 = database unavailable) and, with
 * --db <url>, the peak number of database connections the app held.
 * Refuses non-local URLs unless --allow-remote is passed. Never run --writes
 * against production: it creates posts.
 */
import pg from "pg";

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const base = arg("--url", "http://localhost:3000")!.replace(/\/$/, "");
const concurrency = Number(arg("--concurrency", "10"));
const seconds = Number(arg("--seconds", "15"));
const writes = process.argv.includes("--writes");
const dbUrl = arg("--db");
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base) && !process.argv.includes("--allow-remote")) {
  console.error("Refusing a non-local URL without --allow-remote.");
  process.exit(1);
}

type Stat = { ms: number[]; status: Record<string, number> };
const stats = new Map<string, Stat>();
const record = (name: string, ms: number, status: number | string) => {
  const s = stats.get(name) ?? { ms: [], status: {} };
  s.ms.push(ms);
  s.status[status] = (s.status[status] ?? 0) + 1;
  stats.set(name, s);
};

const users = (await (await fetch(`${base}/api/auth/demo-users`)).json()).data as { id: string }[];
if (!users?.length) throw new Error("No demo accounts. Is the server in demo mode?");
const cookies: string[] = [];
for (let i = 0; i < Math.min(concurrency, users.length); i++) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(i / 250)}.${i % 250}` },
    body: JSON.stringify({ user_id: users[i].id }),
  });
  cookies.push((r.headers.get("set-cookie") ?? "").split(";")[0]);
}

async function rpc(cookie: string, fn: string, body: Record<string, unknown> = {}) {
  const t = performance.now();
  try {
    const r = await fetch(`${base}/api/rpc/${fn}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => null);
    record(fn, performance.now() - t, r.status);
    return json?.data;
  } catch {
    record(fn, performance.now() - t, "network");
    return null;
  }
}

let peakConnections = 0;
const pool = dbUrl ? new pg.Pool({ connectionString: dbUrl, max: 1 }) : null;
const sampler = pool
  ? setInterval(async () => {
      const r = await pool.query("select count(*)::int as n from pg_stat_activity where application_name = 'yoru'").catch(() => null);
      if (r) peakConnections = Math.max(peakConnections, r.rows[0].n);
    }, 250)
  : null;

const end = Date.now() + seconds * 1000;
let postIds: string[] = [];
async function worker(i: number) {
  const cookie = cookies[i % cookies.length];
  while (Date.now() < end) {
    const roll = Math.random();
    if (writes && roll < 0.05) {
      const id = await rpc(cookie, "create_post", { p_body: `load test ${Date.now()} #loadtest` });
      if (typeof id === "string") postIds.push(id);
    } else if (writes && roll < 0.12 && postIds.length) {
      await rpc(cookie, "toggle_reaction", { p_post_id: postIds[Math.floor(Math.random() * postIds.length)], p_kind: "fire" });
    } else if (roll < 0.6) {
      const feed = await rpc(cookie, "get_feed", { p_mode: "latest", p_limit: 15 });
      if (Array.isArray(feed) && !postIds.length) postIds = feed.map((p: { id: string }) => p.id);
    } else if (roll < 0.75) {
      await rpc(cookie, "get_notifications", { p_limit: 30 });
    } else if (roll < 0.9) {
      await rpc(cookie, "get_channels");
    } else {
      await rpc(cookie, "get_me");
    }
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
const elapsed = (Date.now() - started) / 1000;
if (sampler) clearInterval(sampler);
await pool?.end();

const pct = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] ?? 0;
let total = 0;
console.log(`\n${base} · ${concurrency} concurrent · ${elapsed.toFixed(1)}s · writes ${writes ? "on" : "off"}`);
console.log("action".padEnd(20), "count".padStart(7), "p50 ms".padStart(8), "p95 ms".padStart(8), "p99 ms".padStart(8), "  statuses");
for (const [name, s] of [...stats].sort()) {
  total += s.ms.length;
  console.log(
    name.padEnd(20),
    String(s.ms.length).padStart(7),
    pct(s.ms, 50).toFixed(0).padStart(8),
    pct(s.ms, 95).toFixed(0).padStart(8),
    pct(s.ms, 99).toFixed(0).padStart(8),
    " ",
    JSON.stringify(s.status),
  );
}
console.log(`throughput: ${(total / elapsed).toFixed(1)} requests/s`);
if (pool) console.log(`peak app database connections: ${peakConnections}`);
