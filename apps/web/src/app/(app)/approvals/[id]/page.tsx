"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ParcelDetail, DocumentSummary } from "@/lib/types";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BackButton } from "@/components/BackButton";
import { formatAreaSqm } from "@/lib/area";
import { isImageFileName } from "@/components/ParcelForm";
import { STATUS_LABEL } from "@/components/CustodyPanel";
import { SecureMediaPreview } from "@/components/SecureMediaPreview";

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
  const [copied, setCopied] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentSummary | null>(null);

  useEffect(() => {
    api<ParcelDetail>(`/parcels/${id}`).then(
      (data) => {
        setP(data);
        if (data.documents.length > 0) {
          setPreviewDoc(data.documents[0]);
        }
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);

  // Esc hotkey closes Show Notes modal
  useEffect(() => {
    if (!notesModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNotesModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notesModalOpen]);

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
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">{p.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.location && (
            <button
              type="button"
              onClick={() => {
                if (!p.location) return;
                void navigator.clipboard?.writeText(`${p.location.lat}, ${p.location.lng}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              title="Click to copy coordinates"
              className="btn-secondary font-mono text-xs"
            >
              {copied
                ? "Coordinates copied"
                : `${p.location.lat.toFixed(4)}° N, ${p.location.lng.toFixed(4)}° E`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setNotesModalOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
              p.remarks
                ? "border-[#FEDF89] bg-warning-bg text-warning hover:bg-[#FDE68A]/50"
                : "border-[#DCE3DC] bg-white text-ink hover:bg-[#F4F6F3]"
            }`}
          >
            <span>Show Notes</span>
          </button>
          <BackButton fallbackHref="/approvals" />
        </div>
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
              <p className="text-xs text-muted">Land Area</p>
              <p className="mt-1 font-mono text-xs font-medium tabular-nums text-ink">
                {formatAreaSqm(p.areaHa, { includeHa: true })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Classification</p>
              <p className="mt-1 font-medium text-ink">{p.classification ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Coordinates</p>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink">
                {p.location
                  ? `${p.location.lat.toFixed(4)}°N, ${p.location.lng.toFixed(4)}°E`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Submitted Media &amp; Files</p>
              <p className="mt-1 font-mono text-xs font-medium tabular-nums text-ink">
                {p.documents.length} attached
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
                  Inspect the property details and all attached documents or site photos below, then
                  approve this parcel to publish it on the map or return it to Legal with review
                  notes.
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
              <p
                role="alert"
                className="animate-fade-up rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* MANAGEMENT REVIEW ACCESS: Submitted Media & Files Inspection Section */}
      <div className="bento-shell">
        <div className="bento-core space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                Submitted Media &amp; Files ({p.documents.length})
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Directly inspect all supporting documents (PDF, DOCX) and site photos (PNG, JPG,
                WebP) attached by the Legal Department.
              </p>
            </div>
            <Link
              href={`/properties/${p.id}`}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Open full property workspace →
            </Link>
          </div>

          {p.documents.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">
              No supporting files or images were attached to this submission.
            </p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              {/* Left File Selector List */}
              <ul className="space-y-2">
                {p.documents.map((doc) => {
                  const isImg = isImageFileName(doc.fileName);
                  const active = previewDoc?.id === doc.id;
                  const ext = (doc.fileName.split(".").pop() ?? "PDF").toUpperCase();
                  return (
                    <li key={doc.id}>
                      <div
                        onClick={() => setPreviewDoc(doc)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setPreviewDoc(doc);
                        }}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-xs transition-all ${
                          active
                            ? "border-[#1A472A] bg-[#EAF2EC] text-ink shadow-sm"
                            : "border-[#DCE3DC] bg-[#F8FAF8] text-ink hover:bg-white"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#DCE3DC] bg-white font-mono text-[10px] font-bold text-[#1A472A]">
                            {isImg ? "IMG" : ext}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{doc.fileName}</p>
                            <p className="truncate text-[11px] text-muted">
                              {doc.docType ?? "Attachment"} · v{doc.version ?? 1} ·{" "}
                              {STATUS_LABEL[doc.status] ?? doc.status}
                            </p>
                          </div>
                        </div>

                        <Link
                          href={`/documents/${doc.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 font-semibold text-brand hover:underline"
                        >
                          Open →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Right Inline Document / Image Viewer for Management */}
              <div className="flex flex-col overflow-hidden rounded-xl border border-[#DCE3DC] bg-[#F8FAF8]">
                {previewDoc ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-3 text-xs">
                      <div>
                        <p className="font-semibold text-ink">{previewDoc.fileName}</p>
                        <p className="text-[11px] text-muted">
                          {previewDoc.docType ?? "Attachment"} · Version {previewDoc.version ?? 1}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/core/documents/${previewDoc.id}/download`}
                          className="btn-secondary text-xs"
                        >
                          Download
                        </a>
                        <Link
                          href={`/documents/${previewDoc.id}`}
                          className="btn-primary text-xs"
                        >
                          Full viewer →
                        </Link>
                      </div>
                    </div>

                    <div className="flex min-h-[420px] flex-1 items-center justify-center p-4">
                      <SecureMediaPreview
                        documentId={previewDoc.id}
                        fileName={previewDoc.fileName}
                        heightClass="h-[460px]"
                        maxImgHeightClass="max-h-[460px]"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center p-6 text-xs text-muted">
                    Select an attachment on the left to preview it here.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Show Notes Modal */}
      {notesModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-notes-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          onClick={() => setNotesModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-fade-up w-full max-w-lg overflow-hidden rounded-2xl border border-[#DCE3DC] bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line bg-[#F7F9F6] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                  Review Notes
                </p>
                <h3 id="approval-notes-title" className="mt-0.5 text-base font-semibold text-ink">
                  {p.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNotesModalOpen(false)}
                className="rounded-lg border border-[#DCE3DC] bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[#F0F4F0]"
              >
                Close (Esc)
              </button>
            </div>
            <div className="p-5 text-xs">
              {p.remarks ? (
                <div className="rounded-xl border border-[#FEDF89] bg-warning-bg/80 p-4">
                  <p className="font-semibold text-warning">Previous Management Review Note</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{p.remarks}</p>
                </div>
              ) : (
                <p className="text-muted">No previous review notes recorded for this parcel.</p>
              )}
            </div>
          </div>
        </div>
      )}

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
