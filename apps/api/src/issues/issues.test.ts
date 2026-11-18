// FR-16 legal issue tracking — DECISIONS D12: type (config list), priority High/Medium/Low,
// assignee (a Legal Department user), lifecycle OPEN → IN_PROGRESS → ON_HOLD → RESOLVED with a
// note on every status change. Legal creates and updates; Management and assigned Tenants view
// only; IT 403. Audit ISSUE_CREATED, ISSUE_STATUS_CHANGED.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor, lastAudit } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
let parcelId = "";

const create = (body: object, role = "LEGAL") =>
  request(app).post(`/parcels/${parcelId}/issues`).set("Cookie", c[role]).send(body);

const issue = () => ({
  title: "Neighbor fence encroaches 3 m",
  type: "Boundary dispute",
  priority: "HIGH",
  assigneeId: ids.LEGAL,
  description: "Synthetic test issue.",
});

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
  const p = await request(app)
    .post("/parcels")
    .set("Cookie", c.LEGAL)
    .send({
      name: `Issues Lot ${Date.now()}`,
      province: "La Union",
      titleNo: "TCT T-20",
      areaHa: 1,
      lat: 16.5,
      lng: 120.4,
    });
  parcelId = p.body.id;
  await request(app).post(`/parcels/${parcelId}/approve`).set("Cookie", c.MANAGEMENT);
  await prisma.tenantAssignment.create({ data: { userId: ids.TENANT, parcelId } });
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("FR-16 record an issue (D12)", () => {
  it("creates an OPEN issue with type, priority and a Legal assignee, and audits ISSUE_CREATED", async () => {
    const res = await create(issue());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: "Boundary dispute",
      priority: "HIGH",
      status: "OPEN",
      assignee: { id: ids.LEGAL },
    });
    const entry = await lastAudit("ISSUE_CREATED");
    expect(JSON.parse(entry!.details!)).toEqual({ issueId: res.body.id, parcelId });
  });

  it("refuses a type or priority not on the list, and an assignee who is not Legal", async () => {
    expect((await create({ ...issue(), type: "Gossip" })).status).toBe(400);
    expect((await create({ ...issue(), priority: "URGENT" })).status).toBe(400);
    expect((await create({ ...issue(), assigneeId: ids.MANAGEMENT })).status).toBe(400);
    expect((await create({ ...issue(), title: "" })).status).toBe(400);
  });

  it.each(["MANAGEMENT", "TENANT", "IT_ADMIN"])(
    "refuses %s with 403 and ACCESS_DENIED",
    async (role) => {
      expect((await create(issue(), role)).status).toBe(403);
      expect((await lastAudit("ACCESS_DENIED"))?.actorId).toBe(ids[role]);
    },
  );
});

describe("FR-16 lifecycle (D12)", () => {
  it("needs a note for every status change, keeps the history and audits ISSUE_STATUS_CHANGED", async () => {
    const id = (await create(issue())).body.id;
    const change = (body: object, role = "LEGAL") =>
      request(app).post(`/issues/${id}/status`).set("Cookie", c[role]).send(body);

    expect((await change({ status: "IN_PROGRESS" })).status).toBe(400);
    expect((await change({ status: "DONE", note: "x" })).status).toBe(400);
    expect((await change({ status: "OPEN", note: "same" })).status).toBe(400);
    expect((await change({ status: "IN_PROGRESS", note: "Surveyor booked" })).status).toBe(200);
    expect((await change({ status: "ON_HOLD", note: "Waiting for barangay" })).status).toBe(200);
    const done = await change({ status: "RESOLVED", note: "Fence moved" });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("RESOLVED");

    const entry = await lastAudit("ISSUE_STATUS_CHANGED");
    expect(JSON.parse(entry!.details!)).toEqual({ issueId: id, from: "ON_HOLD", to: "RESOLVED" });

    const one = await request(app).get(`/issues/${id}`).set("Cookie", c.MANAGEMENT);
    expect(one.body.changes.map((x: { to: string; note: string }) => [x.to, x.note])).toEqual([
      ["RESOLVED", "Fence moved"],
      ["ON_HOLD", "Waiting for barangay"],
      ["IN_PROGRESS", "Surveyor booked"],
    ]);
    expect((await change({ status: "OPEN", note: "x" }, "MANAGEMENT")).status).toBe(403);
  });

  it("status changes cannot be edited or deleted (DB trigger)", async () => {
    const id = (await create(issue())).body.id;
    await request(app)
      .post(`/issues/${id}/status`)
      .set("Cookie", c.LEGAL)
      .send({ status: "IN_PROGRESS", note: "n" });
    await expect(
      prisma.$executeRaw`DELETE FROM issue_status_changes WHERE issue_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });
});

describe("FR-16 viewing (D12, §4)", () => {
  it.each(["LEGAL", "MANAGEMENT", "TENANT"])("lists the parcel's issues for %s", async (role) => {
    const res = await request(app).get(`/parcels/${parcelId}/issues`).set("Cookie", c[role]);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("refuses IT", async () => {
    expect(
      (await request(app).get(`/parcels/${parcelId}/issues`).set("Cookie", c.IT_ADMIN)).status,
    ).toBe(403);
  });

  it("serves the type and priority lists", async () => {
    const res = await request(app).get("/issue-types").set("Cookie", c.LEGAL);
    expect(res.body.types).toContain("Right-of-way conflict");
    expect(res.body.priorities).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });

  it("an open issue makes the map marker amber", async () => {
    const markers = (await request(app).get("/parcels/map").set("Cookie", c.LEGAL)).body as {
      id: string;
      problem: string | null;
    }[];
    expect(markers.find((m) => m.id === parcelId)?.problem).toBe("open_issue");
  });
});
