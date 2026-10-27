import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en";
import { LOCALES, dirOf } from "@/lib/i18n/locales";
import { coverage, loaders, translate } from "@/lib/i18n/translate";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  it("falls back to English, then to the key, and fills placeholders", () => {
    expect(translate({}, "nav.home")).toBe("Home");
    expect(translate({ "nav.home": "ホーム" }, "nav.home")).toBe("ホーム");
    expect(translate(undefined, "col.count", { count: 3 })).toBe("3 posts");
    expect(translate({}, "nope" as never)).toBe("nope");
  });

  it("marks only Arabic as right-to-left", () => {
    expect(LOCALES.filter((l) => dirOf(l.code) === "rtl").map((l) => l.code)).toEqual(["ar"]);
  });

  for (const l of LOCALES.filter((x) => x.code !== "en")) {
    it(`${l.code}: only known keys, same placeholders, full coverage`, async () => {
      const m = (await loaders[l.code as Exclude<typeof l.code, "en">]()).default;
      for (const [k, v] of Object.entries(m)) {
        expect(k in en, `unknown key ${k}`).toBe(true);
        expect(placeholders(v as string), `${l.code} ${k}`).toEqual(placeholders(en[k as keyof typeof en]));
      }
      expect(coverage(m)).toBe(1);
    });
  }
});
