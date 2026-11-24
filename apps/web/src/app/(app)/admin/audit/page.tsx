"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ConfirmModal";
import { PaginationBar } from "@/components/PaginationBar";

const AUDIT_PAGE_SIZE = 8;

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: string;
  attemptedAccount?: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
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

function getActionBadgeClass(action: string, status?: string | null): string {
  if (
    action === "LOGIN_FAILED" ||
    action === "ACCOUNT_LOCKED" ||
    action === "LOGIN_BLOCKED_LOCKED" ||
    status?.includes("LOCKED") ||
    status?.includes("FAILED")
  ) {
    return "pill-danger font-mono text-[10px]";
  }
  if (action === "PASSWORD_RECOVERED" || action === "BACKUP_CODES_GENERATED") {
    return "pill-warning font-mono text-[10px]";
  }
  return "pill-ok font-mono text-[10px]";
}

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<Verify | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        (e.attemptedAccount && e.attemptedAccount.toLowerCase().includes(q)) ||
        (e.status && e.status.toLowerCase().includes(q)) ||
        e.entity.toLowerCase().includes(q) ||
        e.entryHash.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    );
  }, [entries, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const pagedEntries = useMemo(() => {
    const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE)));
    return filtered.slice((safePage - 1) * AUDIT_PAGE_SIZE, safePage * AUDIT_PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
            Activity History · IT Admin
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">Audit Log</h1>
            {result &&
              (result.ok ? (
                <span className="animate-fade-up pill-ok">
                  Chain verified · {result.checked} entries intact ({result.ms} ms)
                </span>
              ) : (
                <span className="animate-fade-up pill-danger">
                  Mismatch found at entry #{result.firstBrokenId}
                </span>
              ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            <span className="font-mono tabular-nums">{filtered.length}</span> of{" "}
            <span className="font-mono tabular-nums">{total}</span> logged events (including failed
            login attempts, 30s lockouts, and password resets).
          </p>
        </div>

        <button type="button" onClick={verify} disabled={busy} className="btn-primary">
          {busy && <Spinner className="h-3.5 w-3.5" />}
          {busy ? "Checking log…" : "Verify chain"}
        </button>
      </div>

      {result && !result.ok && (
        <div className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg p-4 text-xs text-danger">
          Entry <span className="font-mono font-semibold">#{result.firstBrokenId}</span> doesn&apos;t
          match its{" "}
          {result.reason === "prev_hash" ? "link to the previous entry" : "recorded hash"}. Check for
          unauthorized database changes.
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <div className="bento-shell">
        <div className="bento-core overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted px-5 py-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, account/username, status, or hash…"
              aria-label="Search audit entries"
              className="field max-w-xs py-1.5 text-xs"
            />
            <span className="font-mono text-[11px] text-muted">
              Tamper-evident SHA-256 log
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Account / Person</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Hash (SHA-256)</th>
                </tr>
              </thead>
              <tbody key={page} className="animate-fade-up divide-y divide-line">
                {pagedEntries.map((e) => (
                  <tr
                    key={e.id}
                    className={`transition-colors ${
                      result?.firstBrokenId === e.id
                        ? "bg-danger-bg"
                        : "hover:bg-[var(--epl-row-hover)]"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono tabular-nums text-muted">{e.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-muted">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      <div>{e.actor}</div>
                      {e.attemptedAccount && e.attemptedAccount !== e.actor && (
                        <div className="font-mono text-[10px] text-muted">
                          Account: {e.attemptedAccount}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={getActionBadgeClass(e.action, e.status)}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted">
                      {e.status ?? "OK"}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted">
                      {e.entity}
                      {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted">
                      {e.entryHash.slice(0, 16)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-xs text-muted">No matching activity found.</p>
          )}
          <PaginationBar
            page={page}
            pageSize={AUDIT_PAGE_SIZE}
            totalItems={filtered.length}
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
