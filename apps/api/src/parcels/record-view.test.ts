// FR-09 full parcel record view (DECISIONS D9): history in plain sentences without hashes,
// custody records per parcel. Roles per STUDY_CONTEXT §4: history for Legal and Management
// ("own parcel history"); custody for Legal, Management and assigned Tenants; IT refused.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
const names: Record<string, string> = {};
let parcelId = "";
let docId = "";

const pdf = Buffer.from("%PDF-1.4\n% synthetic record view\ntrailer<<>>\n%%EOF\n");

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    names[role] = u.name;
    c[role] = await cookieFor(u);
  }
  const p = await request(app).post("/parcels").set("Cookie", c.LEGAL).send({
    name: "Record View Lot",
    province: "Cebu",
    titleNo: "TCT T-13",
    areaHa: 1,
    lat: 10.3,
    lng: 123.9,
  });
  parcelId = p.body.id;
  await request(app).post(`/parcels/${parcelId}/approve`).set("Cookie", c.MANAGEMENT);
  await prisma.tenantAssignment.create({ data: { userId: ids.TENANT, parcelId } });
  const d = await request(app)
    .post(`/parcels/${parcelId}/documents`)
    .set("Cookie", c.LEGAL)
    .field("docType", "Survey Plan")
    .attach("file", pdf, "survey.pdf");
  docId = d.body.id;
  await request(app).post(`/documents/${docId}/custody`).set("Cookie", c.LEGAL).send({
    action: "RELEASED",
    holderType: "BANK",
    holderName: "Sample Rural Bank",
    expectedReturnDate: "2027-06-30",
  });
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("FR-09 activity history (D9)", () => {
  it("is written in plain sentences with the user's name and the document type, and shows no hashes", async () => {
    const res = await request(app).get(`/parcels/${parcelId}/history`).set("Cookie", c.MANAGEMENT);
    expect(res.status).toBe(200);
    const texts = res.body.map((e: { text: string }) => e.text);
    expect(texts).toEqual([
      `${names.LEGAL} submitted the parcel record`,
      `${names.MANAGEMENT} approved the parcel record`,
      `${names.LEGAL} uploaded Survey Plan`,
      `${names.LEGAL} released Survey Plan to a third party`,
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{64}/);
  });

  it.each(["TENANT", "IT_ADMIN"])("refuses %s (permission matrix)", async (role) => {
    const res = await request(app).get(`/parcels/${parcelId}/history`).set("Cookie", c[role]);
    expect(res.status).toBe(403);
  });
});

describe("FR-09 custody records of the parcel (D9)", () => {
  it.each(["LEGAL", "MANAGEMENT", "TENANT"])(
    "lists each current document with its status and holder for %s",
    async (role) => {
      const res = await request(app).get(`/parcels/${parcelId}/custody`).set("Cookie", c[role]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          documentId: docId,
          label: "Survey Plan",
          status: "WITH_THIRD_PARTY",
          holderType: "BANK",
          holderName: "Sample Rural Bank",
          expectedReturnDate: "2027-06-30",
        }),
      ]);
    },
  );

  it("refuses IT", async () => {
    const res = await request(app).get(`/parcels/${parcelId}/custody`).set("Cookie", c.IT_ADMIN);
    expect(res.status).toBe(403);
  });
});
