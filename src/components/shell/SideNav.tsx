"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { LogOut, Plus } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "@/components/ui/Avatar";
import { post } from "@/lib/client/api";
import { useShell } from "./AppShell";
import { useNavItems } from "./navItems";

// Desktop-only left rail.
export function SideNav() {
  const { me, openComposer } = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const items = useNavItems();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col py-6 lg:flex" aria-label="Sidebar">
      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "group flex items-center gap-4 rounded-full px-4 py-3 text-[16px] font-medium transition-colors duration-150 hover:bg-card-2",
              active(href) ? "text-brand" : "text-ink-2",
            )}
          >
            <Icon size={24} />
            {label}
            {badge ? <span className="ms-auto rounded-full bg-brand px-2 text-xs font-bold text-white">{badge}</span> : null}
          </Link>
        ))}
      </nav>
      <motion.button
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12 }}
        onClick={() => openComposer()}
        className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-[16px] font-semibold text-white transition-colors duration-150 hover:bg-brand-2"
      >
        <Plus size={20} strokeWidth={3} /> Drop a post
      </motion.button>
      <div className="mt-auto flex items-center gap-3 rounded-full p-2">
        <Avatar src={me.avatar_url} name={me.display_name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{me.display_name}</div>
          <div className="truncate text-xs text-muted">@{me.username}</div>
        </div>
        <button
          aria-label="Log out"
          className="rounded-full p-2 text-muted hover:bg-card-2 hover:text-brand"
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
