"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check } from "lucide-react";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Button, Toggle } from "@/components/ui/bits";
import { useApp } from "@/components/providers/AppProvider";
import { useShell } from "@/components/shell/AppShell";
import { rpc } from "@/lib/client/api";
import { byFn, useRpc } from "@/lib/client/hooks";
import type { ProfileLite } from "@/lib/types";

const EMOJIS = ["💬", "🫡", "🔥", "💀", "🗺️", "🐈", "🧢", "🎮", "⚽", "🍕", "🤡", "🚨"];

export function NewChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useShell();
  const { toastError, toast } = useApp();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: members } = useRpc<ProfileLite[]>(open ? "get_members" : null);
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💬");
  const [isPrivate, setPrivate] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const people = (members ?? []).filter(
    (m) => !m.is_bot && m.id !== me.id && (m.display_name + m.username).toLowerCase().includes(filter.toLowerCase()),
  );

  async function startDm(id: string) {
    setBusy(true);
    try {
      const channelId = await rpc<string>("start_dm", { p_user_id: id });
      mutate(byFn("get_channels"));
      onClose();
      router.push(`/chat/${channelId}`);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    setBusy(true);
    try {
      const id = await rpc<string>("create_channel", {
        p_name: name.trim(),
        p_emoji: emoji,
        p_is_private: isPrivate,
        p_member_ids: picked,
      });
      toast("Group chat created. May god help you all.", "chaos", "🎉");
      mutate(byFn("get_channels"));
      onClose();
      router.push(`/chat/${id}`);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New chat">
      <div className="mb-4 flex gap-1 rounded-full border border-line p-1">
        {(["dm", "group"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx("flex-1 rounded-full py-2 text-sm font-bold", mode === m ? "bg-brand text-white" : "text-muted")}
          >
            {m === "dm" ? "Direct message" : "Group chat"}
          </button>
        ))}
      </div>
      {mode === "group" && (
        <div className="mb-3 space-y-3">
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="Group name (e.g. Costco Heist Planning)"
            className="w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 outline-none focus:border-brand"
            aria-label="Group name"
          />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group emoji">
            {EMOJIS.map((e) => (
              <button
                key={e}
                role="radio"
                aria-checked={emoji === e}
                onClick={() => setEmoji(e)}
                className={clsx("rounded-xl p-1.5 text-xl", emoji === e ? "bg-brand/25 ring-2 ring-brand" : "hover:bg-card-2")}
              >
                {e}
              </button>
            ))}
          </div>
          <Toggle
            checked={isPrivate}
            onChange={setPrivate}
            label="Private (invite only)"
            description={isPrivate ? "Only people you pick can see it." : "Every member auto-joins."}
          />
        </div>
      )}
      {(mode === "dm" || isPrivate) && (
        <>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people..."
            className="mb-2 w-full rounded-xl border border-line bg-card-2 px-3 py-2 text-sm outline-none focus:border-brand"
            aria-label="Search people"
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {people.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => (mode === "dm" ? startDm(p.id) : setPicked((all) => (on ? all.filter((x) => x !== p.id) : [...all, p.id])))}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-card-2"
                >
                  <Avatar src={p.avatar_url} name={p.display_name} size={36} online={p.online} />
                  <span className="flex-1">
                    <span className="block text-sm font-bold">{p.display_name}</span>
                    <span className="block text-xs text-muted">@{p.username}</span>
                  </span>
                  {mode === "group" && (
                    <span className={clsx("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-line")}>
                      {on && <Check size={14} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
      {mode === "group" && (
        <Button onClick={createGroup} disabled={busy || !name.trim() || (isPrivate && picked.length === 0)} className="mt-4 w-full">
          {busy ? "Creating..." : `Create group${isPrivate && picked.length ? ` with ${picked.length}` : ""}`}
        </Button>
      )}
    </Modal>
  );
}
