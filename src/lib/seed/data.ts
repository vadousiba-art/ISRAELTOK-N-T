// Demo content. Used by demo mode on first boot and by `npm run seed` for
// Supabase. Everything here becomes real rows (likes, comments, reposts...).

export type SeedUser = {
  key: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  status?: string;
  badge?: string;
  verified?: boolean;
  roast_opt_in?: boolean;
  roast_intensity?: number;
  ai_context_opt_in?: boolean;
  leaderboard_opt_in?: boolean;
  inside_jokes?: string[];
  chaos_points?: number;
};

export const CORE_USERS: SeedUser[] = [
  {
    key: "you",
    username: "AriMenace",
    display_name: "Ari",
    avatar_url: "/seed/avatar-you.png",
    bio: "Main character of a show that got cancelled after one episode.",
    status: "plotting something stupid",
    badge: "⚔️",
    roast_opt_in: true,
    roast_intensity: 2,
    inside_jokes: ["the Costco incident", "Zach's 'business idea'", "never trust a cat in sunglasses"],
    chaos_points: 42,
  },
  {
    key: "ethan",
    username: "EthanLang",
    display_name: "Ethan",
    avatar_url: "/seed/avatar-ethan.png",
    bio: "Alberta's most wanted (by my mom, for dinner). Not a war criminal. Just misunderstood.",
    status: "under investigation by the group chat",
    badge: "👑",
    roast_opt_in: true,
    roast_intensity: 3,
    ai_context_opt_in: true,
    inside_jokes: ["Alberta war criminal", "the crown is self-awarded"],
    chaos_points: 88,
  },
  {
    key: "lucas",
    username: "LucasSZN",
    display_name: "Lucas",
    avatar_url: "/seed/avatar-lucas.png",
    bio: "Professional excuse maker. Victim of the economy. Doritos sponsor (unpaid).",
    status: "cooked",
    badge: "🥷",
    roast_opt_in: true,
    roast_intensity: 2,
    inside_jokes: ["the economy made me do it"],
    chaos_points: 61,
  },
  {
    key: "zach",
    username: "ZachAttack",
    display_name: "Zach",
    avatar_url: "/seed/story-zach.png",
    bio: "Cat dad. Geopolitics enjoyer. Has a business idea (please don't ask).",
    status: "drafting a peace treaty with my landlord",
    badge: "🐈",
    roast_opt_in: true,
    roast_intensity: 1,
    chaos_points: 35,
  },
  {
    key: "tyler",
    username: "TylerW",
    display_name: "Tyler",
    avatar_url: "/seed/story-tyler.png",
    bio: "Smiling through it. Ratio'd my own mother once.",
    status: "touching grass (allegedly)",
    badge: "😁",
    roast_opt_in: false,
    chaos_points: 19,
  },
];

const NPC_NAMES = [
  "Noah", "Liam", "Eli", "Omer", "Daniel", "Max", "Leo", "Sam", "Ben", "Jake", "Ryan", "Matt",
  "Adam", "Josh", "Nate", "Owen", "Dylan", "Evan", "Gabe", "Isaac", "Jonah", "Kai", "Luke", "Micah",
  "Nico", "Oren", "Theo", "Yoni", "Amit", "Itai", "Gal", "Tom", "Roee", "Shai", "Idan", "Yuval",
  "Lior", "Dor", "Ido", "Nadav", "Erez", "Asaf", "Tal", "Ziv", "Elad", "Ron", "Guy", "Uri",
];
const NPC_SUFFIX = ["_fr", "SZN", "420", "_irl", "_mid", "Ratio", "_ok", "_lol", "_xd", "_real", "Cooked", "_npc"];
const NPC_BIOS = [
  "Lurker. Occasional menace.",
  "Here for the roasts.",
  "My screen time is a cry for help.",
  "I peaked in the group chat.",
  "Certified yapper.",
  "Opinions nobody asked for, daily.",
];

export const NPC_USERS: SeedUser[] = NPC_NAMES.map((name, i) => ({
  key: `npc${i}`,
  username: `${name}${NPC_SUFFIX[i % NPC_SUFFIX.length]}`,
  display_name: name,
  bio: NPC_BIOS[i % NPC_BIOS.length],
  leaderboard_opt_in: i % 4 === 0,
}));

export const SEED_USERS = [...CORE_USERS, ...NPC_USERS];

const npcs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `npc${(from + i) % NPC_USERS.length}`);

export type SeedComment = { author: string; body: string; minutesAgo: number; replies?: SeedComment[]; ai?: boolean };

export type SeedPost = {
  key: string;
  author: string; // user key or "bot"
  minutesAgo: number;
  body: string;
  kind?: "post" | "poll" | "roast" | "news";
  media_url?: string;
  media_type?: "image" | "video" | "gif";
  link_url?: string;
  roast?: string;
  roast_label?: string;
  target?: string;
  poll?: { label: string; voters: string[] }[];
  likes: string[];
  reactions?: { kind: string; users: string[] }[];
  comments?: SeedComment[];
  reposts?: string[];
  awards?: { kind: string; giver: string }[];
  bookmarkedBy?: string[];
};

export const SEED_POSTS: SeedPost[] = [
  {
    key: "ethan-war-criminal",
    author: "ethan",
    minutesAgo: 120,
    body: "Just found out my school calls me the “Alberta version of a war criminal” 💀\nHonestly... fair.",
    media_url: "/seed/meme-war-criminal.png",
    media_type: "image",
    likes: ["you", "lucas", "zach", "tyler", ...npcs(0, 43)],
    reactions: [
      { kind: "skull", users: ["lucas", "zach", ...npcs(5, 9)] },
      { kind: "fire", users: npcs(20, 6) },
      { kind: "clown", users: ["tyler"] },
    ],
    reposts: npcs(10, 6),
    awards: [
      { kind: "war_crime", giver: "lucas" },
      { kind: "menace", giver: "zach" },
      { kind: "war_crime", giver: "npc3" },
    ],
    comments: [
      { author: "lucas", minutesAgo: 118, body: "bro really said “fair” 💀💀" },
      {
        author: "zach",
        minutesAgo: 115,
        body: "the Geneva Convention is typing...",
        replies: [
          { author: "ethan", minutesAgo: 110, body: "they can't prove anything" },
          { author: "you", minutesAgo: 108, body: "they have literally 4 screenshots" },
        ],
      },
      { author: "tyler", minutesAgo: 112, body: "Alberta's finest export after oil" },
      { author: "npc1", minutesAgo: 106, body: "the sunglasses are doing a lot of legal heavy lifting" },
      { author: "npc4", minutesAgo: 101, body: "“just a prank bro” is not a legal defense Ethan" },
      { author: "npc7", minutesAgo: 95, body: "this is the most Canadian villain arc ever. sorry for the war crimes eh" },
      { author: "npc9", minutesAgo: 90, body: "framing this and putting it in the group chat hall of fame" },
      { author: "npc12", minutesAgo: 84, body: "who made the meme it goes hard" },
      { author: "npc15", minutesAgo: 70, body: "the hands. the HANDS 😭" },
      { author: "npc2", minutesAgo: 61, body: "@EthanLang turn yourself in king" },
    ],
  },
  {
    key: "menace-roast",
    author: "bot",
    minutesAgo: 180,
    kind: "roast",
    target: "ethan",
    body: "Your last post was so unhinged even I had to take a 5 minute mental health break... and I'm an AI.",
    roast_label: "ROAST OF THE DAY",
    roast: "You're not a war criminal, you're just a walking meme with a phone and delusions of grandeur.",
    likes: ["lucas", "zach", "tyler", ...npcs(2, 29)],
    reactions: [{ kind: "skull", users: ["lucas", "you", ...npcs(30, 7)] }],
    reposts: npcs(25, 3),
    comments: [
      { author: "ethan", minutesAgo: 178, body: "I didn't consent to this level of accuracy" },
      { author: "lucas", minutesAgo: 175, body: "THE AI IS COOKING 🔥🔥" },
      { author: "zach", minutesAgo: 170, body: "delusions of grandeur is crazy work" },
      { author: "npc6", minutesAgo: 160, body: "Menace woke up and chose violence" },
      { author: "npc8", minutesAgo: 150, body: "screenshotted for the trial" },
      { author: "tyler", minutesAgo: 140, body: "even the robot needed therapy after Ethan" },
      { author: "npc11", minutesAgo: 130, body: "UN sanctions incoming" },
      { author: "npc14", minutesAgo: 125, body: "Ethan has been diplomatically isolated" },
    ],
  },
  {
    key: "lucas-economy",
    author: "lucas",
    minutesAgo: 300,
    body: "Bro I'm so cooked I just ate a whole bag of chips and blamed it on “the economy” 💀",
    media_url: "/seed/meme-doritos.png",
    media_type: "image",
    likes: ["ethan", "tyler", ...npcs(13, 19)],
    reactions: [{ kind: "crying", users: ["you", "zach", ...npcs(18, 4)] }],
    reposts: npcs(33, 2),
    comments: [
      { author: "ethan", minutesAgo: 295, body: "inflation hit your self control specifically" },
      { author: "zach", minutesAgo: 290, body: "the cat in the sunglasses is you and you know it" },
      { author: "you", minutesAgo: 285, body: "the economy made me do it should be your epitaph" },
      { author: "npc16", minutesAgo: 280, body: "family size bag or regular. this matters for sentencing" },
      { author: "lucas", minutesAgo: 278, body: "family size. i am the family" },
      { author: "npc19", minutesAgo: 260, body: "#cooked" },
      { author: "npc21", minutesAgo: 250, body: "blame the federal reserve next time it sounds smarter" },
      { author: "tyler", minutesAgo: 240, body: "the Doritos dust on your keyboard is evidence" },
      { author: "npc23", minutesAgo: 230, body: "economists hate this one weird trick" },
    ],
  },
  {
    key: "zach-poll",
    author: "zach",
    minutesAgo: 420,
    kind: "poll",
    body: "Emergency summit: which nation does the group chat start beef with next? 🗺️ #geopolitics",
    poll: [
      { label: "Canada (Ethan's homeland)", voters: ["you", "lucas", ...npcs(0, 9)] },
      { label: "Switzerland (too neutral, suspicious)", voters: ["tyler", ...npcs(9, 12)] },
      { label: "The moon", voters: npcs(21, 7) },
      { label: "Ohio", voters: ["ethan", ...npcs(28, 14)] },
    ],
    likes: ["ethan", "lucas", ...npcs(4, 11)],
    comments: [
      { author: "ethan", minutesAgo: 410, body: "Ohio has been asking for it" },
      { author: "lucas", minutesAgo: 400, body: "Switzerland is hiding something and we all know it" },
    ],
  },
  {
    key: "you-cat-memes",
    author: "you",
    minutesAgo: 600,
    body: "Day 47 of asking the group chat to stop sending cat memes. They escalated to cat memes WITH SUNGLASSES. I am losing this war. #cooked",
    likes: ["ethan", ...npcs(36, 8)],
    comments: [{ author: "zach", minutesAgo: 590, body: "@AriMenace the cats will never stop. accept your fate" }],
  },
  {
    key: "menace-news",
    author: "bot",
    minutesAgo: 720,
    kind: "news",
    body: "🚨 BREAKING: Canada recalls its ambassador from the group chat after Ethan’s “just a prank bro” defense is formally rejected by a panel of three cats in sunglasses. Maple syrup exports frozen. #breaking",
    likes: ["you", "lucas", "zach", ...npcs(40, 12)],
    reactions: [{ kind: "salute", users: ["tyler", ...npcs(2, 5)] }],
    comments: [{ author: "ethan", minutesAgo: 700, body: "this is propaganda and i love it" }],
  },
  {
    key: "tyler-challenge",
    author: "tyler",
    minutesAgo: 900,
    body: "Daily challenge: describe your week using only a geopolitical event. Mine: the fall of Constantinople but it's my GPA. #dailychallenge",
    likes: ["you", "zach", ...npcs(14, 6)],
    awards: [{ kind: "galaxy_brain", giver: "you" }],
    comments: [
      { author: "lucas", minutesAgo: 880, body: "mine is the Treaty of Versailles but I'm Germany and the treaty is my rent" },
      { author: "ethan", minutesAgo: 870, body: "the war of 1812 but nobody remembers it happened, like my birthday" },
    ],
  },
  {
    key: "ethan-link",
    author: "ethan",
    minutesAgo: 1300,
    body: "Found a Wikipedia rabbit hole about the Great Emu War and I'm emotionally invested now. The emus won. #history",
    link_url: "https://en.wikipedia.org/wiki/Emu_War",
    likes: ["lucas", "tyler", ...npcs(20, 7)],
    reactions: [{ kind: "w", users: ["zach", ...npcs(1, 3)] }],
    comments: [{ author: "zach", minutesAgo: 1290, body: "the emus are the only undefeated military in history" }],
  },
];

export type SeedStory = { author: string; channel?: string; media_url?: string; text?: string; bg?: string; minutesAgo: number };

// Order matches the home screen: Ethan, The Boys, Lucas, Zach, Tyler.
export const SEED_STORIES: SeedStory[] = [
  { author: "ethan", media_url: "/seed/story-ethan.png", minutesAgo: 20 },
  { author: "zach", channel: "the-boys", media_url: "/seed/story-boys.png", minutesAgo: 35 },
  { author: "lucas", media_url: "/seed/story-lucas.png", minutesAgo: 50 },
  { author: "zach", media_url: "/seed/story-zach.png", minutesAgo: 65 },
  { author: "tyler", media_url: "/seed/story-tyler.png", minutesAgo: 80 },
  { author: "tyler", text: "touched grass today. 0/10 would not recommend", bg: "lime", minutesAgo: 81 },
];

export type SeedMessage = { author: string; body: string; minutesAgo: number; reactions?: [string, string[]][] };

export const SEED_CHANNEL_MESSAGES: Record<string, SeedMessage[]> = {
  "the-boys": [
    { author: "ethan", body: "who leaked my school nickname", minutesAgo: 140 },
    { author: "lucas", body: "nobody leaked it bro it's on the school website", minutesAgo: 138, reactions: [["💀", ["zach", "tyler", "you"]]] },
    { author: "zach", body: "they put it in the yearbook under 'most likely to'", minutesAgo: 135 },
    { author: "you", body: "most likely to get sanctioned", minutesAgo: 131, reactions: [["😭", ["lucas", "ethan"]]] },
    { author: "ethan", body: "I am filing a complaint with the UN", minutesAgo: 60 },
    { author: "tyler", body: "the UN has blocked your number", minutesAgo: 25 },
    { author: "lucas", body: "Menace already roasted him on the feed lmaooo", minutesAgo: 18 },
    { author: "zach", body: "anyone want to hear my business idea", minutesAgo: 12 },
    { author: "tyler", body: "no", minutesAgo: 11, reactions: [["🫡", ["ethan", "lucas"]]] },
    { author: "ethan", body: "@AriMenace get in here we're planning the Costco heist (legal)", minutesAgo: 6 },
  ],
  "war-room": [
    { author: "zach", body: "Breaking: my landlord has rejected the peace treaty", minutesAgo: 400 },
    { author: "lucas", body: "impose sanctions. stop saying good morning to him", minutesAgo: 395 },
    { author: "you", body: "diplomatic incident of the century", minutesAgo: 390 },
  ],
  "meme-dump": [
    { author: "lucas", body: "drafts folder is getting dangerous", minutesAgo: 800 },
    { author: "tyler", body: "post it on the feed coward", minutesAgo: 790 },
  ],
};

// How many of the newest messages in each channel stay unread for "you".
export const SEED_UNREAD_FOR_YOU: Record<string, number> = { "the-boys": 5, "war-room": 0, "meme-dump": 0 };

export const SEED_DMS: { with: string; messages: SeedMessage[] }[] = [
  {
    with: "ethan",
    messages: [
      { author: "ethan", body: "be honest. is the meme too much", minutesAgo: 130 },
      { author: "you", body: "it's exactly enough. it's a work of art", minutesAgo: 128 },
      { author: "ethan", body: "ok posting it. if I get expelled it's on you", minutesAgo: 125 },
    ],
  },
];

// Notifications for "you" that stay unread after seeding.
export const SEED_UNREAD_NOTIFICATIONS = 3;
