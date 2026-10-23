"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ERROR_TITLES } from "@/lib/jokes";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [title, setTitle] = useState(ERROR_TITLES[0]);
  useEffect(() => {
    console.error(error);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(ERROR_TITLES[Math.floor(Math.random() * ERROR_TITLES.length)]);
  }, [error]);
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div
        className="text-7xl"
        animate={{ rotate: [0, -15, 15, -10, 10, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
        aria-hidden
      >
        💥
      </motion.div>
      <h1 className="glitch text-2xl font-black" data-text={title}>
        {title}
      </h1>
      <p className="max-w-sm text-sm text-muted">
        A diplomatic incident occurred between your browser and our servers. Talks are ongoing.
        {error.digest && <span className="mt-1 block font-mono text-xs">incident #{error.digest}</span>}
      </p>
      <button onClick={reset} className="rounded-full bg-brand px-6 py-3 font-black text-white transition hover:scale-105">
        Try again (bravely)
      </button>
    </div>
  );
}
