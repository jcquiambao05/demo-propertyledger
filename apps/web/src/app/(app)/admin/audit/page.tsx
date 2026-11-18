"use client";
// Figure 42 (V35 Audit log), IT Administrator, dark-blue theme. FR-19, FR-20.
// Shows IDs, actions and hashes only; IT never sees parcel or document content.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: string;
  createdAt: string;
  prevHash: string;
  entryHash: string;
}

interface Verify {
  ok: boolean;
  checked: number;
  firstBrokenId: string | null;
  reason: "prev_hash" | "entry_hash" | null;
  ms: number;
  verifiedAt: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ total: number; entries: Entry[] }>("/admin/audit");
      setEntries(res.entries);
      setTotal(res.total);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function verify() {
    setBusy(true);
    setError("");
    try {
      setResult(await api<Verify>("/admin/audit/verify", { method: "POST" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        {result &&
          (result.ok ? (
            <span className="rounded-full bg-it-okbg px-3 py-1 text-sm text-it-ok">
              Chain intact · {result.checked} entries checked
            </span>
          ) : (
            <span className="rounded-full bg-it-badbg px-3 py-1 text-sm text-it-bad">
              Chain broken at entry #{result.firstBrokenId}
            </span>
          ))}
        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className="ml-auto rounded-lg bg-it-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Verify chain now"}
        </button>
      </div>

      {result && !result.ok && (
        <div className="rounded-xl border border-it-line bg-it-badbg p-4 text-sm text-it-bad">
          Entry #{result.firstBrokenId} does not match its {result.reason === "prev_hash" ? "link to the previous entry" : "stored hash"}.
          Entries from this point cannot be trusted. Investigate direct database access.
        </div>
      )}
      {error && <p className="text-sm text-it-bad">{error}</p>}

      <p className="text-sm text-it-muted">Latest {entries.length} of {total} entries. Entries cannot be edited or deleted.</p>
      <div className="overflow-x-auto rounded-xl border border-it-line bg-it-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-it-line text-it-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Record</th>
              <th className="px-3 py-2 font-medium">Entry hash</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className={`border-b border-it-line last:border-0 ${result?.firstBrokenId === e.id ? "bg-it-badbg" : ""}`}
              >
                <td className="px-3 py-2">{e.id}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">{e.actor}</td>
                <td className="px-3 py-2 font-mono">{e.action}</td>
                <td className="px-3 py-2 font-mono">
                  {e.entity}
                  {e.entityId ? ` ${e.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-2 font-mono text-it-muted">{e.entryHash.slice(0, 16)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
