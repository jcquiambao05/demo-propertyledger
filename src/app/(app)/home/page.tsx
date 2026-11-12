"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { needsAttention, properties, type ProblemKind } from "@/demo/mock-data";

const FILTERS: { key: "all" | ProblemKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tax", label: "Tax" },
  { key: "dispute", label: "Disputes" },
  { key: "documents", label: "Documents" },
];

const count = (k: ProblemKind) =>
  properties.filter((p) => p.problems.some((x) => x.kind === k)).length;

export default function LegalHome() {
  const [filter, setFilter] = useState<"all" | ProblemKind>("all");

  const attention = useMemo(
    () =>
      properties
        .filter(needsAttention)
        .filter((p) => filter === "all" || p.problems.some((x) => x.kind === filter))
        .sort((a, b) => b.problems.length - a.problems.length),
    [filter],
  );

  const stats = [
    { label: "Property tax (RPT) needing action", value: count("tax") },
    { label: "Open disputes", value: count("dispute") },
    { label: "Documents with problems", value: count("documents") },
    { label: "Waiting for approval", value: properties.filter((p) => p.waitingApproval).length },
  ];
  const needing = properties.filter(needsAttention).length;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Good morning, Juan</h1>
      <p className="mt-1 text-sm text-muted">
        {needing} of {properties.length} properties need attention.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-surface p-4">
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Needs your attention</h2>
          <div
            role="group"
            aria-label="Filter"
            className="flex rounded-md border border-line bg-surface p-0.5 text-sm"
          >
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded px-3 py-1 font-medium ${
                  filter === f.key ? "bg-brand text-white" : "text-ink hover:bg-pill-bg"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {attention.length === 0 && (
            <li className="p-4 text-sm text-muted">Nothing needs attention in this group.</li>
          )}
          {attention.map((p) => (
            <li key={p.id}>
              <Link
                href={`/properties/${p.id}`}
                className="flex items-start justify-between gap-4 p-4 hover:bg-page"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted">
                    {p.province} · {p.area}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {p.problems.map((x) => (
                      <li
                        key={x.text}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          x.severity === "danger"
                            ? "bg-danger-bg text-danger-fg"
                            : "bg-warn-bg text-warn-fg"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            x.severity === "danger" ? "bg-danger-dot" : "bg-warn-dot"
                          }`}
                        />
                        {x.text}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="shrink-0 text-sm text-muted">
                  {p.problems.length} {p.problems.length === 1 ? "problem" : "problems"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
