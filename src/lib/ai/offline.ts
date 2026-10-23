import type { Intensity, ToolName } from "./prompts";

// "Menace Lite": a template comedian used when no ANTHROPIC_API_KEY is set or
// the API is unreachable. Responses are labelled as offline in the UI.

const pick = <T>(arr: T[], seed = Math.random()) => arr[Math.floor(seed * arr.length) % arr.length];

const ROASTS: Record<Intensity, string[]> = {
  1: [
    "{name}, you have the energy of a group project member who 'did the research'.",
    "{name}, you're like a software update: nobody asked, and you take forever.",
    "{name} is proof that confidence and competence are two different subscriptions.",
  ],
  2: [
    "{name}, your personality was clearly downloaded from a free trial that expired.",
    "{name}, you're not a main character, you're a loading screen tip nobody reads.",
    "{name}, the group chat goes quiet when you type and it's not out of respect.",
    "{name}, you have the strategic depth of a puddle in a parking lot.",
  ],
  3: [
    "{name}, the UN has a secret file on you labelled 'why'. It's empty. They just gave up.",
    "{name}, you're the human equivalent of a reply-all apology email.",
    "{name}, scientists studied your decision-making and the study got its funding pulled out of pity.",
    "{name}, your browser history is a war crime and your takes are the cover-up.",
  ],
};

const NATIONS = ["the Group Chat", "Ohio", "Switzerland", "the Moon", "Canada", "a Costco parking lot", "the Federal Reserve of Vibes"];
const TOPICS = ["the economy", "Ethan's sunglasses", "the group chat", "Monday", "cat memes", "Ohio", "touching grass", "Zach's business idea"];

export function offlineGenerate(tool: ToolName, input: Record<string, string | number | undefined>, intensity: Intensity) {
  const name = String(input.name ?? "you");
  const subject = String(input.text ?? input.topic ?? input.take ?? input.insult ?? pick(TOPICS)).slice(0, 120);
  const s = Math.random();
  switch (tool) {
    case "roast_me":
    case "roast_post":
    case "chat_command":
      return {
        text: pick(ROASTS[intensity], s).replace("{name}", name) +
          (tool === "roast_post" && subject ? ` Also "${subject.slice(0, 60)}" is not the flex you think it is.` : ""),
      };
    case "chat":
      return {
        text: pick([
          `Menace Lite here (my brain is offline). Regarding "${subject.slice(0, 60)}": skill issue. Next question.`,
          `I'd roast that properly but my API key is touching grass. For now: no.`,
          `Bold of you to say "${subject.slice(0, 50)}" to a robot running on fumes. Respect. Also, cringe.`,
        ], s),
      };
    case "skill_issue": {
      const score = Math.floor(60 + s * 40);
      return {
        text: `${score}% skill issue`,
        data: {
          score,
          verdict: pick(["Terminal skill issue", "Mostly self-inflicted", "Certified own goal"], s),
          diagnosis: `Analysis of "${subject.slice(0, 60)}" complete. Prescription: two hours of touching grass, then try again with less confidence.`,
        },
      };
    }
    case "rate_take": {
      const rating = Math.round((s * 12 - 2) * 10) / 10;
      return {
        text: `${rating}/10`,
        data: {
          rating,
          verdict: rating > 7 ? "Unfortunately based" : rating > 3 ? "Room temperature take" : "Geneva-level cursed",
          reason: `"${subject.slice(0, 60)}" has been reviewed by a panel of three cats in sunglasses. They are concerned.`,
        },
      };
    }
    case "propaganda":
      return {
        text: "",
        data: {
          ministry: "Ministry of Unnecessary Decrees",
          headline: `${subject.toUpperCase().slice(0, 40)} IS MANDATORY`,
          slogan: "Comply now. Complain later. Post about it never.",
          decree: `By order of the group chat, ${subject} is now a national priority. Dissenters will be muted for 24 hours. Glory to the feed.`,
        },
      };
    case "crisis": {
      const a = String(input.a ?? pick(NATIONS, s));
      const b = String(input.b ?? pick(NATIONS, 1 - s));
      return {
        text: [
          `1. INCIDENT: ${a} leaves ${b} on read for 47 minutes. Ambassadors are summoned.`,
          `2. ESCALATION: ${b} posts a vague story clearly about ${a}. Markets react. Doritos stock up 12%.`,
          `3. INTERVENTION: The UN sends a strongly worded meme. Both sides screenshot it.`,
          `4. RESOLUTION: Peace treaty signed in a Costco food court. Clause 7: nobody mentions this ever again.`,
        ].join("\n"),
      };
    }
    case "headline":
      return { text: `🚨 BREAKING: ${subject} declares independence from common sense — experts "not surprised, honestly"` };
    case "comeback":
      return {
        text: pick([
          "I'd agree with you but then we'd both be wrong.",
          "You're not the main character. You're the 'skip intro' button.",
          "Say that again, but this time with a functioning frontal lobe.",
        ], s),
      };
    case "roast_of_the_day":
      return {
        text: "",
        data: {
          intro: "I read this post and had to take a 5 minute mental health break... and I'm an AI.",
          roast: pick(ROASTS[intensity], s).replace("{name}", name),
        },
      };
    case "chaos":
    default:
      return { text: `🚨 BREAKING: ${pick(NATIONS, s)} has entered the chat. Nobody knows why. Stay indoors.` };
  }
}
