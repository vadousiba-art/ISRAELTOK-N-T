"use client";

import { useEffect, useState } from "react";
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
      <span className="text-5xl font-bold text-brand" aria-hidden>
        夜
      </span>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted">
        Something went wrong on our side. Your account and posts are safe.
        {error.digest && <span className="mt-1 block font-mono text-xs">ref #{error.digest}</span>}
      </p>
      <button onClick={reset} className="rounded-full bg-brand px-6 py-3 font-semibold text-white transition-colors duration-150 hover:bg-brand-2">
        Try again
      </button>
    </div>
  );
}
