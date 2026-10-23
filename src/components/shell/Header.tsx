"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Bell, Menu as MenuIcon, Search } from "lucide-react";
import { Logo, Tagline } from "@/components/ui/Logo";
import { useMe } from "@/lib/client/hooks";
import { useShell } from "./AppShell";

export function Header() {
  const { openDrawer } = useShell();
  const { data: me } = useMe();
  const unread = me?.unread_notifications ?? 0;

  return (
    <header className="sticky top-0 z-30 -mx-0 bg-bg/85 px-3 pb-3 pt-3 backdrop-blur-xl sm:px-4">
      <div className="grid grid-cols-[48px_1fr_96px] items-center">
        <button
          onClick={openDrawer}
          className="-ml-1 rounded-full p-2 text-ink transition hover:bg-card-2 lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon size={28} strokeWidth={2} />
        </button>
        <div className="hidden lg:block" />
        <div className="flex flex-col items-center">
          <Link href="/" aria-label="Home" className="block">
            <Logo width={190} />
          </Link>
          <Tagline className="mt-1" />
        </div>
        <div className="flex items-center justify-end gap-1">
          <Link href="/explore" className="rounded-full p-2 text-ink transition hover:bg-card-2" aria-label="Search">
            <Search size={25} strokeWidth={2.2} />
          </Link>
          <Link
            href="/notifications"
            className="relative rounded-full p-2 text-ink transition hover:bg-card-2"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          >
            <motion.span
              className="block"
              animate={unread ? { rotate: [0, -16, 14, -10, 6, 0] } : {}}
              transition={{ duration: 0.9, repeat: unread ? Infinity : 0, repeatDelay: 6 }}
            >
              <Bell size={25} strokeWidth={2.2} />
            </motion.span>
            {unread > 0 && (
              <motion.span
                key={unread}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 600, damping: 15 }}
                className="absolute right-0 top-0 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-bg bg-brand px-1 text-[11px] font-bold text-white"
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
