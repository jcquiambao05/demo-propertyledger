"use client";
// Figure 21 (V14 Property overview), Figure 20 (V13 Returned record), Figure 34 (V27 History). FR-09.
// D9 tabs: Overview · Documents · Custody · Issues (FR-16) · History.
// History is for Legal and Management only (STUDY_CONTEXT §4); Tenants see their parcel read-only.
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
import { ParcelForm, valuesFrom, toBody } from "@/components/ParcelForm";

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

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!parcel) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{parcel.name}</h1>
        <StatusPill status={parcel.status} />
      </div>

      <nav aria-label="Parcel record" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 ${tab === t.key ? "border-brand font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && parcel.status === "RETURNED" && (
        <div className="rounded-xl border border-warning-dot bg-warning-bg p-4 text-sm text-warning">
          <p className="font-semibold">Management returned this record</p>
          <p className="mt-1">{parcel.remarks}</p>
        </div>
      )}

      {tab !== "overview" ? null : parcel.status === "RETURNED" && role === "LEGAL" ? (
        <div className="card">
          <h2 className="font-semibold">Correct and resubmit</h2>
          <div className="mt-4">
            <ParcelForm
              initial={valuesFrom(parcel)}
              submitLabel="Resubmit for approval"
              busy={busy}
              error={error}
              onSubmit={async (v) => {
                setBusy(true);
                try {
                  await api<Parcel>(`/parcels/${id}/resubmit`, { method: "POST", body: toBody(v) });
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
      ) : (
        <div className="card grid gap-4 text-sm md:grid-cols-3">
          <Field label="Province" value={parcel.province} />
          <Field label="Municipality or city" value={parcel.municipality} />
          <Field label="Area" value={`${parcel.areaHa.toFixed(2)} ha`} />
          <Field label="Title number" value={parcel.titleNo} />
          <Field label="Tax declaration" value={parcel.taxDecNo} />
          <Field label="Classification" value={parcel.classification} />
          <Field
            label="Coordinates (approximate)"
            value={parcel.location ? `${parcel.location.lat}, ${parcel.location.lng}` : null}
          />
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
        <div className="card space-y-3 text-sm">
          {parcel.documents.length === 0 ? (
            <p className="text-muted">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {parcel.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <Link
                    href={`/documents/${d.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {d.docType ?? d.fileName}
                  </Link>
                  <span className="flex gap-2">
                    <span className="text-muted">{STATUS_LABEL[d.status] ?? d.status}</span>
                    {d.integrityStatus === "FAILED" && (
                      <span className="pill-danger">Integrity failure</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/properties/${id}/documents`} className="text-brand hover:underline">
            Open the document repository
          </Link>
        </div>
      )}

      {tab === "custody" && (
        <div className="card text-sm">
          {!custody ? (
            <p className="text-muted">Loading…</p>
          ) : custody.length === 0 ? (
            <p className="text-muted">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {custody.map((c) => (
                <li key={c.documentId} className="py-2">
                  <Link
                    href={`/documents/${c.documentId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {c.label}
                  </Link>
                  <p className="text-muted">
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
      )}

      {tab === "issues" && <IssuesTab parcelId={parcel.id} canEdit={role === "LEGAL"} />}

      {tab === "history" && canSeeHistory && (
        <div className="card">
          {history.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex justify-between gap-4 border-b border-line pb-2 last:border-0"
                >
                  <span>{h.text}</span>
                  <span className="shrink-0 text-muted">
                    {new Date(h.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="mt-1 font-medium">{value || "—"}</p>
    </div>
  );
}

/** FR-14 (D10): summary first; the full list sits behind a toggle. Red/amber only when action is needed. */
function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const [open, setOpen] = useState(false);
  const missing = checklist.items.filter((i) => i.state === "MISSING").length;
  const expired = checklist.items.filter((i) => i.state === "EXPIRED").length;
  return (
    <div className="card space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Document completeness</h2>
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-brand hover:underline"
      >
        {open ? "Hide checklist" : "Show checklist"}
      </button>
      {open && (
        <ul className="divide-y divide-line">
          {checklist.items.map((i) => (
            <li key={i.type} className="flex flex-wrap items-center justify-between gap-3 py-2">
              {i.documentId ? (
                <Link href={`/documents/${i.documentId}`} className="text-brand hover:underline">
                  {i.type}
                </Link>
              ) : (
                <span>{i.type}</span>
              )}
              <span
                className={
                  i.state === "EXPIRED"
                    ? "pill-danger"
                    : i.state === "MISSING"
                      ? "pill-warning"
                      : "text-muted"
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
  );
}
