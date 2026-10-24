import { expect, test, type Page } from "@playwright/test";

// The login route allows 10 attempts per IP per minute; give each test login
// its own address so the suite does not trip that limit.
let ipSeq = 1;
async function loginAs(page: Page, name: RegExp) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.0.0.${ipSeq++}` });
  await page.goto("/login");
  await page.getByRole("button", { name }).first().click();
  await page.waitForURL("**/");
  await expect(page.getByText("What's on your mind?")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("logged-out visitors are sent to login", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Choose an account" })).toBeVisible();
});

test("home feed matches the seeded mockup", async ({ page }) => {
  await loginAs(page, /Ari/);
  const first = page.locator("article").first();
  await expect(first).toContainText("Alberta version of a war criminal");
  await expect(first).toContainText("47");
  await expect(page.locator("article").nth(1)).toContainText("ROAST OF THE DAY");
  await expect(page.getByRole("button", { name: "Add story" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Notifications, 3 unread/ })).toBeVisible();
});

test("create a post, like it, comment on it", async ({ page }) => {
  await loginAs(page, /Ari/);
  const text = `e2e post ${Date.now()} #testing`;
  await page.getByRole("button", { name: "Create post" }).click();
  await page.getByLabel("Post text").fill(text);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const card = page.locator("article", { hasText: text });
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: /^Like/ }).click();
  await expect(card.getByRole("button", { name: "Unlike" })).toContainText("1");
  await page.reload();
  await expect(page.locator("article", { hasText: text }).getByRole("button", { name: "Unlike" })).toContainText("1");

  await page.locator("article", { hasText: text }).getByRole("button", { name: /comments/ }).click();
  await page.waitForURL("**/post/**");
  await page.getByLabel("Add a comment...").fill("first comment from e2e");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.getByText("first comment from e2e")).toBeVisible();
});

test("image uploads are validated, stored and served to members", async ({ page }) => {
  await loginAs(page, /Ari/);
  // 1x1 transparent PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('input[type=file][accept^="image"]').first().setInputFiles({ name: "evidence.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Upload preview")).toBeVisible();
  const caption = `photo post ${Date.now()}`;
  await page.getByLabel("Post text").fill(caption);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const img = page.locator("article", { hasText: caption }).locator('img[src^="/api/media/"]');
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // A fake "image" (HTML bytes) is rejected by the server-side signature check.
  const slot = await page.request.post("/api/upload/sign", { data: { type: "image/png", size: 20 } });
  const { data } = await slot.json();
  const res = await page.request.put(data.uploadUrl, { data: Buffer.from("<html><script>x</script>"), headers: { "Content-Type": "image/png" } });
  expect(res.status()).toBe(400);
});

test("polls can be created and voted on", async ({ page }) => {
  await loginAs(page, /Ari/);
  await page.getByRole("button", { name: "Create post" }).click();
  await page.getByRole("button", { name: "Poll", exact: true }).click();
  const q = `Which is worse? ${Date.now()}`;
  await page.getByLabel("Post text").fill(q);
  await page.getByLabel("Poll option 1").fill("Mondays");
  await page.getByLabel("Poll option 2").fill("Ohio");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const card = page.locator("article", { hasText: q });
  await card.getByRole("button", { name: "Ohio" }).click();
  await expect(card.getByText("1 vote")).toBeVisible();
  await expect(card.getByText("100%")).toBeVisible();
});

test("group chat messages arrive in realtime for other members", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await loginAs(pa, /Ethan/);
  await loginAs(pb, /Lucas/);
  await pa.goto("/chat/00000000-0000-4000-8000-0000000c0001");
  await pb.goto("/chat/00000000-0000-4000-8000-0000000c0001");
  await expect(pa.getByText("who leaked my school nickname")).toBeVisible();
  const msg = `realtime check ${Date.now()}`;
  await pb.getByLabel("Message", { exact: true }).fill(msg);
  await pb.getByRole("button", { name: "Send" }).click();
  await expect(pb.getByText(msg)).toBeVisible();
  await expect(pa.getByText(msg)).toBeVisible({ timeout: 15_000 });
  await a.close();
  await b.close();
});

test("chaos tools work without an API key (Menace Lite)", async ({ page }) => {
  await loginAs(page, /Ari/);
  await page.goto("/chaos");
  await page.getByPlaceholder("Cereal is a soup").fill("cereal is a soup");
  await page.getByRole("button", { name: "Rate it" }).click();
  await expect(page.getByText("/10").first()).toBeVisible();
  await expect(page.getByText(/Menace Lite/).first()).toBeVisible();
});

test("admin invites a new member who can join and post", async ({ page, browser }) => {
  await loginAs(page, /Ari/);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Invites" }).click();
  await expect(page.locator("code")).toHaveCount(1); // the revoked seed invite
  await page.getByRole("button", { name: "Create & copy link" }).click();
  await expect(page.locator("code")).toHaveCount(2);
  const code = (await page.locator("code").first().textContent())!.trim();
  expect(code).toMatch(/^[a-z0-9]{10}$/);

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(`/join/${code}`);
  await expect(guest.getByRole("heading", { name: "You're invited" })).toBeVisible();
  const handle = `Newbie${Date.now() % 100000}`;
  await guest.getByLabel("Display name").fill("Newbie");
  await guest.getByLabel("Username").fill(handle);
  await guest.getByLabel("Email").fill(`${handle.toLowerCase()}@example.com`);
  await guest.getByRole("button", { name: "Join YORU" }).click();
  await guest.waitForURL("**/");
  await expect(guest.getByText("What's on your mind?")).toBeVisible();
  await guest.goto(`/u/${handle}`);
  await expect(guest.getByRole("heading", { name: /Newbie/ })).toBeVisible();
  await ctx.close();

  await page.reload();
  await page.getByRole("tab", { name: "Invites" }).click();
  await expect(page.getByText("1/5 used")).toBeVisible();
});

test("nightly check-in grows the streak and XP", async ({ page }) => {
  await loginAs(page, /Lucas/);
  await page.getByRole("button", { name: "Check in for tonight" }).click();
  await expect(page.getByText(/Night 1 · \+20 XP/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Checked in, 1 night streak/ })).toBeDisabled();
});

test("spoilers stay hidden until tapped", async ({ page }) => {
  await loginAs(page, /Zach/);
  await page.getByRole("button", { name: "Create post" }).click();
  await page.getByLabel("Post text").fill(`ending recap ||the villain wins ${Date.now()}||`);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const spoiler = page.getByRole("button", { name: "Spoiler, tap to reveal" }).first();
  await expect(spoiler).toBeVisible();
  await spoiler.click();
  await expect(page.locator(".spoiler[data-open=true]").first()).toContainText("the villain wins");
});

test("admins run announcements and quiet mode from site controls", async ({ page, browser }) => {
  await loginAs(page, /Ari/);
  await page.goto("/admin");
  await expect(page.getByText("Active today")).toBeVisible();
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByLabel("Announcement text").fill("Movie night Friday 9pm");
  await page.getByRole("button", { name: "event" }).click();
  await page.getByRole("button", { name: "Publish banner" }).click();
  await expect(page.getByText("Announcement is live.")).toBeVisible();
  await page.getByRole("switch", { name: /Quiet mode/ }).click();
  await expect(page.getByText("Quiet mode on. Only admins can post.")).toBeVisible();

  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await loginAs(member, /Tyler/);
  await expect(member.getByRole("status").filter({ hasText: "Movie night Friday 9pm" })).toBeVisible();
  await expect(member.getByText(/Quiet mode: only admins can post/)).toBeVisible();
  await member.getByRole("button", { name: "Create post" }).click();
  await member.getByLabel("Post text").fill("can I post?");
  await member.getByRole("button", { name: "Post", exact: true }).click();
  await expect(member.getByText(/YORU is in quiet mode right now/)).toBeVisible();
  await ctx.close();

  await page.getByRole("switch", { name: /Quiet mode/ }).click();
  await expect(page.getByText("Quiet mode off.")).toBeVisible();
  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.getByText("changed quiet mode").first()).toBeVisible();
});

test("command palette jumps anywhere", async ({ page }) => {
  await loginAs(page, /Ari/);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search commands").fill("Leader");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/leaderboard");
  await expect(page.getByRole("button", { name: /Top Levels/ })).toBeVisible();
});

test("invalid invite codes are rejected", async ({ page }) => {
  await page.goto("/join/definitely-not-real");
  await expect(page.getByText(/doesn't exist/)).toBeVisible();
});
