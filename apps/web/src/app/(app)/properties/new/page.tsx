"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { ParcelForm, valuesFrom, toBody, uploadAttachments } from "@/components/ParcelForm";
import { BackButton } from "@/components/BackButton";

export default function NewPropertyPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Preserves parcel ID across retries if parcel creation succeeded but an attachment upload failed
  const [createdParcelId, setCreatedParcelId] = useState<string | null>(null);

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
            New Property
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            Register a Property
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Fill in the property details in square meters (m²), attach optional documents or site
            photos, and click Place Pin on the map on the right.
          </p>
        </div>

        <BackButton fallbackHref="/properties" />
      </div>

      <div className="bento-shell">
        <div className="bento-core p-5">
          <ParcelForm
            initial={valuesFrom()}
            submitLabel={createdParcelId ? "Retry attachment upload" : "Submit for approval"}
            busy={busy}
            error={error}
            onSubmit={async (v, attachments) => {
              setBusy(true);
              setError("");
              try {
                let parcelId = createdParcelId;
                if (!parcelId) {
                  const p = await api<Parcel>("/parcels", { method: "POST", body: toBody(v) });
                  parcelId = p.id;
                  setCreatedParcelId(p.id);
                }
                if (attachments.length > 0) {
                  await uploadAttachments(parcelId, attachments);
                }
                router.push(`/properties/${parcelId}`);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
