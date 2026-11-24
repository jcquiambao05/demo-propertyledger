"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import { STATUS_LABEL } from "@/components/CustodyPanel";
import { Spinner } from "@/components/ConfirmModal";
import { Modal } from "@/components/Modal";
import { PaginationBar } from "@/components/PaginationBar";
import { Toast } from "@/components/Toast";
import { BackButton } from "@/components/BackButton";
import { isImageFileName } from "@/components/ParcelForm";
import { SecureMediaPreview } from "@/components/SecureMediaPreview";
import {
  DocumentHistorySection,
  DocumentLogsSection,
  type DocumentAuditLog,
  type DocumentHistoryEvent,
} from "@/components/DocumentTrackingPanels";

const DOCS_PAGE_SIZE = 5;
type DocsSectionTab = "files" | "history" | "logs";
type MediaKindFilter = "ALL" | "DOCUMENTS" | "IMAGES";

interface Doc {
  id: string;
  fileName: string;
  docType: string | null;
  sha256: string;
  sizeBytes: number;
  integrityStatus: "VERIFIED" | "FAILED";
  status: string;
  version: number;
  createdAt: string;
}

export default function DocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useSession();
  const role = data?.user.role;
  const canSeeHistory = role === "LEGAL" || role === "MANAGEMENT";
  const [parcel, setParcel] = useState<{ id: string; name: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [history, setHistory] = useState<DocumentHistoryEvent[]>([]);
  const [logs, setLogs] = useState<DocumentAuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<DocsSectionTab>("files");
  const [mediaFilter, setMediaFilter] = useState<MediaKindFilter>("ALL");
  const [lightboxDoc, setLightboxDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [types, setTypes] = useState<{ name: string; timeBound: boolean }[]>([]);
  const [docType, setDocType] = useState("");
  const [page, setPage] = useState(1);
  const timeBound = types.find((t) => t.name === docType)?.timeBound ?? false;

  useEffect(() => {
    api<{ name: string; timeBound: boolean }[]>("/document-types").then(setTypes, () => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const [res, trackingRes] = await Promise.all([
        api<{ parcel: { id: string; name: string }; documents: Doc[] }>(
          `/parcels/${id}/documents`,
        ),
        canSeeHistory
          ? api<{ history: DocumentHistoryEvent[]; logs: DocumentAuditLog[] }>(
              `/parcels/${id}/documents/tracking`,
            ).catch(() => ({ history: [] as DocumentHistoryEvent[], logs: [] as DocumentAuditLog[] }))
          : Promise.resolve({
              history: [] as DocumentHistoryEvent[],
              logs: [] as DocumentAuditLog[],
            }),
      ]);
      setParcel(res.parcel);
      setDocs(res.documents);
      setHistory(trackingRes.history);
      setLogs(trackingRes.logs);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) router.replace("/denied");
      else setError((e as Error).message);
    }
  }, [id, router, canSeeHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lightboxDoc) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxDoc(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxDoc]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const doc = await api<Doc>(`/parcels/${id}/documents`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      setSaved(`"${doc.fileName}" uploaded and verified.`);
      (e.target as HTMLFormElement).reset();
      setDocType("");
      setMediaFilter("ALL");
      setPage(1);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const imageFiles = docs.filter((d) => isImageFileName(d.fileName));
  const docFiles = docs.filter((d) => !isImageFileName(d.fileName));
  const filteredDocs =
    mediaFilter === "IMAGES" ? imageFiles : mediaFilter === "DOCUMENTS" ? docFiles : docs;
  const failed = docs.filter((d) => d.integrityStatus === "FAILED");
  const safePage = Math.min(page, Math.max(1, Math.ceil(filteredDocs.length / DOCS_PAGE_SIZE)));
  const pagedDocs = filteredDocs.slice(
    (safePage - 1) * DOCS_PAGE_SIZE,
    safePage * DOCS_PAGE_SIZE,
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <BackButton
            fallbackHref={`/properties/${id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          />
          <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">
            {parcel ? `${parcel.name} — Media & Files` : "Media & Files"}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {canSeeHistory
              ? "Active property media & documents, chronological document history, and user activity logs."
              : "Active property media and documents."}
          </p>
        </div>

        {/* Segmented View Switcher (History/Logs strictly gated to LEGAL & MANAGEMENT) */}
        {canSeeHistory && (
          <div
            className="flex flex-wrap items-center gap-1 rounded-xl border border-[#DCE3DC] bg-[#EDF1EC] p-1 text-xs"
            role="tablist"
            aria-label="Documents section view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "files"}
              onClick={() => setActiveTab("files")}
              className={`rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
                activeTab === "files"
                  ? "bg-white text-ink shadow-sm ring-1 ring-[#DCE3DC]"
                  : "text-muted hover:text-ink"
              }`}
            >
              Media &amp; Files ({docs.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "history"}
              onClick={() => setActiveTab("history")}
              className={`rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
                activeTab === "history"
                  ? "bg-white text-ink shadow-sm ring-1 ring-[#DCE3DC]"
                  : "text-muted hover:text-ink"
              }`}
            >
              Document History ({history.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "logs"}
              onClick={() => setActiveTab("logs")}
              className={`rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
                activeTab === "logs"
                  ? "bg-white text-ink shadow-sm ring-1 ring-[#DCE3DC]"
                  : "text-muted hover:text-ink"
              }`}
            >
              Document Logs ({logs.length})
            </button>
          </div>
        )}
      </div>

      {failed.length > 0 && (
        <div className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg p-4 text-xs text-danger">
          {failed.length} file(s) didn&apos;t pass the file check and were blocked. Please upload a
          fresh copy.
        </div>
      )}

      <Toast message={saved} onClose={() => setSaved("")} />

      {error && (
        <p
          role="alert"
          className="animate-fade-up rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {activeTab === "files" && (
        <>
          {role === "LEGAL" && (
            <form onSubmit={onUpload} className="card flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="file" className="label">
                  File or Photo (PDF, DOCX, PNG, JPG, WebP — up to 20 MB)
                </label>
                <input
                  id="file"
                  name="file"
                  type="file"
                  accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                  className="mt-1.5 text-xs text-[#475467] file:mr-3 file:rounded-md file:border file:border-[#D0D5DD] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-[#F9FAFB]"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <label htmlFor="docType" className="label">
                  Category / Document type
                </label>
                <select
                  id="docType"
                  name="docType"
                  required
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="field"
                >
                  <option value="" disabled>
                    Select category…
                  </option>
                  {types.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {timeBound && (
                <div>
                  <label htmlFor="expiresOn" className="label">
                    Expiry date
                  </label>
                  <input
                    id="expiresOn"
                    name="expiresOn"
                    type="date"
                    required
                    className="field font-mono"
                  />
                </div>
              )}
              <button type="submit" disabled={busy} className="btn-primary">
                {busy && <Spinner className="h-3.5 w-3.5" />}
                {busy ? "Uploading…" : "Upload file"}
              </button>
            </form>
          )}

          <div className="card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#F7F9F6] px-5 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                Media &amp; Files ({filteredDocs.length})
              </span>
              <div className="flex items-center gap-1 rounded-lg border border-[#DCE3DC] bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMediaFilter("ALL");
                    setPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    mediaFilter === "ALL" ? "bg-[#1A472A] text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  All ({docs.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaFilter("DOCUMENTS");
                    setPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    mediaFilter === "DOCUMENTS"
                      ? "bg-[#1A472A] text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Documents ({docFiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaFilter("IMAGES");
                    setPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    mediaFilter === "IMAGES"
                      ? "bg-[#1A472A] text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Images ({imageFiles.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-[#F7F9F6] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                  <tr>
                    <th className="px-5 py-3">File / Media</th>
                    <th className="px-4 py-3">Format</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Uploaded</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">File check</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody key={safePage} className="animate-fade-up divide-y divide-line">
                  {pagedDocs.map((d) => {
                    const isImg = isImageFileName(d.fileName);
                    const ext = (d.fileName.split(".").pop() ?? "PDF").toUpperCase();
                    return (
                      <tr key={d.id} className="transition-colors hover:bg-[#F9FAFB]">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/documents/${d.id}`}
                            className="font-medium text-ink transition-colors hover:text-brand hover:underline"
                          >
                            {d.fileName}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-muted">
                          {isImg ? `Image (${ext})` : `Document (${ext})`}
                        </td>
                        <td className="px-4 py-3.5 text-[#475467]">{d.docType ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-semibold text-[#1A472A]">
                            v{d.version ?? 1}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-[#475467]">
                          {new Date(d.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#475467]">
                          {STATUS_LABEL[d.status] ?? d.status}
                        </td>
                        <td className="px-4 py-3.5">
                          {d.integrityStatus === "FAILED" ? (
                            <span className="pill-danger">Needs replacement</span>
                          ) : (
                            <span className="pill-ok">Verified</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isImg && (
                              <button
                                type="button"
                                onClick={() => setLightboxDoc(d)}
                                className="text-xs font-semibold text-[#1A472A] hover:underline"
                              >
                                Preview
                              </button>
                            )}
                            <Link
                              href={`/documents/${d.id}`}
                              className="text-xs font-semibold text-brand hover:underline"
                            >
                              Open →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredDocs.length === 0 && (
              <p className="p-8 text-center text-xs text-muted">
                No files uploaded for this property yet.
              </p>
            )}
            <PaginationBar
              page={safePage}
              pageSize={DOCS_PAGE_SIZE}
              totalItems={filteredDocs.length}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {activeTab === "history" && canSeeHistory && <DocumentHistorySection items={history} />}
      {activeTab === "logs" && canSeeHistory && <DocumentLogsSection logs={logs} />}

      <Modal
        open={Boolean(lightboxDoc)}
        onClose={() => setLightboxDoc(null)}
        ariaLabel={lightboxDoc?.fileName ?? "Image Preview"}
        maxWidthClass="max-w-4xl"
      >
        {lightboxDoc && (
          <div className="flex max-h-[90vh] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#F7F9F6] px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-ink">{lightboxDoc.fileName}</h3>
                <p className="text-[11px] text-muted">
                  {lightboxDoc.docType ?? "Site Photo / Media"} · Version {lightboxDoc.version ?? 1}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/core/documents/${lightboxDoc.id}/download`}
                  className="btn-secondary text-xs"
                >
                  Download
                </a>
                <Link href={`/documents/${lightboxDoc.id}`} className="btn-primary text-xs">
                  Open full record →
                </Link>
                <button
                  type="button"
                  onClick={() => setLightboxDoc(null)}
                  className="btn-secondary text-xs"
                >
                  Close (Esc)
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-[#121D17] p-4">
              <SecureMediaPreview
                documentId={lightboxDoc.id}
                fileName={lightboxDoc.fileName}
                heightClass="h-[72vh]"
                maxImgHeightClass="max-h-[75vh]"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
