"use client";

import { useRpc } from "./hooks";

// Open Gates features need migration 0007 on the database. Until it exists
// the probe fails and every Open Gates surface stays hidden, so the app can be
// deployed before or after the migration without breaking anything.
export function useOpenGates() {
  const { data, error, isLoading } = useRpc<number>("open_gates_version", {}, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
    dedupingInterval: 10 * 60_000,
  });
  return { ready: !isLoading || Boolean(error), available: !error && typeof data === "number" && data >= 1 };
}

export type Identity = {
  locale: string | null;
  interests: string[];
  ghost_mode: boolean;
  discoverable: boolean;
  banner_style: string;
  avatar_frame: string;
  showcase_badges: string[];
  creator_category: string | null;
  pro: boolean;
  pro_until: string | null;
  theme_slots: number;
  streak_shield_on: string | null;
};

export function useIdentity() {
  const { available } = useOpenGates();
  return useRpc<Identity>(available ? "get_my_identity" : null);
}
