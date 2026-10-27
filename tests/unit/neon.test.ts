import { afterEach, describe, expect, it } from "vitest";
import { configProblems, dataBackend, realtimeTransport } from "@/lib/config";
import { isTransientDbError, toAppError } from "@/lib/server/errors";
import { fromNotify, parseCaptured, routeChanges, byTopic, type RoutingLookup } from "@/lib/server/realtime/routing";
import { uploadPathsIn, verifyUploads } from "@/lib/server/uploads";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const DM = "00000000-0000-4000-8000-0000000d0001";
const PUB = "00000000-0000-4000-8000-0000000c0001";
const M1 = "00000000-0000-4000-8000-0000000e0001";
const M2 = "00000000-0000-4000-8000-0000000e0002";

const lookup: RoutingLookup = {
  channels: async (ids) =>
    [
      { id: DM, kind: "dm", is_private: true },
      { id: PUB, kind: "group", is_private: false },
    ].filter((c) => ids.includes(c.id)),
  members: async (ids) =>
    [
      { channel_id: DM, user_id: A },
      { channel_id: DM, user_id: B },
    ].filter((m) => ids.includes(m.channel_id)),
  messageChannels: async (ids) => [{ id: M2, channel_id: DM }].filter((m) => ids.includes(m.id)),
};

describe("realtime routing", () => {
  it("sends private chat events only to members, public ones to everyone", async () => {
    const out = await routeChanges(
      [
        { t: "messages", op: "INSERT", id: M1, channel_id: DM },
        { t: "messages", op: "INSERT", id: M2, channel_id: PUB },
      ],
      false,
      lookup,
    );
    const topics = byTopic(out);
    expect([...topics.keys()].sort()).toEqual([`yoru:u:${A}`, `yoru:u:${B}`, "yoru:all"].sort());
    expect(topics.get(`yoru:u:${C}`)).toBeUndefined();
    expect(topics.get("yoru:all")).toEqual([{ type: "message", channel_id: PUB, id: M2, op: "INSERT" }]);
  });

  it("routes reactions through their message's channel", async () => {
    const out = await routeChanges([{ t: "message_reactions", op: "DELETE", message_id: M2 }], false, lookup);
    expect(out.map((d) => d.topic).sort()).toEqual([`yoru:u:${A}`, `yoru:u:${B}`].sort());
    expect(out[0].event).toEqual({ type: "message", channel_id: DM, id: M2, op: "UPDATE" });
  });

  it("delivers notifications to their owner, skips reposts, flags overflow", async () => {
    const out = await routeChanges(
      [
        { t: "notifications", op: "INSERT", id: M1, user_id: C, kind: "like", body: "hi" },
        { t: "posts", op: "INSERT", id: M2, author_id: A, kind: "repost" },
        { t: "stories", op: "INSERT", id: M1 },
      ],
      true,
      lookup,
    );
    expect(out).toEqual([
      { topic: `yoru:u:${C}`, event: { type: "notification", id: M1, kind: "like", body: "hi" } },
      { topic: "yoru:all", event: { type: "story", id: M1 } },
      { topic: "yoru:all", event: { type: "resync" } },
    ]);
  });

  it("ignores malformed ids and lines, dedupes repeats", async () => {
    const parsed = parseCaptured(`{"t":"posts","op":"INSERT","id":"${M1}","author_id":"${A}","kind":"post"}\nnot json\n{"t":"posts","op":"INSERT","id":"${M1}","author_id":"${A}","kind":"post"}\n{"t":"notifications","op":"INSERT","id":"x","user_id":"' or 1=1"}\n`);
    const out = await routeChanges(parsed, false, lookup);
    expect(out).toEqual([{ topic: "yoru:all", event: { type: "post", id: M1, author_id: A } }]);
  });

  it("converts demo pg_notify payloads without copying message bodies", () => {
    const c = fromNotify({ table: "messages", op: "INSERT", row: { id: M1, channel_id: DM, body: "private" } });
    expect(c).toMatchObject({ t: "messages", id: M1, channel_id: DM, body: null });
  });
});

describe("backend selection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("keeps Supabase unless DATA_BACKEND=neon is set explicitly", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.DATABASE_URL = "postgres://u@example.neon.tech/db";
    delete process.env.DATA_BACKEND;
    expect(dataBackend()).toBe("supabase");
    expect(realtimeTransport()).toBe("postgres_changes");
    process.env.DATA_BACKEND = "neon";
    expect(dataBackend()).toBe("postgres");
    expect(realtimeTransport()).toBe("broadcast");
  });

  it("reports missing settings by name", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.DATA_BACKEND = "neon";
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    const problems = configProblems().join(" ");
    expect(problems).toMatch(/DATABASE_URL/);
    expect(problems).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("uses SSE with demo login", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.DATA_BACKEND = "neon";
    process.env.DATABASE_URL = "postgres://localhost/db";
    expect(dataBackend()).toBe("postgres");
    expect(realtimeTransport()).toBe("sse");
  });
});

describe("database errors", () => {
  it("treats connection failures as retryable 503s without leaking details", () => {
    for (const code of ["ECONNREFUSED", "57P01", "08006", "53300"]) expect(isTransientDbError({ code })).toBe(true);
    expect(isTransientDbError({ message: "Connection terminated unexpectedly" })).toBe(true);
    expect(isTransientDbError({ code: "23505" })).toBe(false);
    const e = toAppError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 10.0.0.1:5432" });
    expect(e.status).toBe(503);
    expect(e.message).not.toMatch(/10\.0\.0\.1/);
    expect(toAppError({ code: "57014", message: "canceling statement due to statement timeout" }).status).toBe(503);
    expect(toAppError({ message: "NOT_MEMBER|Members only." }).status).toBe(401);
  });
});

describe("upload checks", () => {
  const mine = `u/${A}/11111111-1111-4111-8111-111111111111.png`;
  const theirs = `u/${B}/22222222-2222-4222-8222-222222222222.png`;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const html = new TextEncoder().encode("<html><script>");

  it("finds upload paths in the RPCs that attach media", () => {
    expect(uploadPathsIn("send_message", { p_media_url: mine })).toEqual([mine]);
    expect(uploadPathsIn("update_my_profile", { p: { avatar_url: mine } })).toEqual([mine]);
    expect(uploadPathsIn("create_post", { p_media_url: "/seed/x.png" })).toEqual([]);
  });

  it("rejects someone else's file and files whose bytes do not match", async () => {
    expect(await verifyUploads([theirs], A, null)).toMatch(/someone else/);
    expect(await verifyUploads([mine], A, async () => png)).toBeNull();
    const fake = `u/${A}/33333333-3333-4333-8333-333333333333.png`;
    expect(await verifyUploads([fake], A, async () => html)).toMatch(/not what it claims/);
    expect(await verifyUploads([`u/${A}/44444444-4444-4444-8444-444444444444.png`], A, async () => null)).toMatch(/could not be found/);
    // Storage unreachable: fail open rather than block posting.
    const down = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await verifyUploads([`u/${A}/55555555-5555-4555-8555-555555555555.png`], A, down)).toBeNull();
  });
});

describe("maintenance read-only switch", () => {
  afterEach(() => {
    delete process.env.MAINTENANCE_READ_ONLY;
  });

  it("only lists real read functions as allowed", async () => {
    const { READ_RPCS, RPC_SCHEMAS } = await import("@/lib/server/rpc-registry");
    for (const fn of READ_RPCS) expect(Object.keys(RPC_SCHEMAS)).toContain(fn);
    for (const w of ["create_post", "send_message", "touch_presence", "admin_set_banned", "update_my_profile"]) {
      expect(READ_RPCS.has(w as never)).toBe(false);
    }
  });

  it("blocks writes with a 503 only while switched on", async () => {
    const { assertWritable } = await import("@/lib/server/errors");
    expect(() => assertWritable()).not.toThrow();
    process.env.MAINTENANCE_READ_ONLY = "true";
    expect(() => assertWritable()).toThrow(/paused/);
  });
});
