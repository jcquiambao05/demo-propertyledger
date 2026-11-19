"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import type { Parcel, ParcelStatus } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { PaginationBar } from "@/components/PaginationBar";

type ViewMode = "table" | "bento";
type FilterStatus = "ALL" | ParcelStatus;

export default function PropertiesPage() {
  const { data } = useSession();
  const [parcels, setParcels] = useState<Parcel[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<Parcel[]>("/parcels").then(setParcels, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, viewMode]);

  const stats = useMemo(() => {
    const all = parcels ?? [];
    let totalHa = 0;
    let approved = 0;
    let pending = 0;
    let returned = 0;
    for (const p of all) {
      totalHa += p.areaHa;
      if (p.status === "APPROVED") approved++;
      else if (p.status === "PENDING") pending++;
      else if (p.status === "RETURNED") returned++;
    }
    return { total: all.length, totalHa, approved, pending, returned };
  }, [parcels]);

  const filtered = useMemo(() => {
    if (!parcels) return null;
    return parcels.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          p.name.toLowerCase().includes(q) ||
          p.province.toLowerCase().includes(q) ||
          (p.municipality && p.municipality.toLowerCase().includes(q)) ||
          (p.titleNo && p.titleNo.toLowerCase().includes(q)) ||
          (p.taxDecNo && p.taxDecNo.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [parcels, statusFilter, search]);

  const pageSize = viewMode === "bento" ? 6 : 5;
  const paged = useMemo(() => {
    if (!filtered) return null;
    const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
              Corporate Land Portfolio
            </p>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            Properties
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            All titled and untitled land parcels, survey areas, and current review status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("epl:open-command"))}
            className="btn-secondary"
          >
            <span>Quick jump</span>
            <kbd className="rounded border border-[#DCE3DC] bg-[#F4F6F3] px-1.5 py-0.5 font-mono text-[10px]">
              Ctrl K
            </kbd>
          </button>
          {data?.user.role === "LEGAL" && (
            <Link href="/properties/new" className="btn-primary">
              + Register property
            </Link>
          )}
        </div>
      </div>

      {/* Double-Bezel KPI Summary Strip */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-shell">
          <div className="bento-core p-4">
            <p className="text-xs font-medium text-muted">Total Parcels</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              {parcels ? stats.total : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">Across all regions</p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core p-4">
            <p className="text-xs font-medium text-muted">Total Land Area</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-brand">
              {parcels ? `${stats.totalHa.toFixed(2)} ha` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">Combined portfolio footprint</p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core p-4">
            <p className="text-xs font-medium text-muted">Approved &amp; Active</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              {parcels ? stats.approved : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">Live on the spatial map</p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core p-4">
            <p className="text-xs font-medium text-muted">Needs Review</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-warning">
              {parcels ? stats.pending + stats.returned : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {stats.pending} waiting · {stats.returned} returned
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {/* Main Double-Bezel Registry Workspace */}
      <div className="bento-shell">
        <div className="bento-core overflow-hidden p-0">
          {/* Interactive Filter & View Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F8FAF8] px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64 sm:w-72">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search parcel, province, title no…"
                  aria-label="Search properties"
                  className="w-full rounded-lg border border-[#C8D3C8] bg-white px-3 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-[#DCE3DC] bg-white p-0.5">
                {(
                  [
                    { id: "ALL", label: "All" },
                    { id: "APPROVED", label: "Approved" },
                    { id: "PENDING", label: "Pending" },
                    { id: "RETURNED", label: "Returned" },
                  ] as { id: FilterStatus; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === tab.id
                        ? "bg-[#1A472A] text-white"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table vs Bento Grid View Switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-[#DCE3DC] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "table" ? "bg-[#EAF2EC] text-[#1A472A]" : "text-muted hover:text-ink"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("bento")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "bento" ? "bg-[#EAF2EC] text-[#1A472A]" : "text-muted hover:text-ink"
                }`}
              >
                Cards
              </button>
            </div>
          </div>

          {viewMode === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-[#F7F9F6] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                  <tr>
                    <th className="px-5 py-3">Parcel Name</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Title / Tax Declaration</th>
                    <th className="px-5 py-3">Area</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody key={`${page}-${statusFilter}`} className="animate-fade-up divide-y divide-line">
                  {paged?.map((p) => (
                    <tr key={p.id} className="group transition-colors hover:bg-[#F8FAF8]">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/properties/${p.id}`}
                          className="font-semibold text-ink transition-colors group-hover:text-brand hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#3E5046]">
                        {[p.municipality, p.province].filter(Boolean).join(", ")}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-[#3E5046]">
                        {[p.titleNo, p.taxDecNo].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs font-medium tabular-nums text-ink">
                        {p.areaHa.toFixed(2)} ha
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/properties/${p.id}`}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              key={`${page}-${statusFilter}-bento`}
              className="animate-fade-up grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {paged?.map((p) => (
                <Link
                  key={p.id}
                  href={`/properties/${p.id}`}
                  className="group flex flex-col justify-between rounded-xl border border-[#DCE3DC] bg-[#FBFDFB] p-4 transition-all hover:border-[#1A472A] hover:bg-white hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <StatusPill status={p.status} />
                      <span className="rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#1A472A]">
                        {p.areaHa.toFixed(2)} ha
                      </span>
                    </div>
                    <h2 className="mt-3 text-base font-semibold text-ink group-hover:text-brand">
                      {p.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {[p.municipality, p.province].filter(Boolean).join(", ")}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[#DCE3DC] pt-3 text-xs">
                    <span className="truncate font-mono text-[11px] text-[#56685E]">
                      {p.titleNo || p.taxDecNo || "Untitled"}
                    </span>
                    <span className="font-medium text-brand">View →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {filtered && (
            <PaginationBar
              page={page}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          )}

          {filtered?.length === 0 && (
            <p className="p-8 text-center text-xs text-muted">
              No matching properties found.
            </p>
          )}
          {!parcels && !error && (
            <p className="p-8 text-center text-xs text-muted">Loading properties…</p>
          )}
        </div>
      </div>
    </div>
  );
}
