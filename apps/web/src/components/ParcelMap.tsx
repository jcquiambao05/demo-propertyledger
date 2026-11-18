"use client";
// FR-05: MapLibre map of approved parcels as point markers (STUDY_CONTEXT §5, §6 module 2).
// Colors only for problems (STUDY_CONTEXT §6 module 2): red = failed integrity check or overdue
// RPT; amber = RPT due within 30 days; grey = no problems.
// Without NEXT_PUBLIC_MAPTILER_KEY the map uses a blank style (no tiles, no network calls).
import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const PROBLEM_TEXT = {
  integrity: "Integrity check failed",
  overdue: "RPT overdue",
  due_soon: "RPT falls due within 30 days",
  open_issue: "Open legal issue",
} as const;

export interface Marker {
  id: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  problem: "integrity" | "overdue" | "due_soon" | "open_issue" | null;
}

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#EEF2F5" } }],
};

export function ParcelMap({ markers }: { markers: Marker[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: KEY
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(KEY)}`
        : BLANK,
      center: [122.0, 12.3],
      zoom: 4.6,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    for (const m of markers) {
      const el = document.createElement("div");
      el.style.cssText = `width:16px;height:16px;border-radius:9999px;border:2px solid #fff;box-shadow:0 0 0 1px #0002;background:${
        m.problem === "due_soon" || m.problem === "open_issue"
          ? "#DC8A0E"
          : m.problem
            ? "#D92D20"
            : "#98A2B3"
      };cursor:pointer`;
      el.setAttribute("aria-label", m.name);
      const popup = new maplibregl.Popup({ offset: 12 }).setDOMContent(popupContent(m));
      new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).setPopup(popup).addTo(map);
    }
    return () => map.remove();
  }, [markers]);

  return (
    <div ref={ref} className="h-[520px] w-full overflow-hidden rounded-xl border border-line" />
  );
}

function popupContent(m: Marker): HTMLElement {
  const div = document.createElement("div");
  const title = document.createElement("p");
  title.style.fontWeight = "600";
  title.textContent = m.name;
  const sub = document.createElement("p");
  sub.textContent = m.problem ? `${m.province} · ${PROBLEM_TEXT[m.problem]}` : m.province;
  const link = document.createElement("a");
  link.href = `/properties/${m.id}`;
  link.textContent = "View documents";
  link.style.color = "#1F5C3B";
  div.append(title, sub, link);
  return div;
}
