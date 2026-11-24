"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { CustodyPanel } from "@/components/CustodyPanel";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BackButton } from "@/components/BackButton";
import { isImageFileName } from "@/components/ParcelForm";
import {
  DocumentHistorySection,
  DocumentLogsSection,
  type DocumentAuditLog,
  type DocumentHistoryEvent,
} from "@/components/DocumentTrackingPanels";

interface Meta {
  id: string;
  fileName: string;
  docType: string | null;
  sha256: string;
  status: string;
  version: number;
  expiresOn: string | null;
  parcel: { id: string; name: string };
}

interface Version {
  id: string;
  fileName: string;
  version: number;
  status: string;
  integrityStatus: "VERIFIED" | "FAILED";
  createdAt: string;
}

interface Failure {
  storedHash: string;
  computedHash: string | null;
}

type DocViewerTab = "preview" | "history" | "logs";

async function fetchFile(id: string, kind: "view" | "download") {
  const res = await fetch(`/api/core/documents/${id}/${kind}`, { cache: "no-store" });
  if (res.status === 401) {
    await signOut({ callbackUrl: "/login" });
    throw new Error("Session ended");
  }
  return res;
}

export default function DocumentViewer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [history, setHistory] = useState<DocumentHistoryEvent[]>([]);
  const [logs, setLogs] = useState<DocumentAuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<DocViewerTab>("preview");
  const [busy, setBusy] = useState(false);
  const [newExpiry, setNewExpiry] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: session } = useSession();
  const isLegal = session?.user.role === "LEGAL";
  const canSeeHistory =
    session?.user.role === "LEGAL" || session?.user.role === "MANAGEMENT";

  const loadTracking = useCallback(async () => {
    if (!canSeeHistory) return;
    try {
      const tr = await api<{ history: DocumentHistoryEvent[]; logs: DocumentAuditLog[] }>(
        `/documents/${id}/tracking`,
      );
      setHistory(tr.history);
      setLogs(tr.logs);
    } catch {
      // Ignore tracking load errors
    }
  }, [id, canSeeHistory]);

  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      const m = await fetch(`/api/core/documents/${id}`, { cache: "no-store" });
      if (m.status === 403) return router.replace("/denied");
      if (!m.ok) return setError("Document not found.");
      setMeta((await m.json()) as Meta);

      const res = await fetchFile(id, "view");
      if (res.status === 409) {
        setFailure((await res.json()) as Failure);
        await loadTracking();
        return;
      }
      if (!res.ok) return setError("Something went wrong.");
      setVerified(res.headers.get("X-Integrity-SHA256"));
      objectUrl = URL.createObjectURL(await res.blob());
      setUrl(objectUrl);
      await loadTracking();
    })().catch(() => setError("Something went wrong."));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, router, loadTracking]);

  async function download() {
    const res = await fetchFile(id, "download");
    if (res.status === 409) {
      setFailure((await res.json()) as Failure);
      await loadTracking();
      return;
    }
    if (!res.ok) return setError("Something went wrong.");
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = meta?.fileName ?? "document.pdf";
    a.click();
    URL.revokeObjectURL(blobUrl);
    await loadTracking();
  }

  async function toggleVersions() {
    if (versions) return setVersions(null);
    try {
      setVersions((await api<{ versions: Version[] }>(`/documents/${id}/versions`)).versions);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (meta?.expiresOn) body.append("expiresOn", newExpiry);
      const next = await api<{ id: string }>(`/documents/${id}/replace`, { method: "POST", body });
      router.push(`/documents/${next.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function onDelete() {
    if (!meta) return;
    setConfirmDelete(false);
    setBusy(true);
    try {
      await api(`/documents/${id}`, { method: "DELETE" });
      router.push(`/properties/${meta.parcel.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const current = meta && meta.status !== "SUPERSEDED";
  const fileName = meta?.fileName ?? "";
  const isImage = isImageFileName(fileName);
  const isDocx = fileName.toLowerCase().endsWith(".docx");

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <BackButton
            fallbackHref={meta ? `/properties/${meta.parcel.id}` : "/properties"}
            className="text-xs font-medium text-brand hover:underline inline-flex items-center gap-1"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
              {meta?.fileName ?? "Document"}
            </h1>
            {meta && (
              <span className="rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-semibold text-[#1A472A]">
                Version {meta.version}
              </span>
            )}
          </div>
          {meta?.expiresOn && (
            <p className="mt-1 font-mono text-xs text-muted">Expires on {meta.expiresOn}</p>
          )}
          {meta && !current && (
            <p className="mt-1 text-xs text-muted">
              This is an older version (version {meta.version}). It was replaced by a newer upload.
            </p>
          )}
        </div>

        {/* Segmented View Switcher: Preview & Custody | Document History | Document Logs */}
        {canSeeHistory && (
          <div
            className="flex flex-wrap items-center gap-1 rounded-xl border border-[#DCE3DC] bg-[#EDF1EC] p-1 text-xs"
            role="tablist"
            aria-label="Document view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "preview"}
              onClick={() => setActiveTab("preview")}
              className={`rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
                activeTab === "preview"
                  ? "bg-white text-ink shadow-sm ring-1 ring-[#DCE3DC]"
                  : "text-muted hover:text-ink"
              }`}
            >
              Preview &amp; Custody
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

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {activeTab === "preview" && (
        <>
          {meta && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={toggleVersions}
                className="font-medium text-brand hover:underline"
              >
                {versions ? "Hide versions" : `Show versions (current: version ${meta.version})`}
              </button>
              {isLegal && current && (
                <>
                  {meta.expiresOn && (
                    <label className="flex items-center gap-2">
                      <span className="text-muted">New expiry date</span>
                      <input
                        type="date"
                        value={newExpiry}
                        onChange={(e) => setNewExpiry(e.target.value)}
                        className="field w-auto font-mono"
                      />
                    </label>
                  )}
                  <label
                    title={
                      meta.expiresOn && !newExpiry
                        ? "Enter a new expiry date before selecting a replacement file"
                        : undefined
                    }
                    className={`btn-secondary ${
                      busy || (!!meta.expiresOn && !newExpiry)
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    }`}
                  >
                    {busy ? "Saving…" : "Replace with new version"}
                    <input
                      type="file"
                      accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      disabled={busy || (!!meta.expiresOn && !newExpiry)}
                      onChange={onReplace}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    className="font-medium text-danger hover:underline"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

          {versions && (
            <ul className="animate-fade-up card divide-y divide-line overflow-hidden p-0 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Link
                    href={`/documents/${v.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    Version {v.version}
                  </Link>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-muted">
                    {v.status === "SUPERSEDED" ? "Replaced" : "Current"}
                  </span>
                  {v.integrityStatus === "FAILED" && (
                    <span className="pill-danger">Integrity failure</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {meta && <CustodyPanel documentId={meta.id} canEdit={isLegal} />}

          {failure && (
            <div className="space-y-3 rounded-xl border border-danger-border bg-danger-bg p-6 text-sm text-danger">
              <p className="text-base font-semibold">Integrity failure — do not use this file</p>
              <p className="text-xs leading-relaxed">
                This file changed after it was uploaded, or it is missing. Viewing and downloading
                are blocked, and the event was recorded in the audit log.
              </p>
              <dl className="grid gap-1 font-mono text-xs">
                <dt className="font-sans font-medium">Stored hash (at upload)</dt>
                <dd className="break-all">{failure.storedHash}</dd>
                <dt className="mt-2 font-sans font-medium">Computed hash (now)</dt>
                <dd className="break-all">{failure.computedHash ?? "file missing"}</dd>
              </dl>
              <p className="text-xs text-ink">
                Next steps: get a verified copy of the original, then upload it as a replacement.
              </p>
            </div>
          )}

          {url && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="pill-ok">Integrity verified</span>
                <span className="break-all font-mono text-xs text-muted">SHA-256 {verified}</span>
                <button type="button" onClick={download} className="btn-secondary ml-auto">
                  Download
                </button>
              </div>
              <p className="text-xs text-muted">
                The check confirms the stored file is unchanged since upload. It does not certify
                that the document is authentic.
              </p>

              {isImage ? (
                <div className="flex items-center justify-center rounded-2xl border border-line bg-[#121D17] p-6 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={meta?.fileName ?? "Image attachment"}
                    className="max-h-[72vh] max-w-full rounded-xl object-contain"
                  />
                </div>
              ) : isDocx ? (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
                  <p className="text-base font-semibold text-ink">{meta?.fileName}</p>
                  <p className="mt-1 text-xs text-muted">
                    Word Document (.docx) — SHA-256 verified. Click below to download and open in
                    Microsoft Word or LibreOffice.
                  </p>
                  <button type="button" onClick={download} className="btn-primary mt-4">
                    Download .docx File
                  </button>
                </div>
              ) : (
                <iframe
                  src={url}
                  title={meta?.fileName ?? "Document"}
                  className="h-[70vh] w-full rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                />
              )}
            </>
          )}
        </>
      )}

      {activeTab === "history" && <DocumentHistorySection items={history} />}
      {activeTab === "logs" && <DocumentLogsSection logs={logs} />}

      <ConfirmModal
        open={confirmDelete}
        title="Remove this document?"
        description="It will be removed from this property's active files."
        confirmLabel="Remove"
        cancelLabel="Keep file"
        variant="danger"
        busy={busy}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
