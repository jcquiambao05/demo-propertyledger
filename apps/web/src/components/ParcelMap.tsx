"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import type { Feature, LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  PH_BOUNDS,
  PH_CENTER,
  PH_FIT_BOUNDS,
  PH_MAX_ZOOM,
  PH_MIN_ZOOM,
  PH_OUTLINE_GEOJSON,
  createGeodesicCircle,
  haversineKm,
} from "@/lib/ph-geo";

export const PROBLEM_TEXT = {
  integrity: "Integrity check failed",
  overdue: "RPT overdue",
  due_soon: "RPT falls due within 30 days",
  open_issue: "Open legal issue",
} as const;

export interface Marker {
  id: string;
  name: string;
  region?: string | null;
  province: string;
  municipality?: string | null;
  titleNo?: string | null;
  taxDecNo?: string | null;
  classification?: string | null;
  areaHa?: number;
  lat: number;
  lng: number;
  problem: "integrity" | "overdue" | "due_soon" | "open_issue" | null;
}

export type MapBasemap = "streets" | "satellite" | "topo";

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function buildOfflinePhStyle(
  bgColor: string,
  landColor: string,
  strokeColor: string,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      "ph-archipelago": {
        type: "geojson",
        data: PH_OUTLINE_GEOJSON,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": bgColor } },
      {
        id: "ph-land-fill",
        type: "fill",
        source: "ph-archipelago",
        paint: {
          "fill-color": landColor,
          "fill-opacity": 0.92,
        },
      },
      {
        id: "ph-land-outline",
        type: "line",
        source: "ph-archipelago",
        paint: {
          "line-color": strokeColor,
          "line-width": 1.4,
        },
      },
    ],
  };
}

function getStyle(basemap: MapBasemap): string | StyleSpecification {
  if (!KEY) {
    if (basemap === "satellite") {
      return buildOfflinePhStyle("#0D1914", "#172C22", "#315844");
    }
    if (basemap === "topo") {
      return buildOfflinePhStyle("#E6ECE6", "#F4F2EA", "#B8C5B8");
    }
    return buildOfflinePhStyle("#DCE6DF", "#F3F6F2", "#B5C4B7");
  }
  const mapId =
    basemap === "satellite"
      ? "hybrid"
      : basemap === "topo"
        ? "outdoor-v2"
        : "streets-v2";
  return `https://api.maptiler.com/maps/${mapId}/style.json?key=${encodeURIComponent(KEY)}`;
}

interface ClusterGroup {
  markers: Marker[];
  lat: number;
  lng: number;
}

/** Groups nearby markers when zoomed out below zoom 8.0 */
function clusterMarkers(markers: Marker[], zoom: number): ClusterGroup[] {
  if (zoom >= 8.0 || markers.length <= 1) {
    return markers.map((m) => ({ markers: [m], lat: m.lat, lng: m.lng }));
  }
  // Distance threshold in km scales dynamically with zoom level
  const thresholdKm = zoom < 5.6 ? 55 : zoom < 6.8 ? 30 : 16;
  const used = new Set<string>();
  const groups: ClusterGroup[] = [];

  for (const m of markers) {
    if (used.has(m.id)) continue;
    used.add(m.id);
    const bucket: Marker[] = [m];
    for (const other of markers) {
      if (used.has(other.id)) continue;
      if (haversineKm(m, other) <= thresholdKm) {
        used.add(other.id);
        bucket.push(other);
      }
    }
    const avgLat = bucket.reduce((s, x) => s + x.lat, 0) / bucket.length;
    const avgLng = bucket.reduce((s, x) => s + x.lng, 0) / bucket.length;
    groups.push({ markers: bucket, lat: avgLat, lng: avgLng });
  }
  return groups;
}

export function ParcelMap({
  markers,
  selectedId,
  onSelect,
  basemap = "streets",
  resetCount = 0,
  hasActiveFilter = false,
  radiusCenter = null,
  radiusKm = null,
  routeFeature = null,
  flyTarget = null,
}: {
  markers: Marker[];
  selectedId?: string | null;
  onSelect?: (marker: Marker) => void;
  basemap?: MapBasemap;
  resetCount?: number;
  hasActiveFilter?: boolean;
  radiusCenter?: { lat: number; lng: number } | null;
  radiusKm?: number | null;
  routeFeature?: Feature<LineString> | null;
  flyTarget?: { lat: number; lng: number; zoom?: number; ts: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerInstancesRef = useRef<maplibregl.Marker[]>([]);
  const basemapMountedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [zoomLevel, setZoomLevel] = useState(5.2);
  const [styleReadyTick, setStyleReadyTick] = useState(0);

  // Sync GeoJSON overlays (Geodesic Radius Ring + OSRM Route Polyline)
  const syncOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // 1. Live Geodesic Radius Ring
    const radiusSourceId = "epl-radius-source";
    const radiusFillId = "epl-radius-fill";
    const radiusLineId = "epl-radius-line";

    const circleData =
      radiusCenter && radiusKm && radiusKm > 0
        ? createGeodesicCircle([radiusCenter.lng, radiusCenter.lat], radiusKm)
        : { type: "FeatureCollection" as const, features: [] };

    const existingRadius = map.getSource(radiusSourceId) as maplibregl.GeoJSONSource | undefined;
    if (existingRadius) {
      existingRadius.setData(circleData);
    } else {
      map.addSource(radiusSourceId, { type: "geojson", data: circleData });
      map.addLayer({
        id: radiusFillId,
        type: "fill",
        source: radiusSourceId,
        paint: {
          "fill-color": "#76B82A",
          "fill-opacity": 0.15,
        },
      });
      map.addLayer({
        id: radiusLineId,
        type: "line",
        source: radiusSourceId,
        paint: {
          "line-color": "#1A472A",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
    }

    // 2. OSRM Logistics Route Polyline
    const routeSourceId = "epl-route-source";
    const routeCasingId = "epl-route-casing";
    const routeLineId = "epl-route-line";

    const routeData = routeFeature ?? { type: "FeatureCollection" as const, features: [] };
    const existingRoute = map.getSource(routeSourceId) as maplibregl.GeoJSONSource | undefined;
    if (existingRoute) {
      existingRoute.setData(routeData);
    } else {
      map.addSource(routeSourceId, { type: "geojson", data: routeData });
      map.addLayer({
        id: routeCasingId,
        type: "line",
        source: routeSourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#1A472A",
          "line-width": 6,
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: routeLineId,
        type: "line",
        source: routeSourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#76B82A",
          "line-width": 3,
        },
      });
    }
  }, [radiusCenter, radiusKm, routeFeature]);

  // Initialize map once — Hard-locked to the Philippines, zoomed out to show the whole archipelago
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyle(basemap),
      center: PH_CENTER,
      zoom: 4.75,
      minZoom: PH_MIN_ZOOM,
      maxZoom: PH_MAX_ZOOM,
      maxBounds: PH_BOUNDS,
      attributionControl: false,
    });
    mapRef.current = map;

    map.once("load", () => {
      map.fitBounds(PH_FIT_BOUNDS, {
        padding: { top: 64, bottom: 56, left: 48, right: 48 },
        duration: 0,
      });
    });

    map.on("zoomend", () => {
      setZoomLevel(Number(map.getZoom().toFixed(2)));
    });
    map.on("styledata", () => {
      setStyleReadyTick((t) => t + 1);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap style dynamically (skip initial mount since map is created with initial style)
  useEffect(() => {
    if (!basemapMountedRef.current) {
      basemapMountedRef.current = true;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(getStyle(basemap));
  }, [basemap]);

  // Re-apply overlays whenever style reloads or radius/route changes
  useEffect(() => {
    syncOverlays();
  }, [syncOverlays, styleReadyTick]);

  // Fit camera when a route is drawn
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeFeature) return;
    const coords = routeFeature.geometry.coordinates;
    if (coords.length < 2) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const c of coords) {
      bounds.extend([c[0], c[1]]);
    }
    map.fitBounds(bounds, {
      padding: { top: 130, bottom: 120, left: 90, right: 360 },
      maxZoom: 11,
      duration: 950,
    });
  }, [routeFeature]);

  // Fly to searched Philippine place from Geocoding search bar
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({
      center: [flyTarget.lng, flyTarget.lat],
      zoom: flyTarget.zoom ?? 11.2,
      duration: 1050,
      essential: true,
    });
  }, [flyTarget]);

  // Reset camera view when requested — fit whole Philippines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetCount === 0) return;
    map.fitBounds(PH_FIT_BOUNDS, {
      padding: { top: 64, bottom: 56, left: 48, right: 48 },
      duration: 950,
    });
  }, [resetCount]);

  // Render Smart Clusters + Individual Markers with Hover Tooltips & Lot Area Labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const inst of markerInstancesRef.current) {
      inst.remove();
    }
    markerInstancesRef.current = [];

    const groups = clusterMarkers(markers, zoomLevel);

    for (const group of groups) {
      // Render Cluster Badge if multiple markers are grouped
      if (group.markers.length > 1) {
        const hasCritical = group.markers.some(
          (m) => m.problem === "integrity" || m.problem === "overdue",
        );
        const hasWarning = group.markers.some(
          (m) => m.problem === "due_soon" || m.problem === "open_issue",
        );
        const badgeColor = hasCritical ? "#D92D20" : hasWarning ? "#DC8A0E" : "#1A472A";
        const totalClusterHa = group.markers.reduce((s, m) => s + (m.areaHa ?? 0), 0);

        const clusterBtn = document.createElement("button");
        clusterBtn.type = "button";
        clusterBtn.setAttribute(
          "aria-label",
          `Cluster of ${group.markers.length} parcels in ${group.markers[0].province}`,
        );
        clusterBtn.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid ${badgeColor};
          box-shadow: 0 6px 18px rgba(18, 29, 23, 0.25);
          cursor: pointer;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          transition: transform 0.18s ease;
        `;

        const countSpan = document.createElement("span");
        countSpan.style.cssText = `
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 5px;
          border-radius: 9999px;
          background: ${badgeColor};
          color: #ffffff;
          font-family: var(--font-geist-mono), monospace;
          font-size: 11px;
          font-weight: 700;
        `;
        countSpan.textContent = String(group.markers.length);

        const labelSpan = document.createElement("span");
        labelSpan.style.cssText = `
          font-size: 11px;
          font-weight: 600;
          color: #121D17;
          white-space: nowrap;
        `;
        labelSpan.textContent = `${group.markers[0].province} · ${totalClusterHa.toFixed(1)} ha`;

        clusterBtn.append(countSpan, labelSpan);
        clusterBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const b = new maplibregl.LngLatBounds();
          for (const item of group.markers) b.extend([item.lng, item.lat]);
          map.fitBounds(b, {
            padding: { top: 140, bottom: 140, left: 120, right: 380 },
            maxZoom: 11.5,
            duration: 850,
          });
        });

        const clusterInstance = new maplibregl.Marker({ element: clusterBtn })
          .setLngLat([group.lng, group.lat])
          .addTo(map);
        markerInstancesRef.current.push(clusterInstance);
        continue;
      }

      // Single Parcel Marker with Hover Tooltip & Area Pill
      const m = group.markers[0];
      const isSelected = m.id === selectedId;
      const color =
        m.problem === "due_soon" || m.problem === "open_issue"
          ? "#DC8A0E"
          : m.problem
            ? "#D92D20"
            : "#1A472A";

      const wrapper = document.createElement("button");
      wrapper.type = "button";
      wrapper.setAttribute("aria-label", m.name);
      wrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${isSelected ? "32px" : "22px"};
        height: ${isSelected ? "32px" : "22px"};
        border-radius: 9999px;
        background: ${isSelected ? "rgba(118, 184, 42, 0.30)" : "transparent"};
        border: none;
        padding: 0;
        cursor: pointer;
      `;

      const dot = document.createElement("span");
      dot.style.cssText = `
        width: ${isSelected ? "16px" : "13px"};
        height: ${isSelected ? "16px" : "13px"};
        border-radius: 9999px;
        background: ${color};
        border: 2.5px solid #ffffff;
        box-shadow: ${
          isSelected
            ? `0 0 0 3px ${color}, 0 6px 16px rgba(18,29,23,0.42)`
            : "0 2px 6px rgba(18,29,23,0.34)"
        };
        display: block;
      `;
      wrapper.appendChild(dot);

      // Hover Tooltip Pill (Name + Area + Status)
      const tooltip = document.createElement("div");
      const statusText = m.problem ? PROBLEM_TEXT[m.problem] : "Verified";
      const areaText = typeof m.areaHa === "number" ? ` · ${m.areaHa.toFixed(2)} ha` : "";
      tooltip.style.cssText = `
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(8px);
        border: 1px solid #DCE3DC;
        border-radius: 10px;
        padding: 5px 9px;
        box-shadow: 0 8px 24px rgba(18, 29, 23, 0.18);
        white-space: nowrap;
        pointer-events: none;
        opacity: ${isSelected || zoomLevel >= 10.5 ? "1" : "0"};
        transition: opacity 0.16s ease, transform 0.16s ease;
        z-index: 30;
        text-align: left;
      `;
      const tooltipTitle = document.createElement("div");
      tooltipTitle.style.cssText = "font-size:11px;font-weight:600;color:#121D17;line-height:1.2;";
      tooltipTitle.textContent = m.name;

      const tooltipMeta = document.createElement("div");
      tooltipMeta.style.cssText =
        "font-size:10px;color:#56685E;font-family:var(--font-geist-mono),monospace;margin-top:1px;";
      tooltipMeta.textContent = `${m.province}${areaText} · `;

      const tooltipStatus = document.createElement("span");
      tooltipStatus.style.cssText = `color:${color};font-weight:600;`;
      tooltipStatus.textContent = statusText;
      tooltipMeta.appendChild(tooltipStatus);

      tooltip.append(tooltipTitle, tooltipMeta);
      wrapper.appendChild(tooltip);

      wrapper.addEventListener("mouseenter", () => {
        tooltip.style.opacity = "1";
        tooltip.style.transform = "translateX(-50%) translateY(0)";
      });
      wrapper.addEventListener("mouseleave", () => {
        if (!isSelected && zoomLevel < 10.5) {
          tooltip.style.opacity = "0";
          tooltip.style.transform = "translateX(-50%) translateY(4px)";
        }
      });

      wrapper.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(m);
      });

      const marker = new maplibregl.Marker({ element: wrapper })
        .setLngLat([m.lng, m.lat])
        .addTo(map);

      markerInstancesRef.current.push(marker);
    }
  }, [markers, selectedId, zoomLevel]);

  // Smooth flyTo when a specific parcel is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const target = markers.find((m) => m.id === selectedId);
    if (!target) return;
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 10.2),
      duration: 1050,
      essential: true,
    });
  }, [selectedId, markers]);

  // Fit bounds when filters narrow down the parcel set
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId || !hasActiveFilter || markers.length === 0) return;

    if (markers.length === 1) {
      map.flyTo({
        center: [markers[0].lng, markers[0].lat],
        zoom: 10.2,
        duration: 950,
        essential: true,
      });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const m of markers) {
      bounds.extend([m.lng, m.lat]);
    }
    map.fitBounds(bounds, {
      padding: { top: 120, bottom: 110, left: 80, right: 360 },
      maxZoom: 9.8,
      duration: 950,
    });
  }, [markers, hasActiveFilter, selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
