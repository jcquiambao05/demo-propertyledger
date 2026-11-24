// Philippines geospatial constants, offline archipelago GeoJSON outline,
// geodesic buffer ring generator, MapTiler PH geocoding, and OSRM routing.

import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";

/** Strict bounding box for the Philippine Archipelago: [west, south, east, north] */
export const PH_BOUNDS: [[number, number], [number, number]] = [
  [114.0, 4.2],
  [128.5, 21.8],
];

export const PH_CENTER: [number, number] = [122.0, 12.2];
export const PH_FIT_BOUNDS: [[number, number], [number, number]] = [
  [116.8, 5.2],
  [126.6, 18.9],
];
export const PH_MIN_ZOOM = 4.3;
export const PH_MAX_ZOOM = 18;

/**
 * Lightweight offline GeoJSON silhouette of the major Philippine island groups
 * (Luzon, Mindoro, Palawan, Panay, Negros, Cebu, Samar, Leyte, Mindanao).
 */
export const PH_OUTLINE_GEOJSON: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Luzon" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [120.55, 18.52],
            [121.62, 18.48],
            [122.22, 18.25],
            [122.45, 16.95],
            [121.65, 15.85],
            [121.62, 14.75],
            [122.35, 14.28],
            [123.38, 13.95],
            [124.22, 13.55],
            [124.15, 12.62],
            [123.58, 12.55],
            [123.12, 13.05],
            [122.28, 13.62],
            [121.48, 13.82],
            [120.62, 13.78],
            [120.58, 14.35],
            [120.12, 14.78],
            [119.88, 15.65],
            [119.82, 16.38],
            [120.35, 16.65],
            [120.42, 17.65],
            [120.55, 18.52],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Mindoro" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [120.35, 13.48],
            [121.25, 13.42],
            [121.52, 12.62],
            [121.12, 12.22],
            [120.68, 12.78],
            [120.35, 13.48],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Palawan" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [117.18, 8.38],
            [117.65, 9.15],
            [118.68, 10.12],
            [119.45, 11.28],
            [119.65, 11.12],
            [118.92, 9.88],
            [117.95, 8.85],
            [117.35, 8.32],
            [117.18, 8.38],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Panay & Negros" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [121.92, 11.88],
            [123.15, 11.55],
            [123.52, 10.95],
            [123.35, 9.32],
            [122.62, 9.25],
            [122.42, 9.95],
            [121.95, 10.75],
            [121.92, 11.88],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Cebu, Samar & Leyte" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [124.25, 12.62],
            [125.55, 12.25],
            [125.75, 11.12],
            [125.18, 10.05],
            [124.65, 10.15],
            [123.85, 9.48],
            [123.38, 9.65],
            [123.95, 11.18],
            [124.25, 12.62],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Mindanao" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [125.48, 9.82],
            [126.35, 8.95],
            [126.55, 7.18],
            [125.65, 5.58],
            [124.25, 6.08],
            [123.85, 7.38],
            [122.05, 6.92],
            [121.92, 7.32],
            [123.15, 8.62],
            [124.55, 8.75],
            [125.48, 9.82],
          ],
        ],
      },
    },
  ],
};

/**
 * Generates a geodesic circle polygon around [lng, lat] for radiusKm.
 */
export function createGeodesicCircle(
  center: [number, number],
  radiusKm: number,
  steps = 64,
): Feature<Polygon> {
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  const earthRadiusKm = 6371;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const d = radiusKm / earthRadiusKm;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing),
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(pLat),
      );
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }

  return {
    type: "Feature",
    properties: { radiusKm },
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

/** Haversine distance in kilometers between two coordinates */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const c =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

export interface PhPlaceResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  region: string;
  province: string;
  municipality: string;
}

const LOCAL_PH_GAZETTEER: PhPlaceResult[] = [
  {
    id: "ph-norzagaray",
    label: "Norzagaray, Bulacan, Central Luzon",
    lat: 14.91,
    lng: 121.04,
    region: "Region III (Central Luzon)",
    province: "Bulacan",
    municipality: "Norzagaray",
  },
  {
    id: "ph-san-ildefonso",
    label: "San Ildefonso, Bulacan, Central Luzon",
    lat: 15.08,
    lng: 120.94,
    region: "Region III (Central Luzon)",
    province: "Bulacan",
    municipality: "San Ildefonso",
  },
  {
    id: "ph-teresa",
    label: "Teresa, Rizal, CALABARZON",
    lat: 14.56,
    lng: 121.21,
    region: "Region IV-A (CALABARZON)",
    province: "Rizal",
    municipality: "Teresa",
  },
  {
    id: "ph-antipolo",
    label: "Antipolo City, Rizal, CALABARZON",
    lat: 14.59,
    lng: 121.18,
    region: "Region IV-A (CALABARZON)",
    province: "Rizal",
    municipality: "Antipolo City",
  },
  {
    id: "ph-bacnotan",
    label: "Bacnotan, La Union, Ilocos Region",
    lat: 16.72,
    lng: 120.35,
    region: "Region I (Ilocos Region)",
    province: "La Union",
    municipality: "Bacnotan",
  },
  {
    id: "ph-danao",
    label: "Danao City, Cebu, Central Visayas",
    lat: 10.52,
    lng: 124.03,
    region: "Region VII (Central Visayas)",
    province: "Cebu",
    municipality: "Danao City",
  },
  {
    id: "ph-iligan",
    label: "Iligan City, Lanao del Norte, Northern Mindanao",
    lat: 8.23,
    lng: 124.24,
    region: "Region X (Northern Mindanao)",
    province: "Lanao del Norte",
    municipality: "Iligan City",
  },
  {
    id: "ph-davao",
    label: "Davao City, Davao del Sur, Davao Region",
    lat: 7.19,
    lng: 125.45,
    region: "Region XI (Davao Region)",
    province: "Davao del Sur",
    municipality: "Davao City",
  },
  {
    id: "ph-manila",
    label: "Metro Manila, National Capital Region",
    lat: 14.5995,
    lng: 120.9842,
    region: "NCR (Metro Manila)",
    province: "Metro Manila",
    municipality: "Manila",
  },
  {
    id: "ph-cebu",
    label: "Cebu City, Cebu, Central Visayas",
    lat: 10.3157,
    lng: 123.8854,
    region: "Region VII (Central Visayas)",
    province: "Cebu",
    municipality: "Cebu City",
  },
];

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

// Client-side in-memory + sessionStorage cache for external API responses
const memoryCache = new Map<string, { ts: number; data: unknown }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached<T>(key: string): T | null {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
    return mem.data as T;
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(`epl:${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; data: T };
        if (Date.now() - parsed.ts < CACHE_TTL_MS) {
          memoryCache.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }
  return null;
}

function setCached<T>(key: string, data: T): void {
  const entry = { ts: Date.now(), data };
  memoryCache.set(key, entry);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(`epl:${key}`, JSON.stringify(entry));
    } catch {
      // Ignore quota errors
    }
  }
}

/**
 * Forward geocode Philippine places using MapTiler Geocoding API (country=ph),
 * with instant local gazetteer fallback and client-side caching.
 */
export async function searchPhPlaces(query: string): Promise<PhPlaceResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `geocode:${q.toLowerCase()}`;
  const cached = getCached<PhPlaceResult[]>(cacheKey);
  if (cached) return cached;

  const localMatches = LOCAL_PH_GAZETTEER.filter((p) =>
    p.label.toLowerCase().includes(q.toLowerCase()),
  );

  if (!MAPTILER_KEY) return localMatches;

  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
      q,
    )}.json?country=ph&limit=5&key=${encodeURIComponent(MAPTILER_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) return localMatches;
    const data = (await res.json()) as {
      features?: {
        id: string;
        place_name?: string;
        text?: string;
        center?: [number, number];
        context?: { id: string; text: string }[];
      }[];
    };
    const apiResults: PhPlaceResult[] = (data.features ?? [])
      .filter((f) => Array.isArray(f.center) && f.center.length === 2)
      .map((f) => {
        const [lng, lat] = f.center!;
        const nearest = nearestLocalPlace(lat, lng);
        const ctx = f.context ?? [];
        const subregion = ctx.find((c) => c.id.startsWith("subregion"))?.text;
        const regionCtx = ctx.find((c) => c.id.startsWith("region"))?.text;
        const muni = f.text || nearest.municipality;
        return {
          id: f.id,
          label: f.place_name || `${muni}, ${nearest.province}`,
          lat: Number(lat.toFixed(5)),
          lng: Number(lng.toFixed(5)),
          region: regionCtx || nearest.region,
          province: subregion || nearest.province,
          municipality: muni,
        };
      });
    const finalResults = apiResults.length > 0 ? apiResults : localMatches;
    setCached(cacheKey, finalResults);
    return finalResults;
  } catch {
    return localMatches;
  }
}

function nearestLocalPlace(lat: number, lng: number): PhPlaceResult {
  let best = LOCAL_PH_GAZETTEER[0];
  let bestDist = Infinity;
  for (const p of LOCAL_PH_GAZETTEER) {
    const d = haversineKm({ lat, lng }, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/**
 * Reverse geocode a clicked Philippine coordinate into Region, Province, and Municipality.
 */
export async function reverseGeocodePh(lat: number, lng: number): Promise<PhPlaceResult> {
  const nearest = nearestLocalPlace(lat, lng);
  if (!MAPTILER_KEY) {
    return {
      ...nearest,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
    };
  }

  try {
    const url = `https://api.maptiler.com/geocoding/${lng.toFixed(5)},${lat.toFixed(
      5,
    )}.json?country=ph&limit=1&key=${encodeURIComponent(MAPTILER_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { ...nearest, lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
    }
    const data = (await res.json()) as {
      features?: {
        id: string;
        place_name?: string;
        text?: string;
        context?: { id: string; text: string }[];
      }[];
    };
    const f = data.features?.[0];
    if (!f) {
      return { ...nearest, lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
    }
    const ctx = f.context ?? [];
    const municipality =
      ctx.find((c) => c.id.startsWith("municipality") || c.id.startsWith("place"))?.text ||
      f.text ||
      nearest.municipality;
    const province =
      ctx.find((c) => c.id.startsWith("subregion") || c.id.startsWith("county"))?.text ||
      nearest.province;
    const region =
      ctx.find((c) => c.id.startsWith("region"))?.text || nearest.region;
    return {
      id: f.id,
      label: f.place_name || `${municipality}, ${province}`,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      region,
      province,
      municipality,
    };
  } catch {
    return { ...nearest, lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
  }
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  mode: "road" | "inter-island";
  geometry: Feature<LineString>;
}

/**
 * Computes road route & drive time between two parcels using OSRM,
 * falling back to an inter-island geodesic arc when across islands or offline.
 */
export async function fetchOsrmRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteResult> {
  const cacheKey = `route:${from.lat.toFixed(3)},${from.lng.toFixed(3)}->${to.lat.toFixed(3)},${to.lng.toFixed(3)}`;
  const cached = getCached<RouteResult>(cacheKey);
  if (cached) return cached;

  const straightKm = haversineKm(from, to);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as {
        code?: string;
        routes?: {
          distance: number;
          duration: number;
          geometry: LineString;
        }[];
      };
      const route = data.routes?.[0];
      if (data.code === "Ok" && route) {
        const result: RouteResult = {
          distanceKm: Number((route.distance / 1000).toFixed(1)),
          durationMin: Math.max(1, Math.round(route.duration / 60)),
          mode: "road",
          geometry: {
            type: "Feature",
            properties: { mode: "road" },
            geometry: route.geometry,
          },
        };
        setCached(cacheKey, result);
        return result;
      }
    }
  } catch {
    // Fall back to geodesic line
  }

  const fallback: RouteResult = {
    distanceKm: Number(straightKm.toFixed(1)),
    durationMin: Math.max(5, Math.round((straightKm / 45) * 60)),
    mode: "inter-island",
    geometry: {
      type: "Feature",
      properties: { mode: "inter-island" },
      geometry: {
        type: "LineString",
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    },
  };
  // Do not cache offline/transient fallback so reconnecting fetches the real road route
  return fallback;
}

export interface DrawPoint {
  lat: number;
  lng: number;
}

/**
 * Computes total path distance in kilometers for an array of points.
 */
export function computePathDistanceKm(points: DrawPoint[], closeLoop = false): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  if (closeLoop && points.length >= 3) {
    total += haversineKm(points[points.length - 1], points[0]);
  }
  return Number(total.toFixed(3));
}

/**
 * Computes geodesic polygon area in Hectares (ha) and Square Meters (m²)
 * using local equirectangular metric projection around the polygon centroid.
 */
export function computePolygonMetrics(points: DrawPoint[]): {
  areaHa: number;
  areaSqm: number;
  perimeterKm: number;
} {
  const perimeterKm = computePathDistanceKm(points, true);
  if (points.length < 3) {
    return { areaHa: 0, areaSqm: 0, perimeterKm };
  }

  const meanLatRad =
    (points.reduce((s, p) => s + p.lat, 0) / points.length) * (Math.PI / 180);
  const metersPerDegLat = 111132.92;
  const metersPerDegLng = 111412.84 * Math.cos(meanLatRad);

  const origin = points[0];
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const x1 = (p1.lng - origin.lng) * metersPerDegLng;
    const y1 = (p1.lat - origin.lat) * metersPerDegLat;
    const x2 = (p2.lng - origin.lng) * metersPerDegLng;
    const y2 = (p2.lat - origin.lat) * metersPerDegLat;
    twiceArea += x1 * y2 - x2 * y1;
  }

  const areaSqm = Math.round(Math.abs(twiceArea) / 2);
  const areaHa = Number((areaSqm / 10000).toFixed(2));
  return { areaHa, areaSqm, perimeterKm };
}
