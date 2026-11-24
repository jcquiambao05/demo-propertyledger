// FR-10 document repository, FR-12 integrity verification, NFR-03.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor, lastAudit } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
let parcelId = "";

// A tiny synthetic PDF (not a real document).
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
  const p = await request(app).post("/parcels").set("Cookie", c.LEGAL).send({
    name: "Docs Test Lot",
    province: "Bulacan",
    titleNo: "TCT T-9",
    areaHa: 1,
    lat: 14.9,
    lng: 121,
  });
  parcelId = p.body.id;
  await request(app).post(`/parcels/${parcelId}/approve`).set("Cookie", c.MANAGEMENT);
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

const upload = (role: string, buf: Buffer, name = "survey-plan.pdf") =>
  request(app)
    .post(`/parcels/${parcelId}/documents`)
    .set("Cookie", c[role])
    .field("docType", "Survey Plan")
    .attach("file", buf, { filename: name, contentType: "application/pdf" });

describe("upload and integrity", () => {
  it("stores a PDF with its SHA-256 at upload", async () => {
    const res = await upload("LEGAL", PDF);
    expect(res.status).toBe(201);
    expect(res.body.sha256).toBe(createHash("sha256").update(PDF).digest("hex"));
    expect(await lastAudit("DOCUMENT_UPLOADED")).toMatchObject({
      actorId: ids.LEGAL,
      entityId: res.body.id,
    });
  });

  it("rejects a file that is not a PDF, whatever its name", async () => {
    const res = await upload("LEGAL", Buffer.from("just text"), "fake.pdf");
    expect(res.status).toBe(400);
  });

  it("verifies the hash on every view and download, and blocks an altered file", async () => {
    const up = await upload("LEGAL", PDF);
    const docId = up.body.id as string;

    const view = await request(app).get(`/documents/${docId}/view`).set("Cookie", c.MANAGEMENT);
    expect(view.status).toBe(200);
    expect(view.headers["content-type"]).toContain("application/pdf");
    expect(await lastAudit("DOCUMENT_VIEWED")).toMatchObject({ entityId: docId });

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
    await appendFile(path.join(process.env.UPLOAD_DIR!, doc.storagePath), "tampered");

    const blocked = await request(app).get(`/documents/${docId}/view`).set("Cookie", c.LEGAL);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("integrity_fail");
    expect(blocked.body.storedHash).toBe(doc.sha256);
    expect(blocked.body.computedHash).not.toBe(doc.sha256);
    expect(await lastAudit("INTEGRITY_FAIL")).toMatchObject({ entityId: docId });

    const dl = await request(app).get(`/documents/${docId}/download`).set("Cookie", c.LEGAL);
    expect(dl.status).toBe(409);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: docId } })).integrityStatus,
    ).toBe("FAILED");
  });
});

describe("RBAC on documents", () => {
  it("only Legal uploads", async () => {
    for (const role of ["MANAGEMENT", "TENANT", "IT_ADMIN"]) {
      expect((await upload(role, PDF)).status).toBe(403);
    }
  });

  it("IT and a non-assigned Tenant cannot open a document", async () => {
    const up = await upload("LEGAL", PDF);
    expect(
      (await request(app).get(`/documents/${up.body.id}/view`).set("Cookie", c.IT_ADMIN)).status,
    ).toBe(403);
    const t = await request(app).get(`/documents/${up.body.id}/view`).set("Cookie", c.TENANT);
    expect(t.status).toBe(403);
    expect(await lastAudit("ACCESS_DENIED")).toMatchObject({
      actorId: ids.TENANT,
      entityId: parcelId,
    });
  });

  it("blocks Tenant and IT from document history and activity logs", async () => {
    const up = await upload("LEGAL", PDF);
    await prisma.tenantAssignment.upsert({
      where: { userId_parcelId: { userId: ids.TENANT, parcelId } },
      update: {},
      create: { userId: ids.TENANT, parcelId },
    });
    expect(
      (await request(app).get(`/parcels/${parcelId}/documents/tracking`).set("Cookie", c.TENANT))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get(`/documents/${up.body.id}/tracking`).set("Cookie", c.TENANT)).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/parcels/${parcelId}/documents/tracking`).set("Cookie", c.IT_ADMIN))
        .status,
    ).toBe(403);
    const mgmt = await request(app)
      .get(`/parcels/${parcelId}/documents/tracking`)
      .set("Cookie", c.MANAGEMENT);
    expect(mgmt.status).toBe(200);
    expect(Array.isArray(mgmt.body.history)).toBe(true);
    expect(Array.isArray(mgmt.body.logs)).toBe(true);
  });
});
