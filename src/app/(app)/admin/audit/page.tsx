"use client";

import { useState } from "react";

type Entry = { id: number; time: string; actor: string; action: string; target: string; prev: string; hash: string };

// Synthetic chain; hashes are fake and shortened for display.
const entries: Entry[] = [
  { id: 1042, time: "11 Nov 2026 09:14", actor: "Atty. Juan Ramos", action: "Integrity check failed", target: "Survey Plan, Norzagaray Quarry Parcel A", prev: "c81f2a09", hash: "5de7b310" },
  { id: 1041, time: "11 Nov 2026 09:12", actor: "Atty. Juan Ramos", action: "Signed in (MFA passed)", target: "Session", prev: "07ab94e2", hash: "c81f2a09" },
  { id: 1040, time: "09 Nov 2026 16:40", actor: "Maria Santos", action: "Returned record", target: "Davao Terminal Lot", prev: "9a30d7f1", hash: "07ab94e2" },
  { id: 1039, time: "09 Nov 2026 14:02", actor: "System", action: "Account locked after failed sign-ins", target: "Paolo Reyes", prev: "e44c61b8", hash: "9a30d7f1" },
  { id: 1038, time: "09 Nov 2026 11:25", actor: "Atty. Juan Ramos", action: "Uploaded document", target: "Tax clearance, version 1", prev: "3f9d0a56", hash: "e44c61b8" },
  { id: 1037, time: "08 Nov 2026 17:48", actor: "Lito Cruz", action: "Access denied", target: "Iligan Plant Site Lot 7", prev: "b2175ce0", hash: "3f9d0a56" },
];

const FILTERS = ["All", "Sign-ins", "Documents", "Access", "Security"] as const;
const GROUP: Record<string, string> = {
  "Signed in (MFA passed)": "Sign-ins",
  "Uploaded document": "Documents",
  "Integrity check failed": "Documents",
  "Returned record": "Documents",
  "Access denied": "Access",
  "Account locked after failed sign-ins": "Security",
};

export default function AuditLog() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  function verify() {
    setState("running");
    setTimeout(() => setState("done"), 1800);
  }

  const shown = entries.filter((e) => filter === "All" || GROUP[e.action] === filter);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="mt-1 text-sm text-muted">Entries can be added but never changed or deleted.</p>
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className="rounded-full bg-ok-bg px-3 py-1 text-sm font-medium text-ok-fg">
            {state === "running" ? "Checking..." : state === "done" ? "Chain verified just now" : "Chain intact"}
          </span>
          <button
            type="button"
            onClick={verify}
            disabled={state === "running"}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Verify chain now
          </button>
        </div>
      </div>

      <div role="group" aria-label="Filter" className="mt-4 flex w-fit rounded-md border border-line bg-surface p-0.5 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1 font-medium ${filter === f ? "bg-brand text-white" : "hover:bg-pill-bg"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">What happened</th>
              <th className="px-4 py-2 font-medium">Hash (previous to this)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-muted">{e.id}</td>
                <td className="px-4 py-3 text-muted">{e.time}</td>
                <td className="px-4 py-3">{e.actor}</td>
                <td className="px-4 py-3">
                  {e.action}
                  <span className="block text-xs text-muted">{e.target}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {e.prev} → {e.hash}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
