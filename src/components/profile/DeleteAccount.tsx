"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { post } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/bits";

// Permanent, self-serve account deletion (required by app stores and privacy laws).
export function DeleteAccount({ username, isOwner }: { username: string; isOwner: boolean }) {
  const { toastError } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = confirm.trim().toLowerCase() === username.toLowerCase();

  async function destroy() {
    setBusy(true);
    try {
      await post("/api/account/delete", { confirm });
      router.replace("/about?deleted=1");
      router.refresh();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  return (
    <div className="py-3">
      <div className="text-sm font-semibold">Delete account</div>
      <p className="mt-0.5 text-xs text-muted">
        Permanently deletes your account, profile, posts, comments, messages, stories, reactions and uploads. This can&apos;t be undone.
      </p>
      {isOwner ? (
        <p className="mt-2 text-xs text-muted">You own this community, so your account can&apos;t be deleted here. Contact support to hand ownership over first.</p>
      ) : (
        <Button variant="danger" className="mt-2 py-2 text-sm" onClick={() => setOpen(true)}>
          <Trash2 size={16} /> Delete my account
        </Button>
      )}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Delete your account?">
        <p className="text-sm text-ink-2">
          Everything you&apos;ve made on YORU will be erased right away, and you&apos;ll be signed out. Type <b className="text-ink">{username}</b> to confirm.
        </p>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.slice(0, 40))}
          placeholder={username}
          autoComplete="off"
          className="mt-3 w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 text-sm outline-none focus:border-brand"
          aria-label="Type your username to confirm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={destroy} disabled={!matches || busy}>
            {busy ? "Deleting..." : "Delete forever"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
