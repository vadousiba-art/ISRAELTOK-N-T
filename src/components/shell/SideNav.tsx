"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LogOut, Plus } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "@/components/ui/Avatar";
import { post } from "@/lib/client/api";
import { useShell } from "./AppShell";
import { navItems } from "./navItems";

// Desktop-only left rail.
export function SideNav() {
  const { me, openComposer } = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col py-6 lg:flex" aria-label="Sidebar">
      <nav className="flex flex-col gap-1">
        {navItems(me).map(({ href, label, icon: Icon, badge, hot }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "group flex items-center gap-4 rounded-full px-4 py-3 text-[16px] font-bold transition hover:bg-card-2",
              active(href) ? "text-brand" : "text-ink",
            )}
          >
            <motion.span whileHover={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 0.4 }}>
              <Icon size={24} className={hot && !active(href) ? "text-hot" : undefined} />
            </motion.span>
            {label}
            {badge ? <span className="ml-auto rounded-full bg-brand px-2 text-xs font-bold text-white">{badge}</span> : null}
          </Link>
        ))}
      </nav>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => openComposer()}
        className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-[16px] font-black text-white shadow-lg shadow-brand/30"
      >
        <Plus size={20} strokeWidth={3} /> Post chaos
      </motion.button>
      <div className="mt-auto flex items-center gap-3 rounded-full p-2">
        <Avatar src={me.avatar_url} name={me.display_name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{me.display_name}</div>
          <div className="truncate text-xs text-muted">@{me.username}</div>
        </div>
        <button
          aria-label="Log out"
          className="rounded-full p-2 text-muted hover:bg-card-2 hover:text-hot"
          onClick={async () => {
            await post("/api/auth/logout").catch(() => null);
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
