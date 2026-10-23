"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { SWRConfig } from "swr";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppMode } from "@/lib/config";
import { ApiError, rpc } from "@/lib/client/api";

export type PublicConfig = { mode: AppMode; supabaseUrl: string | null; supabaseAnonKey: string | null };
export type ThemePref = "dark" | "light" | "system";
export type MotionPref = "system" | "reduce" | "full";
type ToastKind = "success" | "error" | "info" | "chaos";
type Toast = { id: number; kind: ToastKind; message: string; emoji?: string };

type AppCtx = {
  config: PublicConfig;
  supabase: () => SupabaseClient | null;
  toast: (message: string, kind?: ToastKind, emoji?: string) => void;
  toastError: (err: unknown) => void;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  motionPref: MotionPref;
  setMotionPref: (m: MotionPref) => void;
  sound: boolean;
  setSound: (on: boolean) => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

let browserClient: SupabaseClient | null = null;

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

const TOAST_EMOJI: Record<ToastKind, string> = { success: "✅", error: "💀", info: "📢", chaos: "🌀" };

export function AppProvider({ config, children }: { config: PublicConfig; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const [theme, setThemeState] = useState<ThemePref>("dark");
  const [motionPref, setMotionState] = useState<MotionPref>("system");
  const [sound, setSoundState] = useState(false);

  useEffect(() => {
    // Hydrate preferences saved by the boot script / previous visits.
    /* eslint-disable react-hooks/set-state-in-effect */
    setThemeState(readPref<ThemePref>("itn-theme", "dark"));
    setMotionState(readPref<MotionPref>("itn-motion", "system"));
    setSoundState(readPref<string>("itn-sound", "off") === "on");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const applyTheme = useCallback((t: ThemePref) => {
    const resolved = t === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t;
    document.documentElement.dataset.theme = resolved;
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, applyTheme]);

  const setTheme = useCallback(
    (t: ThemePref) => {
      setThemeState(t);
      writePref("itn-theme", t);
      applyTheme(t);
    },
    [applyTheme],
  );

  const setMotionPref = useCallback((m: MotionPref) => {
    setMotionState(m);
    writePref("itn-motion", m);
    if (m === "system") delete document.documentElement.dataset.motion;
    else document.documentElement.dataset.motion = m;
  }, []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    writePref("itn-sound", on ? "on" : "off");
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "success", emoji?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message, emoji }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 3200);
  }, []);

  const toastError = useCallback(
    (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : "Something broke. The vibes are off.";
      toast(msg, "error");
    },
    [toast],
  );

  const supabase = useCallback(() => {
    if (config.mode !== "supabase" || !config.supabaseUrl || !config.supabaseAnonKey) return null;
    browserClient ??= createBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
    return browserClient;
  }, [config]);

  const value = useMemo<AppCtx>(
    () => ({ config, supabase, toast, toastError, theme, setTheme, motionPref, setMotionPref, sound, setSound }),
    [config, supabase, toast, toastError, theme, setTheme, motionPref, setMotionPref, sound, setSound],
  );

  const reducedMotion = motionPref === "reduce" ? "always" : motionPref === "full" ? "never" : "user";

  return (
    <Ctx.Provider value={value}>
      <SWRConfig
        value={{
          fetcher: (key: [string, string, Record<string, unknown>]) => rpc(key[1], key[2]),
          revalidateOnFocus: true,
          shouldRetryOnError: (err) => !(err instanceof ApiError) || err.status >= 500 || err.status === 0,
          errorRetryCount: 2,
        }}
      >
        <MotionConfig reducedMotion={reducedMotion}>
          {children}
          <div
            className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
            aria-live="polite"
            role="status"
          >
            <AnimatePresence>
              {toasts.map((t) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: -30, scale: 0.8, rotate: -4 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                  className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur ${
                    t.kind === "error"
                      ? "border-hot/50 bg-[#2a0716]/95 text-white"
                      : t.kind === "chaos"
                        ? "border-volt/50 bg-[#170a2e]/95 text-white"
                        : "border-line bg-card/95 text-ink"
                  }`}
                >
                  <span className="text-lg">{t.emoji ?? TOAST_EMOJI[t.kind]}</span>
                  <span>{t.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </MotionConfig>
      </SWRConfig>
    </Ctx.Provider>
  );
}
