// Parcel points: PostGIS geometry(Point, 4326). Only parameterized tagged templates.
import type { Db } from "../db.js";

export interface LatLng {
  lat: number;
  lng: number;
}

export function assertLatLng(p: LatLng): void {
  const ok =
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180;
  if (!ok) throw new Error("Invalid coordinates");
}

export async function setParcelLocation(db: Db, parcelId: string, p: LatLng): Promise<void> {
  assertLatLng(p);
  await db.$executeRaw`
    UPDATE parcels
    SET location = ST_SetSRID(ST_MakePoint(${p.lng}::float8, ${p.lat}::float8), 4326)
    WHERE id = ${parcelId}::uuid`;
}

export async function getParcelLocation(db: Db, parcelId: string): Promise<LatLng | null> {
  const rows = await db.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location) AS lat, ST_X(location) AS lng
    FROM parcels WHERE id = ${parcelId}::uuid AND location IS NOT NULL`;
  return rows[0] ?? null;
}
