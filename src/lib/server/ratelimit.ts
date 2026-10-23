import "server-only";

// Small in-memory sliding-window limiter for unauthenticated endpoints
// (login, invite checks) and as a coarse guard on reads. Per-user write limits
// live in Postgres (enforce_rate_limit) so they hold across instances.

type Bucket = { hits: number[] };
const g = globalThis as unknown as { __itnLimits?: Map<string, Bucket> };
const buckets = (g.__itnLimits ??= new Map());

export function limit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t: number) => now - t < windowMs);
  if (b.hits.length >= max) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.hits.every((t: number) => now - t > windowMs)) buckets.delete(k);
  }
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}
