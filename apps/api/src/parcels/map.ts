// FR-05: map markers for approved parcels only, read from PostGIS. FR-06: filters (D14).
// Colors only for problems (STUDY_CONTEXT §6 module 2): red = failed integrity check
// ("integrity") or overdue RPT ("overdue"); amber = RPT due within 30 days ("due_soon").
// amber also for an open legal issue ("open_issue", FR-16); other markers are grey.
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { route, h } from "../rbac/route.js";
import { visibleParcelIds, UUID } from "./access.js";
import { todayManila } from "../documents/document-types.js";

interface MarkerRow {
  id: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  failed: boolean;
  overdue: boolean;
  due_soon: boolean;
  open_issue: boolean;
}

interface Filters {
  region: string | null;
  province: string | null;
  municipality: string | null;
  near: string | null;
  radiusKm: number | null;
}

const one = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);

/** FR-06 (D14) query: region, province, municipality; near=<parcel id>&radiusKm=<0.1..1000>. */
function parseFilters(q: Record<string, unknown>): Filters | string {
  const near = one(q.near);
  let radiusKm: number | null = null;
  if (near) {
    if (!UUID.test(near)) return "Choose a reference parcel.";
    radiusKm = Number(q.radiusKm);
    if (!Number.isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 1000)
      return "Enter a distance between 0.1 and 1000 km.";
  }
  return {
    region: one(q.region),
    province: one(q.province),
    municipality: one(q.municipality),
    near,
    radiusKm,
  };
}

/** Parameterized only: values are bound, never concatenated (STUDY_CONTEXT §8). */
function filterSql(f: Filters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (f.region) parts.push(Prisma.sql`AND p.region = ${f.region}`);
  if (f.province) parts.push(Prisma.sql`AND p.province = ${f.province}`);
  if (f.municipality) parts.push(Prisma.sql`AND p.municipality = ${f.municipality}`);
  if (f.near && f.radiusKm)
    parts.push(Prisma.sql`AND ST_DWithin(p.location::geography,
      (SELECT r.location::geography FROM parcels r WHERE r.id = ${f.near}::uuid),
      ${f.radiusKm * 1000}::float8)`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

export function mapRouter(): Router {
  const r = Router();
  route(
    r,
    "get",
    "/parcels/map",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (req, res) => {
      const visible = await visibleParcelIds(res);
      if (visible && visible.length === 0) return res.json([]);
      const parsed = parseFilters(req.query);
      if (typeof parsed === "string") return res.status(400).json({ error: parsed });
      // FR-06: the reference parcel must be an approved parcel this user may see.
      if (parsed.near) {
        const ref = await prisma.parcel.count({
          where: {
            AND: [
              { id: parsed.near },
              { status: "APPROVED" },
              ...(visible ? [{ id: { in: visible } }] : []),
            ],
          },
        });
        if (ref === 0) return res.status(404).json({ error: "Reference parcel not found." });
      }
      const filter = Prisma.sql`${visible ? Prisma.sql`AND p.id = ANY(${visible}::uuid[])` : Prisma.empty} ${filterSql(parsed)}`;
      const today = todayManila();
      const rows = await prisma.$queryRaw<MarkerRow[]>`
        SELECT p.id::text AS id, p.name, p.province,
               ST_Y(p.location) AS lat, ST_X(p.location) AS lng,
               EXISTS (SELECT 1 FROM documents d
                       WHERE d.parcel_id = p.id AND d.integrity_status = 'FAILED'
                         AND d.deleted_at IS NULL) AS failed,
               EXISTS (SELECT 1 FROM rpt_schedules s
                       WHERE s.parcel_id = p.id AND s.status <> 'PAID'
                         AND s.due_date < ${today}::date) AS overdue,
               EXISTS (SELECT 1 FROM rpt_schedules s
                       WHERE s.parcel_id = p.id AND s.status <> 'PAID'
                         AND s.due_date >= ${today}::date
                         AND s.due_date <= ${today}::date + 30) AS due_soon,
               EXISTS (SELECT 1 FROM issues i
                       WHERE i.parcel_id = p.id AND i.status <> 'RESOLVED') AS open_issue
        FROM parcels p
        WHERE p.status = 'APPROVED' AND p.location IS NOT NULL ${filter}
        ORDER BY p.name`;
      res.json(
        rows.map((m) => ({
          id: m.id,
          name: m.name,
          province: m.province,
          lat: m.lat,
          lng: m.lng,
          problem: m.failed
            ? "integrity"
            : m.overdue
              ? "overdue"
              : m.due_soon
                ? "due_soon"
                : m.open_issue
                  ? "open_issue"
                  : null,
        })),
      );
    }),
  );
  // FR-06: the stored values to filter by, from the approved parcels this user may see.
  route(
    r,
    "get",
    "/parcels/filters",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (_req, res) => {
      const visible = await visibleParcelIds(res);
      const rows = await prisma.parcel.findMany({
        where: { status: "APPROVED", ...(visible ? { id: { in: visible } } : {}) },
        select: { id: true, name: true, region: true, province: true, municipality: true },
        orderBy: { name: "asc" },
      });
      const distinct = (xs: (string | null)[]) =>
        [...new Set(xs.filter((x): x is string => !!x))].sort();
      res.json({
        regions: distinct(rows.map((x) => x.region)),
        provinces: distinct(rows.map((x) => x.province)),
        municipalities: distinct(rows.map((x) => x.municipality)),
        parcels: rows.map((x) => ({ id: x.id, name: x.name })),
      });
    }),
  );

  return r;
}
