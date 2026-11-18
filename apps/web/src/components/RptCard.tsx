"use client";
// FR-15 (DECISIONS D11) on the parcel overview: quarterly RPT periods; the Legal Department adds
// a period and records the LGU official receipt to mark it paid. The gateway receipt is never
// the legal proof (§18).
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Rpt {
  id: string;
  year: number;
  quarter: number;
  amount: string;
  dueDate: string;
  status: "UNPAID" | "PAID" | "OVERDUE";
  orNumber: string | null;
  paidDate: string | null;
}

const peso = (a: string) => `₱${Number(a).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export function RptCard({ parcelId, canEdit }: { parcelId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<Rpt[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await api<Rpt[]>(`/parcels/${parcelId}/rpt`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [parcelId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(path: string, form: HTMLFormElement, done: () => void) {
    setError("");
    try {
      await api(path, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      done();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const overdue = rows.filter((r) => r.status === "OVERDUE");
  const next = rows
    .filter((r) => r.status === "UNPAID")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return (
    <div className="card space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Real property tax</h2>
        {overdue.length > 0 ? (
          <span className="pill-danger">
            {overdue.length} overdue ·{" "}
            {peso(overdue.reduce((t, r) => t + Number(r.amount), 0).toFixed(2))}
          </span>
        ) : next ? (
          <span className="text-muted">
            Next: Q{next.quarter} {next.year} falls due {next.dueDate}
          </span>
        ) : (
          <span className="text-muted">No unpaid periods</span>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-brand hover:underline"
        >
          {open ? "Hide periods" : `Show periods (${rows.length})`}
        </button>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-brand hover:underline"
          >
            Add a period
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(`/parcels/${parcelId}/rpt`, e.currentTarget, () => setAdding(false));
          }}
          className="flex flex-wrap items-end gap-3 border-t border-line pt-3"
        >
          <div>
            <label htmlFor="rpt-year" className="label">
              Year
            </label>
            <input
              id="rpt-year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              required
              className="field w-24"
            />
          </div>
          <div>
            <label htmlFor="rpt-q" className="label">
              Quarter
            </label>
            <select id="rpt-q" name="quarter" className="field">
              <option value="1">Q1 (Mar 31)</option>
              <option value="2">Q2 (Jun 30)</option>
              <option value="3">Q3 (Sep 30)</option>
              <option value="4">Q4 (Dec 31)</option>
            </select>
          </div>
          <div>
            <label htmlFor="rpt-amount" className="label">
              Amount (₱)
            </label>
            <input
              id="rpt-amount"
              name="amount"
              inputMode="decimal"
              pattern="\d+(\.\d{1,2})?"
              required
              className="field w-36"
            />
          </div>
          <button type="submit" className="btn-primary">
            Save period
          </button>
          <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
            Cancel
          </button>
        </form>
      )}

      {open && (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Q{r.quarter} {r.year} · {peso(r.amount)} · falls due {r.dueDate}
                </span>
                {r.status === "PAID" ? (
                  <span className="text-muted">
                    Paid {r.paidDate} · OR {r.orNumber}
                  </span>
                ) : (
                  <span className="flex items-center gap-3">
                    <span className={r.status === "OVERDUE" ? "pill-danger" : "text-muted"}>
                      {r.status === "OVERDUE" ? "Overdue" : "Unpaid"}
                    </span>
                    {canEdit && paying !== r.id && (
                      <button
                        type="button"
                        onClick={() => setPaying(r.id)}
                        className="text-brand hover:underline"
                      >
                        Record official receipt
                      </button>
                    )}
                  </span>
                )}
              </div>
              {paying === r.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(`/rpt/${r.id}/pay`, e.currentTarget, () => setPaying(null));
                  }}
                  className="flex flex-wrap items-end gap-3"
                >
                  <div>
                    <label htmlFor={`or-${r.id}`} className="label">
                      LGU official receipt no.
                    </label>
                    <input
                      id={`or-${r.id}`}
                      name="orNumber"
                      required
                      maxLength={60}
                      className="field"
                    />
                  </div>
                  <div>
                    <label htmlFor={`pd-${r.id}`} className="label">
                      Payment date
                    </label>
                    <input
                      id={`pd-${r.id}`}
                      name="paidDate"
                      type="date"
                      required
                      className="field"
                    />
                  </div>
                  <button type="submit" className="btn-primary">
                    Mark paid
                  </button>
                  <button type="button" onClick={() => setPaying(null)} className="btn-secondary">
                    Cancel
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
