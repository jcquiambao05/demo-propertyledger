"use client";
// Figure 19 (V12 Register property). FR-07. Single form (the 4-step stepper is not in this build).
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
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Register property</h1>
      <p className="mt-1 text-sm text-muted">The record goes to Management for approval before it appears on the map.</p>
      <div className="card mt-6">
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
  );
}
