"use client";
// FR-13 status and custody of the original (DECISIONS D4–D7). Figure 26 (V19 Update custody).
// Summary first; history and the update form sit behind toggles. Legal Department only edits.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  UNDER_PROCESSING: "Under processing",
  WITH_THIRD_PARTY: "With third party",
  EXPIRED: "Expired",
  SUPERSEDED: "Replaced by a newer version",
  MISSING: "Missing",
  RECALLED: "Recalled",
};

const ACTION_LABEL: Record<string, string> = {
  RELEASED: "Released",
  RETURNED: "Returned",
  SENT_FOR_PROCESSING: "Sent for processing",
};

export const HOLDER_LABEL: Record<string, string> = {
  COMPANY_VAULT: "Company vault",
  BANK: "Bank",
  GOVERNMENT_OFFICE: "Government office",
};

interface CustodyRecord {
  id: string;
  action: string;
  holderType: string;
  holderName: string;
  referenceNo: string | null;
  releaseDate: string | null;
  expectedReturnDate: string | null;
  processingStage: string | null;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
}

interface Custody {
  status: string;
  current: CustodyRecord | null;
  history: CustodyRecord[];
}

export function CustodyPanel({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const [data, setData] = useState<Custody | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState("RELEASED");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Custody>(`/documents/${documentId}/custody`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/documents/${documentId}/custody`, { method: "POST", body: JSON.stringify(body) });
      setEditing(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p className="text-sm text-danger">{error}</p> : null;
  const cur = data.current;
  const needsAttention = data.status === "MISSING" || data.status === "RECALLED";
  const stageRequired = action === "SENT_FOR_PROCESSING";

  return (
    <section className="card space-y-3 text-sm">
      <h2 className="text-base font-semibold">Original document</h2>
      <p>
        Status:{" "}
        <span className={needsAttention ? "pill-danger" : "pill"}>
          {STATUS_LABEL[data.status] ?? data.status}
        </span>
      </p>
      <p>
        {cur
          ? `${ACTION_LABEL[cur.action]} — held by ${cur.holderName} (${HOLDER_LABEL[cur.holderType]})`
          : "No custody movement recorded yet."}
        {cur?.expectedReturnDate && ` · expected back ${cur.expectedReturnDate}`}
        {cur?.processingStage && ` · stage: ${cur.processingStage}`}
      </p>

      <div className="flex flex-wrap gap-4">
        {data.history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-brand hover:underline"
          >
            {showHistory ? "Hide custody history" : `Show custody history (${data.history.length})`}
          </button>
        )}
        {canEdit && data.status !== "SUPERSEDED" && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand hover:underline"
          >
            Update custody
          </button>
        )}
      </div>

      {showHistory && (
        <ul className="divide-y divide-line">
          {data.history.map((h) => (
            <li key={h.id} className="py-2">
              <p className="font-medium">
                {ACTION_LABEL[h.action]} · {h.holderName} ({HOLDER_LABEL[h.holderType]})
              </p>
              <p className="text-muted">
                {new Date(h.createdAt).toLocaleDateString()}
                {h.recordedBy && ` by ${h.recordedBy}`}
                {h.referenceNo && ` · ref. ${h.referenceNo}`}
                {h.releaseDate && ` · released ${h.releaseDate}`}
                {h.expectedReturnDate && ` · expected back ${h.expectedReturnDate}`}
                {h.processingStage && ` · stage: ${h.processingStage}`}
              </p>
              {h.note && <p>{h.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form onSubmit={onSubmit} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <div>
            <label htmlFor="action" className="label">
              What happened
            </label>
            <select
              id="action"
              name="action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="field"
            >
              {Object.entries(ACTION_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {action !== "RETURNED" && (
            <div>
              <label htmlFor="holderType" className="label">
                Who holds it now
              </label>
              <select id="holderType" name="holderType" className="field" defaultValue="BANK">
                <option value="BANK">Bank</option>
                <option value="GOVERNMENT_OFFICE">Government office</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="holderName" className="label">
              Holder name
            </label>
            <input
              key={action}
              id="holderName"
              name="holderName"
              required
              maxLength={200}
              defaultValue={action === "RETURNED" ? "Legal Department vault" : ""}
              placeholder="e.g. Registry of Deeds"
              className="field"
            />
          </div>
          <div>
            <label htmlFor="referenceNo" className="label">
              Custody reference no. (optional)
            </label>
            <input id="referenceNo" name="referenceNo" maxLength={100} className="field" />
          </div>
          <div>
            <label htmlFor="releaseDate" className="label">
              Release date (optional)
            </label>
            <input id="releaseDate" name="releaseDate" type="date" className="field" />
          </div>
          <div>
            <label htmlFor="expectedReturnDate" className="label">
              Expected return (optional)
            </label>
            <input
              id="expectedReturnDate"
              name="expectedReturnDate"
              type="date"
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="processingStage" className="label">
              Processing stage {stageRequired ? "" : "(needed when it goes to a government office)"}
            </label>
            <input
              id="processingStage"
              name="processingStage"
              maxLength={120}
              required={stageRequired}
              placeholder="e.g., Annotation at Registry of Deeds"
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="note" className="label">
              Note (optional)
            </label>
            <textarea id="note" name="note" maxLength={1000} rows={2} className="field" />
          </div>
          {error && (
            <p role="alert" className="text-danger sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : "Save custody update"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
