// FR-07 registration, FR-08 approval workflow, FR-09 record view, FR-03/NFR-09 RBAC.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor, lastAudit } from "../test/helpers.js";

const app = createApp();
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

const NEW_PARCEL = {
  name: "Slice 3 Test Lot",
  province: "Bulacan",
  municipality: "Norzagaray",
  titleNo: "TCT T-000-2026-0001",
  classification: "Industrial",
  areaHa: 1.25,
  lat: 14.9,
  lng: 121.05,
};

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    cookies[role] = await cookieFor(u);
  }
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

const post = (path: string, role: string, body: object = {}) =>
  request(app).post(path).set("Cookie", cookies[role]).send(body);
const get = (path: string, role: string) => request(app).get(path).set("Cookie", cookies[role]);

describe("registration and approval", () => {
  it("Legal registers a parcel as pending; Management approves it", async () => {
    const created = await post("/parcels", "LEGAL", NEW_PARCEL);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("PENDING");
    expect(await lastAudit("PARCEL_SUBMITTED")).toMatchObject({
      actorId: ids.LEGAL,
      entityId: created.body.id,
    });

    const queue = await get("/approvals", "MANAGEMENT");
    expect(queue.body.map((p: { id: string }) => p.id)).toContain(created.body.id);

    const approved = await post(`/parcels/${created.body.id}/approve`, "MANAGEMENT");
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(await lastAudit("PARCEL_APPROVED")).toMatchObject({ actorId: ids.MANAGEMENT });

    const again = await post(`/parcels/${created.body.id}/approve`, "MANAGEMENT");
    expect(again.status).toBe(409);
  });

  it("requires title or tax declaration details and valid coordinates", async () => {
    const noTitle = await post("/parcels", "LEGAL", { ...NEW_PARCEL, titleNo: undefined });
    expect(noTitle.status).toBe(400);
    const badLat = await post("/parcels", "LEGAL", { ...NEW_PARCEL, lat: 120 });
    expect(badLat.status).toBe(400);
  });

  it("returns with required remarks, then Legal corrects and resubmits", async () => {
    const created = await post("/parcels", "LEGAL", { ...NEW_PARCEL, name: "Slice 3 Return Lot" });
    const noRemarks = await post(`/parcels/${created.body.id}/return`, "MANAGEMENT", {
      remarks: "  ",
    });
    expect(noRemarks.status).toBe(400);

    const returned = await post(`/parcels/${created.body.id}/return`, "MANAGEMENT", {
      remarks: "Area does not match the title.",
    });
    expect(returned.status).toBe(200);
    expect(returned.body).toMatchObject({
      status: "RETURNED",
      remarks: "Area does not match the title.",
    });

    const resubmitted = await post(`/parcels/${created.body.id}/resubmit`, "LEGAL", {
      ...NEW_PARCEL,
      areaHa: 1.3,
    });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.status).toBe("PENDING");
    expect(await lastAudit("PARCEL_RESUBMITTED")).toMatchObject({ entityId: created.body.id });

    const history = await get(`/parcels/${created.body.id}/history`, "LEGAL");
    expect(history.body.map((e: { action: string }) => e.action)).toEqual([
      "PARCEL_SUBMITTED",
      "PARCEL_RETURNED",
      "PARCEL_RESUBMITTED",
    ]);
  });
});

describe("RBAC on parcel routes", () => {
  it.each([
    ["TENANT", "/parcels"],
    ["IT_ADMIN", "/parcels"],
    ["MANAGEMENT", "/parcels"],
  ])("%s cannot register (403 + ACCESS_DENIED)", async (role, path) => {
    const res = await post(path, role, NEW_PARCEL);
    expect(res.status).toBe(403);
    expect(await lastAudit("ACCESS_DENIED")).toMatchObject({ actorId: ids[role] });
  });

  it("Legal, Tenant and IT cannot approve or return", async () => {
    const created = await post("/parcels", "LEGAL", { ...NEW_PARCEL, name: "Slice 3 RBAC Lot" });
    for (const role of ["LEGAL", "TENANT", "IT_ADMIN"]) {
      expect((await post(`/parcels/${created.body.id}/approve`, role)).status).toBe(403);
      expect(
        (await post(`/parcels/${created.body.id}/return`, role, { remarks: "x" })).status,
      ).toBe(403);
    }
  });

  it("IT Administrator cannot read parcel content", async () => {
    expect((await get("/parcels", "IT_ADMIN")).status).toBe(403);
  });

  it("Tenant sees only assigned, approved parcels; others are refused and logged", async () => {
    const assigned = await post("/parcels", "LEGAL", { ...NEW_PARCEL, name: "Slice 3 Tenant Lot" });
    await post(`/parcels/${assigned.body.id}/approve`, "MANAGEMENT");
    await prisma.tenantAssignment.create({
      data: { userId: ids.TENANT, parcelId: assigned.body.id },
    });
    const other = await post("/parcels", "LEGAL", { ...NEW_PARCEL, name: "Slice 3 Other Lot" });

    const list = await get("/parcels", "TENANT");
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([assigned.body.id]);
    expect((await get(`/parcels/${assigned.body.id}`, "TENANT")).status).toBe(200);

    const denied = await get(`/parcels/${other.body.id}`, "TENANT");
    expect(denied.status).toBe(403);
    expect(await lastAudit("ACCESS_DENIED")).toMatchObject({
      actorId: ids.TENANT,
      entityId: other.body.id,
    });
  });
});
