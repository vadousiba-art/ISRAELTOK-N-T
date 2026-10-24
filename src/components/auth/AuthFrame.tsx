"use client";

import { motion } from "motion/react";
import { Logo, Tagline, TAGLINE_JP } from "@/components/ui/Logo";
import { AppDownload } from "./AppDownload";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(242,13,47,0.12),transparent_60%)]" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-10">
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <Logo width={260} />
          <Tagline size="lg" className="mt-3" />
          <p className="mt-2 text-sm text-muted">{TAGLINE_JP}</p>
        </motion.div>
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.06, duration: 0.22, ease: "easeOut" }}
          className="card mt-8 w-full p-5"
        >
          {children}
        </motion.div>
        <AppDownload className="mt-4" />
      </main>
    </div>
  );
}
