"use client";

import Link from "next/link";
import { Fragment } from "react";

// Same hashtag rule as extract_hashtags() in SQL (unicode-friendly).
const TOKEN = /(#[^\s#.,!?;:()[\]{}"'<>/\\]{1,40}|@[A-Za-z0-9_]{3,20}|https?:\/\/[^\s<]+)/g;

export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <p className={className} dir="auto">
      {parts.map((part, i) => {
        if (!part) return null;
        const isToken = i % 2 === 1; // split() with a capture group puts matches at odd indexes
        if (isToken && part.startsWith("#")) {
          return (
            <Link
              key={i}
              href={`/explore?tag=${encodeURIComponent(part.slice(1).toLowerCase())}`}
              className="font-semibold text-brand-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        if (isToken && part.startsWith("@")) {
          return (
            <Link
              key={i}
              href={`/u/${part.slice(1)}`}
              className="font-semibold text-brand-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        if (isToken) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all text-brand-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part.replace(/^https?:\/\//, "").slice(0, 48)}
              {part.length > 56 ? "…" : ""}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
}
