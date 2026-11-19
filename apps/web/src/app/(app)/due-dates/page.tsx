"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { Spinner } from "@/components/ConfirmModal";
import { PaginationBar } from "@/components/PaginationBar";

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

const peso = (a: string) => `₱${Number(a).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export default function DueDatesPage() {
  const router = useRouter();
  const { data } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
          ? "Check complete — all due dates are up to date (email notifications aren't connected yet)."
          : `Check complete — sent ${r.sent} reminder email${r.sent === 1 ? "" : "s"}.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overdue = items?.filter((i) => i.overdue) ?? [];
  const upcoming = items?.filter((i) => !i.overdue) ?? [];
  const totalAmount = (items ?? []).reduce((s, i) => s + (i.amount ? Number(i.amount) : 0), 0);

  const PARCEL_PAGE_SIZE = 4;
  const safeParcelPage = Math.min(parcelPage, Math.max(1, Math.ceil(parcels.length / PARCEL_PAGE_SIZE)));
  const pagedParcels = parcels.slice(
    (safeParcelPage - 1) * PARCEL_PAGE_SIZE,
    safeParcelPage * PARCEL_PAGE_SIZE,
  );

  return (
    <div className="w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
              Tax &amp; Document Reminders
            </p>
          </div>
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

      {notice && (
        <div
          role="status"
          className="animate-fade-up flex items-center justify-between rounded-xl border border-brand-border bg-brand-soft px-4 py-3 text-xs font-medium text-brand"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notice"
            className="ml-3 text-brand/70 hover:text-brand"
          >
            ✕
          </button>
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

      {/* Full-Width 2-Column Bento Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.45fr_1fr]">
        {/* Left Column: Overdue & Next 90 Days Lists */}
        <div className="space-y-5">
          {!items ? (
            <div className="bento-shell">
              <div className="bento-core flex items-center justify-center gap-2 p-8 text-xs text-muted">
                <Spinner />
                <span>Loading due dates…</span>
              </div>
            </div>
          ) : (
            <>
              <PaginatedDueList title="Overdue" items={overdue} danger />
              <PaginatedDueList title="Coming Up (Next 90 Days)" items={upcoming} />
            </>
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

          {/* Paged Parcel RPT Directory (No inner scrollbar wall) */}
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
                key={parcelPage}
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
                page={parcelPage}
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

function PaginatedDueList({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: Item[];
  danger?: boolean;
}) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;
  const safePage = Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE)));
  const paged = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="bento-shell">
      <section className="bento-core overflow-hidden p-0 text-sm">
        <div className="flex items-center justify-between border-b border-line bg-[#F7F9F6] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${danger ? "bg-danger-dot" : "bg-[#76B82A]"}`}
              aria-hidden="true"
            />
            <h2
              className={`text-xs font-semibold uppercase tracking-[0.04em] ${
                danger ? "text-danger" : "text-[#2A3B31]"
              }`}
            >
              {title}
            </h2>
          </div>
          <span className="font-mono text-xs text-muted">{items.length} item(s)</span>
        </div>
        {items.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted">Nothing due here right now.</p>
        ) : (
          <>
            <ul key={page} className="animate-fade-up divide-y divide-line">
              {paged.map((i) => (
                <li
                  key={`${i.kind}-${i.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[#F8FAF8]"
                >
                  <div className="text-sm text-[#3E5046]">
                    <Link
                      href={`/properties/${i.parcelId}`}
                      className="font-semibold text-ink transition-colors hover:text-brand hover:underline"
                    >
                      {i.parcelName}
                    </Link>{" "}
                    · <span className="text-xs">{i.label}</span>
                    {i.amount && (
                      <span className="ml-2 rounded bg-[#EAF2EC] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#1A472A]">
                        {peso(i.amount)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono text-xs tabular-nums ${danger ? "pill-danger" : "pill"}`}
                  >
                    {i.kind === "RPT" ? "Due" : "Expires"} {i.date}
                  </span>
                </li>
              ))}
            </ul>
            <PaginationBar
              page={page}
              totalItems={items.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
