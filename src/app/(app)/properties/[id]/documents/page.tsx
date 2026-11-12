"use client";

import { useState } from "react";
import Link from "next/link";
import { docsFor } from "@/demo/documents";
import { properties } from "@/demo/mock-data";
import { useRole } from "@/demo/role";

export default function PropertyDocuments({ params }: { params: { id: string } }) {
  const { role } = useRole();
  const [custody, setCustody] = useState(false);
  const prop = properties.find((p) => p.id === params.id);
  const docs = docsFor(params.id);
  const failed = docs.find((d) => d.status === "failed");
  const readOnly = role === "tenant";

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-muted">
        <Link href={`/properties/${params.id}`} className="text-brand">
          {prop?.name ?? params.id}
        </Link>{" "}
        / Documents
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <button
              type="button"
              role="switch"
              aria-checked={custody}
              onClick={() => setCustody(!custody)}
              className={`relative h-5 w-9 rounded-full ${custody ? "bg-brand" : "bg-line"}`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${custody ? "left-4" : "left-0.5"}`}
              />
            </button>
            Show custody details
          </label>
          {!readOnly && (
            <button type="button" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
              Upload document
            </button>
          )}
        </div>
      </div>
      {readOnly && <p className="mt-2 text-sm text-muted">You have view-only access to this property.</p>}

      {failed && (
        <div role="alert" className="mt-4 rounded-lg border border-danger-dot bg-danger-bg p-4 text-danger-fg">
          <p className="font-semibold">1 document failed its integrity check</p>
          <p className="text-sm">
            {failed.name} no longer matches the fingerprint saved at upload. It is blocked from download.{" "}
            <Link href={`/documents/${failed.id}`} className="font-medium underline">
              Review it
            </Link>
          </p>
        </div>
      )}

      <div className={`mt-4 grid gap-4 ${custody ? "lg:grid-cols-[1fr_280px]" : ""}`}>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Document</th>
                <th className="px-4 py-2 font-medium">Type</th>
                                <th className="px-4 py-2 font-medium">Integrity</th>
                {custody && <th className="px-4 py-2 font-medium">Held by</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3">
                    <Link href={`/documents/${d.id}`} className="font-medium text-brand">
                      {d.name}
                    </Link>
                    <span className="block text-xs text-muted">Version {d.version}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{d.type}</td>
                                    <td className="px-4 py-3">
                    {d.status === "verified" ? (
                      <span className="rounded-full bg-ok-bg px-2.5 py-0.5 text-xs font-medium text-ok-fg">Verified</span>
                    ) : (
                      <span className="rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-medium text-danger-fg">
                        Failed
                      </span>
                    )}
                  </td>
                  {custody && <td className="px-4 py-3 text-muted">{d.custody.holder}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {custody && (
          <aside aria-label="Custody details" className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">Custody details</p>
            <p className="mt-1 text-muted">Who holds each original and where it is kept.</p>
            <ul className="mt-3 space-y-3">
              {docs.map((d) => (
                <li key={d.id}>
                  <p className="font-medium">{d.type}</p>
                  <p className="text-muted">{d.custody.holder}</p>
                  {d.custody.note && <p className="text-muted">{d.custody.note}</p>}
                  {d.custody.reason && <p className="text-muted">Reason: {d.custody.reason}</p>}
                  {d.custody.reference && <p className="text-muted">Reference: {d.custody.reference}</p>}
                  {d.custody.dueBack && <p className="text-muted">Due back: {d.custody.dueBack}</p>}
                </li>
              ))}
            </ul>
            {!readOnly && (
              <button type="button" className="mt-4 rounded-md border border-line px-3 py-1.5 font-medium">
                Update custody
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
