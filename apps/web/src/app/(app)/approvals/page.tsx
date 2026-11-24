"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { PaginationBar } from "@/components/PaginationBar";
import { formatAreaSqm } from "@/lib/area";

const APPROVALS_PAGE_SIZE = 5;

export default function ApprovalsPage() {
  const [queue, setQueue] = useState<Parcel[] | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<Parcel[]>("/approvals").then(setQueue, (e: Error) => setError(e.message));
  }, []);

  const totalPendingHa = (queue ?? []).reduce((s, p) => s + p.areaHa, 0);
  const safePage = Math.min(page, Math.max(1, Math.ceil((queue?.length ?? 0) / APPROVALS_PAGE_SIZE)));
  const pagedQueue = (queue ?? []).slice(
    (safePage - 1) * APPROVALS_PAGE_SIZE,
    safePage * APPROVALS_PAGE_SIZE,
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
            Management Review
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            Approvals Queue
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Parcels waiting for management approval, oldest submissions first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="pill">
            <span className="font-mono font-semibold tabular-nums">{queue?.length ?? 0}</span> waiting
          </span>
          <Link href="/properties" className="btn-secondary">
            All properties
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger">
          {error}
        </p>
      )}

      {/* Full-Width 2-Column Split (Queue on Left + Governance Policy on Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {queue && queue.length > 0 && (
            <div className="bento-shell">
              <div className="bento-core divide-y divide-line overflow-hidden p-0">
                <div className="flex items-center justify-between bg-[#F7F9F6] px-5 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                  <span>Waiting for review</span>
                  <span className="font-mono tabular-nums">
                    {formatAreaSqm(totalPendingHa, { includeHa: true })} total
                  </span>
                </div>
                <div key={page} className="animate-fade-up divide-y divide-line">
                  {pagedQueue.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#F8FAF8]"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <p className="text-sm font-semibold text-ink">{p.name}</p>
                          <span className="rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-[#1A472A]">
                            {formatAreaSqm(p.areaHa, { includeHa: true })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {[p.municipality, p.province].filter(Boolean).join(", ")} ·{" "}
                          <span className="font-mono">{p.titleNo || p.taxDecNo || "Untitled"}</span> ·
                          sent{" "}
                          <span className="font-mono tabular-nums">
                            {new Date(p.updatedAt).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      <Link href={`/approvals/${p.id}`} className="btn-primary">
                        Review parcel →
                      </Link>
                    </div>
                  ))}
                </div>
                <PaginationBar
                  page={page}
                  pageSize={APPROVALS_PAGE_SIZE}
                  totalItems={queue.length}
                  onPageChange={setPage}
                />
              </div>
            </div>
          )}

          {queue?.length === 0 && (
            <div className="bento-shell">
              <div className="bento-core py-14 text-center">
                <p className="text-sm font-semibold text-ink">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-muted">
                  No parcels are waiting for review right now.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bento-shell">
            <div className="bento-core space-y-3 p-5 text-xs">
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                How review works
              </h2>
              <p className="leading-relaxed text-muted">
                New parcels registered by Legal stay in{" "}
                <span className="font-mono font-medium text-ink">PENDING</span> status and won&apos;t
                appear on the map until Management approves them.
              </p>
              <div className="space-y-2 pt-1">
                <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3">
                  <p className="font-semibold text-ink">1. Approve parcel</p>
                  <p className="mt-0.5 text-muted">
                    Publishes the parcel to the map and unlocks tax schedules and tenant setup.
                  </p>
                </div>
                <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3">
                  <p className="font-semibold text-ink">2. Send back for changes</p>
                  <p className="mt-0.5 text-muted">
                    Returns the parcel to Legal with a short note on what to fix.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
