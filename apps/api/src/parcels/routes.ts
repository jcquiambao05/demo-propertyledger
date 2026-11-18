// FR-07 Parcel Record Registration, FR-08 approval workflow, FR-09 record view.
// Legal registers -> PENDING -> Management approves (APPROVED) or returns with remarks
// (RETURNED) -> Legal corrects and resubmits (PENDING). Every step is audited.
import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { appendAudit } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { assertLatLng, setParcelLocation } from "./geo.js";
import { readableParcel, visibleParcelIds, UUID } from "./access.js";

const READERS = ["LEGAL", "MANAGEMENT", "TENANT"] as const;

interface ParcelInput {
  name: string;
  province: string;
  region: string | null;
  municipality: string | null;
  titleNo: string | null;
  taxDecNo: string | null;
  classification: string | null;
  areaHa: number;
  lat: number;
  lng: number;
}

function text(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Server-side validation. Returns the cleaned input or an error message. */
export function parseParcel(body: Record<string, unknown>): ParcelInput | string {
  const name = text(body.name);
  const province = text(body.province, 100);
  if (!name || !province) return "Enter the parcel name and province.";
  const titleNo = text(body.titleNo, 60);
  const taxDecNo = text(body.taxDecNo, 60);
  // FR-07: identified by an OCT or TCT, or a tax declaration if untitled.
  if (!titleNo && !taxDecNo)
    return "Enter the title number (OCT or TCT) or the tax declaration number.";
  const areaHa = Number(body.areaHa);
  if (!Number.isFinite(areaHa) || areaHa <= 0 || areaHa > 100000)
    return "Enter the area in hectares.";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  try {
    assertLatLng({ lat, lng });
  } catch {
    return "Enter valid coordinates.";
  }
  return {
    name,
    province,
    region: text(body.region, 100),
    municipality: text(body.municipality, 100),
    titleNo,
    taxDecNo,
    classification: text(body.classification, 60),
    areaHa,
    lat,
    lng,
  };
}

async function withLocation(ids: string[]) {
  if (ids.length === 0) return new Map<string, { lat: number; lng: number }>();
  const rows = await prisma.$queryRaw<{ id: string; lat: number; lng: number }[]>`
    SELECT id::text AS id, ST_Y(location) AS lat, ST_X(location) AS lng
    FROM parcels WHERE id = ANY(${ids}::uuid[]) AND location IS NOT NULL`;
  return new Map(rows.map((r) => [r.id, { lat: r.lat, lng: r.lng }]));
}

type ParcelRow = Prisma.ParcelGetPayload<object>;

async function present(parcels: ParcelRow[]) {
  const loc = await withLocation(parcels.map((p) => p.id));
  return parcels.map((p) => ({
    id: p.id,
    name: p.name,
    province: p.province,
    region: p.region,
    municipality: p.municipality,
    titleNo: p.titleNo,
    taxDecNo: p.taxDecNo,
    classification: p.classification,
    areaHa: Number(p.areaHa),
    status: p.status,
    remarks: p.remarks,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    location: loc.get(p.id) ?? null,
  }));
}

async function presentOne(p: ParcelRow) {
  return (await present([p]))[0];
}

async function loadForDecision(res: Response, id: string) {
  if (!UUID.test(id)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const p = await prisma.parcel.findUnique({ where: { id } });
  if (!p) res.status(404).json({ error: "not_found" });
  return p;
}

const CUSTODY_SENTENCE: Record<string, (doc: string) => string> = {
  RELEASED: (doc) => `released ${doc} to a third party`,
  RETURNED: (doc) => `recorded that ${doc} was returned`,
  SENT_FOR_PROCESSING: (doc) => `sent ${doc} for processing`,
};

const SENTENCE: Record<string, (doc: string) => string> = {
  PARCEL_SUBMITTED: () => "submitted the parcel record",
  PARCEL_APPROVED: () => "approved the parcel record",
  PARCEL_RETURNED: () => "returned the parcel record with remarks",
  PARCEL_RESUBMITTED: () => "resubmitted the parcel record",
  DOCUMENT_UPLOADED: (doc) => `uploaded ${doc}`,
  DOCUMENT_VIEWED: (doc) => `viewed ${doc}`,
  DOCUMENT_DOWNLOADED: (doc) => `downloaded ${doc}`,
  DOCUMENT_REPLACED: (doc) => `uploaded a new version of ${doc}`,
  DOCUMENT_DELETED: (doc) => `deleted ${doc}`,
  INTEGRITY_FAIL: (doc) => `opened ${doc}, which failed the integrity check and was blocked`,
  ACCESS_DENIED: () => "was refused access",
  ISSUE_CREATED: () => "recorded a legal issue",
};

/** FR-09 (D9): one plain sentence per audit entry, e.g. "Rico Lim uploaded Survey Plan". */
function historySentence(
  actor: string,
  e: { action: string; details: string | null },
  doc = "a document",
): string {
  if (e.action === "ISSUE_STATUS_CHANGED") {
    const to = e.details ? (JSON.parse(e.details) as { to?: string }).to : undefined;
    return `${actor} changed a legal issue to ${(to ?? "a new status").toLowerCase().replace(/_/g, " ")}`;
  }
  if (e.action === "CUSTODY_UPDATED") {
    const action = e.details ? (JSON.parse(e.details) as { action?: string }).action : undefined;
    const f = action ? CUSTODY_SENTENCE[action] : undefined;
    return `${actor} ${f ? f(doc) : `updated the custody of ${doc}`}`;
  }
  const f = SENTENCE[e.action];
  return `${actor} ${f ? f(doc) : e.action.toLowerCase().replace(/_/g, " ")}`;
}

export function parcelsRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/parcels",
    READERS,
    h(async (_req, res) => {
      const visible = await visibleParcelIds(res);
      const parcels = await prisma.parcel.findMany({
        where: visible ? { id: { in: visible } } : {},
        orderBy: { name: "asc" },
      });
      res.json(await present(parcels));
    }),
  );

  route(
    r,
    "post",
    "/parcels",
    ["LEGAL"],
    h(async (req, res) => {
      const input = parseParcel(req.body ?? {});
      if (typeof input === "string") return res.status(400).json({ error: input });
      const user = currentUser(res);
      const { lat, lng, ...data } = input;
      const parcel = await prisma.$transaction(async (tx) => {
        const p = await tx.parcel.create({
          data: { ...data, areaHa: data.areaHa, createdById: user.id },
        });
        await setParcelLocation(tx, p.id, { lat, lng });
        await appendAudit(
          { actorId: user.id, action: "PARCEL_SUBMITTED", entity: "parcel", entityId: p.id },
          tx,
        );
        return p;
      });
      res.status(201).json(await presentOne(parcel));
    }),
  );

  route(
    r,
    "get",
    "/parcels/:id",
    READERS,
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const documents = await prisma.document.findMany({
        // FR-10 (D2, D3): current versions only; deleted documents are hidden.
        where: { parcelId: parcel.id, deletedAt: null, status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          docType: true,
          sizeBytes: true,
          integrityStatus: true,
          status: true,
          version: true,
          createdAt: true,
        },
      });
      res.json({ ...(await presentOne(parcel)), documents });
    }),
  );

  route(
    r,
    "get",
    "/parcels/:id/history",
    ["LEGAL", "MANAGEMENT"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      // All documents of the parcel, deleted and older versions included: history is complete.
      const docs = await prisma.document.findMany({
        where: { parcelId: parcel.id },
        select: { id: true, docType: true, fileName: true },
      });
      const docIds = docs.map((d) => d.id);
      const docLabel = new Map(docs.map((d) => [d.id, d.docType ?? d.fileName]));
      const issueIds = (
        await prisma.issue.findMany({ where: { parcelId: parcel.id }, select: { id: true } })
      ).map((i) => i.id);
      const entries = await prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: "parcel", entityId: parcel.id },
            { entity: "document", entityId: { in: docIds } },
            { entity: "issue", entityId: { in: issueIds } },
          ],
        },
        orderBy: { id: "asc" },
      });
      const actors = await prisma.user.findMany({
        where: { id: { in: entries.map((e) => e.actorId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      });
      const names = new Map(actors.map((a) => [a.id, a.name]));
      res.json(
        entries.map((e) => {
          const actor = e.actorId ? (names.get(e.actorId) ?? "Unknown user") : "System";
          return {
            id: e.id.toString(),
            action: e.action,
            entity: e.entity,
            entityId: e.entityId,
            actor,
            // D9: plain language, no hashes.
            text: historySentence(actor, e, e.entityId ? docLabel.get(e.entityId) : undefined),
            createdAt: e.createdAt,
          };
        }),
      );
    }),
  );

  route(
    r,
    "get",
    "/approvals",
    ["MANAGEMENT"],
    h(async (_req, res) => {
      const pending = await prisma.parcel.findMany({
        where: { status: "PENDING" },
        orderBy: { updatedAt: "asc" },
      });
      res.json(await present(pending));
    }),
  );

  route(
    r,
    "post",
    "/parcels/:id/approve",
    ["MANAGEMENT"],
    h(async (req, res) => {
      const p = await loadForDecision(res, req.params.id);
      if (!p) return;
      const user = currentUser(res);
      const changed = await prisma.$transaction(async (tx) => {
        const updated = await tx.parcel.updateMany({
          where: { id: p.id, status: "PENDING" },
          data: { status: "APPROVED", remarks: null },
        });
        if (updated.count === 0) return false;
        await appendAudit(
          { actorId: user.id, action: "PARCEL_APPROVED", entity: "parcel", entityId: p.id },
          tx,
        );
        return true;
      });
      if (!changed)
        return res
          .status(409)
          .json({ error: "Only records waiting for approval can be approved." });
      res.json(await presentOne(await prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })));
    }),
  );

  route(
    r,
    "post",
    "/parcels/:id/return",
    ["MANAGEMENT"],
    h(async (req, res) => {
      const remarks = text(req.body?.remarks, 1000);
      if (!remarks)
        return res.status(400).json({ error: "Remarks are required to return a record." });
      const p = await loadForDecision(res, req.params.id);
      if (!p) return;
      const user = currentUser(res);
      const changed = await prisma.$transaction(async (tx) => {
        const updated = await tx.parcel.updateMany({
          where: { id: p.id, status: "PENDING" },
          data: { status: "RETURNED", remarks },
        });
        if (updated.count === 0) return false;
        await appendAudit(
          { actorId: user.id, action: "PARCEL_RETURNED", entity: "parcel", entityId: p.id },
          tx,
        );
        return true;
      });
      if (!changed)
        return res
          .status(409)
          .json({ error: "Only records waiting for approval can be returned." });
      res.json(await presentOne(await prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })));
    }),
  );

  route(
    r,
    "post",
    "/parcels/:id/resubmit",
    ["LEGAL"],
    h(async (req, res) => {
      const p = await loadForDecision(res, req.params.id);
      if (!p) return;
      if (p.status !== "RETURNED")
        return res.status(409).json({ error: "Only returned records can be resubmitted." });
      const input = parseParcel(req.body ?? {});
      if (typeof input === "string") return res.status(400).json({ error: input });
      const { lat, lng, ...data } = input;
      const user = currentUser(res);
      const ok = await prisma.$transaction(async (tx) => {
        const u = await tx.parcel.updateMany({
          where: { id: p.id, status: "RETURNED" },
          data: { ...data, status: "PENDING" },
        });
        if (u.count === 0) return false;
        await setParcelLocation(tx, p.id, { lat, lng });
        await appendAudit(
          { actorId: user.id, action: "PARCEL_RESUBMITTED", entity: "parcel", entityId: p.id },
          tx,
        );
        return true;
      });
      if (!ok) return res.status(409).json({ error: "Only returned records can be resubmitted." });
      res.json(await presentOne(await prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })));
    }),
  );

  return r;
}
