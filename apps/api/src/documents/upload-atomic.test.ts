// FR-10, FR-19 (review finding a): a document row, its file and its DOCUMENT_UPLOADED audit
// entry are saved together. If the audit write fails, no row and no file are left behind.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { config } from "../config.js";
import { makeUser, cookieFor } from "../test/helpers.js";
import * as chain from "../audit/chain.js";

const app = createApp();
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let legal = "";
let parcelId = "";

async function files() {
  return readdir(path.resolve(config.uploadDir)).catch(() => [] as string[]);
}

beforeAll(async () => {
  legal = await cookieFor(await makeUser("LEGAL"));
  const p = await request(app).post("/parcels").set("Cookie", legal).send({
    name: "Atomic Upload Lot",
    province: "Bulacan",
    titleNo: "TCT T-10",
    areaHa: 1,
    lat: 14.9,
    lng: 121,
  });
  parcelId = p.body.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await closeRedis();
  await prisma.$disconnect();
});

describe("upload is atomic", () => {
  it("leaves no document row and no file when the audit write fails", async () => {
    const before = await files();
    const spy = vi.spyOn(chain, "appendAudit").mockRejectedValueOnce(new Error("audit down"));
    const res = await request(app)
      .post(`/parcels/${parcelId}/documents`)
      .set("Cookie", legal)
      .field("docType", "Survey Plan")
      .attach("file", PDF, "sample.pdf");
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await prisma.document.count({ where: { parcelId } })).toBe(0);
    expect((await files()).sort()).toEqual(before.sort());
  });
});
