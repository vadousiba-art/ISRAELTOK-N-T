"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/bits";
import { Avatar } from "@/components/ui/Avatar";
import { rpc } from "@/lib/client/api";
import { refreshFeeds } from "@/lib/client/hooks";
import { useApp } from "@/components/providers/AppProvider";
import type { PostCore } from "@/lib/types";

export function QuoteDialog({ open, onClose, post }: { open: boolean; onClose: () => void; post: PostCore }) {
  const { toast, toastError } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await rpc("toggle_repost", { p_post_id: post.id, p_quote: text.trim() });
      toast("Quote posted. Context added, chaos multiplied.", "success", "💬");
      setText("");
      refreshFeeds();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Quote post">
      <textarea
        data-autofocus
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        placeholder="Add your unsolicited commentary..."
        className="h-28 w-full resize-none rounded-xl border border-line bg-card-2 p-3 outline-none focus:border-brand"
      />
      <div className="mt-3 rounded-xl border border-line p-3">
        <div className="flex items-center gap-2 text-sm">
          <Avatar src={post.author.avatar_url} name={post.author.display_name} size={22} />
          <b>{post.author.display_name}</b>
        </div>
        <p className="mt-1 line-clamp-3 text-sm text-muted">{post.body || post.roast || "(media)"}</p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={submit} disabled={busy || !text.trim()}>
          {busy ? "Posting..." : "Quote it"}
        </Button>
      </div>
    </Modal>
  );
}
