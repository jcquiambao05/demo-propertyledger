// FR-05: approved parcels only, as PostGIS points; Tenant sees assigned only; IT refused.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
let tenantId = "";

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    if (role === "TENANT") tenantId = u.id;
    c[role] = await cookieFor(u);
  }
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

const body = (name: string) => ({
  name,
  province: "Rizal",
  titleNo: "TCT T-1",
  areaHa: 1,
  lat: 14.5,
  lng: 121.2,
});

describe("GET /parcels/map", () => {
  it("returns approved parcels with coordinates and leaves pending ones out", async () => {
    const approved = await request(app)
      .post("/parcels")
      .set("Cookie", c.LEGAL)
      .send(body("Map Approved Lot"));
    await request(app).post(`/parcels/${approved.body.id}/approve`).set("Cookie", c.MANAGEMENT);
    const pending = await request(app)
      .post("/parcels")
      .set("Cookie", c.LEGAL)
      .send(body("Map Pending Lot"));

    const res = await request(app).get("/parcels/map").set("Cookie", c.MANAGEMENT);
    expect(res.status).toBe(200);
    const ids = res.body.map((m: { id: string }) => m.id);
    expect(ids).toContain(approved.body.id);
    expect(ids).not.toContain(pending.body.id);
    const marker = res.body.find((m: { id: string }) => m.id === approved.body.id);
    expect(marker).toMatchObject({ lat: 14.5, lng: 121.2, problem: null });
  });

  it("shows a Tenant only assigned parcels", async () => {
    const mine = await request(app)
      .post("/parcels")
      .set("Cookie", c.LEGAL)
      .send(body("Map Tenant Lot"));
    await request(app).post(`/parcels/${mine.body.id}/approve`).set("Cookie", c.MANAGEMENT);
    await prisma.tenantAssignment.create({ data: { userId: tenantId, parcelId: mine.body.id } });
    const res = await request(app).get("/parcels/map").set("Cookie", c.TENANT);
    expect(res.body.map((m: { id: string }) => m.id)).toEqual([mine.body.id]);
  });

  it("refuses the IT Administrator", async () => {
    expect((await request(app).get("/parcels/map").set("Cookie", c.IT_ADMIN)).status).toBe(403);
  });
});
