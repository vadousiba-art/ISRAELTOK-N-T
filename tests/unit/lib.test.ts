import { describe, expect, it } from "vitest";
import { offlineGenerate } from "@/lib/ai/offline";
import { TOOL_SCHEMAS } from "@/lib/ai/prompts";
import { sniffMatches, mediaKind, maxBytesFor, UPLOAD_PATH_RE, signDemoUpload, verifyDemoUpload } from "@/lib/server/uploads";
import { AppError, toAppError } from "@/lib/server/errors";
import { RPC_SCHEMAS, isRpcName } from "@/lib/server/rpc-registry";
import { DAILY_CHALLENGES, todaysChallenge } from "@/lib/jokes";
import { ZodError, z } from "zod";

describe("offline Menace Lite", () => {
  it("returns structured data for every structured tool", () => {
    for (const tool of Object.keys(TOOL_SCHEMAS) as (keyof typeof TOOL_SCHEMAS)[]) {
      const out = offlineGenerate(tool, { name: "Ethan", text: "lag", take: "cereal is soup", topic: "naps" }, 2);
      const schema = TOOL_SCHEMAS[tool] as { required: string[] };
      expect(out.data, tool).toBeTruthy();
      for (const key of schema.required) expect(out.data, `${tool}.${key}`).toHaveProperty(key);
    }
  });

  it("produces text for free-form tools and personalizes roasts", () => {
    expect(offlineGenerate("roast_me", { name: "Lucas" }, 3).text).toContain("Lucas");
    expect(offlineGenerate("crisis", { a: "Canada", b: "Ohio" }, 2).text).toMatch(/Canada[\s\S]*Ohio/);
    expect(offlineGenerate("headline", { topic: "cats" }, 1).text).toMatch(/^🚨 BREAKING/);
  });
});

describe("upload validation", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)).concat(new Array(16).fill(0)));

  it("accepts real signatures", () => {
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(true);
    expect(sniffMatches("image/gif", ascii("GIF89a"))).toBe(true);
    expect(sniffMatches("image/webp", ascii("RIFF\0\0\0\0WEBP"))).toBe(true);
    expect(sniffMatches("video/mp4", ascii("\0\0\0\x18ftypmp42"))).toBe(true);
    expect(sniffMatches("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
  });

  it("rejects disguised files", () => {
    expect(sniffMatches("image/png", ascii("<html><script>"))).toBe(false);
    expect(sniffMatches("image/jpeg", ascii("MZ\x90\0"))).toBe(false);
    expect(sniffMatches("application/x-msdownload", ascii("MZ"))).toBe(false);
  });

  it("classifies types and limits", () => {
    expect(mediaKind("image/gif")).toBe("gif");
    expect(mediaKind("video/mp4")).toBe("video");
    expect(mediaKind("text/html")).toBeNull();
    expect(maxBytesFor("video/mp4")).toBeGreaterThan(maxBytesFor("image/png"));
  });

  it("only allows well-formed per-user paths", () => {
    expect(UPLOAD_PATH_RE.test("u/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png")).toBe(true);
    expect(UPLOAD_PATH_RE.test("u/../../etc/passwd")).toBe(false);
    expect(UPLOAD_PATH_RE.test("u/11111111-1111-4111-8111-111111111111/x.html")).toBe(false);
  });

  it("signs demo upload slots and rejects tampering/expiry", () => {
    const p = "u/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
    const exp = Date.now() + 60_000;
    const sig = signDemoUpload(p, "image/png", exp);
    expect(verifyDemoUpload(p, "image/png", exp, sig)).toBe(true);
    expect(verifyDemoUpload(p, "video/mp4", exp, sig)).toBe(false);
    expect(verifyDemoUpload(p, "image/png", Date.now() - 1, signDemoUpload(p, "image/png", Date.now() - 1))).toBe(false);
  });
});

describe("error mapping", () => {
  it("maps CODE|message errors raised by Postgres", () => {
    const e = toAppError(new Error("RATE_LIMIT|Slow down, menace."));
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(429);
    expect(e.message).toBe("Slow down, menace.");
    expect(toAppError({ message: "NOT_MEMBER|Members only." }).status).toBe(401);
    expect(toAppError({ message: "FORBIDDEN|nope" }).status).toBe(403);
  });

  it("maps driver codes and zod errors", () => {
    expect(toAppError({ code: "42501", message: "permission denied for table posts" }).status).toBe(403);
    expect(toAppError({ code: "23514", message: "check violation" }).status).toBe(400);
    const zerr = (() => {
      try {
        z.object({ a: z.string() }).parse({});
      } catch (err) {
        return err as ZodError;
      }
    })();
    expect(toAppError(zerr).status).toBe(400);
  });
});

describe("RPC allowlist", () => {
  it("never exposes server-only functions", () => {
    for (const fn of ["bot_create_post", "bot_add_comment", "bot_send_message", "check_invite", "consume_quota", "enforce_rate_limit", "add_chaos_points", "save_ai_exchange", "get_ai_context"]) {
      expect(isRpcName(fn), fn).toBe(false);
    }
  });

  it("validates arguments", () => {
    expect(RPC_SCHEMAS.toggle_reaction.safeParse({ p_post_id: "not-a-uuid", p_kind: "heart" }).success).toBe(false);
    expect(RPC_SCHEMAS.toggle_reaction.safeParse({ p_post_id: crypto.randomUUID(), p_kind: "nuke" }).success).toBe(false);
    expect(RPC_SCHEMAS.create_post.safeParse({ p_body: "x", p_link_url: "javascript:alert(1)" }).success).toBe(false);
    expect(RPC_SCHEMAS.create_post.safeParse({ p_body: "x".repeat(2001) }).success).toBe(false);
    expect(RPC_SCHEMAS.update_my_profile.safeParse({ p: { role: "owner" } }).success).toBe(false);
    expect(RPC_SCHEMAS.create_post.safeParse({ p_body: "hello", p_poll_options: ["a", "b"] }).success).toBe(true);
  });
});

describe("daily challenge", () => {
  it("is stable for a given UTC day and rotates", () => {
    const d = new Date("2026-10-23T05:00:00Z");
    expect(todaysChallenge(d)).toBe(todaysChallenge(new Date("2026-10-23T22:00:00Z")));
    expect(DAILY_CHALLENGES).toContain(todaysChallenge(d));
    expect(todaysChallenge(d)).not.toBe(todaysChallenge(new Date("2026-10-24T05:00:00Z")));
  });
});
