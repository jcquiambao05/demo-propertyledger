"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { ParcelForm, valuesFrom, toBody } from "@/components/ParcelForm";

export default function NewPropertyPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
              Legal Land Registration
            </p>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            Register Property
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Complete the parcel instrument fields on the left and drop a geodetic pin on the
            Philippines map on the right.
          </p>
        </div>

        <Link href="/properties" className="btn-secondary">
          ← Back to Properties Registry
        </Link>
      </div>

      <div className="bento-shell">
        <div className="bento-core p-5">
          <ParcelForm
            initial={valuesFrom()}
            submitLabel="Submit for approval"
            busy={busy}
            error={error}
            onSubmit={async (v) => {
              setBusy(true);
              setError("");
              try {
                const p = await api<Parcel>("/parcels", { method: "POST", body: toBody(v) });
                router.push(`/properties/${p.id}`);
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
