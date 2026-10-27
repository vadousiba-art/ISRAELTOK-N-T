"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useRpc } from "@/lib/client/hooks";
import { rpc } from "@/lib/client/api";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { Button, ChaosLoader, Empty, PageTitle } from "@/components/ui/bits";
import { Gate } from "@/components/yoru/Gate";
import { CollectionCard } from "@/components/collections/CollectionCard";
import { CollectionForm } from "@/components/collections/CollectionForm";
import type { CollectionSummary } from "@/lib/opengates";

export default function CollectionsPage() {
  return (
    <Gate>
      <Collections />
    </Gate>
  );
}

function Collections() {
  const t = useT();
  const { toastError } = useApp();
  const { data, error, mutate } = useRpc<CollectionSummary[]>("get_my_collections", {});
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <PageTitle sub={t("col.sub")}>{t("col.title")}</PageTitle>
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> {t("col.new")}
        </Button>
      </div>
      {error && <Empty text={t("common.error")} />}
      {!data && !error && <ChaosLoader />}
      {data?.length === 0 && <Empty text={t("col.empty")} />}
      {!!data?.length && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((c) => (
            <CollectionCard key={c.id} c={c} />
          ))}
        </div>
      )}
      <CollectionForm
        open={creating}
        onClose={() => setCreating(false)}
        onSave={async (v) => {
          try {
            await rpc("save_collection", v);
            setCreating(false);
            mutate();
          } catch (err) {
            toastError(err);
          }
        }}
      />
    </div>
  );
}
