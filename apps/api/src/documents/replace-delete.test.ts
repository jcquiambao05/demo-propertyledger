// FR-10 replace (new version, old one SUPERSEDED) and soft delete — DECISIONS D2, D3.
// FR-03: only the Legal Department; others get 403 and ACCESS_DENIED.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { access } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { config } from "../config.js";
import { makeUser, cookieFor, lastAudit } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
let parcelId = "";

const pdf = (n: string) => Buffer.from(`%PDF-1.4\n% synthetic ${n}\ntrailer<<>>\n%%EOF\n`);

async function upload(name = "survey.pdf", body = pdf(name)) {
  const res = await request(app)
    .post(`/parcels/${parcelId}/documents`)
    .set("Cookie", c.LEGAL)
    .field("docType", "Survey Plan")
    .attach("file", body, name);
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

const replace = (id: string, cookie: string, body: Buffer = pdf("v2"), name = "survey-v2.pdf") =>
  request(app).post(`/documents/${id}/replace`).set("Cookie", cookie).attach("file", body, name);

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
  const p = await request(app).post("/parcels").set("Cookie", c.LEGAL).send({
    name: "Replace Delete Lot",
    province: "Bulacan",
    titleNo: "TCT T-11",
    areaHa: 1,
    lat: 14.9,
    lng: 121,
  });
  parcelId = p.body.id;
  await request(app).post(`/parcels/${parcelId}/approve`).set("Cookie", c.MANAGEMENT);
  await prisma.tenantAssignment.create({ data: { userId: ids.TENANT, parcelId } });
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("FR-10 replace (D2)", () => {
  it("creates a new version with its own hash; the old one is SUPERSEDED and listed under versions", async () => {
    const v1 = await upload();
    const res = await replace(v1.id, c.LEGAL);
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(v1.id);
    expect(res.body.version).toBe(2);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.docType).toBe("Survey Plan");

    const old = await prisma.document.findUniqueOrThrow({ where: { id: v1.id } });
    expect(old.status).toBe("SUPERSEDED");
    expect(res.body.sha256).not.toBe(old.sha256);

    const list = await request(app).get(`/parcels/${parcelId}/documents`).set("Cookie", c.LEGAL);
    const listed = list.body.documents.map((d: { id: string }) => d.id);
    expect(listed).toContain(res.body.id);
    expect(listed).not.toContain(v1.id);

    const versions = await request(app)
      .get(`/documents/${res.body.id}/versions`)
      .set("Cookie", c.TENANT);
    expect(versions.status).toBe(200);
    expect(versions.body.versions.map((d: { id: string }) => d.id)).toEqual([res.body.id, v1.id]);

    // The old version keeps its stored hash and still passes the integrity check on its own.
    expect((await request(app).get(`/documents/${v1.id}/view`).set("Cookie", c.LEGAL)).status).toBe(
      200,
    );

    const entry = await lastAudit("DOCUMENT_REPLACED");
    expect(entry?.entityId).toBe(res.body.id);
    expect(JSON.parse(entry!.details!)).toEqual({
      documentId: res.body.id,
      newVersionId: res.body.id,
      oldVersionId: v1.id,
    });
  });

  it("refuses to replace a version that is already superseded", async () => {
    const v1 = await upload("a.pdf");
    expect((await replace(v1.id, c.LEGAL)).status).toBe(201);
    expect((await replace(v1.id, c.LEGAL, pdf("v3"))).status).toBe(409);
  });

  it("accepts PDF only (content check)", async () => {
    const v1 = await upload("b.pdf");
    const res = await replace(v1.id, c.LEGAL, Buffer.from("not a pdf"), "fake.pdf");
    expect(res.status).toBe(400);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe(
      "ACTIVE",
    );
  });

  it.each(["MANAGEMENT", "TENANT", "IT_ADMIN"])(
    "refuses %s with 403 and ACCESS_DENIED",
    async (role) => {
      const v1 = await upload(`r-${role}.pdf`);
      const res = await replace(v1.id, c[role]);
      expect(res.status).toBe(403);
      const entry = await lastAudit("ACCESS_DENIED");
      expect(entry?.actorId).toBe(ids[role]);
    },
  );
});

describe("FR-10 soft delete (D3)", () => {
  it("hides the document and its versions but keeps the file and hash", async () => {
    const v1 = await upload("del.pdf");
    const v2 = (await replace(v1.id, c.LEGAL)).body as { id: string };
    const res = await request(app).delete(`/documents/${v2.id}`).set("Cookie", c.LEGAL);
    expect(res.status).toBe(204);

    const list = await request(app).get(`/parcels/${parcelId}/documents`).set("Cookie", c.LEGAL);
    const listed = list.body.documents.map((d: { id: string }) => d.id);
    expect(listed).not.toContain(v2.id);
    expect((await request(app).get(`/documents/${v2.id}`).set("Cookie", c.LEGAL)).status).toBe(404);
    expect((await request(app).get(`/documents/${v1.id}`).set("Cookie", c.LEGAL)).status).toBe(404);

    const row = await prisma.document.findUniqueOrThrow({ where: { id: v2.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).toBe(ids.LEGAL);
    await access(path.resolve(config.uploadDir, row.storagePath));

    const entry = await lastAudit("DOCUMENT_DELETED");
    expect(entry?.entityId).toBe(v2.id);
    expect(JSON.parse(entry!.details!)).toEqual({ documentId: v2.id, parcelId });
  });

  it.each(["MANAGEMENT", "TENANT", "IT_ADMIN"])(
    "refuses %s with 403 and ACCESS_DENIED",
    async (role) => {
      const v1 = await upload(`d-${role}.pdf`);
      const res = await request(app).delete(`/documents/${v1.id}`).set("Cookie", c[role]);
      expect(res.status).toBe(403);
      expect((await lastAudit("ACCESS_DENIED"))?.actorId).toBe(ids[role]);
      expect(
        (await prisma.document.findUniqueOrThrow({ where: { id: v1.id } })).deletedAt,
      ).toBeNull();
    },
  );
});
