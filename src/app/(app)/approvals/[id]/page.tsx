"use client";

import { useState } from "react";
import Link from "next/link";
import { properties } from "@/demo/mock-data";
import { docsFor } from "@/demo/documents";
import { fakeDelay } from "@/demo/mock-data";

export default function ApprovalReview({ params }: { params: { id: string } }) {
  const prop = properties.find((p) => p.id === params.id) ?? properties.find((p) => p.waitingApproval)!;
  const docs = docsFor(prop.id).filter((d) => d.status === "verified");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<"" | "approved" | "returned">("");
  const [busy, setBusy] = useState(false);

  async function decide(kind: "approved" | "returned") {
    if (kind === "returned" && remarks.trim().length < 5) {
      setError("Remarks are required when you return a record.");
      return;
    }
    setError("");
    setBusy(true);
    await fakeDelay();
    setBusy(false);
    setResult(kind);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href="/approvals" className="text-brand">
          Approvals
        </Link>{" "}
        / {prop.name}
      </p>
      <h1 className="mt-1 text-2xl font-bold">Review: {prop.name}</h1>
      <p className="text-sm text-muted">Submitted by Atty. Juan Ramos, Legal Department · returned once on Nov 9 with remarks</p>

      {result && (
        <div role="status" className="mt-4 rounded-lg bg-ok-bg p-4 text-sm text-ok-fg">
          {result === "approved"
            ? "Approved. The property is now in the portfolio."
            : "Returned to Legal with your remarks. Legal will correct and resend."}
        </div>
      )}

      <section className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Property details</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Location</dt>
            <dd>
              {prop.province} · {prop.area}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Title</dt>
            <dd>{prop.titleRef}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Documents</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2">
              {d.name}
              <span className="rounded-full bg-ok-bg px-2.5 py-0.5 text-xs font-medium text-ok-fg">Verified</span>
            </li>
          ))}
        </ul>
        {prop.problems.map((q) => (
          <p key={q.text} className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            {q.text}
          </p>
        ))}
      </section>

      {!result && (
        <section className="mt-4 rounded-lg border border-line bg-surface p-5">
          <label htmlFor="remarks" className="font-semibold">
            Remarks
          </label>
          <p className="text-sm text-muted">Required if you return the record.</p>
          <textarea
            id="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-md border border-line bg-page p-2 text-sm"
          />
          {error && (
            <p role="alert" className="mt-1 text-sm text-danger-fg">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide("approved")}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Saving..." : "Approve"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide("returned")}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Return with remarks
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
