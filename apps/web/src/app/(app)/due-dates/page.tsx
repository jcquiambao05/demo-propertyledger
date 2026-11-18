"use client";
// Figure (V24 Due dates), DEMO_PAGES page 24. FR-15 (DECISIONS D11): overdue first in red,
// then the next 90 days; alert schedule 30 / 7 / 0 days. Legal Department can run the check now.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api";

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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Item[] }>("/due-dates")).items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) router.replace("/denied");
      else setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    setBusy(true);
    setNotice("");
    try {
      const r = await api<{ skipped: boolean; sent: number }>("/alerts/run", { method: "POST" });
      setNotice(
        r.skipped
          ? "Check done. Emails were not sent because email is not set up yet."
          : `Check done. ${r.sent} alert email(s) sent.`,
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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Due dates</h1>
        {data?.user.role === "LEGAL" && (
          <button type="button" onClick={runNow} disabled={busy} className="btn-primary">
            {busy ? "Checking…" : "Run check now"}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Email alerts go out 30 days and 7 days before, and on, each RPT due date and document
        expiry.
      </p>
      {notice && <p className="text-sm text-brand">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!items ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {overdue.length > 0 && <List title="Overdue" items={overdue} danger />}
          <List title="Next 90 days" items={upcoming} />
        </>
      )}
    </div>
  );
}

function List({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: Item[];
  danger?: boolean;
}) {
  return (
    <section className="card space-y-2 text-sm">
      <h2 className={`font-semibold ${danger ? "text-danger" : ""}`}>{title}</h2>
      {items.length === 0 ? (
        <p className="text-muted">Nothing falls due.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li
              key={`${i.kind}-${i.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span>
                <Link
                  href={`/properties/${i.parcelId}`}
                  className="font-medium text-brand hover:underline"
                >
                  {i.parcelName}
                </Link>{" "}
                · {i.label}
                {i.amount && ` · ${peso(i.amount)}`}
              </span>
              <span className={danger ? "pill-danger" : "text-muted"}>
                {i.kind === "RPT" ? "Falls due" : "Expires"} {i.date}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
