import { z } from "zod";
import { AVATAR_FRAMES, BANNER_STYLES, CREATOR_CATEGORIES, INTERESTS, LOCALE_CODES as LOCALES, REPORT_CATEGORIES } from "@/lib/opengates";

// Every Postgres function the browser may call, with its argument schema.
// Anything not listed here (bot_*, check_invite, ...) is server-only.

const id = z.uuid();
const ts = z.iso.datetime({ offset: true }).nullable().optional();
const text = (max: number) => z.string().max(max);
const mediaUrl = z.string().max(300).nullable().optional();
const mediaType = z.enum(["image", "video", "gif"]).nullable().optional();
const none = z.object({});
const offset = z.number().int().min(-840).max(840).optional();

export const REACTIONS = ["heart", "skull", "fire", "clown", "cap", "crying", "salute", "w", "l"] as const;
export const AWARDS = ["menace", "war_crime", "touch_grass", "galaxy_brain", "skill_issue", "ratio"] as const;

export const RPC_SCHEMAS = {
  // reads
  get_me: none,
  get_feed: z.object({
    p_mode: z.enum(["latest", "trending", "user", "media", "tag", "search", "bookmarks"]).optional(),
    p_arg: text(100).nullable().optional(),
    p_before: ts,
    p_offset: z.number().int().min(0).max(2000).optional(),
    p_limit: z.number().int().min(1).max(50).optional(),
  }),
  get_post: z.object({ p_id: id }),
  get_comments: z.object({ p_post_id: id }),
  get_stories: none,
  get_channels: none,
  get_channel: z.object({ p_id: id }),
  get_messages: z.object({
    p_channel_id: id,
    p_before: ts,
    p_after: ts,
    p_limit: z.number().int().min(1).max(100).optional(),
  }),
  get_message: z.object({ p_id: id }),
  get_notifications: z.object({ p_before: ts, p_limit: z.number().int().min(1).max(100).optional() }),
  get_members: none,
  get_profile: z.object({ p_username: text(20) }),
  get_leaderboard: none,
  get_trending_tags: z.object({ p_limit: z.number().int().min(1).max(30).optional() }),
  search_profiles: z.object({ p_q: text(40) }),
  get_blocked: none,
  get_ai_history: z.object({ p_limit: z.number().int().min(1).max(100).optional() }),
  admin_overview: none,
  get_site: none,
  get_my_progress: z.object({ p_offset_minutes: offset }),
  get_profile_extras: z.object({ p_username: text(20) }),
  get_featured: none,
  get_level_board: none,
  admin_get_site: none,
  admin_stats: none,
  admin_audit: z.object({ p_limit: z.number().int().min(1).max(200).optional() }),
  admin_member_extras: none,

  // writes
  touch_presence: none,
  update_my_profile: z.object({
    p: z
      .object({
        display_name: text(40).optional(),
        avatar_url: z.string().max(300).nullable().optional(),
        bio: text(280).optional(),
        status: text(80).optional(),
        badge: text(8).optional(),
        roast_opt_in: z.boolean().optional(),
        roast_intensity: z.number().int().min(1).max(3).optional(),
        leaderboard_opt_in: z.boolean().optional(),
        ai_context_opt_in: z.boolean().optional(),
        notification_prefs: z.record(z.string(), z.boolean()).optional(),
        inside_jokes: z.array(text(40)).max(12).optional(),
      })
      .strict(),
  }),
  create_post: z.object({
    p_body: text(2000).optional(),
    p_media_url: mediaUrl,
    p_media_type: mediaType,
    p_link_url: z.url({ protocol: /^https?$/ }).max(500).nullable().optional(),
    p_poll_options: z.array(text(80)).min(2).max(6).nullable().optional(),
  }),
  delete_post: z.object({ p_id: id }),
  toggle_repost: z.object({ p_post_id: id, p_quote: text(2000).nullable().optional() }),
  toggle_reaction: z.object({ p_post_id: id, p_kind: z.enum(REACTIONS) }),
  vote_poll: z.object({ p_post_id: id, p_option_id: id }),
  toggle_bookmark: z.object({ p_post_id: id }),
  add_comment: z.object({ p_post_id: id, p_body: text(1000), p_parent_id: id.nullable().optional() }),
  delete_comment: z.object({ p_id: id }),
  toggle_comment_like: z.object({ p_comment_id: id }),
  give_award: z.object({ p_post_id: id, p_kind: z.enum(AWARDS) }),
  create_story: z.object({
    p_text: text(200).optional(),
    p_media_url: mediaUrl,
    p_media_type: mediaType,
    p_bg: z.enum(["lime", "pink", "purple", "blue", "fire", "void"]).optional(),
    p_channel_id: id.nullable().optional(),
  }),
  view_story: z.object({ p_story_id: id }),
  delete_story: z.object({ p_story_id: id }),
  create_channel: z.object({
    p_name: text(40),
    p_emoji: text(8).optional(),
    p_description: text(200).optional(),
    p_is_private: z.boolean().optional(),
    p_member_ids: z.array(id).max(200).optional(),
  }),
  start_dm: z.object({ p_user_id: id }),
  join_channel: z.object({ p_channel_id: id }),
  leave_channel: z.object({ p_channel_id: id }),
  add_channel_members: z.object({ p_channel_id: id, p_member_ids: z.array(id).max(200) }),
  mark_channel_read: z.object({ p_channel_id: id }),
  send_message: z.object({
    p_channel_id: id,
    p_body: text(2000).optional(),
    p_media_url: mediaUrl,
    p_media_type: mediaType,
    p_reply_to: id.nullable().optional(),
  }),
  delete_message: z.object({ p_id: id }),
  toggle_message_reaction: z.object({ p_message_id: id, p_emoji: z.string().min(1).max(16) }),
  mark_notifications_read: z.object({ p_ids: z.array(id).max(200).nullable().optional() }),
  toggle_block: z.object({ p_user_id: id }),
  create_report: z.object({
    p_target_type: z.enum(["post", "comment", "message", "user", "story"]),
    p_target_id: id,
    p_reason: text(500),
    p_category: z.enum(REPORT_CATEGORIES).optional(),
  }),
  clear_ai_history: none,
  daily_checkin: z.object({ p_offset_minutes: offset }),
  update_my_style: z.object({
    p: z
      .object({
        accent_hue: z.number().int().min(0).max(359).optional(),
        currently_kind: z.enum(["watching", "reading", "listening", "playing", ""]).optional(),
        currently_title: text(60).optional(),
      })
      .strict(),
  }),
  pin_post: z.object({ p_post_id: id.nullable() }),

  // admin (the functions re-check the caller's role)
  admin_create_invite: z.object({
    p_max_uses: z.number().int().min(1).max(500).optional(),
    p_expires_hours: z.number().int().min(0).max(2160).optional(),
    p_note: text(80).optional(),
  }),
  admin_revoke_invite: z.object({ p_code: text(40) }),
  admin_set_role: z.object({ p_user_id: id, p_role: z.enum(["admin", "member"]) }),
  admin_set_banned: z.object({ p_user_id: id, p_banned: z.boolean() }),
  admin_set_verified: z.object({ p_user_id: id, p_verified: z.boolean() }),
  admin_resolve_report: z.object({ p_report_id: id, p_action: z.enum(["dismiss", "delete", "ban"]) }),
  admin_update_site: z.object({
    p: z
      .object({
        announcement: z.object({ text: text(280), tone: z.enum(["info", "event", "alert"]) }).nullable().optional(),
        lockdown: z.boolean().optional(),
        open_signup: z.boolean().optional(),
        slow_mode: z.number().int().min(0).max(3600).optional(),
        word_filter: z.array(text(30)).max(100).optional(),
        nightly_prompt: text(200).nullable().optional(),
      })
      .strict(),
  }),
  admin_broadcast: z.object({ p_body: z.string().min(1).max(280) }),
  admin_feature_post: z.object({ p_post_id: id, p_featured: z.boolean() }),
  admin_mute: z.object({ p_user_id: id, p_minutes: z.number().int().min(0).max(43200) }),
  admin_set_flair: z.object({ p_user_id: id, p_flair: text(24) }),
  admin_grant_xp: z.object({ p_user_id: id, p_amount: z.number().int().min(-5000).max(5000) }),
  admin_recalculate_xp: none,
  admin_support_inbox: z.object({ p_limit: z.number().int().min(1).max(300).optional() }),
  admin_close_support: z.object({ p_id: id, p_closed: z.boolean().optional() }),

  // Open Gates (migration 0007)
  open_gates_version: none,
  get_my_identity: none,
  get_welcome_state: none,
  mark_welcome_seen: z.object({ p_version: z.string().regex(/^[0-9]{1,4}(\.[0-9]{1,3})?$/) }),
  update_my_identity: z.object({
    p: z
      .object({
        locale: z.enum(LOCALES).nullable().optional(),
        interests: z.array(z.enum(INTERESTS)).max(8).optional(),
        ghost_mode: z.boolean().optional(),
        discoverable: z.boolean().optional(),
        banner_style: z.enum(BANNER_STYLES).optional(),
        avatar_frame: z.enum(AVATAR_FRAMES).optional(),
        showcase_badges: z.array(z.string().regex(/^[a-z_]{2,30}$/)).max(3).optional(),
      })
      .strict(),
  }),
  get_profile_identity: z.object({ p_username: text(20) }),
  get_discover: z.object({
    p_interest: z.enum(INTERESTS).nullable().optional(),
    p_locale: z.enum(LOCALES).nullable().optional(),
    p_creators_only: z.boolean().optional(),
    p_limit: z.number().int().min(1).max(50).optional(),
    p_offset: z.number().int().min(0).max(2000).optional(),
  }),
  get_my_collections: z.object({ p_post_id: id.nullable().optional() }),
  get_collection: z.object({ p_id: id, p_before: ts, p_limit: z.number().int().min(1).max(50).optional() }),
  save_collection: z.object({
    p_id: id.nullable().optional(),
    p_name: z.string().trim().min(1).max(40).optional(),
    p_description: text(200).optional(),
    p_emoji: text(8).optional(),
    p_visibility: z.enum(["private", "members"]).optional(),
  }),
  delete_collection: z.object({ p_id: id }),
  set_collection_item: z.object({ p_collection_id: id, p_post_id: id, p_in: z.boolean().optional() }),
  get_my_themes: none,
  save_theme: z.object({
    p_name: z.string().trim().min(1).max(30),
    p_accent_hue: z.number().int().min(0).max(359),
    p_theme: z.enum(["dark", "light", "system"]).optional(),
    p_ambience: z.enum(["off", "stars", "sakura", "rain", "fireflies"]).optional(),
  }),
  delete_theme: z.object({ p_id: id }),
  get_my_creator_application: none,
  apply_creator: z.object({
    p_category: z.enum(CREATOR_CATEGORIES),
    p_portfolio_url: z.url({ protocol: /^https?$/ }).max(300),
    p_statement: z.string().trim().min(20, "Tell us a little more (20+ characters).").max(600),
  }),
  withdraw_creator_application: none,
  admin_creator_queue: z.object({ p_status: z.enum(["pending", "approved", "rejected", "withdrawn", "revoked"]).optional() }),
  admin_review_creator: z.object({ p_application_id: id, p_approve: z.boolean(), p_note: text(300).optional() }),
  admin_revoke_creator: z.object({ p_user: id, p_note: text(300).optional() }),
  admin_grant_pro: z.object({ p_user: id, p_days: z.number().int().min(1).max(366), p_note: text(200).optional() }),
  admin_revoke_pro: z.object({ p_user: id }),
  admin_pro_members: none,
  admin_report_flags: none,
  admin_escalate_report: z.object({ p_report_id: id, p_escalated: z.boolean() }),
} as const;

export type RpcName = keyof typeof RPC_SCHEMAS;

export function isRpcName(name: string): name is RpcName {
  return Object.prototype.hasOwnProperty.call(RPC_SCHEMAS, name);
}

// Functions that only read. Everything else is paused while
// MAINTENANCE_READ_ONLY=true (database cutover window, see
// docs/database-migration.md).
export const READ_RPCS: ReadonlySet<RpcName> = new Set<RpcName>([
  "get_me", "get_feed", "get_post", "get_comments", "get_stories", "get_channels", "get_channel",
  "get_messages", "get_message", "get_notifications", "get_members", "get_profile", "get_leaderboard",
  "get_trending_tags", "search_profiles", "get_blocked", "get_ai_history", "admin_overview", "get_site",
  "get_my_progress", "get_profile_extras", "get_featured", "get_level_board", "admin_get_site",
  "admin_stats", "admin_audit", "admin_member_extras", "admin_support_inbox",
  "open_gates_version", "get_my_identity", "get_profile_identity", "get_discover", "get_my_collections",
  "get_collection", "get_my_themes", "get_my_creator_application", "admin_creator_queue", "admin_pro_members",
  "admin_report_flags", "get_welcome_state",
]);
