// FR-13 document status and custody tracking — DECISIONS D4 (status list), D5 (holder types),
// D6 (processing stage), D7 (actions, history, roles, CUSTODY_UPDATED).
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

const pdf = (n: string) => Buffer.from(`%PDF-1.4\n% synthetic ${n}\ntrailer<<>>\n%%EOF\n`);

async function upload(name: string) {
  const res = await request(app)
    .post(`/parcels/${parcelId}/documents`)
    .set("Cookie", c.LEGAL)
    .field("docType", "Certificate of Title")
    .attach("file", pdf(name), name);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const custody = (id: string, cookie: string, body: object) =>
  request(app).post(`/documents/${id}/custody`).set("Cookie", cookie).send(body);

const toBank = {
  action: "RELEASED",
  holderType: "BANK",
  holderName: "Sample Rural Bank",
  referenceNo: "LN-2026-0001",
  releaseDate: "2026-11-13",
  expectedReturnDate: "2027-11-13",
  note: "Collateral for loan",
};

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
  const p = await request(app).post("/parcels").set("Cookie", c.LEGAL).send({
    name: "Custody Lot",
    province: "Rizal",
    titleNo: "TCT T-12",
    areaHa: 1,
    lat: 14.6,
    lng: 121.2,
  });
  parcelId = p.body.id;
  await request(app).post(`/parcels/${parcelId}/approve`).set("Cookie", c.MANAGEMENT);
  await prisma.tenantAssignment.create({ data: { userId: ids.TENANT, parcelId } });
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("FR-13 custody actions (D7)", () => {
  it("Released to a bank sets WITH_THIRD_PARTY and records the holder, reference and dates", async () => {
    const id = await upload("t1.pdf");
    const res = await custody(id, c.LEGAL, toBank);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("WITH_THIRD_PARTY");
    expect(res.body.record).toMatchObject({
      action: "RELEASED",
      holderType: "BANK",
      holderName: "Sample Rural Bank",
      referenceNo: "LN-2026-0001",
      releaseDate: "2026-11-13",
      expectedReturnDate: "2027-11-13",
    });
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).status).toBe(
      "WITH_THIRD_PARTY",
    );

    const entry = await lastAudit("CUSTODY_UPDATED");
    expect(entry?.entityId).toBe(id);
    expect(JSON.parse(entry!.details!)).toEqual({
      action: "RELEASED",
      custodyRecordId: res.body.record.id,
      documentId: id,
    });
  });

  it("Released to a government office sets UNDER_PROCESSING and needs the processing stage (D6)", async () => {
    const id = await upload("t2.pdf");
    const base = {
      action: "RELEASED",
      holderType: "GOVERNMENT_OFFICE",
      holderName: "Registry of Deeds",
    };
    expect((await custody(id, c.LEGAL, base)).status).toBe(400);
    const res = await custody(id, c.LEGAL, {
      ...base,
      processingStage: "Annotation at Registry of Deeds",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("UNDER_PROCESSING");
  });

  it("Released to the company vault is refused (Released means leaving the company)", async () => {
    const id = await upload("t3.pdf");
    const res = await custody(id, c.LEGAL, { ...toBank, holderType: "COMPANY_VAULT" });
    expect(res.status).toBe(400);
  });

  it("Sent for processing sets UNDER_PROCESSING; the stage is required and at most 120 characters", async () => {
    const id = await upload("t4.pdf");
    const base = {
      action: "SENT_FOR_PROCESSING",
      holderType: "GOVERNMENT_OFFICE",
      holderName: "Assessor's Office",
    };
    expect((await custody(id, c.LEGAL, base)).status).toBe(400);
    expect((await custody(id, c.LEGAL, { ...base, processingStage: "x".repeat(121) })).status).toBe(
      400,
    );
    const res = await custody(id, c.LEGAL, { ...base, processingStage: "Tax declaration update" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("UNDER_PROCESSING");
  });

  it("Returned sets the holder to COMPANY_VAULT and the status to ACTIVE", async () => {
    const id = await upload("t5.pdf");
    await custody(id, c.LEGAL, toBank);
    const res = await custody(id, c.LEGAL, {
      action: "RETURNED",
      holderType: "BANK",
      holderName: "Legal Department vault",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.record.holderType).toBe("COMPANY_VAULT");
  });

  it("rejects unknown actions and holder types (fixed lists, D5)", async () => {
    const id = await upload("t6.pdf");
    expect((await custody(id, c.LEGAL, { ...toBank, action: "LOST" })).status).toBe(400);
    expect((await custody(id, c.LEGAL, { ...toBank, holderType: "LAWYER" })).status).toBe(400);
    expect((await custody(id, c.LEGAL, { ...toBank, holderName: "" })).status).toBe(400);
    expect(
      (
        await custody(id, c.LEGAL, {
          ...toBank,
          releaseDate: "2027-01-02",
          expectedReturnDate: "2027-01-01",
        })
      ).status,
    ).toBe(400);
  });

  it("refuses custody updates on a superseded version (409)", async () => {
    const id = await upload("t7.pdf");
    await request(app)
      .post(`/documents/${id}/replace`)
      .set("Cookie", c.LEGAL)
      .attach("file", pdf("t7-v2"), "t7-v2.pdf");
    expect((await custody(id, c.LEGAL, toBank)).status).toBe(409);
  });
});

describe("FR-13 custody history and roles (D7)", () => {
  it("keeps every update as a history row, newest first; Management and the assigned Tenant can view", async () => {
    const id = await upload("h1.pdf");
    await custody(id, c.LEGAL, toBank);
    await custody(id, c.LEGAL, {
      action: "RETURNED",
      holderType: "COMPANY_VAULT",
      holderName: "Legal Department vault",
    });
    for (const role of ["LEGAL", "MANAGEMENT", "TENANT"]) {
      const res = await request(app).get(`/documents/${id}/custody`).set("Cookie", c[role]);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ACTIVE");
      expect(res.body.current.holderType).toBe("COMPANY_VAULT");
      expect(res.body.history.map((r: { action: string }) => r.action)).toEqual([
        "RETURNED",
        "RELEASED",
      ]);
    }
  });

  it("keeps the custody history across a replace (same original, new scan)", async () => {
    const id = await upload("h2.pdf");
    await custody(id, c.LEGAL, toBank);
    const v2 = await request(app)
      .post(`/documents/${id}/replace`)
      .set("Cookie", c.LEGAL)
      .attach("file", pdf("h2-v2"), "h2-v2.pdf");
    expect(v2.body.status).toBe("WITH_THIRD_PARTY");
    const res = await request(app).get(`/documents/${v2.body.id}/custody`).set("Cookie", c.LEGAL);
    expect(res.body.history).toHaveLength(1);
  });

  it("custody records cannot be updated or deleted (DB trigger)", async () => {
    const id = await upload("h3.pdf");
    await custody(id, c.LEGAL, toBank);
    await expect(
      prisma.$executeRaw`UPDATE custody_records SET holder_name = 'x' WHERE document_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM custody_records WHERE document_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  it.each(["MANAGEMENT", "TENANT", "IT_ADMIN"])(
    "refuses a custody update by %s with 403 and ACCESS_DENIED",
    async (role) => {
      const id = await upload(`r-${role}.pdf`);
      const res = await custody(id, c[role], toBank);
      expect(res.status).toBe(403);
      expect((await lastAudit("ACCESS_DENIED"))?.actorId).toBe(ids[role]);
      expect((await prisma.document.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    },
  );

  it("IT cannot open custody records", async () => {
    const id = await upload("it.pdf");
    expect(
      (await request(app).get(`/documents/${id}/custody`).set("Cookie", c.IT_ADMIN)).status,
    ).toBe(403);
  });
});
