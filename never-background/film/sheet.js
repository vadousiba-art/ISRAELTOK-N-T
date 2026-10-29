// Character sheet for checking the art (node film/render.mjs --sheet).
import { head, profile, standing, phoneHead, silhouette, torso } from "./art.js";
import { PAPER } from "./manga.js";

export function sheet(g) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, 1080, 1920);
  const at = (x, y, s, fn) => { g.save(); g.translate(x, y); g.scale(s, s); fn(); g.restore(); };
  at(0, 0, 0.6, () => head(g, { headphones: true, eyes: "open", mouth: "neutral" }));
  at(360, 0, 0.6, () => head(g, { headphones: true, eyes: "up", mouth: "smile", rim: 1, brows: "determined", look: [0.2, -1] }));
  at(720, 0, 0.6, () => head(g, { headphones: true, eyes: "down", mouth: "sad", light: "below", brows: "worried", look: [0, 1] }));
  at(0, 440, 0.6, () => head(g, { hair: "bob", mouth: "grin", eyes: "smile", earring: true, collar: "tee" }));
  at(360, 440, 0.6, () => head(g, { hair: "curly", tone: 0.35, mouth: "smile", headset: true, collar: "jacket" }));
  at(720, 440, 0.6, () => head(g, { hair: "cap", tone: 0.18, mouth: "open", collar: "dark", eyes: "wide" }));
  at(0, 880, 0.6, () => head(g, { hair: "long", glasses: true, mouth: "soft", collar: "tee" }));
  at(360, 880, 0.6, () => head(g, { hair: "buns", mouth: "grin", eyes: "smile", blush: true, tone: 0.1 }));
  at(720, 880, 0.6, () => head(g, { hair: "undercut", shave: true, tone: 0.45, mouth: "smile", earring: true, collar: "jacket" }));
  at(0, 1320, 0.6, () => profile(g, { headphones: true, eyes: "closed" }));
  at(360, 1320, 0.6, () => profile(g, { light: "below" }));
  at(740, 1310, 0.23, () => standing(g, { headphones: true, mouth: "soft", eyes: "open", rim: 1 }));
  at(900, 1350, 0.5, () => { g.translate(80, 80); phoneHead(g, { seed: 3 }); });
}
