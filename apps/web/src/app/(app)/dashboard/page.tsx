"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { homeFor } from "@/lib/auth";
import type { Parcel } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { PaginationBar } from "@/components/PaginationBar";
import { Spinner } from "@/components/ConfirmModal";
import { formatAreaSqm } from "@/lib/area";

interface DueItem {
  kind: "RPT" | "DOCUMENT_EXPIRY";
  id: string;
  parcelId: string;
  parcelName: string;
  label: string;
  date: string;
  amount: string | null;
  overdue: boolean;
}

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const QUEUE_PAGE_SIZE = 4;
const DUE_PAGE_SIZE = 4;

export default function ManagementDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = session?.user.role;

  const [parcels, setParcels] = useState<Parcel[] | null>(null);
  const [queue, setQueue] = useState<Parcel[] | null>(null);
  const [dueItems, setDueItems] = useState<DueItem[] | null>(null);
  const [error, setError] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [duePage, setDuePage] = useState(1);

  // Role guard: Executive Dashboard is exclusively Management's homepage
  useEffect(() => {
    if (status === "authenticated" && role && role !== "MANAGEMENT") {
      router.replace(homeFor(role));
    }
  }, [status, role, router]);

  useEffect(() => {
    if (role !== "MANAGEMENT") return;
    Promise.all([
      api<Parcel[]>("/parcels"),
      api<Parcel[]>("/approvals").catch(() => [] as Parcel[]),
      api<{ items: DueItem[] }>("/due-dates").catch(() => ({ items: [] as DueItem[] })),
    ]).then(
      ([allParcels, pendingQueue, dueRes]) => {
        setParcels(allParcels);
        setQueue(pendingQueue);
        setDueItems(dueRes.items);
      },
      (e: Error) => setError(e.message),
    );
  }, [role]);

  const metrics = useMemo(() => {
    const all = parcels ?? [];
    let approvedCount = 0;
    let approvedHa = 0;
    let pendingCount = 0;
    let pendingHa = 0;
    let returnedCount = 0;
    let titledCount = 0;
    let untitledCount = 0;
    const byRegion = new Map<string, { count: number; areaHa: number }>();

    for (const p of all) {
      if (p.status === "APPROVED") {
        approvedCount++;
        approvedHa += p.areaHa;
      } else if (p.status === "PENDING") {
        pendingCount++;
        pendingHa += p.areaHa;
      } else if (p.status === "RETURNED") {
        returnedCount++;
      }

      if ((p.classification ?? "TITLED") === "UNTITLED") untitledCount++;
      else titledCount++;

      const reg = p.region || p.province || "Unassigned";
      const cur = byRegion.get(reg) ?? { count: 0, areaHa: 0 };
      cur.count += 1;
      cur.areaHa += p.areaHa;
      byRegion.set(reg, cur);
    }

    const regions = Array.from(byRegion.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.areaHa - a.areaHa);

    const due = dueItems ?? [];
    const overdueCount = due.filter((d) => d.overdue).length;
    const upcomingCount = due.filter((d) => !d.overdue).length;
    const totalTaxPhp = due.reduce((s, d) => s + (d.amount ? Number(d.amount) : 0), 0);

    return {
      totalCount: all.length,
      totalHa: all.reduce((s, p) => s + p.areaHa, 0),
      approvedCount,
      approvedHa,
      pendingCount,
      pendingHa,
      returnedCount,
      titledCount,
      untitledCount,
      regions,
      overdueCount,
      upcomingCount,
      totalTaxPhp,
    };
  }, [parcels, dueItems]);

  const safeQueuePage = Math.min(
    queuePage,
    Math.max(1, Math.ceil((queue?.length ?? 0) / QUEUE_PAGE_SIZE)),
  );
  const pagedQueue = (queue ?? []).slice(
    (safeQueuePage - 1) * QUEUE_PAGE_SIZE,
    safeQueuePage * QUEUE_PAGE_SIZE,
  );

  const safeDuePage = Math.min(
    duePage,
    Math.max(1, Math.ceil((dueItems?.length ?? 0) / DUE_PAGE_SIZE)),
  );
  const pagedDue = (dueItems ?? []).slice(
    (safeDuePage - 1) * DUE_PAGE_SIZE,
    safeDuePage * DUE_PAGE_SIZE,
  );

  return (
    <div className="w-full space-y-6">
      {/* Executive Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
            Management Executive Overview
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            Portfolio Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Corporate land holdings, pending approval decisions, regional footprint, and upcoming tax
            schedules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/map" className="btn-secondary">
            Open Spatial Map
          </Link>
          <Link href="/properties" className="btn-secondary">
            All Properties
          </Link>
          <Link href="/approvals" className="btn-primary">
            Approvals Queue ({queue?.length ?? 0})
          </Link>
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

      {/* 4-Card Executive KPI Strip */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-shell">
          <div className="bento-core flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Pending Approvals</p>
              <span className={metrics.pendingCount > 0 ? "pill-warning" : "pill-ok"}>
                {metrics.pendingCount > 0 ? "Needs review" : "All clear"}
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              {parcels ? metrics.pendingCount : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {parcels ? `${formatAreaSqm(metrics.pendingHa)} waiting for decision` : "Loading…"}
            </p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Approved Land Area</p>
              <span className="pill-ok">{metrics.approvedCount} active</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-brand">
              {parcels ? formatAreaSqm(metrics.approvedHa) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {metrics.titledCount} titled · {metrics.untitledCount} tax declaration
            </p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Tax &amp; Expiry Alerts</p>
              {metrics.overdueCount > 0 ? (
                <span className="pill-danger">{metrics.overdueCount} overdue</span>
              ) : (
                <span className="pill-ok">On schedule</span>
              )}
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              {dueItems ? metrics.overdueCount + metrics.upcomingCount : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {dueItems ? `${peso(metrics.totalTaxPhp)} total scheduled RPT` : "Loading…"}
            </p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted">Total Portfolio</p>
              <span className="pill">{metrics.returnedCount} returned</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">
              {parcels ? metrics.totalCount : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {parcels
                ? `${formatAreaSqm(metrics.totalHa)} across ${metrics.regions.length} regions`
                : "Loading…"}
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Executive Bento Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Left Column: Approvals Queue Preview + Tax & Document Deadlines */}
        <div className="space-y-6">
          {/* 1. Pending Approvals Queue */}
          <div className="bento-shell">
            <section className="bento-core overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#F7F9F6] px-5 py-3.5">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                    Pending Approvals Queue
                  </h2>
                  <p className="text-[11px] text-muted">
                    Parcels submitted by Legal waiting for your verification.
                  </p>
                </div>
                <Link href="/approvals" className="text-xs font-semibold text-brand hover:underline">
                  Open full queue →
                </Link>
              </div>

              {!queue ? (
                <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted">
                  <Spinner />
                  <span>Loading approvals queue…</span>
                </div>
              ) : queue.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold text-ink">You&apos;re all caught up</p>
                  <p className="mt-1 text-xs text-muted">
                    No parcels are waiting for management approval right now.
                  </p>
                </div>
              ) : (
                <>
                  <div key={safeQueuePage} className="animate-fade-up divide-y divide-line">
                    {pagedQueue.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#F8FAF8]"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink">{p.name}</p>
                            <span className="rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-[#1A472A]">
                              {formatAreaSqm(p.areaHa, { includeHa: true })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {[p.municipality, p.province].filter(Boolean).join(", ")} ·{" "}
                            <span className="font-mono">
                              {p.titleNo || p.taxDecNo || "Untitled"}
                            </span>
                          </p>
                        </div>
                        <Link href={`/approvals/${p.id}`} className="btn-primary py-1.5">
                          Review parcel →
                        </Link>
                      </div>
                    ))}
                  </div>
                  <PaginationBar
                    page={safeQueuePage}
                    totalItems={queue.length}
                    pageSize={QUEUE_PAGE_SIZE}
                    onPageChange={setQueuePage}
                    compact
                  />
                </>
              )}
            </section>
          </div>

          {/* 2. Upcoming & Overdue RPT / Document Obligations */}
          <div className="bento-shell">
            <section className="bento-core overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#F7F9F6] px-5 py-3.5">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#2A3B31]">
                    Tax &amp; Document Deadlines
                  </h2>
                  <p className="text-[11px] text-muted">
                    Overdue and upcoming 90-day property tax and document renewals.
                  </p>
                </div>
                <Link href="/due-dates" className="text-xs font-semibold text-brand hover:underline">
                  View all due dates →
                </Link>
              </div>

              {!dueItems ? (
                <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted">
                  <Spinner />
                  <span>Loading schedules…</span>
                </div>
              ) : dueItems.length === 0 ? (
                <p className="p-8 text-center text-xs text-muted">
                  No overdue or upcoming deadlines in the next 90 days.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line bg-[#F8FAF8] text-[10px] font-semibold uppercase tracking-[0.04em] text-muted">
                        <tr>
                          <th className="px-5 py-2.5">Property</th>
                          <th className="px-4 py-2.5">Obligation</th>
                          <th className="px-4 py-2.5">Amount</th>
                          <th className="px-4 py-2.5">Due Date</th>
                          <th className="px-5 py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody key={safeDuePage} className="animate-fade-up divide-y divide-line">
                        {pagedDue.map((item) => (
                          <tr key={`${item.kind}-${item.id}`} className="hover:bg-[#F8FAF8]">
                            <td className="px-5 py-3">
                              <Link
                                href={`/properties/${item.parcelId}`}
                                className="font-semibold text-ink hover:text-brand hover:underline"
                              >
                                {item.parcelName}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-[#3E5046]">{item.label}</td>
                            <td className="px-4 py-3 font-mono font-medium tabular-nums text-[#1A472A]">
                              {item.amount ? peso(Number(item.amount)) : "—"}
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-muted">
                              {item.date}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {item.overdue ? (
                                <span className="pill-danger">Overdue</span>
                              ) : (
                                <span className="pill-ok">Upcoming</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 pb-3">
                    <PaginationBar
                      page={safeDuePage}
                      totalItems={dueItems.length}
                      pageSize={DUE_PAGE_SIZE}
                      onPageChange={setDuePage}
                      compact
                    />
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        {/* Right Column: Regional Land Footprint & Recent Property Records */}
        <aside className="space-y-6">
          <div className="bento-shell">
            <div className="bento-core space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                    Land Footprint by Region
                  </h2>
                  <p className="text-[11px] text-muted">
                    Distribution of registered land area across Philippine regions.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-ink">
                  {formatAreaSqm(metrics.totalHa)}
                </span>
              </div>

              <div className="space-y-3">
                {metrics.regions.map((reg) => {
                  const pct =
                    metrics.totalHa > 0
                      ? Math.max(4, Math.round((reg.areaHa / metrics.totalHa) * 100))
                      : 0;
                  return (
                    <div key={reg.name} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ink">{reg.name}</span>
                        <span className="font-mono text-[11px] tabular-nums text-muted">
                          {reg.count} parcel{reg.count === 1 ? "" : "s"} ·{" "}
                          <strong className="font-semibold text-ink">
                            {formatAreaSqm(reg.areaHa)}
                          </strong>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#EAF0EB]">
                        <div
                          className="h-full rounded-full bg-[#1A472A] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {metrics.regions.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted">No regions recorded yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="bento-shell">
            <div className="bento-core space-y-3 p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#2A3B31]">
                  Recent Properties
                </h2>
                <Link
                  href="/properties"
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  All properties →
                </Link>
              </div>

              <ul className="divide-y divide-line text-xs">
                {(parcels ?? []).slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/properties/${p.id}`}
                        className="truncate font-semibold text-ink hover:text-brand hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="truncate text-[11px] text-muted">
                        {[p.municipality, p.province].filter(Boolean).join(", ")} ·{" "}
                        {formatAreaSqm(p.areaHa)}
                      </p>
                    </div>
                    <StatusPill status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
