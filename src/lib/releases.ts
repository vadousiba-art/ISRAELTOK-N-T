// "What's new in YORU": versioned release notes. Only shipped, working
// features belong here; each entry must match code that is live.
import type { MessageKey } from "@/lib/i18n/messages/en";

export const WHATS_NEW_EVENT = "yoru:whats-new";
export const RELEASE_SEEN_KEY = "yoru-release-seen";

export type ReleaseSlide = { kicker: string; title: string; body: string; href?: string; cta?: MessageKey };

export type Release = { version: string; name: string; date: string; slides: ReleaseSlide[] };

export const CURRENT_RELEASE: Release = {
  version: "2.0",
  name: "Open Gates",
  date: "2026-10-27",
  slides: [
    {
      kicker: "門 Open Gates",
      title: "YORU opens up.",
      body: "A bigger, more personal YORU: your language, your interests, your look, and new ways to find your people. Everything you had is still here.",
    },
    {
      kicker: "言 16 languages",
      title: "YORU speaks your language.",
      body: "Pick from 16 interface languages in Settings, including Arabic with right-to-left layout. Posts stay exactly as their authors wrote them.",
      href: "/settings",
      cta: "nav.settings",
    },
    {
      kicker: "縁 Discover",
      title: "Find people who share your interests.",
      body: "Add up to 8 interests, then explore people with the same ones, anywhere in the world. Prefer to stay hidden? Switch off “Show me in Discover”.",
      href: "/explore",
      cta: "nav.explore",
    },
    {
      kicker: "顔 Your profile",
      title: "Banners, frames and a badge showcase.",
      body: "Choose a banner style and avatar frame, pin your three proudest badges, and save up to 3 favourite looks to switch between.",
      href: "/settings",
      cta: "nav.settings",
    },
    {
      kicker: "集 Collections",
      title: "Organise what you save.",
      body: "Group posts into named collections. Keep them to yourself or share them with members.",
      href: "/collections",
      cta: "nav.collections",
    },
    {
      kicker: "影 Ghost Mode",
      title: "Go invisible.",
      body: "Turn on Ghost Mode in Settings → Privacy. Your online dot disappears and YORU stops recording when you were last active.",
      href: "/settings",
      cta: "nav.settings",
    },
    {
      kicker: "創 Creators",
      title: "The Creator Showcase is open.",
      body: "Artists, writers, cosplayers and musicians can apply for a creator label. Every application is reviewed by an admin.",
      href: "/creators",
      cta: "nav.creators",
    },
  ],
};
