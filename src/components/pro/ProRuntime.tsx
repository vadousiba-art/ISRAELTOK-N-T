"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/lib/client/hooks";
import { equipped, useMyPro } from "@/lib/client/pro";
import { applyTheme, playSound } from "@/lib/client/pro-fx";
import { setBurstStyle } from "@/components/ui/EmojiBurst";
import type { EffectP, ReactionP, SoundP, ThemeP } from "@/lib/pro/catalog";
import { AmbientEffect, RouteTransition } from "./art/Effects";

// Applies the member's personal slots: theme, interface effect, reaction
// style and notification sound. Only items the server says are in effect
// (owned now) are used; nothing here is ever visible to other members.
export function ProRuntime() {
  const { data: pro } = useMyPro();
  const { data: me } = useMe();
  const theme = equipped<ThemeP>(pro, "theme");
  const effect = equipped<EffectP>(pro, "effect");
  const reaction = equipped<ReactionP>(pro, "reaction");
  const sound = equipped<SoundP>(pro, "sound");
  const effectsOn = pro?.settings.effects_on !== false;

  useEffect(() => {
    applyTheme(theme?.p ?? null);
  }, [theme]);
  useEffect(() => () => applyTheme(null), []);

  useEffect(() => {
    setBurstStyle(reaction?.p ?? null);
    return () => setBurstStyle(null);
  }, [reaction]);

  // A new notification plays the chosen sound, only if sounds are switched on.
  const unread = me?.unread_notifications ?? 0;
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current !== null && unread > last.current && sound && pro?.settings.sounds_on && document.visibilityState === "visible") {
      playSound(sound.p, pro.settings.sound_volume ?? 60);
    }
    last.current = unread;
  }, [unread, sound, pro?.settings.sounds_on, pro?.settings.sound_volume]);

  if (!effect || !effectsOn) return null;
  return effect.p.kind === "particles" ? <AmbientEffect p={effect.p} /> : <RouteTransition p={effect.p} />;
}
