"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { CircleUserRound, House, MessageCircleMore, Plus, Search } from "lucide-react";
import clsx from "clsx";
import { useMe } from "@/lib/client/hooks";
import { useShell } from "./AppShell";

export function BottomNav() {
  const pathname = usePathname();
  const { openComposer } = useShell();
  const { data: me } = useMe();
  const chatUnread = me?.unread_messages ?? 0;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const item = (href: string, label: string, Icon: typeof House, badge?: number) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={clsx(
          "relative flex flex-1 flex-col items-center gap-1 pb-1 pt-2.5 text-[12px] font-medium transition-colors duration-150",
          active ? "text-brand" : "text-muted hover:text-ink",
        )}
        aria-current={active ? "page" : undefined}
      >
        <motion.span whileTap={{ scale: 0.86 }} transition={{ duration: 0.12 }} className="relative">
          <Icon size={25} strokeWidth={active ? 2.2 : 1.9} fill={active && Icon === House ? "currentColor" : "none"} />
          {badge ? (
            <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </motion.span>
        {label}
      </Link>
    );
  };

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-2/95 backdrop-blur-xl lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-[640px] items-end px-2 pb-1.5">
        {item("/", "Home", House)}
        {item("/explore", "Explore", Search)}
        <div className="flex flex-1 justify-center">
          <motion.button
            onClick={() => openComposer()}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className="-mt-6 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand text-white shadow-[0_6px_22px_-6px_rgb(242_13_47/0.7)] ring-4 ring-bg"
            aria-label="Create post"
          >
            <Plus size={30} strokeWidth={2.4} />
          </motion.button>
        </div>
        {item("/chat", "Chat", MessageCircleMore, chatUnread)}
        {item(me ? `/u/${me.username}` : "/settings", "Profile", CircleUserRound)}
      </div>
    </nav>
  );
}
