"use client";

import { useState } from "react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { VolumeX } from "lucide-react";
import { byFn } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/bits";
import { levelTitle } from "@/lib/progress";
import type { MemberExtras, ProfileLite } from "@/lib/types";

const MUTES = [
  [10, "10 min"],
  [60, "1 hour"],
  [1440, "1 day"],
  [10080, "7 days"],
] as const;

const field = "w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-ink outline-none focus:border-brand";

export function MemberToolsDialog({
  member,
  extras,
  canModerate,
  onClose,
}: {
  member: ProfileLite | null;
  extras?: MemberExtras;
  canModerate: boolean;
  onClose: () => void;
}) {
  const { toast, toastError } = useApp();
  const { mutate } = useSWRConfig();
  const [flair, setFlair] = useState<string | null>(null);
  const [xp, setXp] = useState(50);

  const refresh = () => mutate(byFn("admin_member_extras", "admin_overview", "admin_audit", "get_profile_extras", "get_level_board"));
  const run = async (fn: string, args: Record<string, unknown>, msg: string, emoji: string) => {
    try {
      await rpc(fn, args);
      toast(msg, "success", emoji);
      refresh();
    } catch (err) {
      toastError(err);
    }
  };

  const muted = extras?.muted_until && new Date(extras.muted_until) > new Date();
  const flairValue = flair ?? extras?.flair ?? "";

  return (
    <Modal open={member !== null} onClose={onClose} title="Member tools">
      {member && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Avatar src={member.avatar_url} name={member.display_name} size={44} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{member.display_name}</div>
              <div className="text-xs text-muted">
                @{member.username}
                {extras && ` · Lv ${extras.level} ${levelTitle(extras.level).en} · ${extras.xp} XP · 🔥 ${extras.streak}`}
              </div>
            </div>
          </div>

          {canModerate && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Mute</h3>
              {muted ? (
                <div className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 p-2.5 text-sm">
                  <VolumeX size={16} className="text-brand" /> Muted until {new Date(extras!.muted_until!).toLocaleString()}
                  <Button variant="outline" className="ml-auto py-1 text-xs" onClick={() => run("admin_mute", { p_user_id: member.id, p_minutes: 0 }, "Unmuted.", "🔊")}>
                    Unmute
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {MUTES.map(([m, l]) => (
                    <button
                      key={m}
                      onClick={() => run("admin_mute", { p_user_id: member.id, p_minutes: m }, `Muted for ${l}.`, "🔇")}
                      className="rounded-xl border border-line py-2 text-xs transition-colors duration-150 hover:border-brand hover:text-brand"
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-xs text-muted">Muted members can read but can&apos;t post, comment or chat. They get a notice.</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Flair</h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run("admin_set_flair", { p_user_id: member.id, p_flair: flairValue.trim() }, flairValue.trim() ? "Flair set." : "Flair removed.", "🏷️");
              }}
            >
              <input value={flairValue} onChange={(e) => setFlair(e.target.value.slice(0, 24))} placeholder="Night Owl, Mod, OG..." className={field} aria-label="Flair" />
              <Button type="submit" variant="outline">
                Save
              </Button>
            </form>
            <p className="mt-1.5 text-xs text-muted">A short title shown next to their name and on their profile.</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Grant XP</h3>
            <div className="flex gap-2">
              <input
                type="number"
                value={xp}
                min={-5000}
                max={5000}
                onChange={(e) => setXp(Math.max(-5000, Math.min(5000, Math.round(Number(e.target.value) || 0))))}
                className={clsx(field, "w-28")}
                aria-label="XP amount"
              />
              {[50, 100, 500].map((n) => (
                <button key={n} onClick={() => setXp(n)} className="rounded-xl border border-line px-2.5 text-xs hover:border-brand">
                  +{n}
                </button>
              ))}
              <Button
                className="ml-auto"
                disabled={!xp}
                onClick={() => run("admin_grant_xp", { p_user_id: member.id, p_amount: xp }, `${xp > 0 ? "+" : ""}${xp} XP for ${member.display_name}.`, "⬆️")}
              >
                Give
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted">For events and contest winners. Negative amounts take XP away. Logged in the audit log.</p>
          </section>
        </div>
      )}
    </Modal>
  );
}
