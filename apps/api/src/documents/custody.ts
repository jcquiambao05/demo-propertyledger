// FR-13 document status and custody tracking of originals — docs/build/DECISIONS.md D4–D7.
// Actions: Released, Returned, Sent for processing. Every update is a new custody_records row
// (append-only, DB trigger). Legal Department updates; Management and assigned Tenants view;
// IT cannot open custody records (STUDY_CONTEXT §4).
import { Router } from "express";
import type { CustodyAction, DocumentStatus, HolderType } from "@prisma/client";
import { prisma } from "../db.js";
import { appendAudit } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { readableDocument } from "./routes.js";
import { readableParcel } from "../parcels/access.js";

const ACTIONS: CustodyAction[] = ["RELEASED", "RETURNED", "SENT_FOR_PROCESSING"];
const HOLDERS: HolderType[] = ["COMPANY_VAULT", "BANK", "GOVERNMENT_OFFICE"];
const STAGE_MAX = 120; // D6
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Input {
  action: CustodyAction;
  holderType: HolderType;
  holderName: string;
  referenceNo: string | null;
  releaseDate: Date | null;
  expectedReturnDate: Date | null;
  processingStage: string | null;
  note: string | null;
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function date(v: unknown): Date | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v)) return "invalid";
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? "invalid" : d;
}

/** Status after the action (D7). Returns an error message when the combination is not allowed. */
function nextStatus(i: Input): DocumentStatus | string {
  switch (i.action) {
    case "RELEASED":
      if (i.holderType === "BANK") return "WITH_THIRD_PARTY";
      if (i.holderType === "GOVERNMENT_OFFICE") return "UNDER_PROCESSING";
      return "Released means the original leaves the company. Choose a bank or a government office.";
    case "SENT_FOR_PROCESSING":
      return "UNDER_PROCESSING";
    case "RETURNED":
      return "ACTIVE";
  }
}

function parse(body: Record<string, unknown>): Input | string {
  const action = body.action as CustodyAction;
  if (!ACTIONS.includes(action)) return "Choose Released, Returned or Sent for processing.";
  // D7: Returned always puts the original back in the company vault.
  const holderType = action === "RETURNED" ? "COMPANY_VAULT" : (body.holderType as HolderType);
  if (!HOLDERS.includes(holderType)) return "Choose who holds the original.";
  const holderName = text(body.holderName, 200);
  if (!holderName) return "Enter the holder's name.";
  const rawStage = typeof body.processingStage === "string" ? body.processingStage.trim() : "";
  if (rawStage.length > STAGE_MAX)
    return `The processing stage can have up to ${STAGE_MAX} characters.`;
  const releaseDate = date(body.releaseDate);
  const expectedReturnDate = date(body.expectedReturnDate);
  if (releaseDate === "invalid" || expectedReturnDate === "invalid")
    return "Enter dates as YYYY-MM-DD.";
  if (releaseDate && expectedReturnDate && expectedReturnDate < releaseDate)
    return "The expected return date cannot be before the release date.";
  return {
    action,
    holderType,
    holderName,
    referenceNo: text(body.referenceNo, 100),
    releaseDate,
    expectedReturnDate,
    processingStage: rawStage || null,
    note: text(body.note, 1000),
  };
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function present(r: {
  id: string;
  action: CustodyAction;
  holderType: HolderType;
  holderName: string;
  referenceNo: string | null;
  releaseDate: Date | null;
  expectedReturnDate: Date | null;
  processingStage: string | null;
  note: string | null;
  statusAfter: DocumentStatus;
  createdAt: Date;
  recordedBy?: { name: string };
}) {
  return {
    id: r.id,
    action: r.action,
    holderType: r.holderType,
    holderName: r.holderName,
    referenceNo: r.referenceNo,
    releaseDate: iso(r.releaseDate),
    expectedReturnDate: iso(r.expectedReturnDate),
    processingStage: r.processingStage,
    note: r.note,
    statusAfter: r.statusAfter,
    recordedBy: r.recordedBy?.name ?? null,
    createdAt: r.createdAt,
  };
}

export function custodyRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/documents/:id/custody",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (req, res) => {
      const doc = await readableDocument(res, req.params.id);
      if (!doc) return;
      // The original is the same across scan versions, so history covers the whole group.
      const history = await prisma.custodyRecord.findMany({
        where: { document: { groupId: doc.groupId } },
        orderBy: { createdAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      });
      res.json({
        status: doc.status,
        current: history[0] ? present(history[0]) : null,
        history: history.map(present),
      });
    }),
  );

  // FR-09 (D9) Custody tab: each current document of the parcel with its status and holder.
  route(
    r,
    "get",
    "/parcels/:id/custody",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const docs = await prisma.document.findMany({
        where: { parcelId: parcel.id, deletedAt: null, status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, groupId: true, docType: true, fileName: true, status: true },
      });
      const records = await prisma.custodyRecord.findMany({
        where: { document: { groupId: { in: docs.map((d) => d.groupId) } } },
        orderBy: { createdAt: "desc" },
        include: { document: { select: { groupId: true } } },
      });
      const latest = new Map<string, (typeof records)[number]>();
      for (const rec of records)
        if (!latest.has(rec.document.groupId)) latest.set(rec.document.groupId, rec);
      res.json(
        docs.map((d) => {
          const rec = latest.get(d.groupId);
          return {
            documentId: d.id,
            label: d.docType ?? d.fileName,
            status: d.status,
            action: rec?.action ?? null,
            holderType: rec?.holderType ?? null,
            holderName: rec?.holderName ?? null,
            expectedReturnDate: rec ? iso(rec.expectedReturnDate) : null,
            processingStage: rec?.processingStage ?? null,
            updatedAt: rec?.createdAt ?? null,
          };
        }),
      );
    }),
  );

  route(
    r,
    "post",
    "/documents/:id/custody",
    ["LEGAL"],
    h(async (req, res) => {
      const doc = await readableDocument(res, req.params.id);
      if (!doc) return;
      const input = parse(req.body ?? {});
      if (typeof input === "string") return res.status(400).json({ error: input });
      const status = nextStatus(input);
      if (!["ACTIVE", "UNDER_PROCESSING", "WITH_THIRD_PARTY"].includes(status))
        return res.status(400).json({ error: status });
      // D6: the processing stage is required whenever the status becomes UNDER_PROCESSING.
      if (status === "UNDER_PROCESSING" && !input.processingStage)
        return res.status(400).json({ error: "Enter the processing stage." });
      const user = currentUser(res);

      const record = await prisma.$transaction(async (tx) => {
        // Guarded: only the current, not deleted version can change custody.
        const updated = await tx.document.updateMany({
          where: { id: doc.id, status: { not: "SUPERSEDED" }, deletedAt: null },
          data: { status: status as DocumentStatus },
        });
        if (updated.count === 0) return null;
        const rec = await tx.custodyRecord.create({
          data: {
            ...input,
            documentId: doc.id,
            statusAfter: status as DocumentStatus,
            recordedById: user.id,
          },
        });
        await appendAudit(
          {
            actorId: user.id,
            action: "CUSTODY_UPDATED",
            entity: "document",
            entityId: doc.id,
            details: { documentId: doc.id, custodyRecordId: rec.id, action: input.action },
          },
          tx,
        );
        return rec;
      });
      if (!record)
        return res
          .status(409)
          .json({ error: "Update custody on the current version of this document." });
      res.status(201).json({ status, record: present(record) });
    }),
  );

  return r;
}
