// Creates the four demo identities through the app's real flows on a LOCAL
// demo-mode server (embedded database, nothing touches production) and
// captures phone-resolution screenshots and interaction sequences.
//
//   DEMO_MODE=true DEMO_DATA_DIR=.data-promo03 npx next start -p 3200
//   node promo-03/capture/capture.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, launch, newCtx, settle } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "assets", "screens");
const SEQ = path.join(ROOT, "assets", "sequences");
fs.mkdirSync(SHOTS, { recursive: true });

// Fictional demonstration users. Every field below is a real profile/settings option.
const IDS = [
  {
    key: "kuro", look: "DARK MANGA", name: "Kuro", user: "kuro_ink", badge: "🥷",
    status: "inking chapter 12 tonight",
    bio: "Black ink, white paper. One short manga a month, no colour needed.",
    jokes: ["screentone addict", "the 4am panel"],
    hue: "Ice", theme: "Dark", currently: ["reading", "Vagabond"], ambience: "Rain",
    post: "Splash page for chapter 12 is done. Pure ink, zero colour. #manga",
  },
  {
    key: "rei", look: "CRIMSON UNDERGROUND", name: "REI", user: "rei_underground", badge: "⚔️",
    status: "3am. city lights. headphones on.",
    bio: "Night walks, loud guitars and too much ramen. 夜は長い。",
    jokes: ["last train gang", "ramen at 2am"],
    hue: "YORU red", theme: "Dark", currently: ["listening", "Tokyo night drive mix"], ambience: "Stars",
    post: "Which opening had you replaying it on the last train home? #anime",
  },
  {
    key: "mio", look: "CLEAN MINIMAL", name: "Mio", user: "mio_studio", badge: "",
    status: "",
    bio: "less, but better.",
    jokes: [],
    hue: "Sakura", theme: "Light", currently: ["watching", "Frieren"], ambience: "Sakura",
    post: "Slow Sunday. Tea, sketchbook, one episode at a time.",
  },
  {
    key: "gremlin", look: "INTERNET CHAOS", name: "GREMLIN.EXE", user: "gremlin_exe", badge: "🤡",
    status: "touching grass (failed)",
    bio: "professional lurker. certified hot-take dispenser. ask me about the Costco incident.",
    jokes: ["the Costco incident", "cereal is a soup", "Ohio arc"],
    hue: "Gold", theme: "Dark", currently: ["playing", "rhythm games at 4am"], ambience: "Fireflies",
    post: "hot take: the ending was fine actually. see you in the replies 🤡 #anime",
  },
];

const browser = await launch();

async function page4(id) {
  const ctx = await newCtx(browser);
  // The local demo server adds a "DEMO MODE" strip that production never shows.
  await ctx.addInitScript(() => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = 'div:has(> a[href="/setup"]){display:none !important}';
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.documentElement) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${id.key} page error]`, e.message));
  return { ctx, page };
}

async function join(page, id) {
  await page.goto(`${BASE}/join/promo`);
  await page.getByLabel("Display name").fill(id.name);
  await page.getByLabel("Username").fill(id.user);
  await page.getByLabel("Email").fill(`${id.user}@example.com`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Join YORU" }).click();
  await page.waitForURL(`${BASE}/`);
  await settle(page, 1200);
}

const top = (page) => page.evaluate(() => window.scrollTo(0, 0));
async function shot(page, file, wait = 900) {
  await settle(page, wait);
  await page.screenshot({ path: file });
}
function seqDir(name) {
  const d = path.join(SEQ, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  let n = 0;
  return { d, next: () => path.join(d, `${String(n++).padStart(3, "0")}.png`) };
}

async function openProfile(page, id) {
  await page.goto(`${BASE}/u/${id.user}`);
  await page.getByRole("button", { name: "Edit" }).waitFor();
  await top(page);
  await settle(page, 1300);
}

// Fill the real Edit-profile dialog. With `rec`, screenshot each step.
async function editProfile(page, id, rec) {
  const snap = async (w = 250) => rec && (await shot(page, rec.next(), w));
  await page.getByRole("button", { name: "Edit" }).click();
  await snap(700);
  await page.locator('input[type="file"]').setInputFiles(path.join(ROOT, "assets", "avatars", `${id.key}.png`));
  await page.getByRole("button", { name: "Change avatar" }).locator("img").first().waitFor();
  await snap(600);
  const status = page.getByLabel("Status");
  if (id.status) {
    if (rec) {
      for (let i = 3; i <= id.status.length + 2; i += 3) {
        await status.fill(id.status.slice(0, Math.min(i, id.status.length)));
        await snap(120);
      }
    } else await status.fill(id.status);
  }
  const bio = page.getByLabel("Bio");
  if (rec) {
    for (let i = 6; i <= id.bio.length + 5; i += 6) {
      await bio.fill(id.bio.slice(0, Math.min(i, id.bio.length)));
      await snap(120);
    }
  } else await bio.fill(id.bio);
  if (id.badge) {
    await page.getByRole("button", { name: `Flair ${id.badge}` }).click();
    await snap(300);
  }
  for (const j of id.jokes) {
    await page.getByPlaceholder("the Costco incident").fill(j);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await snap(200);
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  await top(page);
  await snap(2600);
}

async function scrollToStyle(page) {
  await page.evaluate(() => {
    const el = document.getElementById("hue")?.closest("section") || document.getElementById("hue");
    el?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -70);
  });
  await settle(page, 500);
}

async function styleSettings(page, id, { skipHue = false } = {}) {
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("App color").waitFor();
  await page.getByRole("radio", { name: id.theme, exact: true }).click();
  if (!skipHue) await page.getByRole("button", { name: new RegExp(`^${id.hue} `) }).click();
  // The form re-syncs from the server once settings load; wait, then save and verify.
  await settle(page, 1800);
  const form = page.locator("form", { has: page.getByLabel("Activity", { exact: true }) });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByLabel("Activity", { exact: true }).selectOption(id.currently[0]);
    await page.getByLabel("Title", { exact: true }).fill(id.currently[1]);
    await form.getByRole("button", { name: "Save" }).click();
    await settle(page, 1500);
    await page.reload();
    await page.getByLabel("App color").waitFor();
    await settle(page, 1500);
    const kind = await page.getByLabel("Activity", { exact: true }).inputValue();
    const title = await page.getByLabel("Title", { exact: true }).inputValue();
    if (kind === id.currently[0] && title === id.currently[1]) break;
  }
  await page.getByRole("radio", { name: new RegExp(`^${id.ambience} `) }).click();
  await settle(page, 1200);
}

async function checkinAndPost(page, id) {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Check in for tonight" }).click();
  await settle(page, 1500);
  await page.getByRole("button", { name: "Create post" }).click();
  await page.getByLabel("Post text").fill(id.post);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.locator("article", { hasText: id.post.slice(0, 20) }).first().waitFor();
  await settle(page, 2500);
}

async function finalShots(page, id) {
  await openProfile(page, id);
  await shot(page, path.join(SHOTS, `profile-${id.key}.png`), 1800);
  await page.screenshot({ path: path.join(SHOTS, `profile-${id.key}-full.png`), fullPage: true });
  await page.goto(`${BASE}/`);
  await top(page);
  await shot(page, path.join(SHOTS, `home-${id.key}.png`), 2200);
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("App color").waitFor();
  await scrollToStyle(page);
  await shot(page, path.join(SHOTS, `settings-style-${id.key}.png`), 900);
}

// --reshoot key[,key]: log back in as existing identities and retake their final screens.
const reshootArg = process.argv.includes("--reshoot") ? process.argv[process.argv.indexOf("--reshoot") + 1] : null;
if (reshootArg) {
  for (const id of IDS.filter((x) => reshootArg.split(",").includes(x.key))) {
    const { ctx, page } = await page4(id);
    await page.goto(`${BASE}/login`);
    await page.getByRole("button", { name: new RegExp(id.name.replace(/[.]/g, "\\.")) }).first().click();
    await page.waitForURL(`${BASE}/`);
    if (id.theme === "Light") {
      await page.goto(`${BASE}/settings`);
      await page.getByRole("radio", { name: "Light", exact: true }).click();
    }
    await page.goto(`${BASE}/settings`);
    await page.getByRole("radio", { name: new RegExp(`^${id.ambience} `) }).click();
    await openProfile(page, id);
    await page.getByRole("button", { name: "Edit" }).click();
    await shot(page, path.join(SHOTS, `edit-${id.key}.png`), 900);
    await page.keyboard.press("Escape");
    await finalShots(page, id);
    console.log("reshot", id.key);
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
}

for (const id of IDS) {
  const { ctx, page } = await page4(id);
  await join(page, id);
  console.log("joined", id.user);

  if (id.key === "rei") {
    // The editing workflow, step by step.
    const rec = seqDir("edit-rei");
    await openProfile(page, id);
    await shot(page, rec.next(), 600);
    await editProfile(page, id, rec);
    await styleSettings(page, id);
  } else if (id.key === "kuro") {
    await openProfile(page, id);
    await editProfile(page, id);
    await styleSettings(page, id, { skipHue: true });
    // The colour slider, dragged from YORU red to Ice, then the profile wearing it.
    await openProfile(page, id);
    await shot(page, path.join(SHOTS, "recolor-before-kuro.png"), 1500);
    const rec = seqDir("hue-kuro");
    await page.goto(`${BASE}/settings`);
    await page.getByLabel("App color").waitFor();
    await scrollToStyle(page);
    await shot(page, rec.next(), 600);
    for (let h = 351; h >= 205; h -= 8) {
      await page.getByLabel("App color").fill(String(h));
      await shot(page, rec.next(), 140);
    }
    await page.getByRole("button", { name: /^Ice / }).click();
    await shot(page, rec.next(), 1200);
    await openProfile(page, id);
    await shot(page, path.join(SHOTS, "recolor-after-kuro.png"), 1500);
  } else if (id.key === "mio") {
    await openProfile(page, id);
    await editProfile(page, id);
    await styleSettings(page, { ...id, theme: "Dark" });
    await openProfile(page, id);
    await shot(page, path.join(SHOTS, "theme-before-mio.png"), 1500);
    await page.goto(`${BASE}/settings`);
    await page.getByRole("radio", { name: "Dark", exact: true }).waitFor();
    await top(page);
    await shot(page, path.join(SHOTS, "theme-control-dark-mio.png"), 700);
    await page.getByRole("radio", { name: "Light", exact: true }).click();
    await shot(page, path.join(SHOTS, "theme-control-light-mio.png"), 900);
    await openProfile(page, id);
    await shot(page, path.join(SHOTS, "theme-after-mio.png"), 1500);
  } else {
    await openProfile(page, id);
    await editProfile(page, id);
    await page.goto(`${BASE}/settings`);
    await page.getByLabel("Let others roast me").check().catch(async () => page.getByRole("switch", { name: "Let others roast me" }).click());
    await styleSettings(page, id);
  }

  // Edit dialog, filled, for the asset set.
  await openProfile(page, id);
  await page.getByRole("button", { name: "Edit" }).click();
  await shot(page, path.join(SHOTS, `edit-${id.key}.png`), 900);
  await page.keyboard.press("Escape");

  await checkinAndPost(page, id);
  await finalShots(page, id);
  console.log("captured", id.key);
  await ctx.close();
}
await browser.close();
console.log("done");
