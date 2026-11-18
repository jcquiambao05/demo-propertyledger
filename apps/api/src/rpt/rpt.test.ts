// FR-15 RPT schedules, official receipt entry, and due-date / expiry alerts — DECISIONS D11.
// STUDY_CONTEXT §6 module 8 (quarterly due dates; staff record the LGU official receipt) and
// module 2 (red = overdue tax; amber = due within 30 days).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor, lastAudit } from "../test/helpers.js";
import { runDueDateCheck } from "./alerts.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
let n = 0;

const pdf = (s: string) => Buffer.from(`%PDF-1.4\n% synthetic ${s}\ntrailer<<>>\n%%EOF\n`);

async function newParcel() {
  const p = await request(app)
    .post("/parcels")
    .set("Cookie", c.LEGAL)
    .send({
      name: `RPT Lot ${++n} ${Date.now()}`,
      province: "Rizal",
      titleNo: `TCT T-R${n}`,
      areaHa: 1,
      lat: 14.6,
      lng: 121.2,
    });
  await request(app).post(`/parcels/${p.body.id}/approve`).set("Cookie", c.MANAGEMENT);
  return p.body.id as string;
}

const addRpt = (parcelId: string, body: object, role = "LEGAL") =>
  request(app).post(`/parcels/${parcelId}/rpt`).set("Cookie", c[role]).send(body);

/** A Date at 07:00 Asia/Manila on the given day. */
const manila = (ymd: string) => new Date(`${ymd}T07:00:00+08:00`);

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

describe("FR-15 RPT schedules (D11)", () => {
  it("derives the quarterly due date (Mar 31, Jun 30, Sep 30, Dec 31) and refuses a duplicate period", async () => {
    const id = await newParcel();
    const res = await addRpt(id, { year: 2026, quarter: 3, amount: "62500.00" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      year: 2026,
      quarter: 3,
      amount: "62500.00",
      dueDate: "2026-09-30",
    });
    expect((await addRpt(id, { year: 2026, quarter: 3, amount: "1.00" })).status).toBe(409);
    expect((await addRpt(id, { year: 2026, quarter: 5, amount: "1.00" })).status).toBe(400);
    expect((await addRpt(id, { year: 2026, quarter: 1, amount: "-5" })).status).toBe(400);
    expect(await lastAudit("RPT_SCHEDULE_ADDED")).toBeTruthy();
  });

  it("shows an unpaid period past its due date as OVERDUE", async () => {
    const id = await newParcel();
    await addRpt(id, { year: 2020, quarter: 4, amount: "100.00" });
    const list = await request(app).get(`/parcels/${id}/rpt`).set("Cookie", c.MANAGEMENT);
    expect(list.status).toBe(200);
    expect(list.body[0].status).toBe("OVERDUE");
  });

  it("marks a period paid only with the LGU official receipt number", async () => {
    const id = await newParcel();
    const s = (await addRpt(id, { year: 2026, quarter: 4, amount: "12225.00" })).body;
    const pay = (body: object) =>
      request(app).post(`/rpt/${s.id}/pay`).set("Cookie", c.LEGAL).send(body);
    expect((await pay({ paidDate: "2026-11-13" })).status).toBe(400);
    const ok = await pay({ orNumber: "OR-0099123", paidDate: "2026-11-13" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      status: "PAID",
      orNumber: "OR-0099123",
      paidDate: "2026-11-13",
    });
    expect((await pay({ orNumber: "OR-2", paidDate: "2026-11-13" })).status).toBe(409);
    expect(await lastAudit("RPT_MARKED_PAID")).toBeTruthy();
  });

  it("links the scanned official receipt when it is a document of the same parcel", async () => {
    const id = await newParcel();
    const other = await newParcel();
    const s = (await addRpt(id, { year: 2027, quarter: 1, amount: "500.00" })).body;
    const up = (parcelId: string) =>
      request(app)
        .post(`/parcels/${parcelId}/documents`)
        .set("Cookie", c.LEGAL)
        .field("docType", "RPT Official Receipt")
        .attach("file", pdf(`or-${parcelId}`), "or.pdf");
    const foreign = (await up(other)).body.id;
    const own = (await up(id)).body.id;
    const pay = (documentId: string) =>
      request(app)
        .post(`/rpt/${s.id}/pay`)
        .set("Cookie", c.LEGAL)
        .send({ orNumber: "OR-1", paidDate: "2027-03-01", documentId });
    expect((await pay(foreign)).status).toBe(400);
    const ok = await pay(own);
    expect(ok.status).toBe(200);
    expect(ok.body.receiptDocumentId).toBe(own);
  });

  it.each(["MANAGEMENT", "TENANT", "IT_ADMIN"])(
    "refuses schedule writes by %s with 403",
    async (role) => {
      const id = await newParcel();
      expect((await addRpt(id, { year: 2026, quarter: 1, amount: "1.00" }, role)).status).toBe(403);
      expect((await lastAudit("ACCESS_DENIED"))?.actorId).toBe(ids[role]);
    },
  );

  it("turns the map marker red for overdue tax", async () => {
    const overdue = await newParcel();
    await addRpt(overdue, { year: 2020, quarter: 1, amount: "1.00" });
    const markers = (await request(app).get("/parcels/map").set("Cookie", c.LEGAL)).body as {
      id: string;
      problem: string | null;
    }[];
    expect(markers.find((m) => m.id === overdue)?.problem).toBe("overdue");
  });
});

describe("FR-15 daily due-date and expiry check (D11)", () => {
  it("sends one alert each at 30, 7 and 0 days for unpaid RPT, never twice for the same day", async () => {
    const id = await newParcel();
    const s = (await addRpt(id, { year: 2031, quarter: 2, amount: "1000.00" })).body; // due 2031-06-30
    const send = vi.fn().mockResolvedValue(undefined);
    const run = (ymd: string) =>
      runDueDateCheck({ now: manila(ymd), send, recipients: ["legal@xcement.example"] });

    await run("2031-05-31"); // 30 days before
    await run("2031-05-31"); // same day again: no duplicate
    await run("2031-06-01"); // no alert day
    await run("2031-06-23"); // 7 days before
    await run("2031-06-30"); // due date
    const mine = send.mock.calls.filter(([m]) => m.itemId === s.id);
    expect(mine.map(([m]) => m.daysBefore)).toEqual([30, 7, 0]);
    const msg = mine[0][0];
    expect(msg.to).toEqual(["legal@xcement.example"]);
    expect(msg.text).toContain("2031-06-30");
    const entry = await lastAudit("ALERT_SENT");
    expect(JSON.parse(entry!.details!)).toMatchObject({ kind: "RPT", daysBefore: 0 });
  });

  it("alerts for an expiring time-bound document and marks it EXPIRED after the date", async () => {
    const id = await newParcel();
    const doc = (
      await request(app)
        .post(`/parcels/${id}/documents`)
        .set("Cookie", c.LEGAL)
        .field("docType", "Tax Clearance")
        .field("expiresOn", "2032-12-01")
        .attach("file", pdf(`tc-${id}`), "tc.pdf")
    ).body;
    const send = vi.fn().mockResolvedValue(undefined);
    await runDueDateCheck({
      now: manila("2032-11-24"),
      send,
      recipients: ["legal@xcement.example"],
    });
    expect(
      send.mock.calls.some(
        ([m]) => m.kind === "DOCUMENT_EXPIRY" && m.itemId === doc.id && m.daysBefore === 7,
      ),
    ).toBe(true);
    await runDueDateCheck({
      now: manila("2032-12-02"),
      send,
      recipients: ["legal@xcement.example"],
    });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe(
      "EXPIRED",
    );
  });

  it("skips sending (and logs a warning) when email is not configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await runDueDateCheck({ now: manila("2026-11-13"), send: null, recipients: [] });
    expect(result.skipped).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("'Run check now' is for the Legal Department only", async () => {
    expect((await request(app).post("/alerts/run").set("Cookie", c.LEGAL)).status).toBe(200);
    expect((await request(app).post("/alerts/run").set("Cookie", c.MANAGEMENT)).status).toBe(403);
  });
});
