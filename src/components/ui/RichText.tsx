"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

// Same hashtag rule as extract_hashtags() in SQL (unicode-friendly).
const TOKEN = /(#[^\s#.,!?;:()[\]{}"'<>/\\]{1,40}|@[A-Za-z0-9_]{3,20}|https?:\/\/[^\s<]+)/g;

// ||like this|| hides a spoiler until tapped.
const SPOILER = /\|\|([\s\S]{1,500}?)\|\|/g;

export function RichText({ text, className }: { text: string; className?: string }) {
  const chunks = text.split(SPOILER);
  return (
    <p className={className} dir="auto">
      {chunks.map((chunk, i) =>
        i % 2 === 1 ? <Spoiler key={i}>{tokens(chunk, `s${i}`)}</Spoiler> : <Fragment key={i}>{tokens(chunk, `t${i}`)}</Fragment>,
      )}
    </p>
  );
}

function Spoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="spoiler"
      data-open={open}
      role={open ? undefined : "button"}
      tabIndex={open ? undefined : 0}
      aria-label={open ? undefined : "Spoiler, tap to reveal"}
      onClick={(e) => {
        if (open) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e) => {
        if (!open && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
    </span>
  );
}

function tokens(text: string, prefix: string) {
  const parts = text.split(TOKEN);
  return parts.map((part, idx) => {
    const i = `${prefix}-${idx}`;
    if (!part) return null;
    const isToken = idx % 2 === 1; // split() with a capture group puts matches at odd indexes
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
  });
}
