"use client";
// Figure 18 (V11 Properties list). FR-09 entry point.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import type { Parcel } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";

export default function PropertiesPage() {
  const { data } = useSession();
  const [parcels, setParcels] = useState<Parcel[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Parcel[]>("/parcels").then(setParcels, (e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Properties</h1>
        {data?.user.role === "LEGAL" && (
          <Link href="/properties/new" className="btn-primary">
            Register property
          </Link>
        )}
      </div>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <div className="card mt-6 overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Parcel</th>
              <th className="px-4 py-3 font-medium">Province</th>
              <th className="px-4 py-3 font-medium">Title / tax declaration</th>
              <th className="px-4 py-3 font-medium">Area</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {parcels?.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/properties/${p.id}`} className="font-medium text-brand hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{p.province}</td>
                <td className="px-4 py-3">{[p.titleNo, p.taxDecNo].filter(Boolean).join(" · ")}</td>
                <td className="px-4 py-3">{p.areaHa.toFixed(2)} ha</td>
                <td className="px-4 py-3">
                  <StatusPill status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {parcels?.length === 0 && <p className="p-4 text-sm text-muted">No properties yet.</p>}
        {!parcels && !error && <p className="p-4 text-sm text-muted">Loading…</p>}
      </div>
    </div>
  );
}
