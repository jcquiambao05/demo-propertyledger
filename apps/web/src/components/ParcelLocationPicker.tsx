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

export function ParcelLocationPicker({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
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
      zoom: hasInit ? 10.5 : 4.75,
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("click", async (e) => {
      const clickedLat = Number(e.lngLat.lat.toFixed(5));
      const clickedLng = Number(e.lngLat.lng.toFixed(5));
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

    return () => {
      mapRef.current = null;
      markerRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync pin position when lat/lng state changes
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

    if (!markerRef.current) {
      const pinEl = document.createElement("div");
      pinEl.style.cssText = `
        width: 22px;
        height: 22px;
        border-radius: 9999px;
        background: #1A472A;
        border: 3px solid #ffffff;
        box-shadow: 0 0 0 3px #76B82A, 0 6px 16px rgba(18,29,23,0.4);
        cursor: grab;
      `;
      const m = new maplibregl.Marker({ element: pinEl, draggable: true })
        .setLngLat([numLng, numLat])
        .addTo(map);
      m.on("dragend", async () => {
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
    } else {
      markerRef.current.setLngLat([numLng, numLat]);
    }
  }, [lat, lng]);

  function selectPlace(pl: PhPlaceResult) {
    setQuery("");
    setResults([]);
    onPick({
      lat: String(pl.lat),
      lng: String(pl.lng),
      region: pl.region,
      province: pl.province,
      municipality: pl.municipality,
    });
    mapRef.current?.flyTo({
      center: [pl.lng, pl.lat],
      zoom: 12,
      duration: 950,
      essential: true,
    });
  }

  return (
    <div className="flex h-full flex-col justify-between space-y-3 rounded-2xl border border-[#DCE3DC] bg-[#F8FAF8] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
            <p className="text-xs font-semibold text-ink">
              Interactive Philippines Geodetic Pin-Picker
            </p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            Click anywhere on the map or search a municipality to drop a pin and auto-populate
            Region, Province, City, and WGS84 coordinates.
          </p>
        </div>
        {resolving && (
          <span className="rounded-full bg-[#EAF2EC] px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#1A472A]">
            Resolving location…
          </span>
        )}
      </div>

      {/* Geocoding Search Box */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Philippine municipality, city, or province (e.g. Norzagaray, Teresa, Iligan)…"
          aria-label="Search Philippine address"
          className="w-full rounded-lg border border-[#C8D3C8] bg-white px-3.5 py-2 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:outline-none"
        />
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-[#DCE3DC] bg-white p-1 shadow-[0_12px_32px_rgba(18,29,23,0.18)]">
            {results.map((pl) => (
              <li key={pl.id}>
                <button
                  type="button"
                  onClick={() => selectPlace(pl)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-[#EAF2EC]"
                >
                  <div>
                    <p className="font-semibold text-ink">{pl.municipality}</p>
                    <p className="text-[11px] text-muted">{pl.label}</p>
                  </div>
                  <span className="font-mono text-[10px] text-[#1A472A]">
                    {pl.lat.toFixed(3)}°N, {pl.lng.toFixed(3)}°E
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Full-Height Philippines Map Canvas */}
      <div
        ref={containerRef}
        className="min-h-[440px] flex-1 w-full overflow-hidden rounded-xl border border-[#DCE3DC]"
      />

      <div className="flex items-center justify-between border-t border-[#DCE3DC] pt-2.5 text-[11px] text-muted">
        <span>Bounds locked to Philippine Archipelago (4.2°–21.8°N, 114.0°–128.5°E)</span>
        <span className="font-mono font-medium text-[#1A472A]">
          {lat && lng ? `${lat}°N, ${lng}°E` : "No pin placed yet"}
        </span>
      </div>
    </div>
  );
}
