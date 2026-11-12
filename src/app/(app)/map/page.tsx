"use client";

import { useState } from "react";
import Link from "next/link";
import { properties, type Property } from "@/demo/mock-data";

// Static placeholder map: no tiles and no network calls.
const W = 640;
const H = 520;
const LAT = [6.5, 17.2];
const LNG = [119.5, 126.2];
const x = (lng: number) => ((lng - LNG[0]) / (LNG[1] - LNG[0])) * W;
const y = (lat: number) => H - ((lat - LAT[0]) / (LAT[1] - LAT[0])) * H;

const tone = (p: Property) =>
  p.problems.some((q) => q.severity === "danger")
    ? { color: "var(--danger-dot)", label: "Needs action now" }
    : p.problems.length
      ? { color: "var(--warn-dot)", label: "Needs attention" }
      : { color: "var(--brand)", label: "No problems" };

export default function MapPage() {
  const [sel, setSel] = useState<string>("iligan");
  const chosen = properties.find((p) => p.id === sel);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Map</h1>
      <p className="mt-1 text-sm text-muted">
        All {properties.length} approved properties. Color shows the biggest problem.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-lg border border-line bg-brand-soft">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of property locations" className="h-auto w-full">
            {[1, 2, 3, 4, 5].map((i) => (
              <g key={i} stroke="var(--line)" strokeWidth="1">
                <line x1={(W / 6) * i} y1="0" x2={(W / 6) * i} y2={H} />
                <line x1="0" y1={(H / 6) * i} x2={W} y2={(H / 6) * i} />
              </g>
            ))}
            {properties.map((p) => (
              <g
                key={p.id}
                tabIndex={0}
                role="button"
                aria-label={`${p.name}, ${tone(p).label}`}
                onClick={() => setSel(p.id)}
                onKeyDown={(e) => e.key === "Enter" && setSel(p.id)}
                className="cursor-pointer outline-none focus-visible:[&>circle:last-child]:stroke-[3]"
              >
                <circle cx={x(p.lng)} cy={y(p.lat)} r={sel === p.id ? 13 : 9} fill={tone(p).color} stroke="#fff" strokeWidth="2" />
              </g>
            ))}
          </svg>
          <p className="absolute right-3 top-2 text-xs text-muted">
            Placeholder map (no map tiles in the demo)
          </p>
          {chosen && (
            <div
              role="dialog"
              aria-label={`${chosen.name} summary`}
              className="absolute bottom-8 left-3 w-64 rounded-lg border border-line bg-surface p-4 shadow-md"
            >
              <p className="font-semibold">{chosen.name}</p>
              <p className="text-sm text-muted">
                {chosen.province} · {chosen.area}
              </p>
              <p className="mt-1 text-xs text-muted">{chosen.titleRef}</p>
              <p className="mt-2 text-sm">
                {chosen.problems.length === 0
                  ? "No problems."
                  : `${chosen.problems.length} ${chosen.problems.length === 1 ? "problem" : "problems"}:`}
              </p>
              <ul className="mt-1 list-disc pl-4 text-sm text-muted">
                {chosen.problems.map((q) => (
                  <li key={q.text}>{q.text}</li>
                ))}
              </ul>
              <Link
                href={`/properties/${chosen.id}`}
                className="mt-3 inline-block rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white"
              >
                Open property
              </Link>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {properties.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSel(p.id)}
                  aria-pressed={sel === p.id}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-page ${sel === p.id ? "bg-brand-soft" : ""}`}
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: tone(p).color }} />
                  <span className="flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">{p.province}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="mb-2 font-semibold">Legend</p>
            {[
              ["var(--danger-dot)", "Needs action now"],
              ["var(--warn-dot)", "Needs attention"],
              ["var(--brand)", "No problems"],
            ].map(([c, l]) => (
              <p key={l} className="flex items-center gap-2 text-muted">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                {l}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
