"use client";
// Figure 37 (V30 Approvals queue). FR-08. Oldest first.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Parcel } from "@/lib/types";

export default function ApprovalsPage() {
  const [queue, setQueue] = useState<Parcel[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Parcel[]>("/approvals").then(setQueue, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <p className="mt-1 text-sm text-muted">Records waiting for your decision, oldest first.</p>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <ul className="mt-6 space-y-3">
        {queue?.map((p) => (
          <li key={p.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted">
                {p.province} · submitted {new Date(p.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <Link href={`/approvals/${p.id}`} className="btn-secondary">
              Review
            </Link>
          </li>
        ))}
      </ul>
      {queue?.length === 0 && <p className="mt-6 text-sm text-muted">Nothing is waiting for approval.</p>}
    </div>
  );
}
