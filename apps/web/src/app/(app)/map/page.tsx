"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import {
  PROBLEM_TEXT,
  type DrawMode,
  type MapBasemap,
  type Marker,
} from "@/components/ParcelMap";
import { PaginationBar } from "@/components/PaginationBar";
import { Spinner } from "@/components/ConfirmModal";
import { formatAreaSqm } from "@/lib/area";
import {
  computePathDistanceKm,
  computePolygonMetrics,
  fetchOsrmRoute,
  searchPhPlaces,
  type DrawPoint,
  type PhPlaceResult,
  type RouteResult,
} from "@/lib/ph-geo";

const ParcelMap = dynamic(() => import("@/components/ParcelMap").then((m) => m.ParcelMap), {
  ssr: false,
});

type StatusFilter = "ALL" | "HEALTHY" | "WARNING" | "CRITICAL";
type ToolTab = "filters" | "measure" | "route" | "export";
type MobileSheetState = "minimized" | "peek" | "expanded";
type MobileTab = "parcels" | "selected" | "tools";

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

function ToolsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function MeasureToolIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2" />
      <path d="m11.5 9.5 2-2" />
      <path d="m8.5 6.5 2-2" />
      <path d="m17.5 15.5 2-2" />
    </svg>
  );
}

function RouteToolIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}

function ExportToolIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

const PARCELS_PER_PAGE = 4;

export default function MapPage() {
  const { data: session } = useSession();
  const role = session?.user.role;
  const [markers, setMarkers] = useState<Marker[] | null>(null);
  const [allApprovedMarkers, setAllApprovedMarkers] = useState<Marker[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Options | null>(null);

  // Reactive controlled spatial filter state (FR-06)
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [near, setNear] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");

  // Single-Icon Unified Tools Popover (Filters · Measure · Route · Export)
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<ToolTab>("filters");
  const [parcelsOpen, setParcelsOpen] = useState(false);
  const [parcelPage, setParcelPage] = useState(1);

  // Interactive Boundary Polygon & Distance Ruler Tool
  const [drawMode, setDrawMode] = useState<DrawMode>("off");
  const [drawnPoints, setDrawnPoints] = useState<DrawPoint[]>([]);

  // Mobile Bottom Sheet state (< lg)
  const [mobileSheet, setMobileSheet] = useState<MobileSheetState>("minimized");
  const [mobileTab, setMobileTab] = useState<MobileTab>("parcels");

  // Client-side HUD filters & camera state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<MapBasemap>("streets");
  const [resetCount, setResetCount] = useState(0);

  // 1. Philippine Place Search (MapTiler Geocoding country=ph with SWR cache)
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PhPlaceResult[]>([]);
  const [flyTarget, setFlyTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    ts: number;
  } | null>(null);

  // 2. OSRM Logistics Route & Drive-Time Calculator
  const [routeFromId, setRouteFromId] = useState("");
  const [routeToId, setRouteToId] = useState("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);

  const routeActive = Boolean(routeFromId || routeToId || (toolsOpen && activeToolTab === "route"));

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

  // Role-specific context: fetch pending approvals count for MANAGEMENT
  useEffect(() => {
    if (role === "MANAGEMENT") {
      api<unknown[]>("/approvals").then(
        (list) => setPendingApprovalsCount(list.length),
        () => undefined,
      );
    }
  }, [role]);

  // Reset pagination to page 1 when filters or search change
  useEffect(() => {
    setParcelPage(1);
  }, [queryString, statusFilter, search]);

  // Global & Tool Keyboard Hotkeys on Map Workspace (Esc, M=Measure, F=Filters, R=Route, E=Export, P=Parcels, 0=Reset)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
          setPlaceResults([]);
        }
        return;
      }

      if (e.key === "Escape") {
        if (drawMode !== "off") {
          setDrawMode("off");
          return;
        }
        if (toolsOpen) {
          setToolsOpen(false);
          return;
        }
        if (parcelsOpen) {
          setParcelsOpen(false);
          return;
        }
        if (mobileSheet !== "minimized") {
          setMobileSheet("minimized");
          return;
        }
        if (selectedId) {
          setSelectedId(null);
          return;
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (k === "m") {
        e.preventDefault();
        setToolsOpen(true);
        setActiveToolTab("measure");
        setDrawMode((prev) => (prev === "off" ? "polygon" : prev));
      } else if (k === "f") {
        e.preventDefault();
        setToolsOpen((prev) => (prev && activeToolTab === "filters" ? false : true));
        setActiveToolTab("filters");
      } else if (k === "r") {
        e.preventDefault();
        setToolsOpen((prev) => (prev && activeToolTab === "route" ? false : true));
        setActiveToolTab("route");
      } else if (k === "e") {
        e.preventDefault();
        setToolsOpen((prev) => (prev && activeToolTab === "export" ? false : true));
        setActiveToolTab("export");
      } else if (k === "p") {
        e.preventDefault();
        setParcelsOpen((v) => !v);
      } else if (k === "0") {
        e.preventDefault();
        setSelectedId(null);
        setResetCount((c) => c + 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawMode, toolsOpen, activeToolTab, parcelsOpen, mobileSheet, selectedId]);

  // Debounced Philippine place geocoding search
  useEffect(() => {
    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchPhPlaces(placeQuery).then(setPlaceResults);
    }, 200);
    return () => clearTimeout(timer);
  }, [placeQuery]);

  // Compute OSRM route when routeFromId and routeToId are chosen
  useEffect(() => {
    if (!routeFromId || !routeToId || routeFromId === routeToId) {
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
  }, [routeFromId, routeToId, allApprovedMarkers, markers]);

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

  // Live metrics for Drawn Boundary Polygon or Distance Ruler
  const drawMetrics = useMemo(() => {
    if (drawMode === "polygon") {
      return computePolygonMetrics(drawnPoints);
    }
    if (drawMode === "ruler") {
      return {
        areaHa: 0,
        areaSqm: 0,
        perimeterKm: computePathDistanceKm(drawnPoints, false),
      };
    }
    return { areaHa: 0, areaSqm: 0, perimeterKm: 0 };
  }, [drawMode, drawnPoints]);

  function handleMarkerClick(m: Marker) {
    if (toolsOpen && activeToolTab === "route") {
      if (!routeFromId || (routeFromId && routeToId)) {
        setRouteFromId(m.id);
        setRouteToId("");
      } else if (m.id !== routeFromId) {
        setRouteToId(m.id);
      }
      return;
    }
    setSelectedId((prev) => {
      const next = prev === m.id ? null : m.id;
      if (next) {
        setMobileTab("selected");
        setMobileSheet((s) => (s === "minimized" ? "peek" : s));
      }
      return next;
    });
  }

  function handleToolTabSelect(tab: ToolTab) {
    if (toolsOpen && activeToolTab === tab) {
      setToolsOpen(false);
      return;
    }
    setActiveToolTab(tab);
    setToolsOpen(true);
    if (tab === "measure" && drawMode === "off") {
      setDrawMode("polygon");
    } else if (tab !== "measure" && drawMode !== "off" && drawnPoints.length === 0) {
      setDrawMode("off");
    }
  }

  // Lazy-load GeoJSON / KML / Dedicated Printable GIS Report & PNG Snapshot exporters
  async function handleExport(kind: "geojson" | "kml" | "print") {
    const mod = await import("@/lib/map-export");
    const targetMarkers = filteredMarkers ?? markers ?? [];
    if (kind === "geojson") {
      mod.exportToGeoJSON(targetMarkers, drawnPoints, drawMode);
    } else if (kind === "kml") {
      mod.exportToKML(targetMarkers, drawnPoints, drawMode);
    } else {
      mod.triggerMapPrintSnapshot(targetMarkers, drawnPoints, drawMode);
    }
  }

  const routePool = allApprovedMarkers.length > 0 ? allApprovedMarkers : (markers ?? []);

  return (
    <div className="relative h-full w-full flex-1 overflow-hidden rounded-[17px] border border-line bg-surface-muted shadow-[inset_0_1px_2px_rgba(12,18,15,0.08)]">
      {/* FRAMED PHILIPPINES-LOCKED MAP CANVAS */}
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
          drawMode={drawMode}
          drawnPoints={drawnPoints}
          onAddDrawPoint={(pt) => setDrawnPoints((prev) => [...prev, pt])}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-muted">
          <Spinner />
          <span>Loading Philippines spatial map…</span>
        </div>
      )}

      {/* TOP FLOATING GLASS HUD BAR */}
      <header className="no-print pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 sm:inset-x-4 sm:top-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left Identity + Clean Monochrome Segmented Filter Bar */}
          <div className="glass-hud pointer-events-auto flex flex-wrap items-center gap-3 px-3.5 py-2">
            <div className="flex items-baseline gap-2 border-r border-line pr-3">
              <h1 className="text-xs font-semibold tracking-[-0.01em] text-ink">
                Spatial Portfolio
              </h1>
            </div>

            {/* Clean Flat Monochrome Segmented Filter Track */}
            <div
              className="flex flex-wrap items-center gap-0.5 rounded-xl border border-[#DCE3DC] bg-[#F4F6F3] p-0.5"
              role="group"
              aria-label="Compliance filter"
            >
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-all ${
                  statusFilter === "ALL"
                    ? "bg-[#1A472A] font-semibold text-white shadow-sm"
                    : "text-[#3E5046] hover:text-ink"
                }`}
              >
                <span>All</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    statusFilter === "ALL" ? "text-white/85" : "text-muted"
                  }`}
                >
                  {markers ? stats.total : "—"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "HEALTHY" ? "ALL" : "HEALTHY")}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-all ${
                  statusFilter === "HEALTHY"
                    ? "bg-[#1A472A] font-semibold text-white shadow-sm"
                    : "text-[#3E5046] hover:text-ink"
                }`}
              >
                <span>Clear</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    statusFilter === "HEALTHY" ? "text-white/85" : "text-muted"
                  }`}
                >
                  {markers ? stats.healthy : "—"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "WARNING" ? "ALL" : "WARNING")}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-all ${
                  statusFilter === "WARNING"
                    ? "bg-[#1A472A] font-semibold text-white shadow-sm"
                    : "text-[#3E5046] hover:text-ink"
                }`}
              >
                <span>Attention</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    statusFilter === "WARNING" ? "text-white/85" : "text-muted"
                  }`}
                >
                  {markers ? stats.warning : "—"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "CRITICAL" ? "ALL" : "CRITICAL")}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-xs font-medium transition-all ${
                  statusFilter === "CRITICAL"
                    ? "bg-[#1A472A] font-semibold text-white shadow-sm"
                    : "text-[#3E5046] hover:text-ink"
                }`}
              >
                <span>Critical</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    statusFilter === "CRITICAL" ? "text-white/85" : "text-muted"
                  }`}
                >
                  {markers ? stats.critical : "—"}
                </span>
              </button>
            </div>

            {/* Subtle Role Quick-Link (No competing colored badge box) */}
            {role === "MANAGEMENT" && (pendingApprovalsCount ?? 0) > 0 && (
              <Link
                href="/approvals"
                className="border-l border-[#DCE3DC] pl-3 text-xs font-semibold text-[#1A472A] transition-colors hover:underline"
              >
                {pendingApprovalsCount} Pending →
              </Link>
            )}

            {role === "LEGAL" && stats.warning + stats.critical > 0 && (
              <Link
                href="/due-dates"
                className="border-l border-[#DCE3DC] pl-3 text-xs font-semibold text-[#1A472A] transition-colors hover:underline"
              >
                {stats.warning + stats.critical} Alerts →
              </Link>
            )}
          </div>

          {/* Right: PH Geocoder + Consolidated Single-Icon "Tools" Popover Button + Parcels Drawer Button */}
          <div className="glass-hud pointer-events-auto flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
            {/* Philippine Place Search */}
            <div className="relative">
              <input
                type="search"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="Find a city or town…"
                aria-label="Search Philippine city or municipality"
                className="w-36 rounded-lg border border-[#DCE3DC] bg-[#F8FAF8] px-2.5 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:bg-white focus:outline-none sm:w-48"
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

            {/* Approved Parcels Accordion Toggle Button (Desktop) */}
            <button
              type="button"
              aria-expanded={parcelsOpen}
              onClick={() => setParcelsOpen((v) => !v)}
              className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all lg:inline-flex ${
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
              className="hidden items-center gap-1 rounded-lg border border-[#DCE3DC] bg-[#F4F6F3] px-2 py-1.5 text-xs text-muted transition-colors hover:border-[#B7D3BF] hover:text-ink sm:inline-flex"
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

      {/* LEFT-SIDE COLLAPSIBLE MAP TOOLS ICON DOCK + FLOATING TOOL PANEL */}
      <aside
        aria-label="Map tools dock"
        className="no-print pointer-events-none absolute left-3 top-16 z-20 flex items-start gap-2.5 sm:left-4 sm:top-[68px]"
      >
        {/* Vertical Stack of 4 Collapsible Tool Icon Buttons */}
        <div className="glass-hud pointer-events-auto flex flex-col items-center gap-1.5 p-1.5">
          {(
            [
              {
                id: "filters" as ToolTab,
                title: "1. Spatial Filters",
                badge: activeFilterCount > 0 ? String(activeFilterCount) : null,
                icon: <ToolsIcon />,
              },
              {
                id: "measure" as ToolTab,
                title: "2. Survey & Measure",
                badge: drawnPoints.length > 0 ? String(drawnPoints.length) : null,
                icon: <MeasureToolIcon />,
              },
              {
                id: "route" as ToolTab,
                title: "3. Logistics Route",
                badge: routeResult ? "✓" : null,
                icon: <RouteToolIcon />,
              },
              {
                id: "export" as ToolTab,
                title: "4. Export & Print",
                badge: null,
                icon: <ExportToolIcon />,
              },
            ]
          ).map((tool) => {
            const isActive = toolsOpen && activeToolTab === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.title}
                aria-label={tool.title}
                aria-expanded={isActive}
                onClick={() => handleToolTabSelect(tool.id)}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200 ${
                  isActive
                    ? "border-[var(--epl-brand)] bg-[var(--epl-brand)] text-[var(--epl-brand-fg)] shadow-sm"
                    : "border-line bg-surface text-ink hover:bg-surface-muted"
                }`}
              >
                {tool.icon}
                {tool.badge && (
                  <span
                    className={`absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold ${
                      isActive
                        ? "bg-surface text-ink"
                        : "bg-[var(--epl-brand)] text-[var(--epl-brand-fg)]"
                    }`}
                  >
                    {tool.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Collapsible Floating Tool Panel Expanding from Left Icon Dock */}
        {toolsOpen && (
          <div className="glass-hud animate-fade-up pointer-events-auto w-[min(90vw,640px)] p-3.5">
            {/* Active Tool Header + Contextual Action Icons */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink">
                  {activeToolTab === "filters" &&
                    `1. Spatial Filters${activeFilterCount ? ` (${activeFilterCount} active)` : ""}`}
                  {activeToolTab === "measure" &&
                    `2. Survey & Measure${drawnPoints.length ? ` (${drawnPoints.length} pts)` : ""}`}
                  {activeToolTab === "route" &&
                    `3. Logistics Route${routeResult ? ` (${routeResult.distanceKm} km)` : ""}`}
                  {activeToolTab === "export" && "4. Export & Print Snapshot"}
                </span>
              </div>

              {/* Top-Right Contextual Action Icons */}
              <div className="flex items-center gap-1.5">
                {activeToolTab === "filters" &&
                  (hasSpatialFilter || statusFilter !== "ALL" || search.trim() || selectedId) && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      title="Reset all filters"
                      aria-label="Reset all filters"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink transition-colors hover:bg-surface"
                    >
                      <ResetIcon />
                    </button>
                  )}

                {activeToolTab === "measure" && drawnPoints.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDrawnPoints((prev) => prev.slice(0, -1))}
                      title="Undo last point"
                      aria-label="Undo last point"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink transition-colors hover:bg-surface"
                    >
                      <UndoIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawnPoints([])}
                      title="Clear all points"
                      aria-label="Clear all points"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}

                {activeToolTab === "route" && (routeFromId || routeToId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setRouteFromId("");
                      setRouteToId("");
                      setRouteResult(null);
                    }}
                    title="Clear route"
                    aria-label="Clear route"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink transition-colors hover:bg-surface"
                  >
                    <ResetIcon />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setToolsOpen(false)}
                  title="Collapse tool panel"
                  aria-label="Collapse tool panel"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* TAB 1: SPATIAL FILTERS */}
            {activeToolTab === "filters" && (
              <div className="animate-fade-up mt-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-surface-muted p-2.5">
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
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">All Regions ({options?.regions.length ?? 0})</option>
                      {options?.regions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl border border-line bg-surface-muted p-2.5">
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
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">All Provinces ({availableProvinces.length})</option>
                      {availableProvinces.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl border border-line bg-surface-muted p-2.5">
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
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
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

                  <div className="rounded-xl border border-line bg-surface-muted p-2.5">
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
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
                      >
                        <option value="">Any distance</option>
                        {options?.parcels.map((p) => (
                          <option key={p.id} value={p.id}>
                            Near {p.name}
                          </option>
                        ))}
                      </select>

                      {near && (
                        <label className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand-border bg-brand-soft px-2 py-1.5 text-xs text-brand-soft-fg">
                          <input
                            type="number"
                            min={0.5}
                            max={1000}
                            step={1}
                            value={radiusKm}
                            onChange={(e) => setRadiusKm(e.target.value)}
                            aria-label="Radius in kilometers"
                            className="w-12 bg-transparent font-mono text-xs font-semibold tabular-nums focus:outline-none"
                          />
                          <span className="font-mono text-[10px]">km</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SURVEY & MEASURE (LOT BOUNDARY POLYGON + DISTANCE RULER) */}
            {activeToolTab === "measure" && (
              <div className="animate-fade-up mt-3 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => setDrawMode("polygon")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      drawMode === "polygon"
                        ? "bg-[var(--epl-brand)] text-[var(--epl-brand-fg)]"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Lot Boundary (Area)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawMode("ruler")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      drawMode === "ruler"
                        ? "bg-[var(--epl-brand)] text-[var(--epl-brand-fg)]"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Distance Ruler
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawMode("off")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      drawMode === "off"
                        ? "bg-[var(--epl-brand)] text-[var(--epl-brand-fg)]"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Pause Drawing
                  </button>
                </div>

                <span className="text-muted">
                  {drawMode === "off"
                    ? "Select Lot Boundary or Distance Ruler above, then click points on the map."
                    : drawnPoints.length === 0
                      ? "Click anywhere on the map to place survey points."
                      : drawMode === "polygon" && drawnPoints.length < 3
                        ? `Placed ${drawnPoints.length} point(s) — add ${3 - drawnPoints.length} more to close polygon.`
                        : null}
                </span>

                {drawMode === "polygon" && drawnPoints.length >= 3 && (
                  <div className="animate-fade-up flex flex-wrap items-center gap-2.5 rounded-lg border border-brand-border bg-brand-soft px-3 py-1.5 text-brand-soft-fg">
                    <span className="font-mono font-semibold tabular-nums">
                      {drawMetrics.areaSqm.toLocaleString()} m²
                    </span>
                    <span className="opacity-40">|</span>
                    <span className="font-mono tabular-nums">
                      {drawMetrics.areaHa} ha
                    </span>
                    <span className="opacity-40">|</span>
                    <span className="font-mono tabular-nums">
                      Perimeter: {drawMetrics.perimeterKm} km
                    </span>
                  </div>
                )}

                {drawMode === "ruler" && drawnPoints.length >= 2 && (
                  <div className="animate-fade-up flex items-center gap-2.5 rounded-lg border border-brand-border bg-brand-soft px-3 py-1.5 text-brand-soft-fg">
                    <span className="font-mono font-semibold tabular-nums">
                      {drawMetrics.perimeterKm} km
                    </span>
                    <span className="opacity-40">|</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(drawMetrics.perimeterKm * 1000).toLocaleString()} m
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: OSRM LOGISTICS ROUTE */}
            {activeToolTab === "route" && (
              <div className="animate-fade-up mt-3 flex flex-wrap items-center gap-2.5 text-xs">
                <select
                  aria-label="Origin parcel"
                  value={routeFromId}
                  onChange={(e) => setRouteFromId(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
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
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
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
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
                    <Spinner className="h-3 w-3" /> Finding route…
                  </span>
                )}

                {routeResult && !routeBusy && (
                  <div className="animate-fade-up flex items-center gap-3 rounded-lg border border-brand-border bg-brand-soft px-3 py-1.5 text-xs text-brand-soft-fg">
                    <span className="font-mono font-semibold tabular-nums">
                      {routeResult.distanceKm} km
                    </span>
                    <span className="opacity-40">|</span>
                    <span className="font-mono font-medium tabular-nums">
                      ~{routeResult.durationMin >= 60
                        ? `${Math.floor(routeResult.durationMin / 60)}h ${routeResult.durationMin % 60}m`
                        : `${routeResult.durationMin} min`}{" "}
                      ({routeResult.mode === "road" ? "Road" : "Inter-Island"})
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: EXPORT & PRINT SNAPSHOT */}
            {activeToolTab === "export" && (
              <div className="animate-fade-up mt-3 grid gap-2.5 sm:grid-cols-3 text-xs">
                <button
                  type="button"
                  onClick={() => void handleExport("geojson")}
                  className="flex flex-col rounded-xl border border-line bg-surface-muted p-3 text-left transition-all hover:border-brand hover:bg-surface"
                >
                  <span className="font-semibold text-ink">Export GeoJSON (.geojson)</span>
                  <span className="mt-0.5 text-[11px] text-muted">
                    Standard GIS vector features &amp; drawn lot boundaries
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleExport("kml")}
                  className="flex flex-col rounded-xl border border-line bg-surface-muted p-3 text-left transition-all hover:border-brand hover:bg-surface"
                >
                  <span className="font-semibold text-ink">Export Google Earth (.kml)</span>
                  <span className="mt-0.5 text-[11px] text-muted">
                    KML 2.2 placemarks for Google Earth &amp; survey tools
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleExport("print")}
                  className="flex flex-col rounded-xl border border-brand-border bg-brand-soft p-3 text-left text-brand-soft-fg transition-all hover:opacity-90"
                >
                  <span className="font-semibold">Print GIS Snapshot Report</span>
                  <span className="mt-0.5 text-[11px] opacity-85">
                    Captures map canvas image + printable parcel inventory
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* BOTTOM-LEFT FLOATING HUD (Desktop Selected Parcel Dossier + Nearby POIs + Weather + Basemap Switcher) */}
      <div className="no-print pointer-events-none absolute bottom-4 left-4 z-20 hidden flex-col gap-2.5 lg:flex">
        {selectedMarker && (
          <div className="glass-hud animate-fade-up pointer-events-auto w-[364px] p-4">
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
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Area</p>
                <p className="mt-0.5 font-mono text-xs font-medium tabular-nums text-ink">
                  {formatAreaSqm(selectedMarker.areaHa, { includeHa: true })}
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

      {/* RIGHT FLOATING ACCORDION PARCEL INSPECTOR DRAWER (Desktop — Paged 4 per page) */}
      <aside
        aria-label="Parcel Inspector"
        className={`no-print glass-hud absolute right-4 z-20 hidden w-[340px] flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:flex ${
          toolsOpen ? "top-[230px]" : "top-[62px]"
        } ${
          parcelsOpen
            ? "max-h-[600px] opacity-100 translate-y-0"
            : "max-h-0 opacity-0 -translate-y-2 pointer-events-none border-0 p-0"
        }`}
      >
        <div className="flex flex-col p-4">
          <button
            type="button"
            onClick={() => setParcelsOpen(false)}
            className="flex w-full items-center justify-between border-b border-line pb-2.5 text-left"
          >
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-ink">
                {hasSpatialFilter || statusFilter !== "ALL" || search
                  ? "Matching Parcels"
                  : "Approved Parcels"}
              </h2>
              <p className="text-[11px] text-muted">
                {routeActive ? "Pick two parcels to measure route" : "Click a parcel to zoom in"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-brand-border bg-brand-soft px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-brand-soft-fg">
                {filteredMarkers?.length ?? 0}
              </span>
              <Chevron open={parcelsOpen} />
            </div>
          </button>

          <div className="mt-2.5">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, province, title…"
              aria-label="Search parcels"
              className="field mt-0 py-1.5 text-xs"
            />
          </div>

          <ul key={parcelPage} className="animate-fade-up mt-2.5 space-y-2">
            {pagedMarkers.map((m) => {
              const active = m.id === selectedId || m.id === routeFromId || m.id === routeToId;
              return (
                <li
                  key={m.id}
                  style={{
                    backgroundColor: active
                      ? "var(--epl-brand-soft)"
                      : "var(--epl-card-elevated)",
                    borderColor: active
                      ? "var(--epl-brand-border)"
                      : "var(--epl-line)",
                  }}
                  className="overflow-hidden rounded-xl border transition-all duration-200 hover:border-brand-border"
                >
                  <button
                    type="button"
                    onClick={() => handleMarkerClick(m)}
                    className="group flex w-full items-start justify-between gap-2.5 p-2.5 text-left transition-colors hover:bg-surface-muted"
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
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted">
                            {m.titleNo || m.taxDecNo}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {typeof m.areaHa === "number" && (
                        <span
                          style={{
                            backgroundColor: "var(--epl-surface)",
                            borderColor: "var(--epl-line)",
                            color: "var(--epl-ink)",
                          }}
                          className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
                        >
                          {formatAreaSqm(m.areaHa)}
                        </span>
                      )}
                      <Chevron open={active} />
                    </div>
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div
                        style={{
                          backgroundColor: "var(--epl-surface)",
                          borderColor: "var(--epl-line)",
                        }}
                        className="border-t px-3 py-2.5 text-[11px] space-y-2"
                      >
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

          <div className="mt-2.5 border-t border-line pt-2.5 text-[11px] text-muted">
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

      {/* MOBILE / TABLET COLLAPSIBLE BOTTOM SHEET (< lg) */}
      <div
        className={`no-print fixed inset-x-0 bottom-16 z-30 flex flex-col rounded-t-2xl border-t border-[#DCE3DC] bg-white/95 shadow-[0_-12px_36px_rgba(18,29,23,0.16)] backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:bottom-0 lg:hidden ${
          mobileSheet === "expanded"
            ? "max-h-[75dvh]"
            : mobileSheet === "peek"
              ? "max-h-[340px]"
              : "max-h-[48px]"
        }`}
      >
        {/* Drag / Tap Handle Bar */}
        <div className="flex items-center justify-between border-b border-[#DCE3DC] px-4 py-2.5">
          <button
            type="button"
            onClick={() =>
              setMobileSheet((s) =>
                s === "minimized" ? "peek" : s === "peek" ? "expanded" : "minimized",
              )
            }
            className="flex flex-1 items-center gap-2 text-left text-xs font-semibold text-ink"
          >
            <span className="h-1.5 w-8 rounded-full bg-[#C8D3C8]" aria-hidden="true" />
            <span>
              {selectedMarker
                ? selectedMarker.name
                : `Parcels (${filteredMarkers?.length ?? 0}) & Map Tools`}
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            {mobileSheet !== "minimized" && (
              <button
                type="button"
                onClick={() =>
                  setMobileSheet((s) => (s === "peek" ? "expanded" : "peek"))
                }
                className="rounded-md bg-[#F4F6F3] px-2 py-1 text-[11px] font-medium text-[#2A3B31]"
              >
                {mobileSheet === "expanded" ? "Half" : "Expand"}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setMobileSheet((s) => (s === "minimized" ? "peek" : "minimized"))
              }
              className="rounded-md bg-[#EAF2EC] px-2 py-1 text-[11px] font-semibold text-[#1A472A]"
            >
              {mobileSheet === "minimized" ? "Open ▲" : "Hide ▼"}
            </button>
          </div>
        </div>

        {/* Mobile Sheet Body */}
        {mobileSheet !== "minimized" && (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#DCE3DC] bg-[#F4F6F3] p-1 text-xs">
              {(
                [
                  { id: "parcels", label: `Parcels (${filteredMarkers?.length ?? 0})` },
                  { id: "selected", label: "Selected Parcel" },
                  { id: "tools", label: "Basemap & View" },
                ] as { id: MobileTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMobileTab(t.id)}
                  className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                    mobileTab === t.id
                      ? "bg-white text-[#1A472A] shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {mobileTab === "parcels" && (
              <div className="space-y-2.5">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search parcel, province, title…"
                  className="w-full rounded-lg border border-[#C8D3C8] bg-[#F8FAF8] px-3 py-1.5 text-xs text-ink"
                />
                <ul className="space-y-1.5">
                  {pagedMarkers.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-xl border border-[#DCE3DC] bg-[#F8FAF8] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => handleMarkerClick(m)}
                        className="flex-1 text-left"
                      >
                        <p className="font-semibold text-ink">{m.name}</p>
                        <p className="text-[11px] text-muted">
                          {[m.municipality, m.province].filter(Boolean).join(", ")}
                        </p>
                      </button>
                      <Link
                        href={`/properties/${m.id}`}
                        className="btn-secondary py-1 px-2.5 text-[11px]"
                      >
                        Open →
                      </Link>
                    </li>
                  ))}
                </ul>
                <PaginationBar
                  page={parcelPage}
                  totalItems={filteredMarkers?.length ?? 0}
                  pageSize={PARCELS_PER_PAGE}
                  onPageChange={setParcelPage}
                  compact
                />
              </div>
            )}

            {mobileTab === "selected" && (
              <div className="space-y-2.5 text-xs">
                {!selectedMarker ? (
                  <p className="py-6 text-center text-muted">
                    Tap any parcel pin on the map to inspect its details and documents.
                  </p>
                ) : (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{selectedMarker.name}</h3>
                      <p className="text-muted">
                        {[selectedMarker.municipality, selectedMarker.province]
                          .filter(Boolean)
                          .join(", ")}{" "}
                        · {formatAreaSqm(selectedMarker.areaHa, { includeHa: true })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/properties/${selectedMarker.id}`}
                        className="btn-primary flex-1 justify-center py-1.5"
                      >
                        View Property →
                      </Link>
                      <Link
                        href={`/properties/${selectedMarker.id}/documents`}
                        className="btn-secondary py-1.5"
                      >
                        Files
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}

            {mobileTab === "tools" && (
              <div className="space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "streets", label: "Vector Map" },
                      { id: "satellite", label: "Satellite" },
                      { id: "topo", label: "Terrain" },
                    ] as { id: MapBasemap; label: string }[]
                  ).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBasemap(b.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        basemap === b.id
                          ? "bg-[#1A472A] text-white"
                          : "bg-[#F4F6F3] text-[#2A3B31]"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setResetCount((c) => c + 1);
                    }}
                    className="rounded-lg border border-[#DCE3DC] bg-white px-3 py-1.5 text-xs font-medium text-[#2A3B31]"
                  >
                    Reset View
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
