"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  PH_BOUNDS,
  PH_CENTER,
  PH_FIT_BOUNDS,
  PH_MAX_ZOOM,
  PH_MIN_ZOOM,
  PH_OUTLINE_GEOJSON,
  reverseGeocodePh,
  searchPhPlaces,
  type PhPlaceResult,
} from "@/lib/ph-geo";

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "ph-archipelago": {
      type: "geojson",
      data: PH_OUTLINE_GEOJSON,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#DCE6DF" } },
    {
      id: "ph-land-fill",
      type: "fill",
      source: "ph-archipelago",
      paint: { "fill-color": "#F3F6F2", "fill-opacity": 0.94 },
    },
    {
      id: "ph-land-outline",
      type: "line",
      source: "ph-archipelago",
      paint: { "line-color": "#B5C4B7", "line-width": 1.4 },
    },
  ],
};

/**
 * High-precision pointed SVG pin marker element (26x34, bottom tip anchored to exact coordinate).
 */
function createPrecisionPinElement(locked: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width: 26px;
    height: 34px;
    cursor: ${locked ? "not-allowed" : "grab"};
    filter: drop-shadow(0 5px 10px rgba(18, 29, 23, 0.38));
    user-select: none;
  `;
  const fill = locked ? "#1A472A" : "#76B82A";
  const ring = locked ? "#ffffff" : "#111914";
  el.innerHTML = `
    <svg width="26" height="34" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.37258 1 1 6.37258 1 13C1 21.25 13 32.5 13 32.5C13 32.5 25 21.25 25 13C25 6.37258 19.6274 1 13 1Z" fill="${fill}" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="13" cy="12.5" r="4.2" fill="${ring}"/>
      <circle cx="13" cy="12.5" r="1.6" fill="${fill}"/>
    </svg>
  `;
  return el;
}

export function ParcelLocationPicker({
  lat,
  lng,
  underReview = false,
  onPick,
}: {
  lat: string;
  lng: string;
  underReview?: boolean;
  onPick: (picked: {
    lat: string;
    lng: string;
    region?: string;
    province?: string;
    municipality?: string;
  }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const hasValidCoords =
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Number(lat) >= 4.2 &&
    Number(lat) <= 21.8 &&
    Number(lng) >= 114 &&
    Number(lng) <= 128.5;

  // Under-Review mode locks map location edits by default until user clicks "Edit Location"
  const [editEnabled, setEditEnabled] = useState(!underReview);
  // Intentional Pin Placement: passive map clicks do NOT drop pins unless Place Pin is armed
  const [placingPin, setPlacingPin] = useState(false);
  // Pin Lock toggle prevents accidental drag/relocation once a coordinate is set
  const [pinLocked, setPinLocked] = useState(hasValidCoords || underReview);

  const placingPinRef = useRef(placingPin);
  placingPinRef.current = placingPin;
  const pinLockedRef = useRef(pinLocked);
  pinLockedRef.current = pinLocked;
  const editEnabledRef = useRef(editEnabled);
  editEnabledRef.current = editEnabled;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PhPlaceResult[]>([]);
  const [resolving, setResolving] = useState(false);

  // Debounced PH place geocoding
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchPhPlaces(query).then(setResults);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard shortcuts: P = Place Pin, L = Lock/Unlock Pin, Esc = Cancel Place Pin
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "Escape" && placingPinRef.current) {
        e.preventDefault();
        setPlacingPin(false);
      } else if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!editEnabledRef.current) return;
        e.preventDefault();
        setPinLocked(false);
        setPlacingPin((v) => !v);
      } else if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!editEnabledRef.current) return;
        e.preventDefault();
        setPlacingPin(false);
        setPinLocked((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Initialize MapLibre locked to the Philippines
  useEffect(() => {
    if (!containerRef.current) return;
    const initLat = Number(lat);
    const initLng = Number(lng);
    const hasInit =
      Number.isFinite(initLat) &&
      Number.isFinite(initLng) &&
      initLat >= 4.2 &&
      initLat <= 21.8 &&
      initLng >= 114 &&
      initLng <= 128.5;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: KEY
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(KEY)}`
        : OFFLINE_STYLE,
      center: hasInit ? [initLng, initLat] : PH_CENTER,
      zoom: hasInit ? 11.2 : 4.75,
      minZoom: PH_MIN_ZOOM,
      maxZoom: PH_MAX_ZOOM,
      maxBounds: PH_BOUNDS,
      attributionControl: false,
    });
    mapRef.current = map;

    if (!hasInit) {
      map.once("load", () => {
        map.fitBounds(PH_FIT_BOUNDS, { padding: 32, duration: 0 });
      });
    }

    map.on("styleimagemissing", (e) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, {
          width: 1,
          height: 1,
          data: new Uint8Array([0, 0, 0, 0]),
        });
      }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Only place a pin when "Place Pin" mode is explicitly armed!
    map.on("click", async (e) => {
      if (!editEnabledRef.current || !placingPinRef.current) return;
      const clickedLat = Number(e.lngLat.lat.toFixed(5));
      const clickedLng = Number(e.lngLat.lng.toFixed(5));
      setPlacingPin(false);
      setPinLocked(true); // Auto-lock pin after intentional placement
      setResolving(true);
      const rev = await reverseGeocodePh(clickedLat, clickedLng);
      setResolving(false);
      onPickRef.current({
        lat: String(clickedLat),
        lng: String(clickedLng),
        region: rev.region,
        province: rev.province,
        municipality: rev.municipality,
      });
    });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
    }

    return () => {
      ro?.disconnect();
      mapRef.current = null;
      markerRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map cursor based on Place Pin mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = editEnabled && placingPin ? "crosshair" : "";
  }, [editEnabled, placingPin]);

  // Sync pointed pin position & draggable lock state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (
      !Number.isFinite(numLat) ||
      !Number.isFinite(numLng) ||
      numLat < 4.2 ||
      numLat > 21.8 ||
      numLng < 114 ||
      numLng > 128.5
    ) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const canDrag = editEnabled && !pinLocked;
    markerRef.current?.remove();

    const pinEl = createPrecisionPinElement(!canDrag);
    const m = new maplibregl.Marker({
      element: pinEl,
      anchor: "bottom",
      draggable: canDrag,
    })
      .setLngLat([numLng, numLat])
      .addTo(map);

    m.on("dragend", async () => {
      if (!editEnabledRef.current || pinLockedRef.current) return;
      const pos = m.getLngLat();
      const dLat = Number(pos.lat.toFixed(5));
      const dLng = Number(pos.lng.toFixed(5));
      setResolving(true);
      const rev = await reverseGeocodePh(dLat, dLng);
      setResolving(false);
      onPickRef.current({
        lat: String(dLat),
        lng: String(dLng),
        region: rev.region,
        province: rev.province,
        municipality: rev.municipality,
      });
    });

    markerRef.current = m;
  }, [lat, lng, editEnabled, pinLocked]);

  function selectPlace(pl: PhPlaceResult) {
    setQuery("");
    setResults([]);
    setPlacingPin(false);
    setPinLocked(true);
    onPick({
      lat: String(pl.lat),
      lng: String(pl.lng),
      region: pl.region,
      province: pl.province,
      municipality: pl.municipality,
    });
    mapRef.current?.flyTo({
      center: [pl.lng, pl.lat],
      zoom: 12.5,
      duration: 950,
      essential: true,
    });
  }

  return (
    <div className="flex h-full flex-col justify-between space-y-3 rounded-2xl border border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink">Pin Property Location</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {!editEnabled
              ? "Location is locked while under review. Click Edit Location to reposition the pin."
              : placingPin
                ? "Click the exact target spot on the map to drop the pointed pin (Esc to cancel)."
                : pinLocked && hasValidCoords
                  ? "Pin is locked in place so panning won't move it. Unlock or click Place Pin to adjust."
                  : "Click Place Pin (or press P) to drop a pointed pin, or drag the unlocked pin."}
          </p>
        </div>

        {/* Precision Pinning & Under-Review Edit Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {resolving && (
            <span className="rounded-lg bg-brand-soft px-2.5 py-1 font-mono text-[11px] font-medium text-brand-soft-fg">
              Finding location…
            </span>
          )}

          {underReview && !editEnabled ? (
            <button
              type="button"
              onClick={() => {
                setEditEnabled(true);
                setPinLocked(false);
              }}
              className="btn-primary px-3 py-1.5 text-xs"
            >
              Edit Location
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = !placingPin;
                  setPlacingPin(next);
                  if (next) setPinLocked(false);
                }}
                title="Arm intentional pin placement (Shortcut: P)"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  placingPin
                    ? "border-brand-border bg-brand-fill text-brand-fg shadow-sm"
                    : "border-line bg-surface text-brand hover:bg-brand-soft"
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{placingPin ? "Click Map to Drop…" : "Place Pin"}</span>
              </button>

              {hasValidCoords && (
                <button
                  type="button"
                  onClick={() => {
                    setPlacingPin(false);
                    setPinLocked((v) => !v);
                  }}
                  title={
                    pinLocked
                      ? "Pin locked — click to unlock dragging (Shortcut: L)"
                      : "Pin unlocked — click to lock position (Shortcut: L)"
                  }
                  aria-label={
                    pinLocked
                      ? "Pin locked — click to unlock dragging (Shortcut: L)"
                      : "Pin unlocked — click to lock position (Shortcut: L)"
                  }
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                    pinLocked
                      ? "border-brand-border bg-brand-soft text-brand-soft-fg hover:opacity-90"
                      : "border-warning-border bg-warning-bg text-warning hover:opacity-90"
                  }`}
                >
                  {pinLocked ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                  )}
                </button>
              )}

              {underReview && editEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setPlacingPin(false);
                    setPinLocked(true);
                    setEditEnabled(false);
                  }}
                  className="btn-secondary px-2.5 py-1.5 text-xs"
                >
                  Done
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Geocoding Search Box (Disabled when Under-Review location is locked) */}
      <div className="relative">
        <input
          type="search"
          value={query}
          disabled={!editEnabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            editEnabled
              ? "Search city, town, or province (e.g. Norzagaray, Teresa, Iligan)…"
              : "Click 'Edit Location' above to search or move the pin"
          }
          aria-label="Search Philippine address"
          className="field mt-0 text-xs disabled:opacity-60"
        />
        {results.length > 0 && editEnabled && (
          <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[0_12px_32px_rgba(12,18,15,0.22)]">
            {results.map((pl) => (
              <li key={pl.id}>
                <button
                  type="button"
                  onClick={() => selectPlace(pl)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-brand-soft"
                >
                  <div>
                    <p className="font-semibold text-ink">{pl.municipality}</p>
                    <p className="text-[11px] text-muted">{pl.label}</p>
                  </div>
                  <span className="font-mono text-[10px] text-brand">
                    {pl.lat.toFixed(3)}°N, {pl.lng.toFixed(3)}°E
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Full-Height Philippines Map Canvas */}
      <div className="relative min-h-[440px] flex-1 w-full overflow-hidden rounded-xl border border-line">
        <div ref={containerRef} className="h-full min-h-[440px] w-full" />
        {placingPin && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between rounded-xl border border-brand-border bg-brand-fill px-3.5 py-2 text-xs font-medium text-brand-fg shadow-md">
            <span>Click the target location on the map to place the pointed pin</span>
            <kbd className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[11px] text-muted">
        <span>
          Shortcuts: <kbd className="rounded border border-line px-1 font-mono text-[10px]">P</kbd> Place Pin ·{" "}
          <kbd className="rounded border border-line px-1 font-mono text-[10px]">L</kbd> Lock/Unlock ·{" "}
          <kbd className="rounded border border-line px-1 font-mono text-[10px]">Esc</kbd> Cancel
        </span>
        <span className="font-mono font-medium text-brand">
          {hasValidCoords
            ? `${Number(lat).toFixed(5)}°N, ${Number(lng).toFixed(5)}°E (${pinLocked || !editEnabled ? "Locked" : "Unlocked"})`
            : "No pin placed yet"}
        </span>
      </div>
    </div>
  );
}
