"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LogOut, X } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "@/components/ui/Avatar";
import { Logo } from "@/components/ui/Logo";
import { post } from "@/lib/client/api";
import { TICKER } from "@/lib/jokes";
import { useShell } from "./AppShell";
import { navItems } from "./navItems";

export function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useShell();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    onClose();
    // close when navigating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const logout = async () => {
    await post("/api/auth/logout").catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "-100%", rotate: -3 }}
            animate={{ x: 0, rotate: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="absolute inset-y-0 left-0 flex w-[84%] max-w-[330px] flex-col overflow-y-auto border-r border-line bg-bg-2 p-5"
            aria-label="Menu"
          >
            <div className="mb-5 flex items-center justify-between">
              <Logo width={150} />
              <button onClick={onClose} className="rounded-full p-2 hover:bg-card-2" aria-label="Close menu">
                <X size={22} />
              </button>
            </div>
            <Link href={`/u/${me.username}`} className="card mb-4 flex items-center gap-3 p-3">
              <Avatar src={me.avatar_url} name={me.display_name} size={48} ring="gradient" />
              <div className="min-w-0">
                <div className="truncate font-bold">
                  {me.display_name} {me.badge}
                </div>
                <div className="truncate text-sm text-muted">@{me.username}</div>
              </div>
              <div className="ml-auto rounded-full bg-lime/15 px-2 py-1 text-xs font-black text-lime">
                {me.chaos_points} 🌀
              </div>
            </Link>
            <nav className="flex flex-col gap-0.5">
              {navItems(me).map(({ href, label, icon: Icon, badge, hot }) => (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-4 rounded-2xl px-3 py-3 text-[15px] font-bold transition hover:bg-card-2",
                    pathname === href && "bg-card text-brand",
                  )}
                >
                  <Icon size={22} className={hot ? "text-hot" : undefined} />
                  {label}
                  {hot && <span className="sticker ml-1 rotate-[-6deg] rounded bg-lime px-1.5 text-[11px] text-black">NEW</span>}
                  {badge ? (
                    <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{badge}</span>
                  ) : null}
                </Link>
              ))}
            </nav>
            <div className="my-5 overflow-hidden rounded-xl border border-line bg-card py-2">
              <div className="marquee flex w-max gap-8 whitespace-nowrap text-xs font-semibold text-muted">
                {[...TICKER, ...TICKER].map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-3 font-bold text-hot hover:bg-card-2"
            >
              <LogOut size={20} /> Log out (coward)
            </button>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
