"use client";

import { useState } from "react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/bits";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { pickLine, SUCCESS_TOASTS } from "@/lib/jokes";

const REASONS = [
  "Harassment or targeting someone",
  "Hate based on identity",
  "Private info / doxxing",
  "Spam or scam",
  "Explicit content",
  "Something else",
];

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: "post" | "comment" | "message" | "user" | "story";
  targetId: string;
}) {
  const { toast, toastError } = useApp();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await rpc("create_report", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: details.trim() ? `${reason}: ${details.trim()}` : reason,
      });
      toast(pickLine(SUCCESS_TOASTS.report), "success", "🚩");
      setDetails("");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Report ${targetType}`}>
      <p className="mb-3 text-sm text-muted">
        Jokes are fine. Actual harm is not. Admins will review this — the person won&apos;t see who reported.
      </p>
      <div className="space-y-2">
        {REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={clsx(
              "w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition",
              reason === r ? "border-hot bg-hot/10" : "border-line hover:bg-card-2",
            )}
            aria-pressed={reason === r}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value.slice(0, 400))}
        placeholder="Extra details (optional)"
        className="mt-3 h-20 w-full resize-none rounded-xl border border-line bg-card-2 p-3 text-sm outline-none focus:border-brand"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={submit} disabled={busy}>
          {busy ? "Reporting..." : "Send report"}
        </Button>
      </div>
    </Modal>
  );
}
