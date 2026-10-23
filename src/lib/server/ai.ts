import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiConfig } from "@/lib/config";
import { offlineGenerate } from "@/lib/ai/offline";
import { MENACE_SYSTEM, TOOL_SCHEMAS, type Intensity, type ToolName } from "@/lib/ai/prompts";
import { AppError } from "./errors";

export type AiResult = {
  text: string;
  data?: Record<string, unknown>;
  source: "claude" | "offline";
  degraded?: boolean;
};

let client: Anthropic | null = null;
function getClient(apiKey: string) {
  client ??= new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  return client;
}

export const aiAvailable = () => Boolean(aiConfig().apiKey);

// One Menace call. The API key never leaves the server; callers pass only the
// text the user explicitly chose to share.
export async function menace(opts: {
  tool: ToolName;
  intensity: Intensity;
  prompt: string;
  history?: { role: "user" | "assistant"; content: string }[];
  offlineInput: Record<string, string | number | undefined>;
}): Promise<AiResult> {
  const cfg = aiConfig();
  const schema = TOOL_SCHEMAS[opts.tool];
  const offline = (degraded = false): AiResult => ({
    ...offlineGenerate(opts.tool, opts.offlineInput, opts.intensity),
    source: "offline",
    degraded,
  });
  if (!cfg.apiKey) return offline();

  try {
    const res = await getClient(cfg.apiKey).beta.messages.create({
      model: cfg.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        ...(schema ? { format: { type: "json_schema" as const, schema } } : {}),
      },
      system: [{ type: "text", text: MENACE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [...(opts.history ?? []), { role: "user", content: opts.prompt }],
    });

    if (res.stop_reason === "refusal") {
      return {
        text: "Even I have standards, and that request just failed them. Try something funnier and less felony-shaped.",
        source: "claude",
      };
    }
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) return offline(true);
    if (schema) {
      try {
        return { text: "", data: JSON.parse(text), source: "claude" };
      } catch {
        return offline(true);
      }
    }
    return { text: text.slice(0, 3000), source: "claude" };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new AppError("AI_UNAVAILABLE", "The Menace is overloaded (too many roasts in flight). Try again in a minute.", 503);
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("[itn] Anthropic auth failed — check ANTHROPIC_API_KEY. Falling back to Menace Lite.");
    } else if (err instanceof Anthropic.APIConnectionError) {
      console.error("[itn] Anthropic unreachable. Falling back to Menace Lite.");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`[itn] Anthropic API error ${err.status}: ${err.message}`);
    } else {
      console.error("[itn] Menace call failed", err);
    }
    return offline(true);
  }
}
