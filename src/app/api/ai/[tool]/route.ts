import { NextRequest } from "next/server";
import { z } from "zod";
import { aiConfig } from "@/lib/config";
import { intensityRule, TOOL_INSTRUCTIONS, type Intensity, type ToolName } from "@/lib/ai/prompts";
import { aiAvailable, menace, type AiResult } from "@/lib/server/ai";
import { getUserDb, serviceRpc, type Db } from "@/lib/server/db";
import { AppError, assertWritable, handle } from "@/lib/server/errors";
import type { Me, Message, Post } from "@/lib/types";

// Claude calls can take a while; give serverless hosts (e.g. Vercel) room.
export const maxDuration = 60;

const level = z.union([z.literal(1), z.literal(2), z.literal(3)]).optional();
const line = (min: number, max: number) => z.string().trim().min(min).max(max);

const INPUTS = {
  chat: z.object({ message: line(1, 1000), intensity: level }),
  roast_me: z.object({ intensity: level, extra: z.string().trim().max(300).optional() }),
  roast_post: z.object({ post_id: z.uuid(), intensity: level }),
  skill_issue: z.object({ text: line(1, 500) }),
  rate_take: z.object({ take: line(1, 500) }),
  propaganda: z.object({ topic: line(1, 120) }),
  crisis: z.object({ a: line(1, 60), b: line(1, 60), incident: z.string().trim().max(200).optional() }),
  headline: z.object({ topic: z.string().trim().max(120).optional(), post: z.boolean().optional() }),
  comeback: z.object({ insult: line(1, 300), intensity: level }),
  chaos: z.object({}),
  roast_of_the_day: z.object({}),
  chat_command: z.object({ channel_id: z.uuid(), message_id: z.uuid() }),
} satisfies Record<ToolName, z.ZodType>;

type AiContext = {
  id: string;
  display_name: string;
  roast_opt_in: boolean;
  roast_intensity?: number;
  shared: boolean;
  bio?: string;
  status?: string;
  inside_jokes?: string[];
  recent_posts?: string[];
};

const CHAOS_TOPICS = [
  "the group chat's collective GPA", "a cat wearing sunglasses", "Ohio", "the price of Doritos",
  "Zach's business idea", "Monday mornings", "Switzerland's suspicious neutrality", "Ethan's crown",
];
const CHAOS_PAIRS: [string, string][] = [
  ["Canada", "the Group Chat"], ["Switzerland", "Ohio"], ["the Moon", "a Costco"], ["Lucas", "the Economy"],
];

function clampIntensity(n: number | undefined, fallback: number): Intensity {
  const v = Math.round(n ?? fallback);
  return (v < 1 ? 1 : v > 3 ? 3 : v) as Intensity;
}

function describeContext(ctx: AiContext) {
  if (!ctx.shared) return `Name: ${ctx.display_name}. (They have not shared any other details.)`;
  const parts = [`Name: ${ctx.display_name}`];
  if (ctx.bio) parts.push(`Bio: ${ctx.bio}`);
  if (ctx.status) parts.push(`Status: ${ctx.status}`);
  if (ctx.inside_jokes?.length) parts.push(`Inside jokes they opted to share: ${ctx.inside_jokes.join("; ")}`);
  if (ctx.recent_posts?.length) parts.push(`Their recent posts:\n- ${ctx.recent_posts.join("\n- ")}`);
  return parts.join("\n");
}

const task = (tool: Exclude<ToolName, "chat" | "chaos">, intensity: Intensity, body: string) =>
  `<task>${TOOL_INSTRUCTIONS[tool]}</task>\n<intensity>${intensityRule(intensity)}</intensity>\n${body}`;

async function checkQuota(db: Db) {
  const cfg = aiConfig();
  const burst = await db.rpc<{ allowed: boolean }>("consume_quota", {
    p_bucket: "ai_minute",
    p_max: cfg.burstLimit,
    p_window_seconds: 60,
  });
  if (!burst.allowed) throw new AppError("RATE_LIMIT", "The Menace needs a breather. Try again in a minute.", 429);
  if (!aiAvailable()) return null;
  const day = await db.rpc<{ allowed: boolean; remaining: number }>("consume_quota", {
    p_bucket: "ai_day",
    p_max: cfg.dailyLimit,
    p_window_seconds: 86400,
  });
  if (!day.allowed) {
    throw new AppError("RATE_LIMIT", `Daily Menace limit reached (${cfg.dailyLimit}). Even comedians unionize.`, 429);
  }
  return day.remaining;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ tool: string }> }) {
  return handle(async () => {
    assertWritable();
    const { tool } = await ctx.params;
    if (!Object.prototype.hasOwnProperty.call(INPUTS, tool)) throw new AppError("NOT_FOUND", "Unknown Menace tool.", 404);
    const name = tool as ToolName;
    const input = INPUTS[name].parse(await req.json().catch(() => ({}))) as Record<string, unknown>;
    const db = await getUserDb();
    const me = await db.rpc<Me>("get_me");
    const remaining = await checkQuota(db);
    const myLevel = clampIntensity((input as { intensity?: number }).intensity, me.roast_intensity);
    const extra: Record<string, unknown> = {};
    let result: AiResult;

    switch (name) {
      case "chat": {
        const { message } = input as unknown as { message: string };
        const history = (await db.rpc<{ role: "user" | "assistant"; content: string }[]>("get_ai_history", { p_limit: 12 }))
          .map((m) => ({ role: m.role, content: m.content }));
        while (history.length && history[0].role !== "user") history.shift();
        result = await menace({
          tool: name,
          intensity: myLevel,
          history,
          prompt: `<intensity>${intensityRule(myLevel)}</intensity>\n<from>${me.display_name}</from>\n${message}`,
          offlineInput: { text: message, name: me.display_name },
        });
        await db.rpc("save_ai_exchange", { p_user_text: message, p_ai_text: result.text });
        break;
      }
      case "roast_me": {
        const { extra: more } = input as unknown as { extra?: string };
        const c = await db.rpc<AiContext>("get_ai_context", {});
        result = await menace({
          tool: name,
          intensity: myLevel,
          prompt: task(name, myLevel, `<about_them>\n${describeContext(c)}\n</about_them>${more ? `\n<they_say>${more}</they_say>` : ""}`),
          offlineInput: { name: me.display_name },
        });
        break;
      }
      case "roast_post": {
        const { post_id } = input as unknown as { post_id: string };
        const post = await db.rpc<Post>("get_post", { p_id: post_id });
        let level = myLevel;
        if (post.author.id !== me.id && !post.author.is_bot) {
          const c = await db.rpc<AiContext>("get_ai_context", { p_user_id: post.author.id });
          if (!c.roast_opt_in) {
            throw new AppError("FORBIDDEN", `${post.author.display_name} hasn't opted into roasts. Consent matters, even for burns.`, 403);
          }
          level = clampIntensity(Math.min(myLevel, c.roast_intensity ?? 2), 2);
        }
        const content = post.body || (post.media_url ? "(a post with only an image/video and no caption)" : "(empty)");
        result = await menace({
          tool: name,
          intensity: level,
          prompt: task(name, level, `<post author="${post.author.display_name}">\n${content}\n</post>\n<requested_by>${me.display_name}</requested_by>`),
          offlineInput: { name: post.author.display_name, text: post.body },
        });
        extra.comment_id = await serviceRpc<string>("bot_add_comment", { p_post_id: post.id, p_body: result.text });
        break;
      }
      case "skill_issue": {
        const { text } = input as unknown as { text: string };
        result = await menace({ tool: name, intensity: myLevel, prompt: task(name, myLevel, `<situation>${text}</situation>`), offlineInput: { text } });
        break;
      }
      case "rate_take": {
        const { take } = input as unknown as { take: string };
        result = await menace({ tool: name, intensity: myLevel, prompt: task(name, myLevel, `<take>${take}</take>`), offlineInput: { take } });
        break;
      }
      case "propaganda": {
        const { topic } = input as unknown as { topic: string };
        result = await menace({ tool: name, intensity: 2, prompt: task(name, 2, `<topic>${topic}</topic>`), offlineInput: { topic } });
        break;
      }
      case "crisis": {
        const { a, b, incident } = input as unknown as { a: string; b: string; incident?: string };
        result = await menace({
          tool: name,
          intensity: 2,
          prompt: task(name, 2, `<party_a>${a}</party_a>\n<party_b>${b}</party_b>${incident ? `\n<inciting_incident>${incident}</inciting_incident>` : ""}`),
          offlineInput: { a, b },
        });
        break;
      }
      case "headline": {
        const { topic, post } = input as unknown as { topic?: string; post?: boolean };
        const t = topic || CHAOS_TOPICS[Math.floor(Math.random() * CHAOS_TOPICS.length)];
        result = await menace({ tool: name, intensity: 2, prompt: task(name, 2, `<topic>${t}</topic>`), offlineInput: { topic: t } });
        if (post) {
          extra.post_id = await serviceRpc<string>("bot_create_post", { p_body: result.text, p_kind: "news" });
        }
        break;
      }
      case "comeback": {
        const { insult } = input as unknown as { insult: string };
        result = await menace({ tool: name, intensity: myLevel, prompt: task(name, myLevel, `<they_said>${insult}</they_said>`), offlineInput: { insult } });
        break;
      }
      case "chaos": {
        const roll = Math.floor(Math.random() * 3);
        if (roll === 0) {
          const t = CHAOS_TOPICS[Math.floor(Math.random() * CHAOS_TOPICS.length)];
          result = await menace({ tool: "headline", intensity: 2, prompt: task("headline", 2, `<topic>${t}</topic>`), offlineInput: { topic: t } });
          extra.kind = "headline";
        } else if (roll === 1) {
          const [a, b] = CHAOS_PAIRS[Math.floor(Math.random() * CHAOS_PAIRS.length)];
          result = await menace({ tool: "crisis", intensity: 2, prompt: task("crisis", 2, `<party_a>${a}</party_a>\n<party_b>${b}</party_b>`), offlineInput: { a, b } });
          extra.kind = "crisis";
        } else {
          const t = CHAOS_TOPICS[Math.floor(Math.random() * CHAOS_TOPICS.length)];
          result = await menace({ tool: "propaganda", intensity: 2, prompt: task("propaganda", 2, `<topic>${t}</topic>`), offlineInput: { topic: t } });
          extra.kind = "propaganda";
        }
        break;
      }
      case "roast_of_the_day": {
        if (await serviceRpc<boolean>("bot_roast_of_day_exists")) {
          throw new AppError("INVALID", "Today's Roast of the Day has already been served. Come back tomorrow, glutton.", 409);
        }
        const target = await serviceRpc<{ user_id: string; display_name: string; roast_intensity: number; post_body: string } | null>(
          "bot_pick_roast_target",
        );
        if (!target) throw new AppError("NOT_FOUND", "Nobody has opted into roasts yet. Cowards, all of you.", 404);
        const level = clampIntensity(target.roast_intensity, 2);
        result = await menace({
          tool: name,
          intensity: level,
          prompt: task(name, level, `<post author="${target.display_name}">\n${target.post_body}\n</post>`),
          offlineInput: { name: target.display_name },
        });
        const intro = String(result.data?.intro ?? "").slice(0, 600);
        const roast = String(result.data?.roast ?? result.text).slice(0, 800);
        extra.post_id = await serviceRpc<string>("bot_create_post", {
          p_body: intro,
          p_roast: roast,
          p_roast_label: "ROAST OF THE DAY",
          p_kind: "roast",
          p_target_user_id: target.user_id,
        });
        break;
      }
      case "chat_command": {
        const { channel_id, message_id } = input as unknown as { channel_id: string; message_id: string };
        const msg = await db.rpc<Message>("get_message", { p_id: message_id });
        if (msg.author.id !== me.id || msg.channel_id !== channel_id) {
          throw new AppError("FORBIDDEN", "You can only summon the Menace with your own message.", 403);
        }
        const ask = msg.body.replace(/^\/menace\b/i, "").trim() || "say something unhinged";
        result = await menace({
          tool: name,
          intensity: myLevel,
          prompt: task(name, myLevel, `<from>${me.display_name}</from>\n<command>${ask}</command>`),
          offlineInput: { name: me.display_name, text: ask },
        });
        extra.message_id = await serviceRpc<string>("bot_send_message", {
          p_channel_id: channel_id,
          p_body: result.text,
          p_reply_to: message_id,
        });
        break;
      }
    }

    await db.rpc("add_chaos_points", { p_points: 1 }).catch(() => null);
    return { ...result, ...extra, remaining, tool: name };
  });
}
