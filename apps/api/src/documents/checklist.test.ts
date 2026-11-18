// FR-14 document completeness checklist — DECISIONS D10 (interim required set, kept in one
// config file; Present / Missing / Expired; time-bound types carry an expiry date).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};

const pdf = (n: string) => Buffer.from(`%PDF-1.4\n% synthetic ${n}\ntrailer<<>>\n%%EOF\n`);
let n = 0;

async function newParcel(extra: object) {
  const p = await request(app)
    .post("/parcels")
    .set("Cookie", c.LEGAL)
    .send({
      name: `Checklist Lot ${++n}`,
      province: "Bulacan",
      areaHa: 1,
      lat: 14.9,
      lng: 121,
      ...extra,
    });
  expect(p.status).toBe(201);
  await request(app).post(`/parcels/${p.body.id}/approve`).set("Cookie", c.MANAGEMENT);
  return p.body.id as string;
}

function upload(parcelId: string, docType: string, expiresOn?: string) {
  const req = request(app)
    .post(`/parcels/${parcelId}/documents`)
    .set("Cookie", c.LEGAL)
    .field("docType", docType);
  if (expiresOn) req.field("expiresOn", expiresOn);
  return req.attach("file", pdf(`${docType}-${++n}`), "file.pdf");
}

const checklist = async (parcelId: string, role = "LEGAL") =>
  request(app).get(`/parcels/${parcelId}/checklist`).set("Cookie", c[role]);

const state = (items: { type: string; state: string }[]) =>
  Object.fromEntries(items.map((i) => [i.type, i.state]));

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("FR-14 required set (D10)", () => {
  it("a titled parcel needs title, tax declaration, RPT official receipt, deed of sale and survey plan", async () => {
    const id = await newParcel({ titleNo: "TCT T-14" });
    const res = await checklist(id);
    expect(res.status).toBe(200);
    expect(res.body.classification).toBe("TITLED");
    expect(state(res.body.items)).toEqual({
      "Certificate of Title": "MISSING",
      "Tax Declaration": "MISSING",
      "RPT Official Receipt": "MISSING",
      "Deed of Sale": "MISSING",
      "Survey Plan": "MISSING",
    });
    expect(res.body.complete).toBe(false);
  });

  it("an untitled parcel does not need a certificate of title", async () => {
    const id = await newParcel({ taxDecNo: "TD 03-0412-00999" });
    const res = await checklist(id);
    expect(res.body.classification).toBe("UNTITLED");
    expect(res.body.items.map((i: { type: string }) => i.type)).toEqual([
      "Tax Declaration",
      "RPT Official Receipt",
      "Deed of Sale",
      "Survey Plan",
    ]);
  });

  it("marks an uploaded type Present, and Missing again after the document is deleted", async () => {
    const id = await newParcel({ titleNo: "TCT T-15" });
    const doc = await upload(id, "Tax Declaration");
    expect(doc.status).toBe(201);
    let items = (await checklist(id)).body.items;
    expect(state(items)["Tax Declaration"]).toBe("PRESENT");
    expect(items.find((i: { type: string }) => i.type === "Tax Declaration").documentId).toBe(
      doc.body.id,
    );

    await request(app).delete(`/documents/${doc.body.id}`).set("Cookie", c.LEGAL);
    items = (await checklist(id)).body.items;
    expect(state(items)["Tax Declaration"]).toBe("MISSING");
  });

  it("is complete when every required type is present and nothing is expired", async () => {
    const id = await newParcel({ taxDecNo: "TD 03-0412-01000" });
    for (const t of ["Tax Declaration", "RPT Official Receipt", "Deed of Sale", "Survey Plan"]) {
      expect((await upload(id, t)).status).toBe(201);
    }
    expect((await checklist(id)).body.complete).toBe(true);
  });
});

describe("FR-14 time-bound documents (D10)", () => {
  it("lists a tax clearance as Expired after its expiry date and Present before it", async () => {
    const id = await newParcel({ titleNo: "TCT T-16" });
    const old = await upload(id, "Tax Clearance", "2026-01-31");
    expect(old.status).toBe(201);
    expect(old.body.expiresOn).toBe("2026-01-31");
    await upload(id, "Permit", "2099-12-31");
    const res = await checklist(id);
    expect(state(res.body.items)["Tax Clearance"]).toBe("EXPIRED");
    expect(state(res.body.items).Permit).toBe("PRESENT");
    expect(res.body.complete).toBe(false);
  });

  it("requires an expiry date for time-bound types", async () => {
    const id = await newParcel({ titleNo: "TCT T-17" });
    expect((await upload(id, "Certification")).status).toBe(400);
  });

  it("refuses a document type that is not on the list", async () => {
    const id = await newParcel({ titleNo: "TCT T-18" });
    expect((await upload(id, "Barangay Gossip")).status).toBe(400);
  });
});

describe("FR-14 roles and the type list", () => {
  it("serves the type list with the time-bound flag", async () => {
    const res = await request(app).get("/document-types").set("Cookie", c.LEGAL);
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ name: "Tax Clearance", timeBound: true });
    expect(res.body).toContainEqual({ name: "Survey Plan", timeBound: false });
    expect(res.body).toContainEqual({ name: "Other", timeBound: false });
  });

  it("lets Management and the assigned Tenant read the checklist, refuses IT", async () => {
    const id = await newParcel({ titleNo: "TCT T-19" });
    await prisma.tenantAssignment.create({ data: { userId: ids.TENANT, parcelId: id } });
    expect((await checklist(id, "MANAGEMENT")).status).toBe(200);
    expect((await checklist(id, "TENANT")).status).toBe(200);
    expect((await checklist(id, "IT_ADMIN")).status).toBe(403);
  });
});
