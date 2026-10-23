"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Type, X } from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/bits";
import { useApp } from "@/components/providers/AppProvider";
import { rpc, uploadFile } from "@/lib/client/api";
import { byFn, useRpc } from "@/lib/client/hooks";
import { STORY_BG } from "@/lib/jokes";
import type { Channel } from "@/lib/types";

const BGS = ["lime", "pink", "purple", "blue", "fire", "void"] as const;

export function StoryComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast, toastError, supabase } = useApp();
  const { mutate } = useSWRConfig();
  const { data: channels } = useRpc<Channel[]>(open ? "get_channels" : null);
  const [text, setText] = useState("");
  const [bg, setBg] = useState<(typeof BGS)[number]>("lime");
  const [media, setMedia] = useState<{ path: string; kind: "image" | "video" | "gif"; preview: string } | null>(null);
  const [channel, setChannel] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function attach(file: File) {
    setUploading(true);
    const preview = URL.createObjectURL(file);
    try {
      const up = await uploadFile(file, supabase);
      setMedia({ ...up, preview });
    } catch (err) {
      toastError(err);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      await rpc("create_story", {
        p_text: text.trim(),
        p_media_url: media?.path ?? null,
        p_media_type: media?.kind ?? null,
        p_bg: bg,
        p_channel_id: channel || null,
      });
      toast("Story posted. It self-destructs in 24h.", "success", "⏳");
      mutate(byFn("get_stories"));
      setText("");
      setMedia(null);
      setChannel("");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  const groups = (channels ?? []).filter((c) => c.kind === "group" && c.is_member);

  return (
    <Modal open={open} onClose={onClose} title="New story (24h)">
      <div
        className="relative flex aspect-[9/12] w-full items-center justify-center overflow-hidden rounded-2xl"
        style={{ background: media ? "#000" : STORY_BG[bg] }}
      >
        {media ? (
          <>
            {media.kind === "video" ? (
              <video src={media.preview} autoPlay muted loop playsInline className="h-full w-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.preview} alt="Story preview" className="h-full w-full object-contain" />
            )}
            <button onClick={() => setMedia(null)} className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white" aria-label="Remove media">
              <X size={16} />
            </button>
          </>
        ) : null}
        <textarea
          data-autofocus
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 200))}
          placeholder={media ? "Add a caption..." : "Type something unhinged"}
          className={clsx(
            "absolute inset-x-4 resize-none bg-transparent text-center outline-none",
            media ? "bottom-4 h-16 rounded-xl bg-black/60 p-2 text-white placeholder:text-white/60" : "sticker inset-y-10 text-3xl text-black placeholder:text-black/40",
          )}
          aria-label="Story text"
          dir="auto"
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold hover:bg-card-2"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />} Photo/Video
        </button>
        {!media && (
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Background">
            <Type size={16} className="text-muted" />
            {BGS.map((b) => (
              <button
                key={b}
                role="radio"
                aria-checked={bg === b}
                aria-label={`${b} background`}
                onClick={() => setBg(b)}
                className={clsx("h-7 w-7 rounded-full border-2", bg === b ? "border-ink" : "border-transparent")}
                style={{ background: STORY_BG[b] }}
              />
            ))}
          </div>
        )}
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-semibold text-muted">Post to</span>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 outline-none focus:border-brand"
        >
          <option value="">Everyone (my story)</option>
          {groups.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name} (group story)
            </option>
          ))}
        </select>
      </label>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void attach(f);
          e.target.value = "";
        }}
      />
      <div className="mt-4 flex justify-end">
        <Button onClick={submit} disabled={busy || uploading || (!media && !text.trim())}>
          {busy ? "Posting..." : "Share story"}
        </Button>
      </div>
    </Modal>
  );
}
