import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the real Anthropic SDK call path against a local mock of the
// Messages API: request shape (model, fallbacks, effort, structured output)
// and response handling (text, JSON, refusal, server errors).

type Captured = { headers: http.IncomingHttpHeaders; body: Record<string, unknown> };
let server: http.Server;
let captured: Captured[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };

const message = (content: unknown[], stop_reason = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      captured.push({ headers: req.headers, body: JSON.parse(raw || "{}") });
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
});

beforeEach(() => {
  captured = [];
  vi.resetModules();
});

async function load() {
  return import("@/lib/server/ai");
}

describe("menace() against the Messages API", () => {
  it("sends the expected request and returns text", async () => {
    reply = { status: 200, body: message([{ type: "text", text: "You're a loading screen tip." }]) };
    const { menace } = await load();
    const r = await menace({ tool: "roast_me", intensity: 2, prompt: "<task>roast</task>", offlineInput: { name: "Ari" } });
    expect(r).toEqual({ text: "You're a loading screen tip.", source: "claude" });
    const req = captured[0];
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    expect(req.body.output_config).toEqual({ effort: "low" });
    expect(String(req.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(String(req.headers.authorization ?? req.headers["x-api-key"])).toContain("test-key");
    expect(JSON.stringify(req.body.system)).toContain("The AI Menace");
    expect(req.body).not.toHaveProperty("temperature");
  });

  it("requests structured output for card tools and parses it", async () => {
    reply = { status: 200, body: message([{ type: "text", text: JSON.stringify({ rating: 7.5, verdict: "Based", reason: "Soup." }) }]) };
    const { menace } = await load();
    const r = await menace({ tool: "rate_take", intensity: 2, prompt: "<take>cereal</take>", offlineInput: { take: "cereal" } });
    expect(r.data).toEqual({ rating: 7.5, verdict: "Based", reason: "Soup." });
    const oc = captured[0].body.output_config as { format: { type: string } };
    expect(oc.format.type).toBe("json_schema");
  });

  it("turns a refusal into an in-character decline", async () => {
    reply = { status: 200, body: { ...message([], "refusal"), stop_details: { type: "refusal", category: null, explanation: null } } };
    const { menace } = await load();
    const r = await menace({ tool: "chat", intensity: 3, prompt: "something bad", offlineInput: {} });
    expect(r.source).toBe("claude");
    expect(r.text).toMatch(/standards/);
  });

  it("falls back to Menace Lite when the API errors", async () => {
    reply = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "nope" } } };
    const { menace } = await load();
    const r = await menace({ tool: "headline", intensity: 2, prompt: "x", offlineInput: { topic: "cats" } });
    expect(r.source).toBe("offline");
    expect(r.degraded).toBe(true);
    expect(r.text).toMatch(/BREAKING/);
  });

  it("surfaces rate limiting as a retryable 503", async () => {
    reply = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow" } } };
    const { menace } = await load();
    await expect(menace({ tool: "chat", intensity: 1, prompt: "x", offlineInput: {} })).rejects.toMatchObject({ status: 503 });
  });
});
