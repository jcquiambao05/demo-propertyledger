"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import { STATUS_LABEL } from "@/components/CustodyPanel";
import { Spinner } from "@/components/ConfirmModal";
import { PaginationBar } from "@/components/PaginationBar";

const DOCS_PAGE_SIZE = 5;

interface Doc {
  id: string;
  fileName: string;
  docType: string | null;
  sha256: string;
  sizeBytes: number;
  integrityStatus: "VERIFIED" | "FAILED";
  status: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useSession();
  const [parcel, setParcel] = useState<{ id: string; name: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
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
      const res = await api<{ parcel: { id: string; name: string }; documents: Doc[] }>(
        `/parcels/${id}/documents`,
      );
      setParcel(res.parcel);
      setDocs(res.documents);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) router.replace("/denied");
      else setError((e as Error).message);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setSaved(`File uploaded and verified (${doc.sha256.slice(0, 14)}…).`);
      (e.target as HTMLFormElement).reset();
      setDocType("");
      setPage(1);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const failed = docs.filter((d) => d.integrityStatus === "FAILED");
  const safePage = Math.min(page, Math.max(1, Math.ceil(docs.length / DOCS_PAGE_SIZE)));
  const pagedDocs = docs.slice((safePage - 1) * DOCS_PAGE_SIZE, safePage * DOCS_PAGE_SIZE);

  return (
    <div className="w-full space-y-6">
      <div className="border-b border-line pb-5">
        <Link href={`/properties/${id}`} className="text-xs font-medium text-brand hover:underline">
          ← {parcel?.name ?? "Property"}
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-ink">Documents</h1>
      </div>

      {failed.length > 0 && (
        <div className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg p-4 text-xs text-danger">
          {failed.length} file(s) didn&apos;t pass the file check and were blocked. Please upload a
          fresh copy.
        </div>
      )}

      {data?.user.role === "LEGAL" && (
        <form onSubmit={onUpload} className="card flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="file" className="label">
              PDF file (up to 20 MB)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept="application/pdf"
              required
              className="mt-1.5 text-xs text-[#475467] file:mr-3 file:rounded-md file:border file:border-[#D0D5DD] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-[#F9FAFB]"
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label htmlFor="docType" className="label">
              Document type
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
                Select document type…
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
              <input id="expiresOn" name="expiresOn" type="date" required className="field font-mono" />
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {busy ? "Uploading…" : "Upload file"}
          </button>
          {saved && <p className="animate-fade-up w-full font-mono text-xs text-brand">{saved}</p>}
        </form>
      )}

      {error && (
        <p role="alert" className="animate-fade-up rounded-lg border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-[#F7F9F6] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              <tr>
                <th className="px-5 py-3">File</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">File check</th>
              </tr>
            </thead>
            <tbody key={page} className="animate-fade-up divide-y divide-line">
              {pagedDocs.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-[#F9FAFB]">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/documents/${d.id}`}
                      className="font-medium text-ink transition-colors hover:text-brand hover:underline"
                    >
                      {d.fileName}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-[#475467]">{d.docType ?? "—"}</td>
                  <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-[#475467]">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#475467]">
                    {STATUS_LABEL[d.status] ?? d.status}
                  </td>
                  <td className="px-5 py-3.5">
                    {d.integrityStatus === "FAILED" ? (
                      <span className="pill-danger">Needs replacement</span>
                    ) : (
                      <span className="pill-ok">Verified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {docs.length === 0 && (
          <p className="p-8 text-center text-xs text-muted">
            No files uploaded for this property yet.
          </p>
        )}
        <PaginationBar
          page={page}
          pageSize={DOCS_PAGE_SIZE}
          totalItems={docs.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
