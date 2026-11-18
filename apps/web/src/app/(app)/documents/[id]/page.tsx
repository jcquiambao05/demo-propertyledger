"use client";
// Figure 24 (V17 Document viewer) and Figure 25 (V18 Integrity failure). FR-12:
// every view and every download re-hashes the stored file on the server first.
// FR-10 replace (new version, D2) and soft delete (D3): Legal Department only.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { CustodyPanel } from "@/components/CustodyPanel";

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

const DELETE_CONFIRM = "This removes the document from the property. The action is recorded.";

interface Failure {
  storedHash: string;
  computedHash: string | null;
}

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
  const [busy, setBusy] = useState(false);
  const [newExpiry, setNewExpiry] = useState("");
  const { data: session } = useSession();
  const isLegal = session?.user.role === "LEGAL";

  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      const m = await fetch(`/api/core/documents/${id}`, { cache: "no-store" });
      if (m.status === 403) return router.replace("/denied");
      if (!m.ok) return setError("Document not found.");
      setMeta((await m.json()) as Meta);

      const res = await fetchFile(id, "view");
      if (res.status === 409) return setFailure((await res.json()) as Failure);
      if (!res.ok) return setError("Something went wrong.");
      setVerified(res.headers.get("X-Integrity-SHA256"));
      objectUrl = URL.createObjectURL(await res.blob());
      setUrl(objectUrl);
    })().catch(() => setError("Something went wrong."));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, router]);

  async function download() {
    const res = await fetchFile(id, "download");
    if (res.status === 409) return setFailure((await res.json()) as Failure);
    if (!res.ok) return setError("Something went wrong.");
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = meta?.fileName ?? "document.pdf";
    a.click();
    URL.revokeObjectURL(blobUrl);
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
    if (!meta || !window.confirm(DELETE_CONFIRM)) return;
    setBusy(true);
    try {
      await api(`/documents/${id}`, { method: "DELETE" });
      router.push(`/properties/${meta.parcel.id}/documents`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const current = meta && meta.status !== "SUPERSEDED";

  return (
    <div className="max-w-5xl space-y-4">
      {meta && (
        <Link
          href={`/properties/${meta.parcel.id}/documents`}
          className="text-sm text-brand hover:underline"
        >
          ← {meta.parcel.name} documents
        </Link>
      )}
      <h1 className="text-2xl font-semibold">{meta?.fileName ?? "Document"}</h1>
      {meta?.expiresOn && <p className="text-sm text-muted">Expires on {meta.expiresOn}</p>}
      {meta && !current && (
        <p className="text-sm text-muted">
          This is an older version (version {meta.version}). It was replaced by a newer upload.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {meta && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" onClick={toggleVersions} className="text-brand hover:underline">
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
                    className="field w-auto"
                  />
                </label>
              )}
              <label className="btn-secondary cursor-pointer">
                {busy ? "Saving…" : "Replace with new version"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  // A renewed time-bound document needs its new expiry date first (D10).
                  disabled={busy || (!!meta.expiresOn && !newExpiry)}
                  onChange={onReplace}
                />
              </label>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="text-danger hover:underline"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {versions && (
        <ul className="card divide-y divide-line p-0 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <Link href={`/documents/${v.id}`} className="font-medium text-brand hover:underline">
                Version {v.version}
              </Link>
              <span className="text-muted">{new Date(v.createdAt).toLocaleDateString()}</span>
              <span className="text-muted">
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
        <div className="space-y-3 rounded-xl border border-danger-dot bg-danger-bg p-6 text-sm text-danger">
          <p className="text-lg font-semibold">Integrity failure — do not use this file</p>
          <p>
            This file changed after it was uploaded, or it is missing. Viewing and downloading are
            blocked, and the event was recorded in the audit log.
          </p>
          <dl className="grid gap-1 font-mono text-xs">
            <dt className="font-sans font-medium">Stored hash (at upload)</dt>
            <dd className="break-all">{failure.storedHash}</dd>
            <dt className="mt-2 font-sans font-medium">Computed hash (now)</dt>
            <dd className="break-all">{failure.computedHash ?? "file missing"}</dd>
          </dl>
          <p className="text-ink">
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
            The check confirms the stored file is unchanged since upload. It does not certify that
            the document is authentic.
          </p>
          <iframe
            src={url}
            title={meta?.fileName ?? "Document"}
            className="h-[70vh] w-full rounded-xl border border-line bg-surface"
          />
        </>
      )}
    </div>
  );
}
