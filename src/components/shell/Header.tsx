"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Bell, Menu as MenuIcon, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Logo, Tagline } from "@/components/ui/Logo";
import { NIGHT_MODE_EVENT } from "@/lib/progress";
import { useMe } from "@/lib/client/hooks";
import { useShell } from "./AppShell";

export function Header() {
  const { openDrawer } = useShell();
  const { data: me } = useMe();
  const unread = me?.unread_notifications ?? 0;
  const anyUnread = unread + (me?.unread_messages ?? 0) > 0;
  // Publish the header's height so sticky sub-headers (chat) sit right below it.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Five quick taps on the logo unlock 夜 mode.
  const taps = useRef<number[]>([]);
  const onLogoTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1800), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      window.dispatchEvent(new Event(NIGHT_MODE_EVENT));
    }
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-30 bg-bg/90 px-3 pb-2.5 pt-3 backdrop-blur-xl sm:px-4">
      <div className="flex items-center gap-2">
        <button
          onClick={openDrawer}
          className="relative -ml-1 rounded-full p-2 text-ink transition-colors duration-150 hover:bg-card-2 lg:hidden"
          aria-label={`Open menu${anyUnread ? " (new activity)" : ""}`}
        >
          <MenuIcon size={26} strokeWidth={2} />
          {anyUnread && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand" aria-hidden />}
        </button>
        <Link href="/" onClick={onLogoTap} aria-label="YORU home" className="ml-1 flex flex-col items-start gap-1 lg:ml-0">
          <Logo width={146} />
          <Tagline className="pl-px" />
        </Link>
        <div className="ml-auto flex items-center">
          <Link
            href="/explore"
            className="rounded-full p-2 text-ink transition-colors duration-150 hover:bg-card-2"
            aria-label="Search"
          >
            <Search size={24} strokeWidth={2} />
          </Link>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <Link
            href="/notifications"
            className="relative rounded-full p-2 text-ink transition-colors duration-150 hover:bg-card-2"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <Bell size={24} strokeWidth={2} />
            {unread > 0 && (
              <motion.span
                key={unread}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.18 }}
                className="absolute right-0.5 top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-bold text-white"
              >
                {unread > 99 ? "99+" : unread}
              </motion.span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
