"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { PROBLEM_TEXT, type MapBasemap, type Marker } from "@/components/ParcelMap";
import { PaginationBar } from "@/components/PaginationBar";
import {
  fetchOpenMeteoWeather,
  fetchOsrmRoute,
  searchPhPlaces,
  type PhPlaceResult,
  type RouteResult,
  type SiteWeather,
} from "@/lib/ph-geo";

const ParcelMap = dynamic(() => import("@/components/ParcelMap").then((m) => m.ParcelMap), {
  ssr: false,
});

type StatusFilter = "ALL" | "HEALTHY" | "WARNING" | "CRITICAL";

interface ParcelOption {
  id: string;
  name: string;
  region?: string | null;
  province?: string;
  municipality?: string | null;
}

interface Options {
  regions: string[];
  provinces: string[];
  municipalities: string[];
  parcels: ParcelOption[];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        open ? "rotate-180" : "rotate-0"
      }`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const PARCELS_PER_PAGE = 4;

export default function MapPage() {
  const { data: session } = useSession();
  const role = session?.user.role;
  const [markers, setMarkers] = useState<Marker[] | null>(null);
  const [allApprovedMarkers, setAllApprovedMarkers] = useState<Marker[]>([]);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Options | null>(null);

  // Reactive controlled spatial filter state (FR-06)
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [near, setNear] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");

  // All panels collapsed by default upon initial login so the whole PH map is unobstructed
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [parcelsOpen, setParcelsOpen] = useState(false);
  const [parcelPage, setParcelPage] = useState(1);

  // Client-side HUD filters & camera state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<MapBasemap>("streets");
  const [resetCount, setResetCount] = useState(0);

  // 1. Philippine Place Search (MapTiler Geocoding country=ph)
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PhPlaceResult[]>([]);
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    ts: number;
  } | null>(null);

  // 2. Open-Meteo Live Weather Telemetry for selected parcel
  const [weather, setWeather] = useState<SiteWeather | null>(null);

  // 3. OSRM Logistics Route & Drive-Time Calculator
  const [routeFromId, setRouteFromId] = useState("");
  const [routeToId, setRouteToId] = useState("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);

  // Build reactive API query string
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (province) params.set("province", province);
    if (municipality) params.set("municipality", municipality);
    if (near) {
      params.set("near", near);
      const r = Number(radiusKm);
      params.set("radiusKm", Number.isFinite(r) && r >= 0.1 && r <= 1000 ? String(r) : "25");
    }
    return params.toString();
  }, [region, province, municipality, near, radiusKm]);

  const activeFilterCount = [region, province, municipality, near].filter(Boolean).length;
  const hasSpatialFilter = activeFilterCount > 0;

  useEffect(() => {
    api<Marker[]>(`/parcels/map${queryString ? `?${queryString}` : ""}`).then(
      (m) => {
        setError("");
        setMarkers(m);
        if (!queryString) setAllApprovedMarkers(m);
      },
      (e: Error) => setError(e.message),
    );
  }, [queryString]);

  useEffect(() => {
    api<Options>("/parcels/filters").then(setOptions, () => undefined);
  }, []);

  // Reset pagination to page 1 when filters or search change
  useEffect(() => {
    setParcelPage(1);
  }, [queryString, statusFilter, search]);

  // Debounced Philippine place geocoding search
  useEffect(() => {
    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchPhPlaces(placeQuery).then(setPlaceResults);
    }, 220);
    return () => clearTimeout(timer);
  }, [placeQuery]);

  // Compute OSRM route when routeFromId and routeToId are chosen
  useEffect(() => {
    if (!routeMode || !routeFromId || !routeToId || routeFromId === routeToId) {
      setRouteResult(null);
      return;
    }
    const pool = allApprovedMarkers.length > 0 ? allApprovedMarkers : (markers ?? []);
    const fromParcel = pool.find((m) => m.id === routeFromId);
    const toParcel = pool.find((m) => m.id === routeToId);
    if (!fromParcel || !toParcel) return;

    let cancelled = false;
    setRouteBusy(true);
    fetchOsrmRoute(fromParcel, toParcel)
      .then((res) => {
        if (!cancelled) setRouteResult(res);
      })
      .finally(() => {
        if (!cancelled) setRouteBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeMode, routeFromId, routeToId, allApprovedMarkers, markers]);

  // Cascading options based on hierarchy in options.parcels
  const availableProvinces = useMemo(() => {
    if (!options) return [];
    if (!region) return options.provinces;
    const set = new Set<string>();
    for (const p of options.parcels) {
      if (p.region === region && p.province) set.add(p.province);
    }
    return set.size > 0 ? Array.from(set).sort() : options.provinces;
  }, [options, region]);

  const availableMunicipalities = useMemo(() => {
    if (!options) return [];
    if (!region && !province) return options.municipalities;
    const set = new Set<string>();
    for (const p of options.parcels) {
      if (region && p.region !== region) continue;
      if (province && p.province !== province) continue;
      if (p.municipality) set.add(p.municipality);
    }
    return set.size > 0 ? Array.from(set).sort() : options.municipalities;
  }, [options, region, province]);

  function handleRegionChange(nextRegion: string) {
    setRegion(nextRegion);
    setProvince("");
    setMunicipality("");
    setSelectedId(null);
  }

  function handleProvinceChange(nextProvince: string) {
    setProvince(nextProvince);
    setMunicipality("");
    setSelectedId(null);
  }

  function clearAllFilters() {
    setRegion("");
    setProvince("");
    setMunicipality("");
    setNear("");
    setRadiusKm("25");
    setStatusFilter("ALL");
    setSearch("");
    setSelectedId(null);
    setPlaceQuery("");
    setPlaceResults([]);
    setParcelPage(1);
    setResetCount((c) => c + 1);
  }

  const stats = useMemo(() => {
    const all = markers ?? [];
    let healthy = 0;
    let warning = 0;
    let critical = 0;
    let totalHa = 0;
    for (const m of all) {
      if (!m.problem) healthy++;
      else if (m.problem === "due_soon" || m.problem === "open_issue") warning++;
      else critical++;
      if (typeof m.areaHa === "number") totalHa += m.areaHa;
    }
    return { total: all.length, healthy, warning, critical, totalHa };
  }, [markers]);

  const filteredMarkers = useMemo(() => {
    if (!markers) return null;
    return markers.filter((m) => {
      if (statusFilter === "HEALTHY" && m.problem !== null) return false;
      if (statusFilter === "WARNING" && m.problem !== "due_soon" && m.problem !== "open_issue")
        return false;
      if (statusFilter === "CRITICAL" && m.problem !== "integrity" && m.problem !== "overdue")
        return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          m.name.toLowerCase().includes(q) ||
          m.province.toLowerCase().includes(q) ||
          (m.municipality && m.municipality.toLowerCase().includes(q)) ||
          (m.region && m.region.toLowerCase().includes(q)) ||
          (m.titleNo && m.titleNo.toLowerCase().includes(q)) ||
          (m.taxDecNo && m.taxDecNo.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [markers, statusFilter, search]);

  const pagedMarkers = useMemo(() => {
    if (!filteredMarkers) return [];
    const safePage = Math.min(
      parcelPage,
      Math.max(1, Math.ceil(filteredMarkers.length / PARCELS_PER_PAGE)),
    );
    const start = (safePage - 1) * PARCELS_PER_PAGE;
    return filteredMarkers.slice(start, start + PARCELS_PER_PAGE);
  }, [filteredMarkers, parcelPage]);

  const selectedMarker = useMemo(
    () => (filteredMarkers ?? markers ?? []).find((m) => m.id === selectedId) ?? null,
    [filteredMarkers, markers, selectedId],
  );

  // Fetch Open-Meteo live site weather whenever selectedMarker changes
  useEffect(() => {
    if (!selectedMarker) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    fetchOpenMeteoWeather(selectedMarker.lat, selectedMarker.lng).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMarker]);

  // Coordinates for the Live Geodesic Radius Ring overlay
  const radiusCenter = useMemo(() => {
    if (!near) return null;
    const pool = allApprovedMarkers.length > 0 ? allApprovedMarkers : (markers ?? []);
    const ref = pool.find((m) => m.id === near);
    return ref ? { lat: ref.lat, lng: ref.lng } : null;
  }, [near, allApprovedMarkers, markers]);

  const numericRadiusKm = useMemo(() => {
    if (!near) return null;
    const r = Number(radiusKm);
    return Number.isFinite(r) && r >= 0.1 && r <= 1000 ? r : 25;
  }, [near, radiusKm]);

  function handleMarkerClick(m: Marker) {
    if (routeMode) {
      if (!routeFromId || (routeFromId && routeToId)) {
        setRouteFromId(m.id);
        setRouteToId("");
      } else if (m.id !== routeFromId) {
        setRouteToId(m.id);
      }
      return;
    }
    setSelectedId((prev) => (prev === m.id ? null : m.id));
  }

  const routePool = allApprovedMarkers.length > 0 ? allApprovedMarkers : (markers ?? []);

  return (
    <div className="bento-shell flex h-[calc(100dvh-2.5rem)] min-h-[640px] flex-col">
      <div className="relative flex-1 overflow-hidden rounded-[17px] border border-[#DCE3DC] bg-[#DCE6DF]">
        {/* Full-Canvas Philippines-Locked Map Spotlight (Zoomed Out Whole PH Default) */}
        {filteredMarkers ? (
          <ParcelMap
            markers={filteredMarkers}
            selectedId={selectedId}
            onSelect={handleMarkerClick}
            basemap={basemap}
            resetCount={resetCount}
            hasActiveFilter={hasSpatialFilter || statusFilter !== "ALL" || Boolean(search.trim())}
            radiusCenter={radiusCenter}
            radiusKm={numericRadiusKm}
            routeFeature={routeResult?.geometry ?? null}
            flyTarget={flyTarget}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            Loading map…
          </div>
        )}

        {/* TOP COMPACT HUD BAR (All drawers/accordions collapsed on initial login) */}
        <header className="pointer-events-none absolute inset-x-3.5 top-3.5 z-20 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left Identity + Status Filter Chips */}
            <div className="glass-hud pointer-events-auto flex flex-wrap items-center gap-2 px-3.5 py-2">
              <div className="flex items-center gap-2 border-r border-[#DCE3DC] pr-2.5">
                <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-xs font-semibold tracking-[-0.01em] text-ink">
                      Spatial Portfolio
                    </h1>
                    <span className="rounded bg-[#EAF2EC] px-1.5 py-0.2 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#1A472A]">
                      PH Locked
                    </span>
                  </div>
                  <p className="font-mono text-[10px] tabular-nums text-muted">
                    {stats.totalHa > 0 ? `${stats.totalHa.toFixed(2)} ha approved` : "Live GIS"}
                  </p>
                </div>
              </div>

              {/* Interactive KPI Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Compliance filter">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    statusFilter === "ALL"
                      ? "bg-[#1A472A] text-white shadow-sm"
                      : "bg-[#F4F6F3] text-[#2A3B31] hover:bg-[#E5ECE6]"
                  }`}
                >
                  <span>All</span>
                  <span className="font-mono text-[11px] tabular-nums opacity-85">
                    {markers ? stats.total : "—"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "HEALTHY" ? "ALL" : "HEALTHY")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    statusFilter === "HEALTHY"
                      ? "bg-[#1A472A] text-white shadow-sm"
                      : "bg-[#EAF2EC] text-[#1A472A] hover:bg-[#DCE9DF]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#76B82A]" aria-hidden="true" />
                  <span>Clear</span>
                  <span className="font-mono text-[11px] tabular-nums">{markers ? stats.healthy : "—"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "WARNING" ? "ALL" : "WARNING")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    statusFilter === "WARNING"
                      ? "bg-warning text-white shadow-sm"
                      : "bg-warning-bg text-warning hover:bg-[#FDEFC7]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-warning-dot" aria-hidden="true" />
                  <span>Attention</span>
                  <span className="font-mono text-[11px] tabular-nums">{markers ? stats.warning : "—"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === "CRITICAL" ? "ALL" : "CRITICAL")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    statusFilter === "CRITICAL"
                      ? "bg-danger text-white shadow-sm"
                      : "bg-danger-bg text-danger hover:bg-[#FDE3E1]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-danger-dot" aria-hidden="true" />
                  <span>Critical</span>
                  <span className="font-mono text-[11px] tabular-nums">{markers ? stats.critical : "—"}</span>
                </button>
              </div>
            </div>

            {/* Right: PH Geocoder + Expandable Accordion Toggles (Filters / Logistics / Parcels) */}
            <div className="glass-hud pointer-events-auto flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
              {/* Philippine Place Search */}
              <div className="relative">
                <input
                  type="search"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder="Find a city or town…"
                  aria-label="Search Philippine city or municipality"
                  className="w-44 rounded-lg border border-[#DCE3DC] bg-[#F8FAF8] px-2.5 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:bg-white focus:outline-none sm:w-52"
                />
                {placeResults.length > 0 && (
                  <ul className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 overflow-hidden rounded-xl border border-[#DCE3DC] bg-white p-1 shadow-[0_12px_32px_rgba(18,29,23,0.18)]">
                    {placeResults.map((pl) => (
                      <li key={pl.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setFlyTarget({ lat: pl.lat, lng: pl.lng, zoom: 11.5, ts: Date.now() });
                            setPlaceQuery("");
                            setPlaceResults([]);
                          }}
                          className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-[#EAF2EC]"
                        >
                          <span className="font-semibold text-ink">{pl.municipality}</span>
                          <span className="truncate text-[11px] text-muted">{pl.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 1. Filters Accordion Toggle Button */}
              <button
                type="button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  filtersOpen || hasSpatialFilter
                    ? "border-[#1A472A] bg-[#1A472A] text-white"
                    : "border-[#DCE3DC] bg-white text-[#2A3B31] hover:bg-[#F4F6F3]"
                }`}
              >
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[#76B82A] px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#121D17]">
                    {activeFilterCount}
                  </span>
                )}
                <Chevron open={filtersOpen} />
              </button>

              {/* 2. Logistics Route Accordion Toggle Button */}
              <button
                type="button"
                aria-expanded={routeMode}
                onClick={() => {
                  setRouteMode((prev) => {
                    const next = !prev;
                    if (!next) {
                      setRouteFromId("");
                      setRouteToId("");
                      setRouteResult(null);
                    }
                    return next;
                  });
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  routeMode
                    ? "border-[#1A472A] bg-[#1A472A] text-white"
                    : "border-[#DCE3DC] bg-white text-[#2A3B31] hover:bg-[#F4F6F3]"
                }`}
              >
                <span>Route</span>
                <Chevron open={routeMode} />
              </button>

              {/* 3. Approved Parcels Accordion Toggle Button */}
              <button
                type="button"
                aria-expanded={parcelsOpen}
                onClick={() => setParcelsOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  parcelsOpen
                    ? "border-[#1A472A] bg-[#1A472A] text-white"
                    : "border-[#DCE3DC] bg-white text-[#2A3B31] hover:bg-[#F4F6F3]"
                }`}
              >
                <span>Parcels ({filteredMarkers?.length ?? 0})</span>
                <Chevron open={parcelsOpen} />
              </button>

              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("epl:open-command"))}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3DC] bg-[#F4F6F3] px-2 py-1.5 text-xs text-muted transition-colors hover:border-[#B7D3BF] hover:text-ink"
              >
                <kbd className="rounded border border-[#DCE3DC] bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#56685E]">
                  Ctrl K
                </kbd>
              </button>

              {role === "LEGAL" && (
                <Link href="/properties/new" className="btn-primary py-1.5">
                  + Register
                </Link>
              )}
              {role === "MANAGEMENT" && (
                <Link href="/approvals" className="btn-primary py-1.5">
                  Approvals
                </Link>
              )}
            </div>
          </div>

          {/* ORGANIZED SPATIAL FILTERS ACCORDION PANEL */}
          <div
            className={`grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              filtersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="glass-hud pointer-events-auto p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE3DC] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#1A472A]" aria-hidden="true" />
                    <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                      Filter Parcels by Location
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {(hasSpatialFilter || statusFilter !== "ALL" || search.trim() || selectedId) && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="rounded-lg bg-[#EAF2EC] px-2.5 py-1 text-xs font-semibold text-[#1A472A] transition-colors hover:bg-[#D5E6D9]"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-[#F4F6F3] hover:text-ink"
                    >
                      Hide
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* 1. Region */}
                  <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-2.5">
                    <label
                      htmlFor="filter-region"
                      className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
                    >
                      1. Region
                    </label>
                    <select
                      id="filter-region"
                      value={region}
                      onChange={(e) => handleRegionChange(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">All Regions ({options?.regions.length ?? 0})</option>
                      {options?.regions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Province */}
                  <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-2.5">
                    <label
                      htmlFor="filter-province"
                      className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
                    >
                      2. Province
                    </label>
                    <select
                      id="filter-province"
                      value={province}
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">All Provinces ({availableProvinces.length})</option>
                      {availableProvinces.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. City / Municipality */}
                  <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-2.5">
                    <label
                      htmlFor="filter-municipality"
                      className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
                    >
                      3. City / Municipality
                    </label>
                    <select
                      id="filter-municipality"
                      value={municipality}
                      onChange={(e) => {
                        setMunicipality(e.target.value);
                        setSelectedId(null);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">
                        All Cities / Municipalities ({availableMunicipalities.length})
                      </option>
                      {availableMunicipalities.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Proximity Buffer Ring */}
                  <div className="rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-2.5">
                    <label
                      htmlFor="filter-near"
                      className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
                    >
                      4. Distance From Parcel
                    </label>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <select
                        id="filter-near"
                        value={near}
                        onChange={(e) => {
                          setNear(e.target.value);
                          setSelectedId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                      >
                        <option value="">Any distance</option>
                        {options?.parcels.map((p) => (
                          <option key={p.id} value={p.id}>
                            Near {p.name}
                          </option>
                        ))}
                      </select>

                      {near && (
                        <label className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#B7D3BF] bg-[#EAF2EC] px-2 py-1.5 text-xs text-[#1A472A]">
                          <input
                            type="number"
                            min={0.5}
                            max={1000}
                            step={1}
                            value={radiusKm}
                            onChange={(e) => setRadiusKm(e.target.value)}
                            aria-label="Radius in kilometers"
                            className="w-12 bg-transparent font-mono text-xs font-semibold tabular-nums text-[#1A472A] focus:outline-none"
                          />
                          <span className="font-mono text-[10px]">km</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* OSRM LOGISTICS ROUTE ACCORDION BAR */}
          <div
            className={`grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              routeMode ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
            }`}
          >
            <div className="overflow-hidden">
              <div className="glass-hud pointer-events-auto flex flex-wrap items-center gap-2.5 border-[#B7D3BF] bg-[#F4F9F5]/95 px-3.5 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#1A472A]">
                  Measure Route
                </span>

                <select
                  aria-label="Origin parcel"
                  value={routeFromId}
                  onChange={(e) => setRouteFromId(e.target.value)}
                  className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                >
                  <option value="">Starting parcel…</option>
                  {routePool.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.province})
                    </option>
                  ))}
                </select>

                <span className="text-xs font-semibold text-muted">→</span>

                <select
                  aria-label="Destination parcel"
                  value={routeToId}
                  onChange={(e) => setRouteToId(e.target.value)}
                  className="rounded-lg border border-[#C8D3C8] bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                >
                  <option value="">Destination parcel…</option>
                  {routePool
                    .filter((p) => p.id !== routeFromId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.province})
                      </option>
                    ))}
                </select>

                {routeBusy && (
                  <span className="font-mono text-xs text-muted">Finding route…</span>
                )}

                {routeResult && !routeBusy && (
                  <div className="animate-fade-up flex items-center gap-3 rounded-lg border border-[#B7D3BF] bg-white px-3 py-1 text-xs">
                    <span className="font-mono font-semibold tabular-nums text-[#1A472A]">
                      {routeResult.distanceKm} km
                    </span>
                    <span className="text-[#DCE3DC]">|</span>
                    <span className="font-mono font-medium tabular-nums text-ink">
                      ~{routeResult.durationMin >= 60
                        ? `${Math.floor(routeResult.durationMin / 60)}h ${routeResult.durationMin % 60}m`
                        : `${routeResult.durationMin} min`}{" "}
                      ({routeResult.mode === "road" ? "Road" : "Inter-Island"})
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setRouteMode(false);
                    setRouteFromId("");
                    setRouteToId("");
                    setRouteResult(null);
                  }}
                  className="ml-auto text-xs font-medium text-muted hover:text-ink"
                >
                  Hide
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="glass-hud pointer-events-auto w-fit border-[#FECDCA] bg-danger-bg/95 px-3.5 py-2 text-xs font-medium text-danger"
            >
              {error}
            </p>
          )}
        </header>

        {/* BOTTOM-LEFT FLOATING HUD: Selected Parcel Dossier + Open-Meteo Weather + Basemap Switcher */}
        <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-20 flex flex-col gap-2.5">
          {selectedMarker && (
            <div className="glass-hud animate-fade-up pointer-events-auto w-[352px] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={
                      selectedMarker.problem === "due_soon" || selectedMarker.problem === "open_issue"
                        ? "pill-warning"
                        : selectedMarker.problem
                          ? "pill-danger"
                          : "pill-ok"
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedMarker.problem === "due_soon" || selectedMarker.problem === "open_issue"
                          ? "bg-warning-dot"
                          : selectedMarker.problem
                            ? "bg-danger-dot"
                            : "bg-[#76B82A]"
                      }`}
                    />
                    {selectedMarker.problem
                      ? PROBLEM_TEXT[selectedMarker.problem]
                      : "Clear & Verified"}
                  </span>
                  <h2 className="mt-2 text-base font-semibold tracking-[-0.015em] text-ink">
                    {selectedMarker.name}
                  </h2>
                  <p className="text-xs text-muted">
                    {[selectedMarker.municipality, selectedMarker.province, selectedMarker.region]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close parcel preview"
                  className="rounded-md p-1 text-muted hover:bg-[#F4F6F3] hover:text-ink"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] p-3 text-xs">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    Title / Tax Dec
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs font-medium text-ink">
                    {selectedMarker.titleNo || selectedMarker.taxDecNo || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    Area
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-medium tabular-nums text-ink">
                    {typeof selectedMarker.areaHa === "number"
                      ? `${selectedMarker.areaHa.toFixed(2)} ha`
                      : "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    Coordinates
                  </p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-ink">
                    {selectedMarker.lat.toFixed(4)}° N, {selectedMarker.lng.toFixed(4)}° E
                  </p>
                </div>
              </div>

              {weather && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl border border-[#DCE3DC] bg-[#EAF2EC]/70 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
                    <span className="font-medium text-[#1A472A]">Weather:</span>
                    <span className="text-ink">{weather.condition}</span>
                  </div>
                  <span className="font-mono text-xs font-semibold tabular-nums text-[#1A472A]">
                    {weather.tempC}°C · {weather.rainMm} mm
                  </span>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <Link
                  href={`/properties/${selectedMarker.id}`}
                  className="btn-primary flex-1 justify-center"
                >
                  View Property →
                </Link>
                <Link
                  href={`/properties/${selectedMarker.id}/documents`}
                  className="btn-secondary"
                >
                  Files
                </Link>
              </div>
            </div>
          )}

          {/* Basemap Switcher + Camera Reset Pill */}
          <div className="glass-hud pointer-events-auto flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
            {(
              [
                { id: "streets", label: "Vector" },
                { id: "satellite", label: "Satellite" },
                { id: "topo", label: "Terrain" },
              ] as { id: MapBasemap; label: string }[]
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBasemap(b.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  basemap === b.id
                    ? "bg-[#1A472A] text-white"
                    : "text-[#2A3B31] hover:bg-[#F4F6F3]"
                }`}
              >
                {b.label}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-[#DCE3DC]" aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setResetCount((c) => c + 1);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-[#2A3B31] transition-colors hover:bg-[#F4F6F3]"
            >
              Reset View
            </button>
          </div>
        </div>

        {/* RIGHT FLOATING ACCORDION PARCEL INSPECTOR DRAWER (Paged — No Scroll Wall) */}
        <aside
          aria-label="Parcel Inspector"
          className={`glass-hud absolute right-3.5 z-20 hidden w-[332px] flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:flex ${
            filtersOpen ? "top-[218px]" : routeMode ? "top-[108px]" : "top-[58px]"
          } ${
            parcelsOpen
              ? "max-h-[600px] opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-2 pointer-events-none border-0 p-0"
          }`}
        >
          <div className="flex flex-col p-4">
            {/* Clickable Accordion Header */}
            <button
              type="button"
              onClick={() => setParcelsOpen(false)}
              className="flex w-full items-center justify-between border-b border-[#DCE3DC] pb-2.5 text-left"
            >
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-[#2A3B31]">
                  {hasSpatialFilter || statusFilter !== "ALL" || search
                    ? "Matching Parcels"
                    : "Approved Parcels"}
                </h2>
                <p className="text-[11px] text-muted">
                  {routeMode ? "Pick two parcels to measure route" : "Click a parcel to zoom in"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[#DCE3DC] bg-[#F4F6F3] px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#1A472A]">
                  {filteredMarkers?.length ?? 0}
                </span>
                <Chevron open={parcelsOpen} />
              </div>
            </button>

            {/* Instant Search Input */}
            <div className="mt-2.5">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, province, title…"
                aria-label="Search parcels"
                className="w-full rounded-lg border border-[#C8D3C8] bg-[#F8FAF8] px-3 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:bg-white focus:outline-none"
              />
            </div>

            {/* Paginated Parcel Cards (4 per page — no long scroll wall) */}
            <ul key={parcelPage} className="animate-fade-up mt-2.5 space-y-1.5">
              {pagedMarkers.map((m) => {
                const active = m.id === selectedId || m.id === routeFromId || m.id === routeToId;
                return (
                  <li
                    key={m.id}
                    className={`overflow-hidden rounded-xl border transition-all duration-200 ${
                      active
                        ? "border-[#1A472A] bg-[#EAF2EC]/90 shadow-sm"
                        : "border-transparent bg-[#F8FAF8]/85 hover:border-[#DCE3DC] hover:bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleMarkerClick(m)}
                      className="group flex w-full items-start justify-between gap-2.5 p-2.5 text-left"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            m.problem === "due_soon" || m.problem === "open_issue"
                              ? "bg-warning-dot"
                              : m.problem
                                ? "bg-danger-dot"
                                : "bg-[#76B82A]"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink group-hover:text-brand">
                            {m.name}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted">
                            {[m.municipality, m.province].filter(Boolean).join(", ")}
                          </p>
                          {(m.titleNo || m.taxDecNo) && (
                            <p className="mt-0.5 truncate font-mono text-[10px] text-[#56685E]">
                              {m.titleNo || m.taxDecNo}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {typeof m.areaHa === "number" && (
                          <span className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-[#2A3B31]">
                            {m.areaHa.toFixed(2)} ha
                          </span>
                        )}
                        <Chevron open={active} />
                      </div>
                    </button>

                    {/* Smooth Inline Accordion Body for Active Parcel */}
                    <div
                      className={`grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="border-t border-[#B7D3BF]/70 bg-white/75 px-3 py-2.5 text-[11px] space-y-2">
                          <div className="flex items-center justify-between font-mono text-[10px] text-muted">
                            <span>
                              {m.lat.toFixed(4)}°N, {m.lng.toFixed(4)}°E
                            </span>
                            <span>{m.classification || "TITLED"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/properties/${m.id}`}
                              className="btn-primary flex-1 justify-center py-1 text-[11px]"
                            >
                              View Property →
                            </Link>
                            <Link
                              href={`/properties/${m.id}/documents`}
                              className="btn-secondary py-1 text-[11px]"
                            >
                              Files
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}

              {filteredMarkers?.length === 0 && (
                <li className="py-8 text-center text-xs text-muted">
                  No parcels match your search.
                </li>
              )}
            </ul>

            <div className="mt-2.5">
              <PaginationBar
                page={parcelPage}
                totalItems={filteredMarkers?.length ?? 0}
                pageSize={PARCELS_PER_PAGE}
                onPageChange={setParcelPage}
                compact
              />
            </div>

            {/* Compact Compliance Legend Footer */}
            <div className="mt-2.5 border-t border-[#DCE3DC] pt-2.5 text-[11px] text-muted">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#76B82A]" /> Clear
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning-dot" /> Due 30d / Issue
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-danger-dot" /> Critical
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
