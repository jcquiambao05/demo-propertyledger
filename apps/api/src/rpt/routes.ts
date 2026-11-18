// FR-15 RPT schedules and official receipt entry — docs/build/DECISIONS.md D11.
// Quarterly due dates (STUDY_CONTEXT §6 module 8). Marking a period paid needs the LGU official
// receipt number; the scanned OR may be linked as a document of the same parcel. Legal writes;
// Management and assigned Tenants read; IT refused (§4).
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { appendAudit } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { readableParcel, UUID } from "../parcels/access.js";
import { todayManila } from "../documents/document-types.js";
import { addDays, runConfiguredCheck } from "./alerts.js";

const QUARTER_END = ["03-31", "06-30", "09-30", "12-31"];
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type Row = Prisma.RptScheduleGetPayload<object>;

/** OVERDUE is shown as soon as an unpaid period passes its due date, before the daily job runs. */
function present(s: Row, today = todayManila()) {
  const due = ymd(s.dueDate)!;
  const status = s.status === "PAID" ? "PAID" : due < today ? "OVERDUE" : "UNPAID";
  return {
    id: s.id,
    parcelId: s.parcelId,
    year: s.year,
    quarter: s.quarter,
    amount: s.amount.toFixed(2),
    dueDate: due,
    status,
    orNumber: s.orNumber,
    paidDate: ymd(s.paidDate),
    receiptDocumentId: s.receiptDocumentId,
  };
}

function validDate(v: unknown): Date | null {
  if (typeof v !== "string" || !DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || ymd(d) !== v ? null : d;
}

export function rptRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/parcels/:id/rpt",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const rows = await prisma.rptSchedule.findMany({
        where: { parcelId: parcel.id },
        orderBy: [{ year: "desc" }, { quarter: "desc" }],
      });
      const today = todayManila();
      res.json(rows.map((s) => present(s, today)));
    }),
  );

  route(
    r,
    "post",
    "/parcels/:id/rpt",
    ["LEGAL"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const year = Number(req.body?.year);
      const quarter = Number(req.body?.quarter);
      const amount = String(req.body?.amount ?? "");
      if (!Number.isInteger(year) || year < 2000 || year > 2100)
        return res.status(400).json({ error: "Enter a year between 2000 and 2100." });
      if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4)
        return res.status(400).json({ error: "Choose a quarter from 1 to 4." });
      if (!AMOUNT.test(amount))
        return res.status(400).json({ error: "Enter the amount in pesos, e.g. 62500.00." });
      const user = currentUser(res);
      try {
        const row = await prisma.$transaction(async (tx) => {
          const s = await tx.rptSchedule.create({
            data: {
              parcelId: parcel.id,
              year,
              quarter,
              amount: new Prisma.Decimal(amount),
              dueDate: new Date(`${year}-${QUARTER_END[quarter - 1]}T00:00:00.000Z`),
              createdById: user.id,
            },
          });
          await appendAudit(
            {
              actorId: user.id,
              action: "RPT_SCHEDULE_ADDED",
              entity: "rpt_schedule",
              entityId: s.id,
              details: { rptScheduleId: s.id, parcelId: parcel.id },
            },
            tx,
          );
          return s;
        });
        res.status(201).json(present(row));
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
          return res.status(409).json({ error: "This period is already on the schedule." });
        throw e;
      }
    }),
  );

  route(
    r,
    "post",
    "/rpt/:id/pay",
    ["LEGAL"],
    h(async (req, res) => {
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: "not_found" });
      const s = await prisma.rptSchedule.findUnique({ where: { id: req.params.id } });
      if (!s) return res.status(404).json({ error: "not_found" });
      const parcel = await readableParcel(res, s.parcelId);
      if (!parcel) return;
      const orNumber =
        typeof req.body?.orNumber === "string" ? req.body.orNumber.trim().slice(0, 60) : "";
      if (!orNumber)
        return res.status(400).json({ error: "Enter the LGU official receipt number." });
      const paidDate = validDate(req.body?.paidDate);
      if (!paidDate)
        return res.status(400).json({ error: "Enter the payment date as YYYY-MM-DD." });
      let receiptDocumentId: string | null = null;
      if (req.body?.documentId) {
        const doc =
          typeof req.body.documentId === "string" && UUID.test(req.body.documentId)
            ? await prisma.document.findUnique({ where: { id: req.body.documentId } })
            : null;
        if (!doc || doc.parcelId !== s.parcelId || doc.deletedAt)
          return res.status(400).json({ error: "Link a document of this property." });
        receiptDocumentId = doc.id;
      }
      const user = currentUser(res);
      const row = await prisma.$transaction(async (tx) => {
        const u = await tx.rptSchedule.updateMany({
          where: { id: s.id, status: { not: "PAID" } },
          data: { status: "PAID", orNumber, paidDate, receiptDocumentId },
        });
        if (u.count === 0) return null;
        await appendAudit(
          {
            actorId: user.id,
            action: "RPT_MARKED_PAID",
            entity: "rpt_schedule",
            entityId: s.id,
            details: { rptScheduleId: s.id, parcelId: s.parcelId, receiptDocumentId },
          },
          tx,
        );
        return tx.rptSchedule.findUniqueOrThrow({ where: { id: s.id } });
      });
      if (!row) return res.status(409).json({ error: "This period is already marked paid." });
      res.json(present(row));
    }),
  );

  // Due dates page (DEMO_PAGES page 24): overdue first, then the next 90 days.
  route(
    r,
    "get",
    "/due-dates",
    ["LEGAL", "MANAGEMENT"],
    h(async (_req, res) => {
      const today = todayManila();
      const until = new Date(`${addDays(today, 90)}T00:00:00.000Z`);
      const rpt = await prisma.rptSchedule.findMany({
        where: { status: { not: "PAID" }, dueDate: { lte: until } },
        include: { parcel: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      });
      const docs = await prisma.document.findMany({
        where: {
          deletedAt: null,
          status: { not: "SUPERSEDED" },
          expiresOn: { not: null, lte: until },
        },
        include: { parcel: { select: { name: true } } },
        orderBy: { expiresOn: "asc" },
      });
      const items = [
        ...rpt.map((s) => ({
          kind: "RPT" as const,
          id: s.id,
          parcelId: s.parcelId,
          parcelName: s.parcel.name,
          label: `RPT ${s.year} Q${s.quarter}`,
          date: ymd(s.dueDate)!,
          amount: s.amount.toFixed(2),
        })),
        ...docs.map((d) => ({
          kind: "DOCUMENT_EXPIRY" as const,
          id: d.id,
          parcelId: d.parcelId,
          parcelName: d.parcel.name,
          label: d.docType ?? "Document",
          date: ymd(d.expiresOn)!,
          amount: null,
        })),
      ]
        .map((i) => ({ ...i, overdue: i.date < today }))
        .sort((a, b) => a.date.localeCompare(b.date));
      res.json({ today, items });
    }),
  );

  // D11: "Run check now" for the demo — the same job as the daily scheduler.
  route(
    r,
    "post",
    "/alerts/run",
    ["LEGAL"],
    h(async (_req, res) => {
      res.json(await runConfiguredCheck());
    }),
  );

  return r;
}
