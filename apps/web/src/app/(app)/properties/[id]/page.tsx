"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import type { ParcelDetail, Parcel, ParcelCustodyRow, DocumentSummary } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { STATUS_LABEL, HOLDER_LABEL } from "@/components/CustodyPanel";
import { RptCard } from "@/components/RptCard";
import { IssuesTab } from "@/components/IssuesTab";
import { TenantsCard } from "@/components/TenantsCard";
import {
  ParcelForm,
  valuesFrom,
  toBody,
  uploadAttachments,
  isImageFileName,
} from "@/components/ParcelForm";
import { SecureMediaPreview } from "@/components/SecureMediaPreview";
import { Spinner } from "@/components/ConfirmModal";
import { Modal } from "@/components/Modal";
import { PaginationBar } from "@/components/PaginationBar";
import { Toast } from "@/components/Toast";
import { BackButton } from "@/components/BackButton";
import { formatAreaSqm } from "@/lib/area";
import {
  DocumentHistorySection,
  DocumentLogsSection,
  type DocumentAuditLog,
  type DocumentHistoryEvent,
} from "@/components/DocumentTrackingPanels";

type Tab = "overview" | "documents" | "custody" | "issues" | "doc-history" | "doc-logs";
type MediaKindFilter = "ALL" | "DOCUMENTS" | "IMAGES";

const DOCS_PAGE_SIZE = 5;

interface Checklist {
  classification: "TITLED" | "UNTITLED";
  complete: boolean;
  items: {
    type: string;
    required: boolean;
    state: "PRESENT" | "MISSING" | "EXPIRED";
    documentId: string | null;
    expiresOn: string | null;
  }[];
}

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useSession();
  const role = data?.user.role;
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [docHistory, setDocHistory] = useState<DocumentHistoryEvent[]>([]);
  const [docLogs, setDocLogs] = useState<DocumentAuditLog[]>([]);
  const [custody, setCustody] = useState<ParcelCustodyRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const canSeeHistory = role === "LEGAL" || role === "MANAGEMENT";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Review Notes Modal state ("Show Notes" button placed beside Coordinates)
  const [notesModalOpen, setNotesModalOpen] = useState(false);

  // Unified Media & Files Repository state
  const [docTypes, setDocTypes] = useState<{ name: string; timeBound: boolean }[]>([]);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [docsPage, setDocsPage] = useState(1);
  const [mediaFilter, setMediaFilter] = useState<MediaKindFilter>("ALL");
  const [lightboxDoc, setLightboxDoc] = useState<DocumentSummary | null>(null);

  const timeBound = docTypes.find((t) => t.name === selectedDocType)?.timeBound ?? false;

  const load = useCallback(async () => {
    try {
      setParcel(await api<ParcelDetail>(`/parcels/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) router.replace("/denied");
      else setError((e as Error).message);
    }
  }, [id, router]);

  const loadTracking = useCallback(async () => {
    if (!canSeeHistory) return;
    try {
      const res = await api<{ history: DocumentHistoryEvent[]; logs: DocumentAuditLog[] }>(
        `/parcels/${id}/documents/tracking`,
      );
      setDocHistory(res.history);
      setDocLogs(res.logs);
    } catch {
      // Ignore tracking errors
    }
  }, [id, canSeeHistory]);

  useEffect(() => {
    void load();
    void loadTracking();
    api<{ name: string; timeBound: boolean }[]>("/document-types").then(
      setDocTypes,
      () => undefined,
    );
  }, [load, loadTracking]);

  useEffect(() => {
    if (tab === "overview" && parcel?.status === "APPROVED") {
      api<Checklist>(`/parcels/${id}/checklist`).then(setChecklist, () => undefined);
    }
  }, [id, tab, parcel?.status]);

  useEffect(() => {
    if ((tab === "doc-history" || tab === "doc-logs") && canSeeHistory) {
      void loadTracking();
    }
    if (tab === "custody") {
      api<ParcelCustodyRow[]>(`/parcels/${id}/custody`).then(setCustody, (e: Error) =>
        setError(e.message),
      );
    }
  }, [id, tab, canSeeHistory, parcel?.status, loadTracking]);

  // Global Esc hotkey to close Show Notes modal or Media Lightbox
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
      if (e.key === "Escape") {
        if (lightboxDoc) setLightboxDoc(null);
        else if (notesModalOpen) setNotesModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxDoc, notesModalOpen]);

  async function onInlineUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadBusy(true);
    setError("");
    setToastMsg("");
    try {
      const uploaded = await api<{ fileName: string }>(`/parcels/${id}/documents`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      setToastMsg(`"${uploaded.fileName}" uploaded and verified.`);
      (e.target as HTMLFormElement).reset();
      setSelectedDocType("");
      setMediaFilter("ALL");
      setDocsPage(1);
      await load();
      await loadTracking();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadBusy(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: `Media & Files (${parcel?.documents.length ?? 0})` },
    { key: "custody", label: "Custody" },
    { key: "issues", label: "Issues" },
    ...(canSeeHistory
      ? [
          { key: "doc-history" as Tab, label: "Document History" },
          { key: "doc-logs" as Tab, label: "Document Logs" },
        ]
      : []),
  ];

  if (!parcel) {
    return (
      <div className="space-y-4">
        <BackButton fallbackHref="/properties" />
        <p className="text-xs text-muted">{error || "Loading property details…"}</p>
      </div>
    );
  }

  const docs = parcel.documents ?? [];
  const imageFiles = docs.filter((d) => isImageFileName(d.fileName));
  const docFiles = docs.filter((d) => !isImageFileName(d.fileName));
  const filteredDocs =
    mediaFilter === "IMAGES" ? imageFiles : mediaFilter === "DOCUMENTS" ? docFiles : docs;
  const failedDocs = docs.filter((d) => d.integrityStatus === "FAILED");
  const safeDocsPage = Math.min(
    docsPage,
    Math.max(1, Math.ceil(filteredDocs.length / DOCS_PAGE_SIZE)),
  );
  const pagedDocs = filteredDocs.slice(
    (safeDocsPage - 1) * DOCS_PAGE_SIZE,
    safeDocsPage * DOCS_PAGE_SIZE,
  );

  const reviewNotesFromHistory = docHistory.filter(
    (h) => h.category === "MANAGEMENT_REVIEW" || Boolean(h.reviewNote),
  );

  return (
    <div className="w-full space-y-6">
      <Toast message={toastMsg} onClose={() => setToastMsg("")} />

      {/* Top Context-Aware Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton fallbackHref="/properties" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Link href="/map" className="hover:text-brand hover:underline">
            Spatial Portfolio
          </Link>
          <span>/</span>
          <Link href="/properties" className="hover:text-brand hover:underline">
            Properties
          </Link>
          <span>/</span>
          <span className="font-medium text-ink">{parcel.province}</span>
        </div>
      </div>

      {/* Double-Bezel Parcel Hero Header */}
      <div className="bento-shell">
        <div className="bento-core flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{parcel.name}</h1>
              <StatusPill status={parcel.status} />
            </div>

            <p className="mt-1 font-mono text-xs text-muted">
              {[
                parcel.titleNo,
                parcel.taxDecNo,
                formatAreaSqm(parcel.areaHa, { includeHa: true }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {parcel.location && (
              <button
                type="button"
                onClick={() => {
                  if (!parcel.location) return;
                  void navigator.clipboard?.writeText(
                    `${parcel.location.lat}, ${parcel.location.lng}`,
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                title="Click to copy coordinates"
                className="btn-secondary font-mono text-xs"
              >
                {copied
                  ? "Coordinates copied"
                  : `${parcel.location.lat.toFixed(4)}° N, ${parcel.location.lng.toFixed(4)}° E`}
              </button>
            )}

            {/* "Show Notes" button placed directly beside Coordinates (Legal & Management only) */}
            {canSeeHistory && (
              <button
                type="button"
                onClick={() => setNotesModalOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                  parcel.remarks
                    ? "border-warning-border bg-warning-bg text-warning hover:opacity-90"
                    : "border-line bg-surface text-ink hover:bg-surface-muted"
                }`}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Show Notes</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Segmented Pill Tab Bar */}
      <nav
        aria-label="Parcel record"
        className="flex flex-wrap gap-1.5 rounded-xl border border-[#DCE3DC] bg-[#EDF1EC] p-1 text-xs"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-lg px-4 py-2 transition-all ${
              tab === t.key
                ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-[#DCE3DC]"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {tab !== "overview" ? null : parcel.status === "RETURNED" && role === "LEGAL" ? (
        <div className="bento-shell">
          <div className="bento-core">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ink">Update and resubmit for review</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Map coordinates are locked by default while under review — click{" "}
                  <strong>Edit Location</strong> on the map if you need to move the pin, and attach
                  any requested documents or photos below.
                </p>
              </div>
              {parcel.remarks && (
                <button
                  type="button"
                  onClick={() => setNotesModalOpen(true)}
                  className="rounded-lg border border-[#FEDF89] bg-warning-bg px-3 py-1.5 text-xs font-semibold text-warning hover:bg-[#FDE68A]/50"
                >
                  Show Review Notes
                </button>
              )}
            </div>
            <div className="mt-4">
              <ParcelForm
                initial={valuesFrom(parcel)}
                submitLabel="Resubmit for approval"
                busy={busy}
                error={error}
                underReview
                onSubmit={async (v, attachments) => {
                  setBusy(true);
                  setError("");
                  try {
                    await api<Parcel>(`/parcels/${id}/resubmit`, {
                      method: "POST",
                      body: toBody(v),
                    });
                    if (attachments.length > 0) {
                      await uploadAttachments(id, attachments);
                    }
                    setToastMsg("Property updated and resubmitted for management review.");
                    await load();
                    await loadTracking();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bento-shell">
          <div className="bento-core grid gap-5 text-sm sm:grid-cols-2 md:grid-cols-4">
            <Field label="Region" value={parcel.region} />
            <Field label="Province" value={parcel.province} />
            <Field label="Municipality or city" value={parcel.municipality} />
            <Field
              label="Land Area"
              value={formatAreaSqm(parcel.areaHa, { includeHa: true })}
              mono
            />
            <Field label="Title number" value={parcel.titleNo} mono />
            <Field label="Tax declaration" value={parcel.taxDecNo} mono />
            <Field label="Classification" value={parcel.classification} />
            <Field
              label="Coordinates"
              value={parcel.location ? `${parcel.location.lat}, ${parcel.location.lng}` : null}
              mono
            />
          </div>
        </div>
      )}

      {tab === "overview" && checklist && <ChecklistCard checklist={checklist} />}
      {tab === "overview" && parcel.status === "APPROVED" && (
        <RptCard parcelId={parcel.id} canEdit={role === "LEGAL"} />
      )}
      {tab === "overview" && parcel.status === "APPROVED" && canSeeHistory && (
        <TenantsCard parcelId={parcel.id} canEdit={role === "LEGAL"} />
      )}

      {/* UNIFIED "MEDIA & FILES" SECTION (Aggregates all documents and images for this property) */}
      {tab === "documents" && (
        <div className="space-y-5">
          {failedDocs.length > 0 && (
            <div className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg p-4 text-xs text-danger">
              {failedDocs.length} file(s) didn&apos;t pass the file check and were blocked. Please
              upload a fresh copy.
            </div>
          )}

          {role === "LEGAL" && (
            <form onSubmit={onInlineUpload} className="card flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="inline-file" className="label">
                  File or Photo (PDF, DOCX, PNG, JPG, WebP — up to 20 MB)
                </label>
                <input
                  id="inline-file"
                  name="file"
                  type="file"
                  accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                  className="mt-1.5 text-xs text-[#475467] file:mr-3 file:rounded-md file:border file:border-[#D0D5DD] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-[#F9FAFB]"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <label htmlFor="inline-docType" className="label">
                  Category / Document Type
                </label>
                <select
                  id="inline-docType"
                  name="docType"
                  required
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="field"
                >
                  <option value="" disabled>
                    Select category…
                  </option>
                  {docTypes.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {timeBound && (
                <div>
                  <label htmlFor="inline-expiresOn" className="label">
                    Expiry date
                  </label>
                  <input
                    id="inline-expiresOn"
                    name="expiresOn"
                    type="date"
                    required
                    className="field font-mono"
                  />
                </div>
              )}
              <button type="submit" disabled={uploadBusy} className="btn-primary">
                {uploadBusy && <Spinner className="h-3.5 w-3.5" />}
                {uploadBusy ? "Uploading…" : "Upload file"}
              </button>
            </form>
          )}

          {/* Visual Image & Site Photo Gallery (shown whenever images exist and filter is ALL or IMAGES) */}
          {imageFiles.length > 0 && mediaFilter !== "DOCUMENTS" && (
            <div className="bento-shell">
              <div className="bento-core space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                      Site Photos &amp; Visual Media ({imageFiles.length})
                    </h3>
                    <p className="text-[11px] text-muted">
                      Click any image thumbnail to inspect full-screen or open its version record.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {imageFiles.map((img) => (
                    <div
                      key={img.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] transition-all hover:border-[#1A472A] hover:shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxDoc(img)}
                        className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-1.5 overflow-hidden bg-[#EAF0EB] px-3 text-center transition-colors group-hover:bg-[#DFEBE2]"
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#1A472A"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span className="text-[11px] font-semibold text-[#1A472A]">
                          Click to preview image
                        </span>
                        <span className="absolute right-2 top-2 rounded bg-[#1A472A] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                          v{img.version ?? 1}
                        </span>
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{img.fileName}</p>
                          <p className="truncate text-[10px] text-muted">
                            {img.docType ?? "Site Photo / Media"}
                          </p>
                        </div>
                        <Link
                          href={`/documents/${img.id}`}
                          className="shrink-0 font-semibold text-brand hover:underline"
                        >
                          Details →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Unified Media & Files Table */}
          <div className="bento-shell">
            <div className="bento-core overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F7F9F6] px-5 py-3.5">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                    Media &amp; Files Repository
                  </h2>
                  <p className="text-[11px] text-muted">
                    All property documents (PDF, DOCX) and images (PNG, JPG, WebP) with SHA-256
                    verification and version control.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Filter Pills: All | Documents | Images */}
                  <div className="flex items-center gap-1 rounded-lg border border-[#DCE3DC] bg-white p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setMediaFilter("ALL");
                        setDocsPage(1);
                      }}
                      className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                        mediaFilter === "ALL"
                          ? "bg-[#1A472A] text-white"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      All ({docs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMediaFilter("DOCUMENTS");
                        setDocsPage(1);
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
                        setDocsPage(1);
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

                  {canSeeHistory && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setTab("doc-history")}
                        className="font-semibold text-brand hover:underline"
                      >
                        Document History →
                      </button>
                      <span className="text-muted">·</span>
                      <button
                        type="button"
                        onClick={() => setTab("doc-logs")}
                        className="font-semibold text-brand hover:underline"
                      >
                        Document Logs →
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-[#F8FAF8] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                    <tr>
                      <th className="px-5 py-3">File / Media</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Version</th>
                      <th className="px-4 py-3">Uploaded</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">File Check</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody key={safeDocsPage} className="animate-fade-up divide-y divide-line">
                    {pagedDocs.map((d) => {
                      const isImg = isImageFileName(d.fileName);
                      const ext = (d.fileName.split(".").pop() ?? "PDF").toUpperCase();
                      return (
                        <tr key={d.id} className="transition-colors hover:bg-[#F8FAF8]">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              {isImg ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxDoc(d)}
                                  title="Preview image"
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B7D3BF] bg-[#EAF2EC] font-mono text-[10px] font-bold text-[#1A472A] hover:bg-[#D5E6D9]"
                                >
                                  {ext}
                                </button>
                              ) : (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#DCE3DC] bg-[#F4F6F3] font-mono text-[10px] font-bold text-[#1A472A]">
                                  {ext}
                                </span>
                              )}
                              <Link
                                href={`/documents/${d.id}`}
                                className="font-semibold text-ink transition-colors hover:text-brand hover:underline"
                              >
                                {d.fileName}
                              </Link>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs text-muted">
                            {isImg ? `Image (${ext})` : `Document (${ext})`}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-[#3E5046]">{d.docType ?? "—"}</td>
                          <td className="px-4 py-3.5">
                            <span className="rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-semibold text-[#1A472A]">
                              v{d.version ?? 1}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-muted">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-[#3E5046]">
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
                  No media or files match this filter yet.
                </p>
              )}

              <PaginationBar
                page={safeDocsPage}
                totalItems={filteredDocs.length}
                pageSize={DOCS_PAGE_SIZE}
                onPageChange={setDocsPage}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "custody" && (
        <div className="bento-shell">
          <div className="bento-core text-sm">
            {!custody ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : custody.length === 0 ? (
              <p className="text-xs text-muted">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {custody.map((c) => (
                  <li key={c.documentId} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/documents/${c.documentId}`}
                      className="font-medium text-ink transition-colors hover:text-brand hover:underline"
                    >
                      {c.label}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {STATUS_LABEL[c.status] ?? c.status}
                      {c.holderName
                        ? ` · held by ${c.holderName} (${HOLDER_LABEL[c.holderType ?? ""] ?? c.holderType})`
                        : " · no custody movement recorded"}
                      {c.expectedReturnDate && ` · expected back ${c.expectedReturnDate}`}
                      {c.processingStage && ` · stage: ${c.processingStage}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "issues" && <IssuesTab parcelId={parcel.id} canEdit={role === "LEGAL"} />}

      {tab === "doc-history" && canSeeHistory && <DocumentHistorySection items={docHistory} />}

      {tab === "doc-logs" && canSeeHistory && <DocumentLogsSection logs={docLogs} />}

      {/* REVIEW NOTES MODAL (Overhauled UI/UX, Scroll Lock, Focus Trap, Smooth Transitions) */}
      <Modal
        open={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        ariaLabelledBy="review-notes-modal-title"
        maxWidthClass="max-w-xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line bg-surface-muted px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-soft text-brand-soft-fg">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
                  Management Review &amp; Feedback
                </p>
                <StatusPill status={parcel.status} />
              </div>
              <h3
                id="review-notes-modal-title"
                className="mt-1 text-base font-semibold tracking-[-0.015em] text-ink"
              >
                {parcel.name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNotesModalOpen(false)}
            aria-label="Close review notes"
            className="btn-secondary shrink-0 rounded-xl px-3 py-1.5 text-xs"
          >
            <span>Close</span>
            <kbd className="rounded border border-line bg-surface-muted px-1 py-0.5 font-mono text-[10px] text-muted">
              Esc
            </kbd>
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5 text-xs">
          {/* Active Management Review Note Callout */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Current Review Status
            </p>
            {parcel.remarks ? (
              <div className="rounded-2xl border border-warning-border bg-warning-bg p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <span className="h-2 w-2 rounded-full bg-warning-dot" aria-hidden="true" />
                    Active Management Directive
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    Updated {new Date(parcel.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink">{parcel.remarks}</p>
              </div>
            ) : (
              <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface-muted p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">
                    No active review note on this property
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    When management returns a submission with feedback or remarks, their note is
                    highlighted here.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Historical Review Timeline */}
          {reviewNotesFromHistory.length > 0 && (
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Historical Review Log
                </p>
                <span className="pill font-mono text-[10px]">
                  {reviewNotesFromHistory.length}{" "}
                  {reviewNotesFromHistory.length === 1 ? "entry" : "entries"}
                </span>
              </div>

              <ol className="relative ml-2 space-y-3 border-l-2 border-line pl-4">
                {reviewNotesFromHistory.map((item) => (
                  <li key={item.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-fill"
                    />
                    <div className="rounded-xl border border-line bg-surface-muted p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{item.title}</span>
                        <span className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-ink">
                        {item.reviewNote ?? item.description}
                      </p>
                      <p className="mt-2 text-[11px] text-muted">
                        Recorded by <strong className="font-medium text-ink">{item.actor}</strong>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {canSeeHistory && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-muted px-6 py-3.5 text-xs">
            <span className="text-[11px] text-muted">
              All management reviews are permanently archived in Document History.
            </span>
            <button
              type="button"
              onClick={() => {
                setNotesModalOpen(false);
                setTab("doc-history");
              }}
              className="font-semibold text-brand hover:underline"
            >
              Open Document History →
            </button>
          </div>
        )}
      </Modal>

      {/* IMAGE LIGHTBOX MODAL (Scroll Lock, Focus Trap, Smooth Transitions) */}
      <Modal
        open={Boolean(lightboxDoc)}
        onClose={() => setLightboxDoc(null)}
        ariaLabel={lightboxDoc?.fileName ?? "Image Preview"}
        maxWidthClass="max-w-4xl"
      >
        {lightboxDoc && (
          <div className="flex max-h-[90vh] flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-5 py-3.5">
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

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-medium text-ink ${mono ? "font-mono text-xs tabular-nums" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const [open, setOpen] = useState(false);
  const total = checklist.items.length;
  const present = checklist.items.filter((i) => i.state === "PRESENT").length;
  const missing = checklist.items.filter((i) => i.state === "MISSING").length;
  const expired = checklist.items.filter((i) => i.state === "EXPIRED").length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 100;

  return (
    <div className="bento-shell">
      <div className="bento-core space-y-3.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Document completeness</h2>
            <p className="text-xs text-muted">
              {present} of {total} required documents uploaded ({pct}%)
            </p>
          </div>
          {checklist.complete ? (
            <span className="pill-ok">All required documents present</span>
          ) : (
            <span className={expired > 0 ? "pill-danger" : "pill-warning"}>
              {[missing && `${missing} missing`, expired && `${expired} expired`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-[#EAF0EB]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              checklist.complete
                ? "bg-[#76B82A]"
                : expired > 0
                  ? "bg-danger-dot"
                  : "bg-warning-dot"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          <span>{open ? "Hide checklist" : "Show checklist"}</span>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              open ? "rotate-180" : "rotate-0"
            }`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden">
            <ul className="divide-y divide-line pt-1">
              {checklist.items.map((i) => (
                <li key={i.type} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  {i.documentId ? (
                    <Link
                      href={`/documents/${i.documentId}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {i.type}
                    </Link>
                  ) : (
                    <span className="text-ink">{i.type}</span>
                  )}
                  <span
                    className={
                      i.state === "EXPIRED"
                        ? "pill-danger"
                        : i.state === "MISSING"
                          ? "pill-warning"
                          : "pill-ok"
                    }
                  >
                    {i.state === "PRESENT" ? "Present" : i.state === "MISSING" ? "Missing" : "Expired"}
                    {i.expiresOn && ` · expires ${i.expiresOn}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
