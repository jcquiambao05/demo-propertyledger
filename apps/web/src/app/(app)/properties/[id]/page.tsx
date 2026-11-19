"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import type { ParcelDetail, HistoryEntry, Parcel, ParcelCustodyRow } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { STATUS_LABEL, HOLDER_LABEL } from "@/components/CustodyPanel";
import { RptCard } from "@/components/RptCard";
import { IssuesTab } from "@/components/IssuesTab";
import { TenantsCard } from "@/components/TenantsCard";
import { ParcelForm, valuesFrom, toBody } from "@/components/ParcelForm";

type Tab = "overview" | "documents" | "custody" | "issues" | "history";

interface Checklist {
  classification: "TITLED" | "UNTITLED";
  complete: boolean;
  items: {
    type: string;
    required: boolean;
    state: "PRESENT" | "MISSING" | "EXPIRED";
    documentId: string | null;
    expiresOn: string | null;
  }[];
}

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useSession();
  const role = data?.user.role;
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [custody, setCustody] = useState<ParcelCustodyRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const canSeeHistory = role === "LEGAL" || role === "MANAGEMENT";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setParcel(await api<ParcelDetail>(`/parcels/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) router.replace("/denied");
      else setError((e as Error).message);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "overview" && parcel?.status === "APPROVED") {
      api<Checklist>(`/parcels/${id}/checklist`).then(setChecklist, () => undefined);
    }
  }, [id, tab, parcel?.status]);

  useEffect(() => {
    if (tab === "history" && canSeeHistory) {
      api<HistoryEntry[]>(`/parcels/${id}/history`).then(setHistory, () => undefined);
    }
    if (tab === "custody") {
      api<ParcelCustodyRow[]>(`/parcels/${id}/custody`).then(setCustody, (e: Error) =>
        setError(e.message),
      );
    }
  }, [id, tab, canSeeHistory, parcel?.status]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: `Documents (${parcel?.documents.length ?? 0})` },
    { key: "custody", label: "Custody" },
    { key: "issues", label: "Issues" },
    ...(canSeeHistory ? [{ key: "history" as Tab, label: "History" }] : []),
  ];

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger">
        {error}
      </p>
    );
  }
  if (!parcel) return <p className="text-xs text-muted">Loading parcel dossier…</p>;

  return (
    <div className="w-full space-y-6">
      {/* Double-Bezel Parcel Dossier Hero Header */}
      <div className="bento-shell">
        <div className="bento-core flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Link href="/map" className="hover:text-brand hover:underline">
                Spatial Map
              </Link>
              <span>/</span>
              <Link href="/properties" className="hover:text-brand hover:underline">
                Properties
              </Link>
              <span>/</span>
              <span className="font-medium text-ink">{parcel.province}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{parcel.name}</h1>
              <StatusPill status={parcel.status} />
            </div>

            <p className="mt-1 font-mono text-xs text-muted">
              {[parcel.titleNo, parcel.taxDecNo, `${parcel.areaHa.toFixed(2)} ha`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {parcel.location && (
              <button
                type="button"
                onClick={() => {
                  if (!parcel.location) return;
                  void navigator.clipboard?.writeText(
                    `${parcel.location.lat}, ${parcel.location.lng}`,
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="btn-secondary font-mono text-xs"
              >
                {copied
                  ? "Copied WGS84"
                  : `${parcel.location.lat.toFixed(4)}° N, ${parcel.location.lng.toFixed(4)}° E`}
              </button>
            )}
            <Link href={`/properties/${id}/documents`} className="btn-primary">
              Document Repository ({parcel.documents.length})
            </Link>
          </div>
        </div>
      </div>

      {/* Segmented Pill Tab Bar */}
      <nav
        aria-label="Parcel record"
        className="flex flex-wrap gap-1.5 rounded-xl border border-[#DCE3DC] bg-[#EDF1EC] p-1 text-xs"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-lg px-4 py-2 transition-all ${
              tab === t.key
                ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-[#DCE3DC]"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && parcel.status === "RETURNED" && (
        <div className="rounded-xl border border-warning-border bg-warning-bg p-4 text-xs text-warning">
          <p className="font-semibold">Management returned this record</p>
          <p className="mt-1">{parcel.remarks}</p>
        </div>
      )}

      {tab !== "overview" ? null : parcel.status === "RETURNED" && role === "LEGAL" ? (
        <div className="bento-shell">
          <div className="bento-core">
            <h2 className="text-sm font-semibold text-ink">Correct and resubmit</h2>
            <div className="mt-4">
              <ParcelForm
                initial={valuesFrom(parcel)}
                submitLabel="Resubmit for approval"
                busy={busy}
                error={error}
                onSubmit={async (v) => {
                  setBusy(true);
                  try {
                    await api<Parcel>(`/parcels/${id}/resubmit`, {
                      method: "POST",
                      body: toBody(v),
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bento-shell">
          <div className="bento-core grid gap-5 text-sm sm:grid-cols-2 md:grid-cols-4">
            <Field label="Region" value={parcel.region} />
            <Field label="Province" value={parcel.province} />
            <Field label="Municipality or city" value={parcel.municipality} />
            <Field label="Surveyed Area" value={`${parcel.areaHa.toFixed(2)} ha`} mono />
            <Field label="Title number" value={parcel.titleNo} mono />
            <Field label="Tax declaration" value={parcel.taxDecNo} mono />
            <Field label="Classification" value={parcel.classification} />
            <Field
              label="Coordinates (approximate)"
              value={parcel.location ? `${parcel.location.lat}, ${parcel.location.lng}` : null}
              mono
            />
          </div>
        </div>
      )}

      {tab === "overview" && checklist && <ChecklistCard checklist={checklist} />}
      {tab === "overview" && parcel.status === "APPROVED" && (
        <RptCard parcelId={parcel.id} canEdit={role === "LEGAL"} />
      )}
      {tab === "overview" && parcel.status === "APPROVED" && canSeeHistory && (
        <TenantsCard parcelId={parcel.id} canEdit={role === "LEGAL"} />
      )}

      {tab === "documents" && (
        <div className="bento-shell">
          <div className="bento-core space-y-4 text-sm">
            {parcel.documents.length === 0 ? (
              <p className="text-xs text-muted">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {parcel.documents.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Link
                      href={`/documents/${d.id}`}
                      className="font-medium text-ink transition-colors hover:text-brand hover:underline"
                    >
                      {d.docType ?? d.fileName}
                    </Link>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="pill">{STATUS_LABEL[d.status] ?? d.status}</span>
                      {d.integrityStatus === "FAILED" ? (
                        <span className="pill-danger">Integrity failure</span>
                      ) : (
                        <span className="pill-ok">SHA-256 Verified</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-1">
              <Link href={`/properties/${id}/documents`} className="btn-secondary">
                Open the document repository →
              </Link>
            </div>
          </div>
        </div>
      )}

      {tab === "custody" && (
        <div className="bento-shell">
          <div className="bento-core text-sm">
            {!custody ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : custody.length === 0 ? (
              <p className="text-xs text-muted">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {custody.map((c) => (
                  <li key={c.documentId} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/documents/${c.documentId}`}
                      className="font-medium text-ink transition-colors hover:text-brand hover:underline"
                    >
                      {c.label}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {STATUS_LABEL[c.status] ?? c.status}
                      {c.holderName
                        ? ` · held by ${c.holderName} (${HOLDER_LABEL[c.holderType ?? ""] ?? c.holderType})`
                        : " · no custody movement recorded"}
                      {c.expectedReturnDate && ` · expected back ${c.expectedReturnDate}`}
                      {c.processingStage && ` · stage: ${c.processingStage}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "issues" && <IssuesTab parcelId={parcel.id} canEdit={role === "LEGAL"} />}

      {tab === "history" && canSeeHistory && (
        <div className="bento-shell">
          <div className="bento-core">
            {history.length === 0 ? (
              <p className="text-xs text-muted">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="text-ink">{h.text}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-medium text-ink ${mono ? "font-mono text-xs tabular-nums" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const [open, setOpen] = useState(false);
  const total = checklist.items.length;
  const present = checklist.items.filter((i) => i.state === "PRESENT").length;
  const missing = checklist.items.filter((i) => i.state === "MISSING").length;
  const expired = checklist.items.filter((i) => i.state === "EXPIRED").length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 100;

  return (
    <div className="bento-shell">
      <div className="bento-core space-y-3.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Document completeness</h2>
            <p className="text-xs text-muted">
              {present} of {total} required dossier items verified ({pct}%)
            </p>
          </div>
          {checklist.complete ? (
            <span className="pill-ok">All required documents present</span>
          ) : (
            <span className={expired > 0 ? "pill-danger" : "pill-warning"}>
              {[missing && `${missing} missing`, expired && `${expired} expired`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>

        {/* Visual Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#EAF0EB]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              checklist.complete
                ? "bg-[#76B82A]"
                : expired > 0
                  ? "bg-danger-dot"
                  : "bg-warning-dot"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-brand hover:underline"
        >
          {open ? "Hide checklist" : "Show checklist"}
        </button>

        {open && (
          <ul className="divide-y divide-line pt-1">
            {checklist.items.map((i) => (
              <li key={i.type} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                {i.documentId ? (
                  <Link
                    href={`/documents/${i.documentId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {i.type}
                  </Link>
                ) : (
                  <span className="text-ink">{i.type}</span>
                )}
                <span
                  className={
                    i.state === "EXPIRED"
                      ? "pill-danger"
                      : i.state === "MISSING"
                        ? "pill-warning"
                        : "pill-ok"
                  }
                >
                  {i.state === "PRESENT" ? "Present" : i.state === "MISSING" ? "Missing" : "Expired"}
                  {i.expiresOn && ` · expires ${i.expiresOn}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
