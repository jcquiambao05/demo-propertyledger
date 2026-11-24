"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { Spinner } from "@/components/ConfirmModal";
import { PaginationBar } from "@/components/PaginationBar";
import { Toast } from "@/components/Toast";

interface Item {
  kind: "RPT" | "DOCUMENT_EXPIRY";
  id: string;
  parcelId: string;
  parcelName: string;
  label: string;
  date: string;
  amount: string | null;
  overdue: boolean;
}

type DueTab = "ALL" | "OVERDUE" | "UPCOMING";

const peso = (a: string) => `₱${Number(a).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const TABLE_PAGE_SIZE = 5;
const PARCEL_PAGE_SIZE = 4;

export default function DueDatesPage() {
  const router = useRouter();
  const { data } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Unified Tabbed Compliance Table state
  const [dueTab, setDueTab] = useState<DueTab>("ALL");
  const [search, setSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [parcelPage, setParcelPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [dueRes, parcelRes] = await Promise.all([
        api<{ items: Item[] }>("/due-dates"),
        api<Parcel[]>("/parcels").catch(() => [] as Parcel[]),
      ]);
      setItems(dueRes.items);
      setParcels(parcelRes.filter((p) => p.status === "APPROVED"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) router.replace("/denied");
      else setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTablePage(1);
  }, [dueTab, search]);

  // Immediate trigger on click — no confirmation modal, shows circular spinner then smooth result
  async function runNow() {
    setBusy(true);
    setNotice("");
    setError("");
    const minSpin = new Promise((r) => setTimeout(r, 480));
    try {
      const [r] = await Promise.all([
        api<{ skipped: boolean; sent: number }>("/alerts/run", { method: "POST" }),
        minSpin,
      ]);
      setNotice(
        r.skipped
          ? "All due dates checked — everything's up to date."
          : `All due dates checked — sent ${r.sent} reminder email${r.sent === 1 ? "" : "s"}.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overdue = useMemo(() => items?.filter((i) => i.overdue) ?? [], [items]);
  const upcoming = useMemo(() => items?.filter((i) => !i.overdue) ?? [], [items]);
  const totalAmount = useMemo(
    () => (items ?? []).reduce((s, i) => s + (i.amount ? Number(i.amount) : 0), 0),
    [items],
  );

  const filteredItems = useMemo(() => {
    const base =
      dueTab === "OVERDUE" ? overdue : dueTab === "UPCOMING" ? upcoming : (items ?? []);
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(
      (i) =>
        i.parcelName.toLowerCase().includes(q) ||
        i.label.toLowerCase().includes(q) ||
        i.date.toLowerCase().includes(q),
    );
  }, [items, overdue, upcoming, dueTab, search]);

  const safeTablePage = Math.min(
    tablePage,
    Math.max(1, Math.ceil(filteredItems.length / TABLE_PAGE_SIZE)),
  );
  const pagedItems = filteredItems.slice(
    (safeTablePage - 1) * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE,
  );

  const safeParcelPage = Math.min(
    parcelPage,
    Math.max(1, Math.ceil(parcels.length / PARCEL_PAGE_SIZE)),
  );
  const pagedParcels = parcels.slice(
    (safeParcelPage - 1) * PARCEL_PAGE_SIZE,
    safeParcelPage * PARCEL_PAGE_SIZE,
  );

  return (
    <div className="w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
            Tax &amp; Document Reminders
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            Due Dates &amp; RPT
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Reminders go out 30 days, 7 days, and on the day a property tax or document expires.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {data?.user.role === "LEGAL" && (
            <button
              type="button"
              onClick={runNow}
              disabled={busy}
              className="btn-primary min-w-[152px]"
            >
              {busy && <Spinner />}
              <span>{busy ? "Checking alerts…" : "Run alert check"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Full-Width 4-Card KPI Strip */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-shell">
          <div className="bento-core flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted">Overdue</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-danger">
                {items ? overdue.length : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">Needs immediate attention</p>
            </div>
            <span className="pill-danger">Action needed</span>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted">Next 90 Days</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">
                {items ? upcoming.length : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">Coming up soon</p>
            </div>
            <span className="pill-ok">On track</span>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core p-4">
            <p className="text-xs font-medium text-muted">Total Tax Due</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-brand">
              {items ? peso(String(totalAmount)) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">Across unpaid schedules</p>
          </div>
        </div>

        <div className="bento-shell">
          <div className="bento-core p-4">
            <p className="text-xs font-medium text-muted">Tracked Properties</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">
              {parcels.length}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">Approved &amp; monitored</p>
          </div>
        </div>
      </div>

      <Toast message={notice} onClose={() => setNotice("")} />
      {error && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {/* Full-Width 2-Column Bento Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Left Column: Unified Tabbed Compliance Table */}
        <div>
          {!items ? (
            <div className="bento-shell">
              <div className="bento-core flex items-center justify-center gap-2 p-10 text-xs text-muted">
                <Spinner />
                <span>Loading due dates…</span>
              </div>
            </div>
          ) : (
            <div className="bento-shell">
              <section className="bento-core overflow-hidden p-0">
                {/* Table Header Toolbar with Segmented Filter Tabs + Search */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F8FAF8] px-5 py-3.5">
                  <div
                    className="flex flex-wrap items-center gap-1 rounded-xl border border-[#DCE3DC] bg-white p-1"
                    role="tablist"
                    aria-label="Obligation filter"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dueTab === "ALL"}
                      onClick={() => setDueTab("ALL")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                        dueTab === "ALL"
                          ? "bg-[#1A472A] text-white shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <span>All</span>
                      <span className="font-mono text-[11px] tabular-nums opacity-85">
                        {items.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={dueTab === "OVERDUE"}
                      onClick={() => setDueTab("OVERDUE")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                        dueTab === "OVERDUE"
                          ? "bg-danger text-white shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <span>Overdue</span>
                      <span className="font-mono text-[11px] tabular-nums">{overdue.length}</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={dueTab === "UPCOMING"}
                      onClick={() => setDueTab("UPCOMING")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                        dueTab === "UPCOMING"
                          ? "bg-[#1A472A] text-white shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <span>Next 90 Days</span>
                      <span className="font-mono text-[11px] tabular-nums">{upcoming.length}</span>
                    </button>
                  </div>

                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by parcel or period…"
                    aria-label="Filter due dates"
                    className="w-full rounded-lg border border-[#C8D3C8] bg-white px-3 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:outline-none sm:w-56"
                  />
                </div>

                {/* Structured Multi-Column Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line bg-[#F7F9F6] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                      <tr>
                        <th className="px-5 py-3">Parcel</th>
                        <th className="px-4 py-3">Obligation / Period</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody
                      key={`${dueTab}-${safeTablePage}`}
                      className="animate-fade-up divide-y divide-line"
                    >
                      {pagedItems.map((i) => (
                        <tr
                          key={`${i.kind}-${i.id}`}
                          className={`transition-colors ${
                            i.overdue ? "bg-danger-bg/25 hover:bg-danger-bg/45" : "hover:bg-[#F8FAF8]"
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/properties/${i.parcelId}`}
                              className="font-semibold text-ink transition-colors hover:text-brand hover:underline"
                            >
                              {i.parcelName}
                            </Link>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="rounded border border-[#DCE3DC] bg-[#F4F6F3] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#2A3B31]">
                                {i.kind === "RPT" ? "RPT" : "DOC"}
                              </span>
                              <span className="text-xs font-medium text-[#3E5046]">{i.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs font-semibold tabular-nums text-[#1A472A]">
                            {i.amount ? peso(i.amount) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-[#3E5046]">
                            {i.date}
                          </td>
                          <td className="px-4 py-3.5">
                            {i.overdue ? (
                              <span className="pill-danger">Overdue</span>
                            ) : (
                              <span className="pill-ok">Upcoming</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              href={
                                i.kind === "DOCUMENT_EXPIRY"
                                  ? `/documents/${i.id}`
                                  : `/properties/${i.parcelId}`
                              }
                              className="text-xs font-semibold text-brand hover:underline"
                            >
                              Manage →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredItems.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm font-semibold text-ink">No obligations found</p>
                    <p className="mt-1 text-xs text-muted">
                      Nothing is due in this view right now.
                    </p>
                  </div>
                )}

                <PaginationBar
                  page={safeTablePage}
                  totalItems={filteredItems.length}
                  pageSize={TABLE_PAGE_SIZE}
                  onPageChange={setTablePage}
                />
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Reminder Schedule + Paged Parcel Tax Directory */}
        <aside className="space-y-5">
          <div className="bento-shell">
            <div className="bento-core space-y-3.5 p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                  How Reminders Work
                </h2>
                <span className="pill-ok">Automatic</span>
              </div>
              <ul className="space-y-2.5 text-xs">
                <li className="flex items-start gap-2.5 rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3">
                  <span className="mt-0.5 rounded bg-[#EAF2EC] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1A472A]">
                    30d
                  </span>
                  <div>
                    <p className="font-semibold text-ink">30 Days Before</p>
                    <p className="mt-0.5 text-muted">
                      Early heads-up so Legal and Management can prepare payment or renewal.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5 rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3">
                  <span className="mt-0.5 rounded bg-warning-bg px-1.5 py-0.5 font-mono text-[10px] font-bold text-warning">
                    7d
                  </span>
                  <div>
                    <p className="font-semibold text-ink">7 Days Before</p>
                    <p className="mt-0.5 text-muted">
                      Marks the property as &ldquo;Attention&rdquo; on the map so nothing slips
                      through.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5 rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3">
                  <span className="mt-0.5 rounded bg-danger-bg px-1.5 py-0.5 font-mono text-[10px] font-bold text-danger">
                    0d
                  </span>
                  <div>
                    <p className="font-semibold text-ink">On the Due Date</p>
                    <p className="mt-0.5 text-muted">
                      Unpaid taxes past their due date show up as Critical Alerts on the map.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Paged Parcel RPT Directory */}
          <div className="bento-shell">
            <div className="bento-core space-y-3 p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#2A3B31]">
                  Property Tax Schedules
                </h2>
                <span className="font-mono text-xs text-muted">{parcels.length} total</span>
              </div>
              <p className="text-xs text-muted">
                Pick a property to log a tax payment or add a new schedule.
              </p>

              <ul
                key={safeParcelPage}
                className="animate-fade-up divide-y divide-line text-xs"
              >
                {pagedParcels.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-[11px] text-muted">
                        {[p.municipality, p.province].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <Link
                      href={`/properties/${p.id}`}
                      className="btn-secondary py-1 px-2.5 text-[11px]"
                    >
                      Open →
                    </Link>
                  </li>
                ))}
              </ul>

              <PaginationBar
                page={safeParcelPage}
                totalItems={parcels.length}
                pageSize={PARCEL_PAGE_SIZE}
                onPageChange={setParcelPage}
                compact
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
