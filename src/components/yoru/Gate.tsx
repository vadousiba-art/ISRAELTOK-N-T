"use client";

import { ChaosLoader, Empty } from "@/components/ui/bits";
import { useOpenGates } from "@/lib/client/gates";

// Wraps Open Gates pages: until the database has migration 0007 they explain
// that the feature is not switched on yet, instead of erroring.
export function Gate({ children }: { children: React.ReactNode }) {
  const { ready, available } = useOpenGates();
  if (!ready) return <ChaosLoader />;
  if (!available) return <Empty text="This part of YORU isn't switched on yet. Check back soon." />;
  return <>{children}</>;
}
