"use client";
// Figure 17 (V10 Map). FR-05. Approved parcels only; Tenant sees assigned parcels only.
// FR-06 (DECISIONS D14): filter by region, province, municipality, and distance from a
// reference parcel (e.g. a plant site). Filters sit behind a toggle (summary first).
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Marker } from "@/components/ParcelMap";

const ParcelMap = dynamic(() => import("@/components/ParcelMap").then((m) => m.ParcelMap), {
  ssr: false,
});

export default function MapPage() {
  const [markers, setMarkers] = useState<Marker[] | null>(null);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Options | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api<Marker[]>(`/parcels/map${query ? `?${query}` : ""}`).then(
      (m) => {
        setError("");
        setMarkers(m);
      },
      (e: Error) => setError(e.message),
    );
  }, [query]);

  useEffect(() => {
    api<Options>("/parcels/filters").then(setOptions, () => undefined);
  }, []);

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    new FormData(e.currentTarget).forEach((v, k) => {
      if (String(v).trim()) params.set(k, String(v));
    });
    if (!params.get("near")) params.delete("radiusKm");
    setQuery(params.toString());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Map</h1>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="text-sm text-brand hover:underline"
        >
          {showFilters ? "Hide filters" : query ? "Filters on — change" : "Filter parcels"}
        </button>
      </div>
      {showFilters && options && (
        <form onSubmit={apply} className="card grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Select name="region" label="Region" values={options.regions} />
          <Select name="province" label="Province" values={options.provinces} />
          <Select
            name="municipality"
            label="Municipality or city"
            values={options.municipalities}
          />
          <div>
            <label htmlFor="near" className="label">
              Near parcel
            </label>
            <select id="near" name="near" defaultValue="" className="field">
              <option value="">Any</option>
              {options.parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="radiusKm" className="label">
              Within (km)
            </label>
            <input
              id="radiusKm"
              name="radiusKm"
              type="number"
              min={0.1}
              max={1000}
              step={0.1}
              defaultValue={10}
              className="field"
            />
          </div>
          <div className="flex items-end gap-3">
            <button type="submit" className="btn-primary">
              Apply
            </button>
            <button
              type="reset"
              onClick={() => setQuery("")}
              className="text-brand hover:underline"
            >
              Clear
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {markers ? (
          <ParcelMap markers={markers} />
        ) : (
          <div className="h-[520px] rounded-xl bg-surface" />
        )}
        <aside className="card p-4">
          <h2 className="text-sm font-semibold">
            {query ? "Matching parcels" : "Approved parcels"} ({markers?.length ?? 0})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {markers?.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    m.problem === "due_soon" || m.problem === "open_issue"
                      ? "bg-warning-dot"
                      : m.problem
                        ? "bg-danger-dot"
                        : "bg-[#98A2B3]"
                  }`}
                />
                <Link href={`/properties/${m.id}`} className="hover:underline">
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
            <p>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger-dot" /> Overdue RPT
              or failed integrity check
            </p>
            <p className="mt-1">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-warning-dot" /> RPT due
              within 30 days or open legal issue
            </p>
            <p className="mt-1">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#98A2B3]" /> No problems
            </p>
            <p className="mt-2">Coordinates are approximate (synthetic data).</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface Options {
  regions: string[];
  provinces: string[];
  municipalities: string[];
  parcels: { id: string; name: string }[];
}

function Select({ name, label, values }: { name: string; label: string; values: string[] }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <select id={name} name={name} defaultValue="" className="field">
        <option value="">Any</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
