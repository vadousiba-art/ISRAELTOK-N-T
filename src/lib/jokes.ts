import type { AwardKind, ReactionKind } from "./types";

export const TAGLINE_1 = "The internet was a mistake.";
export const TAGLINE_2 = "You made it worse.";

export const LOADING_LINES = [
  "Consulting the group chat elders...",
  "Bribing the algorithm...",
  "Negotiating with the servers (they want snacks)...",
  "Loading your bad decisions...",
  "Untangling the brainrot...",
  "Asking three cats in sunglasses for permission...",
  "Summoning content nobody asked for...",
  "Calibrating the cringe detector...",
  "Recalling our ambassador from your phone...",
  "Downloading more RAM (legally)...",
  "Warming up the roast oven...",
  "Filing paperwork with the Ministry of Memes...",
];

export const randomLoading = () => LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];

export const EMPTY_LINES = {
  feed: "The feed is empty. Be the chaos you want to see.",
  comments: "No comments yet. Be the first to say something regrettable.",
  notifications: "No notifications. Nobody's thinking about you. Peaceful, honestly.",
  chats: "No chats yet. Start one before the silence gets loud.",
  bookmarks: "No bookmarks. You haven't found anything worth saving. Relatable.",
  search: "Nothing found. Even the algorithm gave up.",
  leaderboard: "Nobody here yet. The throne is empty and kind of sad.",
  messages: "Dead chat. Say something unhinged to revive it.",
  stories: "No stories. Everyone's touching grass apparently.",
};

export const SUCCESS_TOASTS = {
  post: ["Posted. No take-backs.", "Unleashed upon the timeline.", "Your post has entered the arena."],
  comment: ["Comment deployed.", "Words were said. Consequences pending."],
  repost: ["Reposted. Spreading the brainrot."],
  unrepost: ["Repost retracted. Cowardly but valid."],
  bookmark: ["Saved for your future therapist."],
  unbookmark: ["Unsaved. It wasn't that good anyway."],
  report: ["Reported. The mods have been summoned."],
  copy: ["Link copied. Go cause problems."],
  award: ["Award granted. The committee approves."],
};

export const pickLine = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "heart", emoji: "❤️", label: "Love" },
  { kind: "skull", emoji: "💀", label: "Dead" },
  { kind: "fire", emoji: "🔥", label: "Fire" },
  { kind: "crying", emoji: "😭", label: "Crying" },
  { kind: "clown", emoji: "🤡", label: "Clown" },
  { kind: "cap", emoji: "🧢", label: "Cap" },
  { kind: "salute", emoji: "🫡", label: "Salute" },
  { kind: "w", emoji: "🇼", label: "W" },
  { kind: "l", emoji: "🇱", label: "L" },
];
export const REACTION_EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.kind, r.emoji])) as Record<ReactionKind, string>;

export const AWARDS: { kind: AwardKind; emoji: string; label: string; blurb: string }[] = [
  { kind: "menace", emoji: "😈", label: "Certified Menace", blurb: "For outstanding chaos" },
  { kind: "war_crime", emoji: "⚖️", label: "War Crime of the Week", blurb: "The Hague has been notified" },
  { kind: "touch_grass", emoji: "🌱", label: "Touch Grass", blurb: "Please. Go outside." },
  { kind: "galaxy_brain", emoji: "🧠", label: "Galaxy Brain", blurb: "Too smart or too stupid, unclear" },
  { kind: "skill_issue", emoji: "📉", label: "Skill Issue", blurb: "Self-explanatory" },
  { kind: "ratio", emoji: "📊", label: "Ratio King", blurb: "Bodied the replies" },
];
export const AWARD_INFO = Object.fromEntries(AWARDS.map((a) => [a.kind, a])) as Record<AwardKind, (typeof AWARDS)[number]>;

export const BADGES: Record<string, { emoji: string; label: string; blurb: string }> = {
  founder: { emoji: "🏛️", label: "Founding Menace", blurb: "Started this whole mess" },
  verified: { emoji: "✅", label: "Verified", blurb: "Officially real (allegedly)" },
  first_blood: { emoji: "🩸", label: "First Blood", blurb: "Posted for the first time" },
  yapper: { emoji: "🗣️", label: "Certified Yapper", blurb: "25+ posts" },
  banger: { emoji: "💥", label: "Banger Merchant", blurb: "A post hit 10+ likes" },
  ratio_god: { emoji: "👑", label: "Ratio God", blurb: "100+ likes received" },
  roast_survivor: { emoji: "🔥", label: "Roast Survivor", blurb: "Got roasted by the Menace and lived" },
  award_magnet: { emoji: "🏆", label: "Award Magnet", blurb: "5+ community awards" },
  chaos_agent: { emoji: "🌀", label: "Chaos Agent", blurb: "50+ chaos points" },
  challenge_accepted: { emoji: "🎯", label: "Challenge Accepted", blurb: "Did a daily challenge" },
  fireproof: { emoji: "🧯", label: "Fireproof", blurb: "Opted into nuclear roasts" },
};

export const DAILY_CHALLENGES = [
  "Describe your week using only a geopolitical event.",
  "Post your most unhinged screenshot from this month (crop the evidence).",
  "Write a formal declaration of war against a minor inconvenience.",
  "Rate the last thing you ate like it's a peace treaty.",
  "Explain your sleep schedule as a stock market chart.",
  "Write the opening line of your villain origin story.",
  "Confess your worst take. The Menace will judge.",
  "Draft a diplomatic apology to someone you left on read.",
  "Describe your fridge contents like a war correspondent.",
  "Post a photo of something and give it a ridiculous political title.",
  "Write a breaking news headline about your own life.",
  "Invent a new national holiday and its cursed traditions.",
  "Rank the group chat members as countries. No explanations.",
  "Write a 1-star review of a normal day.",
];

export function todaysChallenge(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  return DAILY_CHALLENGES[day % DAILY_CHALLENGES.length];
}

export const TICKER = [
  "🚨 BREAKING: Local man discovers he has been muted in 4 group chats since 2023",
  "📉 MARKETS: Doritos futures surge after Lucas blames 'the economy' again",
  "🌍 UN calls emergency session over Ethan's sunglasses",
  "🐈 Three cats in sunglasses elected to the Security Council",
  "⚖️ The Hague confirms it has a folder labelled 'The Boys'",
  "🛰️ Switzerland denies everything, refuses to elaborate",
  "🌱 Scientists confirm grass still exists, nobody checks",
  "📊 Poll: 9 out of 10 takes in this app are 'actually insane'",
  "🧢 Zach's business idea officially classified as a threat to national security",
  "🗺️ Ohio annexes your sleep schedule",
];

export const STORY_BG: Record<string, string> = {
  lime: "linear-gradient(135deg,#c6ff00,#21c55d)",
  pink: "linear-gradient(135deg,#ff2d95,#ff7ab8)",
  purple: "linear-gradient(135deg,#9d4dff,#2a63ff)",
  blue: "linear-gradient(135deg,#1f6bff,#00d4ff)",
  fire: "linear-gradient(135deg,#ff6a00,#ff2d55)",
  void: "radial-gradient(circle at 30% 20%,#2a2f45,#04060d)",
};

export const INTENSITY = [
  { level: 1 as const, name: "Light Simmer", emoji: "🌶️", blurb: "Playful teasing" },
  { level: 2 as const, name: "Medium War Crime", emoji: "🌶️🌶️", blurb: "Savage but affectionate" },
  { level: 3 as const, name: "Geneva Violation", emoji: "☢️", blurb: "Unhinged. No survivors." },
];

export const NOTIFICATION_TEXT: Record<string, string> = {
  like: "liked your post",
  reaction: "reacted to your post",
  comment: "commented on your post",
  reply: "replied to your comment",
  mention: "mentioned you",
  repost: "reposted your post",
  award: "gave your post an award",
  message: "sent you a message",
  friend_post: "posted something",
  roast: "roasted you",
};

export const ERROR_TITLES = [
  "Something exploded.",
  "The servers have unionized.",
  "This page got sanctioned.",
  "Diplomatic incident detected.",
  "Skill issue (ours, this time).",
];
