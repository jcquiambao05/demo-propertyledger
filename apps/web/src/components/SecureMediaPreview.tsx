"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { isImageFileName } from "@/components/ParcelForm";
import { Spinner } from "@/components/ConfirmModal";

interface IntegrityFailure {
  storedHash?: string;
  computedHash?: string | null;
}

/**
 * Safely fetches an authenticated document/image blob from `/api/core/documents/:id/view`,
 * handling 401 session expiry, 404 soft-deleted historical files, and 409 integrity failures
 * without rendering raw JSON inside an <iframe> or broken <img> tags.
 */
export function SecureMediaPreview({
  documentId,
  fileName,
  heightClass = "h-[380px]",
  maxImgHeightClass = "max-h-[380px]",
}: {
  documentId: string;
  fileName: string;
  heightClass?: string;
  maxImgHeightClass?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failure, setFailure] = useState<IntegrityFailure | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setNotFound(false);
    setFailure(null);
    setError("");
    setBlobUrl(null);

    (async () => {
      const res = await fetch(`/api/core/documents/${documentId}/view`, { cache: "no-store" });
      if (!active) return;
      if (res.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as IntegrityFailure;
        setFailure(data);
        return;
      }
      if (!res.ok) {
        setError("Unable to load file preview.");
        return;
      }
      const blob = await res.blob();
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setBlobUrl(objectUrl);
    })()
      .catch(() => {
        if (active) setError("Unable to load file preview.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  if (loading) {
    return (
      <div className={`flex ${heightClass} w-full items-center justify-center gap-2 text-xs text-muted`}>
        <Spinner />
        <span>Verifying SHA-256 &amp; loading preview…</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-md space-y-1.5 rounded-xl border border-[#DCE3DC] bg-white p-5 text-center text-xs">
        <p className="font-semibold text-ink">Historical File No Longer Active</p>
        <p className="text-muted">
          This file was later removed from active property storage. Its archival metadata and
          SHA-256 fingerprint remain preserved above.
        </p>
      </div>
    );
  }

  if (failure) {
    return (
      <div className="max-w-md space-y-2 rounded-xl border border-danger-border bg-danger-bg p-5 text-xs text-danger">
        <p className="font-semibold">Integrity check failed — blocked for safety</p>
        <p>
          This file changed after upload or is missing on disk. Viewing and downloading are blocked.
        </p>
        {failure.storedHash && (
          <p className="break-all font-mono text-[10px]">Expected: {failure.storedHash}</p>
        )}
      </div>
    );
  }

  if (error || !blobUrl) {
    return <p className="text-xs text-danger">{error || "Preview unavailable."}</p>;
  }

  if (isImageFileName(fileName)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={blobUrl}
        alt={fileName}
        className={`${maxImgHeightClass} max-w-full rounded-lg border border-[#DCE3DC] bg-white object-contain shadow-sm`}
      />
    );
  }

  if (fileName.toLowerCase().endsWith(".docx")) {
    return (
      <div className="space-y-2 text-center text-xs">
        <p className="font-semibold text-ink">{fileName}</p>
        <p className="text-muted">
          Word document (.docx) — SHA-256 verified. Download to inspect in Microsoft Word or
          LibreOffice.
        </p>
        <a
          href={`/api/core/documents/${documentId}/download`}
          className="btn-primary inline-flex text-xs"
        >
          Download .docx File
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      title={fileName}
      className={`${heightClass} w-full rounded-lg border border-[#DCE3DC] bg-white`}
    />
  );
}
