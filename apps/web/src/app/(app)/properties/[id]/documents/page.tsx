"use client";
// Figure 22 (V15 Property documents), Figure 23 (V16 Upload, without AI in this build). FR-10, FR-12,
// FR-13 (lifecycle status column).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import { STATUS_LABEL } from "@/components/CustodyPanel";

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
      setSaved(`Uploaded. Hash saved: ${doc.sha256.slice(0, 16)}…`);
      (e.target as HTMLFormElement).reset();
      setDocType("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const failed = docs.filter((d) => d.integrityStatus === "FAILED");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/properties/${id}`} className="text-sm text-brand hover:underline">
          ← {parcel?.name ?? "Property"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Documents</h1>
      </div>

      {failed.length > 0 && (
        <div className="rounded-xl border border-danger-dot bg-danger-bg p-4 text-sm text-danger">
          {failed.length} file(s) failed the integrity check and are blocked. Replace them with a
          verified copy.
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
              className="mt-1 text-sm"
            />
          </div>
          <div>
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
                Choose a type
              </option>
              {types.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              AI suggestion unavailable — choose the document type.
            </p>
          </div>
          {timeBound && (
            <div>
              <label htmlFor="expiresOn" className="label">
                Expiry date
              </label>
              <input id="expiresOn" name="expiresOn" type="date" required className="field" />
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Uploading…" : "Upload"}
          </button>
          {saved && <p className="w-full text-sm text-brand">{saved}</p>}
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Uploaded</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Integrity</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/documents/${d.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {d.fileName}
                  </Link>
                </td>
                <td className="px-4 py-3">{d.docType ?? "—"}</td>
                <td className="px-4 py-3">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">{STATUS_LABEL[d.status] ?? d.status}</td>
                <td className="px-4 py-3">
                  {d.integrityStatus === "FAILED" ? (
                    <span className="pill-danger">Integrity failure, do not use</span>
                  ) : (
                    <span className="pill">Verified at last check</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.length === 0 && <p className="p-4 text-sm text-muted">No documents yet.</p>}
      </div>
    </div>
  );
}
