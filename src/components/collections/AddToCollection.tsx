"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import clsx from "clsx";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/ui/Modal";
import { Button, ChaosLoader } from "@/components/ui/bits";
import { byFn, useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import type { CollectionSummary } from "@/lib/opengates";

// Pick which collections a post belongs to. Each tap is saved immediately and
// the checkbox only changes after the server confirms (no false success).
export function AddToCollection({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const { toast, toastError } = useApp();
  const { mutate } = useSWRConfig();
  const { data, mutate: reload } = useRpc<CollectionSummary[]>(open ? "get_my_collections" : null, { p_post_id: postId });
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function toggle(c: CollectionSummary) {
    setBusy(c.id);
    try {
      await rpc("set_collection_item", { p_collection_id: c.id, p_post_id: postId, p_in: !c.has_post });
      await reload();
      mutate(byFn("get_collection", "get_profile_identity"));
      toast(t(c.has_post ? "col.removed" : "col.added", { name: c.name }), "success", c.emoji);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy("new");
    try {
      const c = await rpc<CollectionSummary>("save_collection", { p_name: name.trim() });
      await rpc("set_collection_item", { p_collection_id: c.id, p_post_id: postId, p_in: true });
      setName("");
      await reload();
      toast(t("col.added", { name: c.name }), "success", c.emoji);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("col.addTo")}>
      {!data ? (
        <ChaosLoader label={t("common.loading")} />
      ) : (
        <div className="space-y-1">
          {data.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c)}
              disabled={busy !== null}
              aria-pressed={Boolean(c.has_post)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-card-2 disabled:opacity-60"
            >
              <span className="text-xl" aria-hidden>{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block text-xs text-muted">{t("col.count", { count: c.count })}</span>
              </span>
              <span className={clsx("flex h-6 w-6 items-center justify-center rounded-md border", c.has_post ? "border-brand bg-brand text-white" : "border-line")}>
                {c.has_post && <Check size={15} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
      )}
      <form onSubmit={createAndAdd} className="mt-4 flex gap-2 border-t border-line pt-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder={t("col.new")}
          aria-label={t("col.name")}
          className="min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <Button type="submit" disabled={!name.trim() || busy !== null} className="py-2">
          <Plus size={16} /> {t("col.createAndAdd")}
        </Button>
      </form>
    </Modal>
  );
}
