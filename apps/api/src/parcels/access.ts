// Record-level checks (STUDY_CONTEXT §4, NFR-09). Route roles already exclude IT
// from content routes; this adds Tenant <-> tenant_assignments.
import type { Response } from "express";
import type { Parcel } from "@prisma/client";
import { prisma } from "../db.js";
import { currentUser, deny } from "../rbac/route.js";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load a parcel the current user may read, or answer the response (404 / 403 + ACCESS_DENIED)
 * and return null. Tenants see only assigned, approved parcels.
 */
export async function readableParcel(res: Response, parcelId: string): Promise<Parcel | null> {
  if (!UUID.test(parcelId)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const parcel = await prisma.parcel.findUnique({ where: { id: parcelId } });
  if (!parcel) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const user = currentUser(res);
  if (user.role === "TENANT") {
    const assigned = await prisma.tenantAssignment.findUnique({
      where: { userId_parcelId: { userId: user.id, parcelId } },
    });
    if (!assigned || parcel.status !== "APPROVED") {
      await deny(res, "parcel", parcelId);
      return null;
    }
  } else if (user.role !== "LEGAL" && user.role !== "MANAGEMENT") {
    await deny(res, "parcel", parcelId);
    return null;
  }
  return parcel;
}

/** Parcel ids a Tenant may see; null means "all" (Legal, Management). */
export async function visibleParcelIds(res: Response): Promise<string[] | null> {
  const user = currentUser(res);
  if (user.role !== "TENANT") return null;
  const rows = await prisma.tenantAssignment.findMany({
    where: { userId: user.id, parcel: { status: "APPROVED" } },
    select: { parcelId: true },
  });
  return rows.map((r) => r.parcelId);
}
