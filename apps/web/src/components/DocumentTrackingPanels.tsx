"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { STATUS_LABEL } from "@/components/CustodyPanel";
import { formatAreaSqm } from "@/lib/area";
import { SecureMediaPreview } from "@/components/SecureMediaPreview";
import { Modal } from "@/components/Modal";

export interface SnapshotDocItem {
  id: string;
  fileName: string;
  docType: string | null;
  version: number;
  status: string;
  sha256: string;
  sizeBytes: number;
  expiresOn: string | null;
  createdAt: string;
}

export interface ArchivalSnapshot {
  snapshotAt: string;
  parcelState: {
    id: string;
    name: string;
    region: string | null;
    province: string;
    municipality: string | null;
    titleNo: string | null;
    taxDecNo: string | null;
    classification: string | null;
    areaHa: number;
    status: string;
    remarks: string | null;
  };
  focusDocument: {
    id: string | null;
    fileName: string | null;
    docType: string | null;
    version: number | null;
    status: string;
    sha256: string | null;
    sizeBytes: number | null;
    expiresOn: string | null;
    custodyHolder: string | null;
    custodyAction: string | null;
    processingStage: string | null;
    reviewNote: string | null;
  } | null;
  activeDocumentsAtTime: SnapshotDocItem[];
}

export interface DocumentHistoryEvent {
  id: string;
  category:
    | "PROPERTY_LIFECYCLE"
    | "MANAGEMENT_REVIEW"
    | "DOCUMENT_REVISION"
    | "CUSTODY_TRANSFER";
  categoryLabel: string;
  title: string;
  description: string;
  reviewNote?: string | null;
  documentId: string | null;
  documentName: string | null;
  docType: string | null;
  version: number | null;
  status: string;
  actor: string;
  createdAt: string;
  snapshot?: ArchivalSnapshot;
}

export interface DocumentAuditLog {
  id: string;
  action: string;
  actionLabel: string;
  actor: string;
  actorRole: string;
  documentId: string | null;
  documentName: string;
  docType: string | null;
  version: number | null;
  status: string;
  summary: string;
  createdAt: string;
}

const PAGE_SIZE = 5;

function matchesDateRange(isoDate: string, fromDate: string, toDate: string): boolean {
  if (!fromDate && !toDate) return true;
  const day = isoDate.slice(0, 10);
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
}

/**
 * 1. DOCUMENT HISTORY (ARCHIVAL SNAPSHOT / "MUSEUM" VIEW)
 * Strictly an archival record of how the document and property record evolved over time
 * (ordered earliest to latest by default). Every entry is clickable to open a read-only
 * Archival Timeframe Snapshot Modal inspecting that exact historical state.
 */
export function DocumentHistorySection({ items }: { items: DocumentHistoryEvent[] }) {
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [versionFilter, setVersionFilter] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Interactive Archival Timeframe Snapshot Modal
  const [selectedSnapshot, setSelectedSnapshot] = useState<DocumentHistoryEvent | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>("");

  // Close snapshot modal on Esc
  useEffect(() => {
    if (!selectedSnapshot) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedSnapshot(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedSnapshot]);

  function openSnapshot(item: DocumentHistoryEvent) {
    setSelectedSnapshot(item);
    const defaultDocId =
      item.snapshot?.focusDocument?.id ??
      item.documentId ??
      item.snapshot?.activeDocumentsAtTime[0]?.id ??
      null;
    const defaultDocName =
      item.snapshot?.focusDocument?.fileName ??
      item.documentName ??
      item.snapshot?.activeDocumentsAtTime[0]?.fileName ??
      "";
    setPreviewDocId(defaultDocId);
    setPreviewDocName(defaultDocName);
  }

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.status) set.add(item.status);
    }
    return Array.from(set).sort();
  }, [items]);

  const availableVersions = useMemo(() => {
    const set = new Set<number>();
    for (const item of items) {
      if (typeof item.version === "number") set.add(item.version);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [items]);

  // Keep chronological order from earliest to latest
  const filtered = useMemo(() => {
    return items
      .filter((item) => {
        if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
        if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
        if (versionFilter !== "ALL" && String(item.version ?? "") !== versionFilter) return false;
        if (!matchesDateRange(item.createdAt, fromDate, toDate)) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const match =
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.actor.toLowerCase().includes(q) ||
            (item.documentName && item.documentName.toLowerCase().includes(q)) ||
            (item.docType && item.docType.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [items, categoryFilter, statusFilter, versionFilter, fromDate, toDate, search]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, statusFilter, versionFilter, fromDate, toDate, search]);

  const hasFilters =
    categoryFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    versionFilter !== "ALL" ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    Boolean(search.trim());

  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="bento-shell">
      <section className="bento-core overflow-hidden p-0">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F7F9F6] px-5 py-3.5">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
              Document History (Archival Record &amp; Timeframe Snapshots)
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Museum archive of how the property record and documents evolved over time. Click any
              row to inspect the exact read-only snapshot from that timeframe.
            </p>
          </div>
          <span className="pill">
            Earliest → Latest · {filtered.length} archival snapshot{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Filtering Controls Bar */}
        <div className="grid gap-2.5 border-b border-line bg-[#F8FAF8] px-5 py-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search revision, title, holder…"
            aria-label="Search document history"
            className="rounded-lg border border-[#C8D3C8] bg-white px-3 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:outline-none lg:col-span-2"
          />

          <select
            aria-label="Filter by lifecycle type"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="ALL">All Archival Milestones</option>
            <option value="PROPERTY_LIFECYCLE">Title &amp; Property Updates</option>
            <option value="MANAGEMENT_REVIEW">Management Reviews &amp; Notes</option>
            <option value="DOCUMENT_REVISION">Document Revisions (v1, v2…)</option>
            <option value="CUSTODY_TRANSFER">Custody &amp; Transfers</option>
          </select>

          <select
            aria-label="Filter by document status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            {availableStatuses.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st] ?? st}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by version"
            value={versionFilter}
            onChange={(e) => setVersionFilter(e.target.value)}
            className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="ALL">All Versions</option>
            {availableVersions.map((v) => (
              <option key={v} value={String(v)}>
                Version {v}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              title="From date"
              className="min-w-0 flex-1 rounded-lg border border-[#C8D3C8] bg-white px-2 py-1.5 font-mono text-[11px] text-ink focus:border-brand focus:outline-none"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              title="To date"
              className="min-w-0 flex-1 rounded-lg border border-[#C8D3C8] bg-white px-2 py-1.5 font-mono text-[11px] text-ink focus:border-brand focus:outline-none"
            />
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter("ALL");
                  setStatusFilter("ALL");
                  setVersionFilter("ALL");
                  setFromDate("");
                  setToDate("");
                  setSearch("");
                }}
                className="shrink-0 rounded-lg bg-[#EAF2EC] px-2.5 py-1.5 text-xs font-semibold text-[#1A472A] hover:bg-[#D5E6D9]"
              >
                Reset
              </button>
            )}
          </div>
        </div>

            {/* Chronological Revision & Lifecycle Table (Earliest -> Latest) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              <tr>
                <th className="px-4 py-3">Step</th>
                <th className="px-4 py-3">Timeframe</th>
                <th className="px-4 py-3">Milestone Stage</th>
                <th className="px-4 py-3">Archival Record Summary</th>
                <th className="px-4 py-3">Version / State</th>
                <th className="px-4 py-3">Recorded By</th>
                <th className="px-4 py-3 text-right">Snapshot</th>
              </tr>
            </thead>
            <tbody key={safePage} className="animate-fade-up divide-y divide-line">
              {paged.map((item, idx) => {
                const stepNum = (safePage - 1) * PAGE_SIZE + idx + 1;
                return (
                  <tr
                    key={item.id}
                    onClick={() => openSnapshot(item)}
                    className="cursor-pointer align-top transition-colors hover:bg-surface-muted"
                  >
                    <td className="px-4 py-3.5 font-mono font-semibold tabular-nums text-brand">
                      #{stepNum}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono tabular-nums text-muted">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                          item.category === "MANAGEMENT_REVIEW"
                            ? "border-warning-border bg-warning-bg text-warning"
                            : "border-brand-border bg-brand-soft text-brand-soft-fg"
                        }`}
                      >
                        {item.categoryLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-ink">{item.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {item.reviewNote ? `Review note: "${item.reviewNote}"` : item.description}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {typeof item.version === "number" && (
                          <span className="rounded bg-brand-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-soft-fg">
                            v{item.version}
                          </span>
                        )}
                        <span className="pill">{STATUS_LABEL[item.status] ?? item.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-ink">{item.actor}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSnapshot(item);
                        }}
                        className="rounded-lg border border-brand-border bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-soft-fg transition-colors hover:opacity-90"
                      >
                        View snapshot →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="p-8 text-center text-xs text-muted">
            No archival history milestones match your selected filters.
          </p>
        )}

        <PaginationBar
          page={safePage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </section>

      {/* INTERACTIVE ARCHIVAL TIMEFRAME SNAPSHOT MODAL (Read-Only Museum View) */}
      <Modal
        open={Boolean(selectedSnapshot)}
        onClose={() => setSelectedSnapshot(null)}
        ariaLabelledBy="snapshot-modal-title"
        maxWidthClass="max-w-4xl"
      >
        {selectedSnapshot && (
          <div className="flex max-h-[90vh] flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F7F9F6] px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-[#B7D3BF] bg-[#EAF2EC] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#1A472A]">
                    Read-Only Archival Snapshot
                  </span>
                  <span className="rounded-md border border-[#DCE3DC] bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-[#3E5046]">
                    {selectedSnapshot.categoryLabel}
                  </span>
                </div>
                <h3 id="snapshot-modal-title" className="mt-1.5 text-base font-semibold text-ink">
                  {selectedSnapshot.title}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  Timeframe: {new Date(selectedSnapshot.createdAt).toLocaleString()} · Recorded by{" "}
                  <strong className="font-sans text-ink">{selectedSnapshot.actor}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSnapshot(null)}
                className="rounded-lg border border-[#DCE3DC] bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-[#F0F4F0]"
              >
                Close (Esc)
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
              {/* Milestone Description & Review Note */}
              <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A472A]">
                  Milestone Record
                </p>
                <p className="mt-1 text-sm text-ink">{selectedSnapshot.description}</p>
                {(selectedSnapshot.reviewNote ||
                  selectedSnapshot.snapshot?.focusDocument?.reviewNote) && (
                  <div className="mt-3 rounded-lg border border-[#FEDF89] bg-warning-bg p-3 text-warning">
                    <p className="text-[11px] font-semibold uppercase tracking-wider">
                      Management Review Note at Timeframe
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink">
                      {selectedSnapshot.reviewNote ??
                        selectedSnapshot.snapshot?.focusDocument?.reviewNote}
                    </p>
                  </div>
                )}
              </div>

              {/* Property State at Timeframe */}
              {selectedSnapshot.snapshot && (
                <div className="rounded-xl border border-[#DCE3DC] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A472A]">
                      Property Record State at Timeframe
                    </p>
                    <span className="pill">
                      Status:{" "}
                      {STATUS_LABEL[selectedSnapshot.snapshot.parcelState.status] ??
                        selectedSnapshot.snapshot.parcelState.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        Property Name
                      </p>
                      <p className="mt-0.5 font-semibold text-ink">
                        {selectedSnapshot.snapshot.parcelState.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">Location</p>
                      <p className="mt-0.5 font-medium text-ink">
                        {[
                          selectedSnapshot.snapshot.parcelState.municipality,
                          selectedSnapshot.snapshot.parcelState.province,
                          selectedSnapshot.snapshot.parcelState.region,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">Land Area</p>
                      <p className="mt-0.5 font-mono font-medium text-ink">
                        {formatAreaSqm(selectedSnapshot.snapshot.parcelState.areaHa, {
                          includeHa: true,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        Title / Tax Dec
                      </p>
                      <p className="mt-0.5 font-mono font-medium text-ink">
                        {[
                          selectedSnapshot.snapshot.parcelState.titleNo,
                          selectedSnapshot.snapshot.parcelState.taxDecNo,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Focused Document / Custody State at Timeframe */}
              {selectedSnapshot.snapshot?.focusDocument && (
                <div className="rounded-xl border border-[#DCE3DC] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A472A]">
                      Document Version &amp; Custody at Timeframe
                    </p>
                    {selectedSnapshot.snapshot.focusDocument.id && (
                      <Link
                        href={`/documents/${selectedSnapshot.snapshot.focusDocument.id}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        Open full document record →
                      </Link>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">File Name</p>
                      <p className="mt-0.5 font-semibold text-ink">
                        {selectedSnapshot.snapshot.focusDocument.fileName ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        Category &amp; Version
                      </p>
                      <p className="mt-0.5 font-medium text-ink">
                        {selectedSnapshot.snapshot.focusDocument.docType ?? "—"}
                        {typeof selectedSnapshot.snapshot.focusDocument.version === "number"
                          ? ` (v${selectedSnapshot.snapshot.focusDocument.version})`
                          : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        Custody / Status
                      </p>
                      <p className="mt-0.5 font-medium text-ink">
                        {selectedSnapshot.snapshot.focusDocument.custodyHolder ??
                          (STATUS_LABEL[selectedSnapshot.snapshot.focusDocument.status] ??
                            selectedSnapshot.snapshot.focusDocument.status)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        SHA-256 Fingerprint
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {selectedSnapshot.snapshot.focusDocument.sha256 ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Active Files Roster + Inline Read-Only Timeframe File Viewer */}
              {selectedSnapshot.snapshot &&
                selectedSnapshot.snapshot.activeDocumentsAtTime.length > 0 && (
                  <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                    <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A472A]">
                        Files on Record ({selectedSnapshot.snapshot.activeDocumentsAtTime.length})
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Select any file active during this timeframe to inspect it:
                      </p>
                      <ul className="mt-2.5 space-y-1.5">
                        {selectedSnapshot.snapshot.activeDocumentsAtTime.map((doc) => {
                          const active = previewDocId === doc.id;
                          return (
                            <li key={doc.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewDocId(doc.id);
                                  setPreviewDocName(doc.fileName);
                                }}
                                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                                  active
                                    ? "border-[#1A472A] bg-[#1A472A] text-white"
                                    : "border-[#DCE3DC] bg-white text-ink hover:bg-[#EAF2EC]"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold">{doc.fileName}</p>
                                  <p
                                    className={`truncate text-[10px] ${
                                      active ? "text-white/80" : "text-muted"
                                    }`}
                                  >
                                    {doc.docType ?? "Attachment"}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                    active
                                      ? "bg-white/20 text-white"
                                      : "bg-[#EAF2EC] text-[#1A472A]"
                                  }`}
                                >
                                  v{doc.version}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Inline Read-Only File Preview */}
                    <div className="flex flex-col overflow-hidden rounded-xl border border-[#DCE3DC] bg-[#F8FAF8]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-2.5">
                        <span className="truncate font-semibold text-ink">
                          {previewDocName || "Historical File Preview"}
                        </span>
                        {previewDocId && (
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/core/documents/${previewDocId}/download`}
                              className="rounded-lg border border-[#DCE3DC] bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-[#F0F4F0]"
                            >
                              Download copy
                            </a>
                            <Link
                              href={`/documents/${previewDocId}`}
                              className="rounded-lg bg-[#1A472A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#13361F]"
                            >
                              Open viewer →
                            </Link>
                          </div>
                        )}
                      </div>

                      <div className="flex min-h-[340px] flex-1 items-center justify-center p-3">
                        {!previewDocId ? (
                          <p className="text-xs text-muted">
                            Select a file on the left to preview its historical version.
                          </p>
                        ) : (
                          <SecureMediaPreview
                            documentId={previewDocId}
                            fileName={previewDocName}
                            heightClass="h-[380px]"
                            maxImgHeightClass="max-h-[380px]"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * 2. DOCUMENT LOGS (AUDIT TRAIL)
 * Tracks user-initiated actions performed on documents (views, downloads, uploads, version edits,
 * custody updates, deletions, and integrity checks) with action type, user, date range, and keyword filters.
 */
export function DocumentLogsSection({ logs }: { logs: DocumentAuditLog[] }) {
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [actorFilter, setActorFilter] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const availableActors = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.actor) set.add(log.actor);
    }
    return Array.from(set).sort();
  }, [logs]);

  const availableActions = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of logs) {
      map.set(log.action, log.actionLabel);
    }
    return Array.from(map.entries());
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== "ALL" && log.action !== actionFilter) return false;
      if (actorFilter !== "ALL" && log.actor !== actorFilter) return false;
      if (!matchesDateRange(log.createdAt, fromDate, toDate)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          log.summary.toLowerCase().includes(q) ||
          log.actor.toLowerCase().includes(q) ||
          log.actionLabel.toLowerCase().includes(q) ||
          log.documentName.toLowerCase().includes(q) ||
          (log.docType && log.docType.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [logs, actionFilter, actorFilter, fromDate, toDate, search]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, actorFilter, fromDate, toDate, search]);

  const hasFilters =
    actionFilter !== "ALL" ||
    actorFilter !== "ALL" ||
    Boolean(fromDate) ||
    Boolean(toDate) ||
    Boolean(search.trim());

  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="bento-shell">
      <section className="bento-core overflow-hidden p-0">
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F7F9F6] px-5 py-3.5">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
              Document Logs (User Activity Audit Trail)
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Every user-initiated action performed on documents: views, downloads, uploads, version
              edits, custody updates, and removals.
            </p>
          </div>
          <span className="pill">
            {filtered.length} logged action{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Filtering Controls Bar */}
        <div className="grid gap-2.5 border-b border-line bg-[#F8FAF8] px-5 py-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, file, or action…"
            aria-label="Search document logs"
            className="rounded-lg border border-[#C8D3C8] bg-white px-3 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:outline-none lg:col-span-2"
          />

          <select
            aria-label="Filter by action type"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="ALL">All Action Types</option>
            {availableActions.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by user"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="ALL">All Users ({availableActors.length})</option>
            {availableActors.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              title="From date"
              className="min-w-0 flex-1 rounded-lg border border-[#C8D3C8] bg-white px-2 py-1.5 font-mono text-[11px] text-ink focus:border-brand focus:outline-none"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              title="To date"
              className="min-w-0 flex-1 rounded-lg border border-[#C8D3C8] bg-white px-2 py-1.5 font-mono text-[11px] text-ink focus:border-brand focus:outline-none"
            />
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setActionFilter("ALL");
                  setActorFilter("ALL");
                  setFromDate("");
                  setToDate("");
                  setSearch("");
                }}
                className="shrink-0 rounded-lg bg-[#EAF2EC] px-2.5 py-1.5 text-xs font-semibold text-[#1A472A] hover:bg-[#D5E6D9]"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Structured Document Activity Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-[#F7F9F6] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Activity Details</th>
              </tr>
            </thead>
            <tbody key={safePage} className="animate-fade-up divide-y divide-line">
              {paged.map((log) => (
                <tr key={log.id} className="align-top transition-colors hover:bg-[#F8FAF8]">
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono tabular-nums text-[#3E5046]">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-ink">{log.actor}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={
                        log.action === "DOCUMENT_DELETED" || log.action === "INTEGRITY_FAIL"
                          ? "pill-danger"
                          : log.action === "DOCUMENT_UPLOADED" || log.action === "DOCUMENT_REPLACED"
                            ? "pill-ok"
                            : "pill"
                      }
                    >
                      {log.actionLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {log.documentId ? (
                      <Link
                        href={`/documents/${log.documentId}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {log.docType ?? log.documentName}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">
                        {log.docType ?? log.documentName}
                      </span>
                    )}
                    {typeof log.version === "number" && (
                      <span className="ml-1.5 rounded bg-[#EAF2EC] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1A472A]">
                        v{log.version}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-[#3E5046]">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="p-8 text-center text-xs text-muted">
            No user activity logs match your selected filters.
          </p>
        )}

        <PaginationBar
          page={safePage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}
