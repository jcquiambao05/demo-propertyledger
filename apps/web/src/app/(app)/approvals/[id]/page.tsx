"use client";
// Figure 38 (V31 Approval review). FR-08: approve, or return with required remarks.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ParcelDetail } from "@/lib/types";

export default function ApprovalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<ParcelDetail | null>(null);
  const [remarks, setRemarks] = useState("");
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ParcelDetail>(`/parcels/${id}`).then(setP, (e: Error) => setError(e.message));
  }, [id]);

  async function decide(action: "approve" | "return") {
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

  if (!p) return <p className="text-sm text-muted">{error || "Loading…"}</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Review: {p.name}</h1>
      <div className="card grid gap-3 text-sm md:grid-cols-2">
        <p><span className="text-muted">Province:</span> {p.province}</p>
        <p><span className="text-muted">Municipality:</span> {p.municipality ?? "—"}</p>
        <p><span className="text-muted">Title number:</span> {p.titleNo ?? "—"}</p>
        <p><span className="text-muted">Tax declaration:</span> {p.taxDecNo ?? "—"}</p>
        <p><span className="text-muted">Area:</span> {p.areaHa.toFixed(2)} ha</p>
        <p><span className="text-muted">Classification:</span> {p.classification ?? "—"}</p>
        <p><span className="text-muted">Documents attached:</span> {p.documents.length}</p>
      </div>
      {p.status !== "PENDING" ? (
        <p className="text-sm text-muted">This record is no longer waiting for approval.</p>
      ) : returning ? (
        <div className="card space-y-3">
          <label htmlFor="remarks" className="label">Remarks for the Legal Department (required)</label>
          <textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} className="field" />
          <div className="flex gap-3">
            <button type="button" className="btn-primary" disabled={busy || !remarks.trim()} onClick={() => decide("return")}>
              Return with remarks
            </button>
            <button type="button" className="btn-secondary" onClick={() => setReturning(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => decide("approve")}>
            Approve
          </button>
          <button type="button" className="btn-secondary" onClick={() => setReturning(true)}>
            Return with remarks
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
