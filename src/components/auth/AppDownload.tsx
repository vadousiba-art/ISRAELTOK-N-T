"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

// Link to the Android app. Hidden when already running inside it.
export function AppDownload({ className }: { className?: string }) {
  const [inApp, setInApp] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInApp(/IsraelTokntAndroid/.test(navigator.userAgent));
  }, []);
  if (inApp) return null;
  return (
    <a
      href="/download/israeltoknt.apk"
      download="IsraelToknt.apk"
      className={`flex items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-bold transition hover:border-brand hover:text-brand ${className ?? ""}`}
    >
      <Smartphone size={18} /> Get the Android app
    </a>
  );
}
