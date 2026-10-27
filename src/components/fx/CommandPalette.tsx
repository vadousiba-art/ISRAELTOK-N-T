"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, Search } from "lucide-react";
import clsx from "clsx";
import { useRpc } from "@/lib/client/hooks";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { useNavItems } from "@/components/shell/navItems";
import { Avatar } from "@/components/ui/Avatar";
import { AMBIENCE_MODES } from "./Ambience";
import { NIGHT_MODE_EVENT, PALETTE_EVENT } from "@/lib/progress";
import type { ProfileLite } from "@/lib/types";

type Cmd = { id: string; label: string; hint?: string; icon?: React.ReactNode; run: () => void };

// Ctrl/Cmd+K: jump anywhere, find people, flip settings.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { openComposer } = useShell();
  const navLinks = useNavItems();
  const { theme, setTheme, setAmbience } = useApp();
  const query = q.trim();
  const { data: people } = useRpc<ProfileLite[]>(open && query.length >= 1 ? "search_profiles" : null, { p_q: query.replace(/^@/, "") });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQ("");
    setSel(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: Cmd[] = [
      { id: "new", label: "Drop a post", hint: "Create", run: () => openComposer({ tab: "text" }) },
      ...navLinks.map(({ href, label, icon: Icon }) => ({ id: href, label, hint: "Go to", icon: <Icon size={16} />, run: go(href) })),
      { id: "theme", label: theme === "light" ? "Switch to dark theme" : "Switch to light theme", hint: "Theme", run: () => setTheme(theme === "light" ? "dark" : "light") },
      ...AMBIENCE_MODES.map((m) => ({ id: `amb-${m.id}`, label: `Ambience: ${m.label} ${m.jp}`, hint: "Effects", run: () => setAmbience(m.id) })),
      { id: "night", label: "夜 mode", hint: "Secret", run: () => window.dispatchEvent(new Event(NIGHT_MODE_EVENT)) },
    ];
    const lower = query.toLowerCase();
    const matched = lower ? base.filter((c) => c.label.toLowerCase().includes(lower) || c.hint?.toLowerCase().includes(lower)) : base;
    const found = (people ?? []).slice(0, 5).map<Cmd>((p) => ({
      id: `u-${p.id}`,
      label: p.display_name,
      hint: `@${p.username}`,
      icon: <Avatar src={p.avatar_url} name={p.display_name} size={20} />,
      run: go(`/u/${p.username}`),
    }));
    const tag: Cmd[] = lower.startsWith("#") && lower.length > 1 ? [{ id: "tag", label: `Browse ${lower}`, hint: "Tag", run: go(`/explore?tag=${encodeURIComponent(lower.slice(1))}`) }] : [];
    return [...tag, ...found, ...matched].slice(0, 12);
  }, [navLinks, openComposer, people, query, router, setAmbience, setTheme, theme]);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal aria-label="Command palette">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value.slice(0, 40));
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSel((s) => Math.min(s + 1, commands.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSel((s) => Math.max(s - 1, 0));
                  } else if (e.key === "Enter") {
                    run(commands[sel]);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                placeholder="Search people, pages, #tags, settings..."
                className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-muted palette-input"
                aria-label="Search commands"
              />
              <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">ESC</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
              {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing found. It&apos;s quiet tonight.</li>}
              {commands.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === sel}>
                  <button
                    onMouseEnter={() => setSel(i)}
                    onClick={() => run(c)}
                    className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", i === sel ? "bg-card-2 text-ink" : "text-ink-2")}
                  >
                    <span className="flex w-5 justify-center text-muted">{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="text-xs text-muted">{c.hint}</span>}
                    {i === sel && <CornerDownLeft size={14} className="text-brand" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
