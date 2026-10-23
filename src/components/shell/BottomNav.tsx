"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Compass, House, MessageCircleMore, Plus, User } from "lucide-react";
import clsx from "clsx";
import { useMe } from "@/lib/client/hooks";
import { useShell } from "./AppShell";

export function BottomNav() {
  const pathname = usePathname();
  const { openComposer } = useShell();
  const { data: me } = useMe();
  const chatUnread = me?.unread_messages ?? 0;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const item = (href: string, label: string, icon: React.ReactNode, badge?: number) => (
    <Link
      href={href}
      className={clsx(
        "relative flex flex-1 flex-col items-center gap-1 pb-1 pt-2 text-[12px] font-semibold transition",
        isActive(href) ? "text-brand" : "text-ink",
      )}
      aria-current={isActive(href) ? "page" : undefined}
    >
      <motion.span whileTap={{ scale: 0.8, rotate: -8 }} className="relative">
        {icon}
        {badge ? (
          <span className="absolute -right-2.5 -top-2 flex h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 border-bg-2 bg-brand px-1 text-[10.5px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </motion.span>
      {label}
    </Link>
  );

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-2/95 backdrop-blur-xl lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-[640px] items-end px-2 pb-1.5">
        {item("/", "Home", <House size={26} fill={isActive("/") ? "currentColor" : "none"} strokeWidth={isActive("/") ? 1.6 : 2} />)}
        {item("/explore", "Explore", <Compass size={26} strokeWidth={2} />)}
        <div className="flex flex-1 justify-center">
          <motion.button
            onClick={() => openComposer()}
            whileTap={{ scale: 0.85, rotate: 90 }}
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
            className="-mt-6 flex h-[60px] w-[60px] items-center justify-center rounded-full border-[3px] border-brand bg-bg text-brand shadow-[0_0_24px_-4px_var(--brand)]"
            aria-label="Create post"
          >
            <Plus size={32} strokeWidth={2.6} />
          </motion.button>
        </div>
        {item("/chat", "Chat", <MessageCircleMore size={26} strokeWidth={2} />, chatUnread)}
        {item(me ? `/u/${me.username}` : "/settings", "Profile", <User size={26} strokeWidth={2} />)}
      </div>
    </nav>
  );
}
