"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ParcelDetail } from "@/lib/types";
import { ConfirmModal } from "@/components/ConfirmModal";

export default function ApprovalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<ParcelDetail | null>(null);
  const [remarks, setRemarks] = useState("");
  const [returning, setReturning] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ParcelDetail>(`/parcels/${id}`).then(setP, (e: Error) => setError(e.message));
  }, [id]);

  async function decide(action: "approve" | "return") {
    setConfirmApprove(false);
    setConfirmReturn(false);
    setBusy(true);
    setError("");
    try {
      await api(`/parcels/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "return" ? { remarks } : {}),
      });
      router.push("/approvals");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!p) return <p className="text-xs text-muted">{error || "Loading…"}</p>;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-brand">
            Parcel Review
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            {p.name}
          </h1>
        </div>
        <Link href="/approvals" className="btn-secondary">
          ← Back to queue
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="bento-shell">
          <div className="bento-core grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Region</p>
              <p className="mt-1 font-medium text-ink">{p.region ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Province</p>
              <p className="mt-1 font-medium text-ink">{p.province}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Municipality</p>
              <p className="mt-1 font-medium text-ink">{p.municipality ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Title number</p>
              <p className="mt-1 font-mono text-xs font-medium text-ink">{p.titleNo ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Tax declaration</p>
              <p className="mt-1 font-mono text-xs font-medium text-ink">{p.taxDecNo ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Surveyed Area</p>
              <p className="mt-1 font-mono text-xs font-medium tabular-nums text-ink">
                {p.areaHa.toFixed(2)} ha
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Classification</p>
              <p className="mt-1 font-medium text-ink">{p.classification ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Coordinates</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink">
                {p.location ? `${p.location.lat.toFixed(4)}°N, ${p.location.lng.toFixed(4)}°E` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Documents attached</p>
              <p className="mt-1 font-mono text-xs font-medium tabular-nums text-ink">
                {p.documents.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
              Your decision
            </h2>

            {p.status !== "PENDING" ? (
              <p className="text-xs text-muted">This parcel has already been reviewed.</p>
            ) : returning ? (
              <div className="animate-fade-up space-y-4">
                <label htmlFor="remarks" className="label">
                  What should Legal update?
                </label>
                <textarea
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={4}
                  placeholder="Add a short note explaining what needs to be fixed…"
                  className="field"
                />
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !remarks.trim()}
                    onClick={() => setConfirmReturn(true)}
                  >
                    Send back
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setReturning(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-muted">
                  Approve this parcel to publish it on the map, or send it back to Legal if
                  something needs a quick fix.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => setConfirmApprove(true)}
                  >
                    Approve parcel
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setReturning(true)}
                  >
                    Send back for changes
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="animate-fade-up rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmApprove}
        title={`Approve ${p.name}?`}
        description="This publishes the parcel to the map for everyone with access."
        confirmLabel="Approve"
        cancelLabel="Not yet"
        variant="brand"
        busy={busy}
        onConfirm={() => decide("approve")}
        onCancel={() => setConfirmApprove(false)}
      />

      <ConfirmModal
        open={confirmReturn}
        title="Send back for changes?"
        description="Legal will see your note and update the record."
        confirmLabel="Send back"
        cancelLabel="Keep reviewing"
        variant="warning"
        busy={busy}
        onConfirm={() => decide("return")}
        onCancel={() => setConfirmReturn(false)}
      />
    </div>
  );
}
