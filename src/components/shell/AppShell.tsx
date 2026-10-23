"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useMe } from "@/lib/client/hooks";
import { ApiError } from "@/lib/client/api";
import { LiveProvider } from "@/components/providers/LiveProvider";
import { useApp } from "@/components/providers/AppProvider";
import { ChaosLoader } from "@/components/ui/bits";
import { EmojiBurstLayer } from "@/components/ui/EmojiBurst";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import { SideNav } from "./SideNav";
import { RightRail } from "./RightRail";
import { FloatingMemes } from "./FloatingMemes";
import { ComposerModal, type ComposerTab } from "@/components/feed/ComposerModal";
import { StoryComposer } from "@/components/stories/StoryComposer";
import type { Me } from "@/lib/types";

type ComposerOpts = { tab?: ComposerTab; file?: File | null };
type ShellCtx = {
  me: Me;
  openComposer: (opts?: ComposerOpts) => void;
  openStoryComposer: () => void;
  openDrawer: () => void;
};
const Ctx = createContext<ShellCtx | null>(null);

export function useShell() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell outside AppShell");
  return v;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me, error } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const { config } = useApp();
  const [composer, setComposer] = useState<ComposerOpts | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [error, router, pathname]);

  const openComposer = useCallback((opts?: ComposerOpts) => setComposer(opts ?? {}), []);
  const openStoryComposer = useCallback(() => setStoryOpen(true), []);
  const openDrawer = useCallback(() => setDrawer(true), []);

  if (!me) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        {error && !(error instanceof ApiError && error.status === 401) ? (
          <div className="max-w-sm px-6 text-center">
            <div className="mb-3 text-5xl">🛰️</div>
            <p className="font-bold">Can&apos;t reach the mothership.</p>
            <p className="mt-1 text-sm text-muted">{error instanceof ApiError ? error.message : "Unknown error."}</p>
          </div>
        ) : (
          <ChaosLoader />
        )}
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ me, openComposer, openStoryComposer, openDrawer }}>
      <LiveProvider userId={me.id}>
        <FloatingMemes />
        {config.mode === "demo" && (
          <div className="relative z-30 bg-gradient-to-r from-volt via-hot to-volt px-3 py-1 text-center text-[11px] font-bold tracking-wide text-white">
            DEMO MODE · local embedded database · anyone can log in as anyone ·{" "}
            <a href="/setup" className="underline">
              connect Supabase
            </a>
          </div>
        )}
        <div className="relative mx-auto flex w-full max-w-[1280px] justify-center gap-6 lg:px-4">
          <SideNav />
          <div className="w-full min-w-0 max-w-[640px]">
            <Header />
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={pathname}
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="px-3 pb-32 sm:px-4 lg:pb-12"
              >
                {children}
              </motion.main>
            </AnimatePresence>
          </div>
          <RightRail />
        </div>
        <BottomNav />
        <Drawer open={drawer} onClose={() => setDrawer(false)} />
        <ComposerModal
          open={composer !== null}
          initialTab={composer?.tab}
          initialFile={composer?.file ?? null}
          onClose={() => setComposer(null)}
        />
        <StoryComposer open={storyOpen} onClose={() => setStoryOpen(false)} />
        <EmojiBurstLayer />
      </LiveProvider>
    </Ctx.Provider>
  );
}
