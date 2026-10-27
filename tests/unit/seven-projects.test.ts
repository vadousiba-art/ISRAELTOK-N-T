import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seven Supabase projects: registry safety, realtime sharding, media paths.
// Uses made-up refs and keys; no network.

const REF = (c: string) => c.repeat(20).slice(0, 20);
const saved = { ...process.env };

function configure(extra: Record<string, string> = {}) {
  process.env = { ...saved } as NodeJS.ProcessEnv;
  for (const k of Object.keys(process.env)) if (k.startsWith("SUPABASE_PROJECT_") || k === "REALTIME_SHARDS" || k === "STORAGE_UPLOAD_PROJECTS") delete process.env[k];
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF("o")}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-original",
    SUPABASE_SERVICE_ROLE_KEY: "service-original",
    ...extra,
  });
}
const project = (n: number, c: string, secret = false) => ({
  [`SUPABASE_PROJECT_${n}_URL`]: `https://${REF(c)}.supabase.co`,
  [`SUPABASE_PROJECT_${n}_PUBLISHABLE_KEY`]: `sb_publishable_${c}`,
  ...(secret ? { [`SUPABASE_PROJECT_${n}_SECRET_KEY`]: `sb_secret_${c}` } : {}),
});

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...saved };
});

describe("project registry", () => {
  it("always keeps the original project as project 7", async () => {
    configure({ ...project(1, "a"), ...project(2, "b"), SUPABASE_PROJECT_7_URL: `https://${REF("z")}.supabase.co` });
    const { supabaseProjects, configWarnings, configProblems } = await import("@/lib/config");
    const ps = supabaseProjects();
    expect(ps.map((p) => p.n)).toEqual([1, 2, 7]);
    expect(ps.find((p) => p.primary)?.ref).toBe(REF("o"));
    expect(configWarnings().join(" ")).toMatch(/must be the original project/);
    expect(configProblems()).toEqual([]); // warnings never block the app
  });

  it("skips projects without a key, duplicates and the original listed again", async () => {
    configure({
      SUPABASE_PROJECT_1_URL: `https://${REF("a")}.supabase.co`, // no key
      ...project(2, "b"),
      ...project(3, "b"), // duplicate of 2
      SUPABASE_PROJECT_4_URL: `https://${REF("o")}.supabase.co`, // the original
      SUPABASE_PROJECT_4_PUBLISHABLE_KEY: "x",
      SUPABASE_PROJECT_5_URL: "https://evil.example.com",
      SUPABASE_PROJECT_5_PUBLISHABLE_KEY: "x",
    });
    const { supabaseProjects, configWarnings } = await import("@/lib/config");
    expect(supabaseProjects().map((p) => p.n)).toEqual([2, 7]);
    const w = configWarnings().join("\n");
    expect(w).toMatch(/PROJECT_1_PUBLISHABLE_KEY is missing/);
    expect(w).toMatch(/PROJECT_3_URL repeats project 2/);
    expect(w).toMatch(/PROJECT_4_URL is the original project/);
    expect(w).toMatch(/PROJECT_5_URL is not a/);
  });

  it("turns on sharded realtime only when asked", async () => {
    configure({ ...project(1, "a") });
    let c = await import("@/lib/config");
    expect(c.realtimeTransport()).toBe("postgres_changes");
    vi.resetModules();
    configure({ ...project(1, "a"), REALTIME_SHARDS: "on" });
    c = await import("@/lib/config");
    expect(c.realtimeTransport()).toBe("sharded");
    expect(c.realtimeShards().map((p) => p.n)).toEqual([1, 7]);
  });

  it("stores new uploads only where a secret key exists, optionally limited", async () => {
    configure({ ...project(1, "a", true), ...project(2, "b"), ...project(3, "c", true) });
    let c = await import("@/lib/config");
    expect(c.uploadProjects().map((p) => p.n)).toEqual([1, 3, 7]);
    vi.resetModules();
    configure({ ...project(1, "a", true), ...project(3, "c", true), STORAGE_UPLOAD_PROJECTS: "3" });
    c = await import("@/lib/config");
    expect(c.uploadProjects().map((p) => p.n)).toEqual([3]);
  });
});

describe("sharded realtime", () => {
  it("assigns people to projects stably and spreads them out", async () => {
    configure({ ...project(1, "a"), ...project(2, "b"), ...project(3, "c"), ...project(4, "d"), ...project(5, "e"), ...project(6, "f"), REALTIME_SHARDS: "on" });
    const { shardFor } = await import("@/lib/server/realtime/shards");
    const id = "11111111-1111-4111-8111-111111111111";
    expect(shardFor(`u:${id}`).n).toBe(shardFor(`u:${id}`).n);
    const counts = new Map<number, number>();
    for (let i = 0; i < 7000; i++) {
      const n = shardFor(`u:${crypto.randomUUID()}`).n;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const v of counts.values()) expect(v).toBeGreaterThan(800); // ~1000 each
  });

  it("names topics with a secret HMAC so they cannot be guessed", async () => {
    configure({ ...project(1, "a"), REALTIME_SHARDS: "on", REALTIME_TOPIC_SECRET: "s1" });
    const a = await import("@/lib/server/realtime/shards");
    const t = a.physicalTopic("u:abc");
    expect(t).toMatch(/^yoru:[0-9a-f]{32}$/);
    expect(t).not.toContain("abc");
    vi.resetModules();
    (globalThis as { __yoruTopicSecret?: string }).__yoruTopicSecret = undefined;
    configure({ ...project(1, "a"), REALTIME_SHARDS: "on", REALTIME_TOPIC_SECRET: "s2" });
    const b = await import("@/lib/server/realtime/shards");
    expect(b.physicalTopic("u:abc")).not.toBe(t);
    (globalThis as { __yoruTopicSecret?: string }).__yoruTopicSecret = undefined;
  });

  it("sends a person's events to their project only and all-member events to every project", async () => {
    configure({ ...project(1, "a"), ...project(2, "b"), REALTIME_SHARDS: "on", REALTIME_TOPIC_SECRET: "s3" });
    (globalThis as { __yoruTopicSecret?: string }).__yoruTopicSecret = undefined;
    const s = await import("@/lib/server/realtime/shards");
    const uid = "22222222-2222-4222-8222-222222222222";
    const plan = s.planSharded([
      { topic: `yoru:u:${uid}`, event: { type: "notification", id: uid } },
      { topic: "yoru:all", event: { type: "post", id: uid, author_id: uid } },
    ]);
    const home = s.shardFor(`u:${uid}`).n;
    expect(plan.map((p) => p.project.n).sort()).toEqual([1, 2, 7]);
    for (const p of plan) {
      const topics = p.messages.map((m) => m.topic);
      expect(topics).toContain(s.physicalTopic("all"));
      expect(topics.includes(s.physicalTopic(`u:${uid}`))).toBe(p.project.n === home);
    }
    expect(s.userTopics(uid).project.n).toBe(home);
    expect(JSON.stringify(s.userTopics(uid))).not.toMatch(/secret|service/);
    (globalThis as { __yoruTopicSecret?: string }).__yoruTopicSecret = undefined;
  });

  it("routes drained outbox rows with their channel info", async () => {
    configure({});
    const { lookupFrom } = await import("@/lib/server/realtime/outbox");
    const { routeChanges } = await import("@/lib/server/realtime/routing");
    const ch = "33333333-3333-4333-8333-333333333333";
    const a = "44444444-4444-4444-8444-444444444444";
    const b = "55555555-5555-4555-8555-555555555555";
    const m = "66666666-6666-4666-8666-666666666666";
    const d = {
      events: [{ t: "messages", op: "INSERT", id: m, channel_id: ch }],
      messages: [],
      channels: [{ id: ch, kind: "dm", is_private: true }],
      members: [
        { channel_id: ch, user_id: a },
        { channel_id: ch, user_id: b },
      ],
    };
    const out = await routeChanges(d.events, false, lookupFrom(d));
    expect(out.map((x) => x.topic).sort()).toEqual([`yoru:u:${a}`, `yoru:u:${b}`].sort());
  });
});

describe("media spread over projects", () => {
  it("parses stored paths and accepts only well-formed ones", async () => {
    configure({});
    const { UPLOAD_PATH_RE } = await import("@/lib/server/uploads");
    const { splitMediaPath } = await import("@/lib/server/storage");
    const u = "77777777-7777-4777-8777-777777777777";
    const f = "88888888-8888-4888-8888-888888888888";
    expect(UPLOAD_PATH_RE.test(`u/${u}/${f}.jpg`)).toBe(true);
    expect(UPLOAD_PATH_RE.test(`s3/u/${u}/${f}.jpg`)).toBe(true);
    expect(UPLOAD_PATH_RE.test(`s8/u/${u}/${f}.jpg`)).toBe(false);
    expect(UPLOAD_PATH_RE.test(`s3/../u/${u}/${f}.jpg`)).toBe(false);
    expect(splitMediaPath(`s3/u/${u}/${f}.jpg`)).toEqual({ n: 3, objectPath: `u/${u}/${f}.jpg` });
    expect(splitMediaPath(`u/${u}/${f}.jpg`)).toEqual({ n: null, objectPath: `u/${u}/${f}.jpg` });
  });

  it("checks ownership on prefixed paths too", async () => {
    configure({});
    const { verifyUploads } = await import("@/lib/server/uploads");
    const me = "77777777-7777-4777-8777-777777777777";
    const other = "99999999-9999-4999-8999-999999999999";
    const f = "88888888-8888-4888-8888-888888888888";
    expect(await verifyUploads([`s2/u/${me}/${f}.jpg`], me, null)).toBeNull();
    expect(await verifyUploads([`s2/u/${other}/${f}.jpg`], me, null)).toMatch(/someone else/);
  });

  it("spreads new uploads over the projects with storage", async () => {
    configure({ ...project(1, "a", true), ...project(4, "d", true) });
    const { newMediaLocation } = await import("@/lib/server/storage");
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(newMediaLocation("u/x/y.jpg").path.split("/")[0]);
    expect([...seen].sort()).toEqual(["s1", "s4", "u"]); // "u" = the original project
  });
});
