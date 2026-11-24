// FR-10 document repository: upload, list, view, download, replace (new version, D2) and
// soft delete (D3) — docs/build/DECISIONS.md.
// FR-12 integrity: SHA-256 at upload, recomputed on EVERY view and download. On mismatch the
// file is blocked, marked FAILED and INTEGRITY_FAIL is logged. Files live outside the public
// folder and are served only through this API (STUDY_CONTEXT §8).
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Document, DocumentStatus, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config, security } from "../config.js";
import { appendAudit } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { readableParcel, UUID } from "../parcels/access.js";
import { findType, type DocumentType } from "./document-types.js";

const READERS = ["LEGAL", "MANAGEMENT", "TENANT"] as const;

const CUSTODY_LABEL: Record<string, string> = {
  RELEASED: "Released to third party",
  RETURNED: "Returned to company vault",
  SENT_FOR_PROCESSING: "Sent to government office for processing",
};

const HOLDER_LABEL: Record<string, string> = {
  COMPANY_VAULT: "Company Vault",
  BANK: "Bank",
  GOVERNMENT_OFFICE: "Government Office",
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  DOCUMENT_UPLOADED: "Uploaded document",
  DOCUMENT_VIEWED: "Viewed document",
  DOCUMENT_DOWNLOADED: "Downloaded document",
  DOCUMENT_REPLACED: "Uploaded new version",
  DOCUMENT_DELETED: "Removed document",
  CUSTODY_UPDATED: "Updated physical custody",
  INTEGRITY_FAIL: "Integrity check failed",
  PARCEL_SUBMITTED: "Submitted property record",
  PARCEL_APPROVED: "Approved property record",
  PARCEL_RETURNED: "Returned property record for changes",
  PARCEL_RESUBMITTED: "Updated and resubmitted property record",
};

interface SnapshotDocItem {
  id: string;
  fileName: string;
  docType: string | null;
  version: number;
  status: string;
  sha256: string;
  sizeBytes: number;
  expiresOn: string | null;
  createdAt: Date;
}

interface ArchivalSnapshot {
  snapshotAt: Date;
  parcelState: {
    id: string;
    name: string;
    region: string | null;
    province: string;
    municipality: string | null;
    titleNo: string | null;
    taxDecNo: string | null;
    classification: string | null;
    areaHa: number;
    status: string;
    remarks: string | null;
  };
  focusDocument: {
    id: string | null;
    fileName: string | null;
    docType: string | null;
    version: number | null;
    status: string;
    sha256: string | null;
    sizeBytes: number | null;
    expiresOn: string | null;
    custodyHolder: string | null;
    custodyAction: string | null;
    processingStage: string | null;
    reviewNote: string | null;
  } | null;
  activeDocumentsAtTime: SnapshotDocItem[];
}

interface HistoryEventItem {
  id: string;
  category:
    | "PROPERTY_LIFECYCLE"
    | "MANAGEMENT_REVIEW"
    | "DOCUMENT_REVISION"
    | "CUSTODY_TRANSFER";
  categoryLabel: string;
  title: string;
  description: string;
  reviewNote?: string | null;
  documentId: string | null;
  documentName: string | null;
  docType: string | null;
  version: number | null;
  status: string;
  actor: string;
  createdAt: Date;
  snapshot: ArchivalSnapshot;
}

interface DocumentLogItem {
  id: string;
  action: string;
  actionLabel: string;
  actor: string;
  actorRole: string;
  documentId: string | null;
  documentName: string;
  docType: string | null;
  version: number | null;
  status: string;
  summary: string;
  createdAt: Date;
}

async function buildDocumentTracking(parcelId: string, filterGroupId?: string) {
  const parcel = await prisma.parcel.findUniqueOrThrow({
    where: { id: parcelId },
  });

  const allDocs = await prisma.document.findMany({
    where: {
      parcelId,
      ...(filterGroupId ? { groupId: filterGroupId } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { version: "asc" }],
  });

  const docIds = allDocs.map((d) => d.id);
  const docById = new Map(allDocs.map((d) => [d.id, d]));

  const custodyRows =
    docIds.length > 0
      ? await prisma.custodyRecord.findMany({
          where: { documentId: { in: docIds } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const auditEntries = await prisma.auditLog.findMany({
    where: {
      OR: [
        ...(docIds.length > 0 ? [{ entity: "document", entityId: { in: docIds } }] : []),
        { entity: "parcel", entityId: parcelId },
      ],
    },
    orderBy: { id: "asc" },
  });

  const userIds = new Set<string>();
  userIds.add(parcel.createdById);
  for (const d of allDocs) {
    userIds.add(d.uploadedById);
    if (d.deletedById) userIds.add(d.deletedById);
  }
  for (const c of custodyRows) userIds.add(c.recordedById);
  for (const a of auditEntries) {
    if (a.actorId) userIds.add(a.actorId);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true, role: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Helper to safely parse JSON audit details
  function parseDetails<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // Helper to reconstruct historical parcel status & remarks at a given timestamp
  const parcelTimeline = auditEntries
    .filter((e) => e.entity === "parcel")
    .map((e) => {
      const det = parseDetails<{ remarks?: string }>(e.details);
      return {
        at: e.createdAt.getTime(),
        action: e.action,
        remarks: det?.remarks ?? null,
      };
    });

  function parcelStateAt(timestamp: Date): { status: string; remarks: string | null } {
    const t = timestamp.getTime();
    let status: string | null = null;
    let remarks: string | null = null;
    for (const ev of parcelTimeline) {
      if (ev.at > t) break;
      if (ev.action === "PARCEL_SUBMITTED" || ev.action === "PARCEL_RESUBMITTED") {
        status = "PENDING";
      } else if (ev.action === "PARCEL_RETURNED") {
        status = "RETURNED";
        if (ev.remarks) remarks = ev.remarks;
      } else if (ev.action === "PARCEL_APPROVED") {
        status = "APPROVED";
        remarks = null;
      }
    }
    return {
      status: status ?? parcel.status,
      remarks: status === null ? parcel.remarks : remarks,
    };
  }

  // Helper to compute the active document set as it existed at a given timestamp
  function computeActiveDocsAt(timestamp: Date): SnapshotDocItem[] {
    const byGroup = new Map<string, (typeof allDocs)[number]>();
    for (const d of allDocs) {
      if (d.createdAt.getTime() > timestamp.getTime()) continue;
      if (d.deletedAt && d.deletedAt.getTime() <= timestamp.getTime()) {
        byGroup.delete(d.groupId);
        continue;
      }
      const prev = byGroup.get(d.groupId);
      if (!prev || d.version >= prev.version) {
        byGroup.set(d.groupId, d);
      }
    }
    return Array.from(byGroup.values()).map((d) => ({
      id: d.id,
      fileName: d.fileName,
      docType: d.docType,
      version: d.version,
      status: d.status === "SUPERSEDED" ? "ACTIVE" : d.status,
      sha256: d.sha256,
      sizeBytes: d.sizeBytes,
      expiresOn: d.expiresOn ? d.expiresOn.toISOString().slice(0, 10) : null,
      createdAt: d.createdAt,
    }));
  }

  // 1. DOCUMENT HISTORY: Strictly an archival "museum" record of how the document & property record evolved over time
  // (ordered earliest -> latest). Never includes user view/download activity logs.
  const history: HistoryEventItem[] = [];

  for (const e of auditEntries) {
    if (e.entity !== "parcel") continue;
    const actor = e.actorId ? (userMap.get(e.actorId)?.name ?? "Authorized User") : "System";
    const areaSqm = Math.round(Number(parcel.areaHa) * 10000).toLocaleString("en-US");
    let title = "Property record updated";
    let description = `Record "${parcel.name}" (${parcel.titleNo || parcel.taxDecNo || "Untitled"}) was updated.`;
    let status: string = parcel.status;
    let category: HistoryEventItem["category"] = "PROPERTY_LIFECYCLE";
    let categoryLabel = "Title & Property Record";
    let reviewNote: string | null = null;

    if (e.action === "PARCEL_SUBMITTED") {
      title = "Property & title record registered";
      description = `Initial property registration for "${parcel.name}" (${parcel.titleNo || parcel.taxDecNo || "Untitled"}, ${areaSqm} m² in ${parcel.province}).`;
      status = "PENDING";
    } else if (e.action === "PARCEL_APPROVED") {
      category = "MANAGEMENT_REVIEW";
      categoryLabel = "Management Approval";
      title = "Management approved property & title record";
      description = `${actor} verified and approved "${parcel.name}" for the active registry.`;
      status = "APPROVED";
    } else if (e.action === "PARCEL_RETURNED") {
      const det = parseDetails<{ remarks?: string }>(e.details);
      category = "MANAGEMENT_REVIEW";
      categoryLabel = "Management Review Note";
      title = "Management returned record with review note";
      reviewNote = det?.remarks || parcel.remarks || null;
      description = reviewNote
        ? `Management review note: "${reviewNote}"`
        : "Returned to Legal for record and document updates.";
      status = "RETURNED";
    } else if (e.action === "PARCEL_RESUBMITTED") {
      title = "Property record revised and resubmitted";
      description = `Updated property details for "${parcel.name}" and sent back for management review.`;
      status = "PENDING";
    }

    const histParcel = parcelStateAt(e.createdAt);
    history.push({
      id: `hist-parcel-${e.id.toString()}`,
      category,
      categoryLabel,
      title,
      description,
      reviewNote,
      documentId: null,
      documentName: parcel.name,
      docType: parcel.titleNo || parcel.taxDecNo || "Property Record",
      version: null,
      status,
      actor,
      createdAt: e.createdAt,
      snapshot: {
        snapshotAt: e.createdAt,
        parcelState: {
          id: parcel.id,
          name: parcel.name,
          region: parcel.region,
          province: parcel.province,
          municipality: parcel.municipality,
          titleNo: parcel.titleNo,
          taxDecNo: parcel.taxDecNo,
          classification: parcel.classification,
          areaHa: Number(parcel.areaHa),
          status,
          remarks: reviewNote ?? histParcel.remarks,
        },
        focusDocument: reviewNote
          ? {
              id: null,
              fileName: parcel.name,
              docType: "Management Review",
              version: null,
              status,
              sha256: null,
              sizeBytes: null,
              expiresOn: null,
              custodyHolder: null,
              custodyAction: null,
              processingStage: null,
              reviewNote,
            }
          : null,
        activeDocumentsAtTime: computeActiveDocsAt(e.createdAt),
      },
    });
  }

  // Add each document version filing / revision as an archival snapshot
  for (const d of allDocs) {
    const uploader = userMap.get(d.uploadedById)?.name ?? "Legal Department";
    const isInitial = d.version === 1;
    const expStr = d.expiresOn ? d.expiresOn.toISOString().slice(0, 10) : null;
    const histParcel = parcelStateAt(d.createdAt);
    const priorCustody = custodyRows
      .filter((c) => {
        const cDoc = docById.get(c.documentId);
        return cDoc?.groupId === d.groupId && c.createdAt.getTime() <= d.createdAt.getTime();
      })
      .at(-1);
    const docStatusAtFiling = priorCustody ? priorCustody.statusAfter : "ACTIVE";
    const custodyHolderAtFiling = priorCustody
      ? `${priorCustody.holderName} (${HOLDER_LABEL[priorCustody.holderType] ?? priorCustody.holderType})`
      : "Company Vault";

    history.push({
      id: `hist-doc-${d.id}`,
      category: "DOCUMENT_REVISION",
      categoryLabel: isInitial ? "Initial Filing (v1)" : `Version Revision (v${d.version})`,
      title: isInitial
        ? `Filed ${d.docType ?? d.fileName} (Version 1)`
        : `Revised ${d.docType ?? d.fileName} to Version ${d.version}`,
      description: isInitial
        ? `Registered "${d.fileName}"${expStr ? ` (expires ${expStr})` : ""}.`
        : `Revision "${d.fileName}" superseded Version ${d.version - 1}${expStr ? ` (new expiry ${expStr})` : ""}.`,
      documentId: d.deletedAt ? null : d.id,
      documentName: d.fileName,
      docType: d.docType,
      version: d.version,
      status: docStatusAtFiling,
      actor: uploader,
      createdAt: d.createdAt,
      snapshot: {
        snapshotAt: d.createdAt,
        parcelState: {
          id: parcel.id,
          name: parcel.name,
          region: parcel.region,
          province: parcel.province,
          municipality: parcel.municipality,
          titleNo: parcel.titleNo,
          taxDecNo: parcel.taxDecNo,
          classification: parcel.classification,
          areaHa: Number(parcel.areaHa),
          status: histParcel.status,
          remarks: histParcel.remarks,
        },
        focusDocument: {
          id: d.deletedAt ? null : d.id,
          fileName: d.fileName,
          docType: d.docType,
          version: d.version,
          status: docStatusAtFiling,
          sha256: d.sha256,
          sizeBytes: d.sizeBytes,
          expiresOn: expStr,
          custodyHolder: custodyHolderAtFiling,
          custodyAction: isInitial ? "Initial Filing" : `Replaced v${d.version - 1}`,
          processingStage: priorCustody?.processingStage ?? null,
          reviewNote: null,
        },
        activeDocumentsAtTime: computeActiveDocsAt(d.createdAt),
      },
    });
  }

  // Add physical custody transfers & title movements as archival snapshots
  for (const c of custodyRows) {
    const doc = docById.get(c.documentId);
    const recorder = userMap.get(c.recordedById)?.name ?? "Legal Department";
    const holderTypeLabel = HOLDER_LABEL[c.holderType] ?? c.holderType;
    const actionText = CUSTODY_LABEL[c.action] ?? c.action;
    const parts = [`Holder: ${c.holderName} (${holderTypeLabel})`];
    if (c.processingStage) parts.push(`Stage: ${c.processingStage}`);
    if (c.referenceNo) parts.push(`Ref: ${c.referenceNo}`);
    if (c.expectedReturnDate)
      parts.push(`Expected back: ${c.expectedReturnDate.toISOString().slice(0, 10)}`);
    if (c.note) parts.push(`Note: "${c.note}"`);

    const histParcel = parcelStateAt(c.createdAt);
    history.push({
      id: `hist-custody-${c.id}`,
      category: "CUSTODY_TRANSFER",
      categoryLabel: "Custody & Title State",
      title: `${actionText} — ${doc?.docType ?? doc?.fileName ?? "Document"}`,
      description: parts.join(" · "),
      documentId: doc && !doc.deletedAt ? doc.id : null,
      documentName: doc?.fileName ?? "Document",
      docType: doc?.docType ?? null,
      version: doc?.version ?? null,
      status: c.statusAfter,
      actor: recorder,
      createdAt: c.createdAt,
      snapshot: {
        snapshotAt: c.createdAt,
        parcelState: {
          id: parcel.id,
          name: parcel.name,
          region: parcel.region,
          province: parcel.province,
          municipality: parcel.municipality,
          titleNo: parcel.titleNo,
          taxDecNo: parcel.taxDecNo,
          classification: parcel.classification,
          areaHa: Number(parcel.areaHa),
          status: histParcel.status,
          remarks: histParcel.remarks,
        },
        focusDocument: {
          id: doc && !doc.deletedAt ? doc.id : null,
          fileName: doc?.fileName ?? "Document",
          docType: doc?.docType ?? null,
          version: doc?.version ?? null,
          status: c.statusAfter,
          sha256: doc?.sha256 ?? null,
          sizeBytes: doc?.sizeBytes ?? null,
          expiresOn: doc?.expiresOn ? doc.expiresOn.toISOString().slice(0, 10) : null,
          custodyHolder: `${c.holderName} (${holderTypeLabel})`,
          custodyAction: actionText,
          processingStage: c.processingStage,
          reviewNote: c.note,
        },
        activeDocumentsAtTime: computeActiveDocsAt(c.createdAt),
      },
    });
  }

  // Strictly order Document History from earliest to latest
  history.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // 2. DOCUMENT LOGS (Audit Trail): User-initiated actions performed on documents (newest first)
  const logs: DocumentLogItem[] = [];
  for (const e of auditEntries) {
    if (e.entity !== "document") continue;
    const user = e.actorId ? userMap.get(e.actorId) : undefined;
    const actor = user?.name ?? "System";
    const actorRole = user?.role ?? "SYSTEM";
    const doc = e.entityId ? docById.get(e.entityId) : undefined;
    const docLabel = doc?.docType ? `${doc.docType} (${doc.fileName})` : (doc?.fileName ?? "Document");
    const actionLabel = AUDIT_ACTION_LABEL[e.action] ?? e.action;

    let summaryText = `${actor} performed ${actionLabel.toLowerCase()} on ${docLabel}.`;
    if (e.action === "DOCUMENT_VIEWED") {
      summaryText = `${actor} opened and viewed ${docLabel} (v${doc?.version ?? 1}).`;
    } else if (e.action === "DOCUMENT_DOWNLOADED") {
      summaryText = `${actor} downloaded a copy of ${docLabel} (v${doc?.version ?? 1}).`;
    } else if (e.action === "DOCUMENT_UPLOADED") {
      summaryText = `${actor} uploaded ${docLabel} (v${doc?.version ?? 1}).`;
    } else if (e.action === "DOCUMENT_REPLACED") {
      summaryText = `${actor} uploaded a new version (v${doc?.version ?? 2}) of ${docLabel}.`;
    } else if (e.action === "DOCUMENT_DELETED") {
      summaryText = `${actor} removed ${docLabel} from active property files.`;
    } else if (e.action === "CUSTODY_UPDATED") {
      summaryText = `${actor} updated the physical custody record for ${docLabel}.`;
    } else if (e.action === "INTEGRITY_FAIL") {
      summaryText = `${actor} attempted to open ${docLabel}, which failed the SHA-256 file check.`;
    }

    logs.push({
      id: e.id.toString(),
      action: e.action,
      actionLabel,
      actor,
      actorRole,
      documentId: doc && !doc.deletedAt ? doc.id : null,
      documentName: doc?.fileName ?? "Document",
      docType: doc?.docType ?? null,
      version: doc?.version ?? null,
      status: doc?.deletedAt ? "DELETED" : (doc?.status ?? "ACTIVE"),
      summary: summaryText,
      createdAt: e.createdAt,
    });
  }

  logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { history, logs };
}

/** Thrown inside a transaction to roll it back when a guarded update finds nothing to change. */
class Conflict extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: security.maxUploadBytes, files: 1 },
});

function singleFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err)
      return res
        .status(400)
        .json({ error: "Upload one file (PDF, DOCX, PNG, JPG, or WebP) of up to 20 MB." });
    next();
  });
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

function storageFile(storagePath: string): string {
  const dir = path.resolve(config.uploadDir);
  const full = path.resolve(dir, path.basename(storagePath));
  if (path.dirname(full) !== dir) throw new Error("Invalid storage path");
  return full;
}

interface DetectedMedia {
  ext: ".pdf" | ".png" | ".jpg" | ".webp" | ".docx";
  mime: string;
  kind: "document" | "image";
}

/**
 * Validates file content by magic bytes (signature) rather than trusting extension alone:
 * - PDF: %PDF-
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - JPEG/JPG: FF D8 FF
 * - WebP: RIFF....WEBP
 * - DOCX: PK\x03\x04 (ZIP container with .docx filename)
 */
function detectAllowedMedia(
  buf: Buffer | undefined | null,
  originalName = "",
): DetectedMedia | null {
  if (!buf || buf.length < 4) return null;

  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { ext: ".pdf", mime: "application/pdf", kind: "document" };
  }

  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: ".png", mime: "image/png", kind: "image" };
  }

  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg", kind: "image" };
  }

  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return { ext: ".webp", mime: "image/webp", kind: "image" };
  }

  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[2] === 0x03 &&
    buf[3] === 0x04 &&
    originalName.toLowerCase().endsWith(".docx")
  ) {
    return {
      ext: ".docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "document",
    };
  }

  return null;
}

/** Safe download name: letters, digits, dot, dash and underscore only. */
function safeName(name: string, fallbackExt = ".pdf"): string {
  const base = path
    .basename(name)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 120);
  const lower = base.toLowerCase();
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".docx")
  ) {
    return base;
  }
  return `${base || "document"}${fallbackExt}`;
}

function summary(d: {
  id: string;
  parcelId: string;
  fileName: string;
  docType: string | null;
  sha256: string;
  sizeBytes: number;
  integrityStatus: string;
  createdAt: Date;
  expiresOn: Date | null;
  status: string;
  groupId: string;
  version: number;
}) {
  return {
    id: d.id,
    parcelId: d.parcelId,
    fileName: d.fileName,
    docType: d.docType,
    sha256: d.sha256,
    sizeBytes: d.sizeBytes,
    integrityStatus: d.integrityStatus,
    status: d.status,
    groupId: d.groupId,
    version: d.version,
    expiresOn: d.expiresOn ? d.expiresOn.toISOString().slice(0, 10) : null,
    createdAt: d.createdAt,
  };
}

/** D10: time-bound types need an expiry date (YYYY-MM-DD); other types never carry one. */
function parseExpiry(type: DocumentType, v: unknown): Date | null | string {
  if (!type.timeBound) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    return `Enter the expiry date of the ${type.name.toLowerCase()} (YYYY-MM-DD).`;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return "Enter a real date.";
  return d;
}

/**
 * Save one document version: row, file and audit entry together. The row is created first,
 * the file is written inside the same transaction, and `inTx` (the audit entry and, for a
 * replace, superseding the old version) commits with the row. On any failure the transaction
 * rolls back and the file is removed, so nothing is half-saved.
 */
async function saveVersion(
  file: Express.Multer.File,
  data: {
    parcelId: string;
    docType: string | null;
    expiresOn?: Date | null;
    uploadedById: string;
    groupId?: string;
    version?: number;
    status?: DocumentStatus;
  },
  inTx: (tx: Prisma.TransactionClient, doc: Document) => Promise<unknown>,
) {
  const id = randomUUID();
  const detected = detectAllowedMedia(file.buffer, file.originalname);
  const ext = detected?.ext ?? ".pdf";
  const storagePath = `${id}${ext}`;
  await mkdir(path.resolve(config.uploadDir), { recursive: true });
  let wrote = false;
  try {
    return await prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: {
          id,
          parcelId: data.parcelId,
          fileName: path.basename(file.originalname).slice(0, 200),
          docType: data.docType,
          expiresOn: data.expiresOn ?? null,
          sha256: sha256(file.buffer),
          storagePath,
          sizeBytes: file.size,
          uploadedById: data.uploadedById,
          groupId: data.groupId ?? id,
          version: data.version ?? 1,
          ...(data.status ? { status: data.status } : {}),
        },
      });
      await writeFile(storageFile(storagePath), file.buffer, { flag: "wx", mode: 0o600 });
      wrote = true;
      await inTx(tx, d);
      return d;
    });
  } catch (e) {
    if (wrote) await unlink(storageFile(storagePath)).catch(() => undefined);
    throw e;
  }
}

/** Load a document whose parcel the user may read, or answer the response and return null. */
export async function readableDocument(res: Response, id: string) {
  if (!UUID.test(id)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const doc = await prisma.document.findUnique({ where: { id } });
  // Soft-deleted documents are hidden everywhere (D3).
  if (!doc || doc.deletedAt) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  const parcel = await readableParcel(res, doc.parcelId);
  return parcel ? doc : null;
}

function serve(disposition: "inline" | "attachment") {
  return h(async (req, res) => {
    const doc = await readableDocument(res, req.params.id);
    if (!doc) return;
    const user = currentUser(res);

    let bytes: Buffer | null = null;
    try {
      bytes = await readFile(storageFile(doc.storagePath));
    } catch (e) {
      // Only a missing file counts as an integrity failure; other I/O errors are a 500.
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      bytes = null;
    }
    const computed = bytes ? sha256(bytes) : null;

    if (!bytes || computed !== doc.sha256) {
      await prisma.$transaction(async (tx) => {
        await tx.document.update({ where: { id: doc.id }, data: { integrityStatus: "FAILED" } });
        await appendAudit(
          { actorId: user.id, action: "INTEGRITY_FAIL", entity: "document", entityId: doc.id },
          tx,
        );
      });
      return res.status(409).json({
        error: "integrity_fail",
        storedHash: doc.sha256,
        computedHash: computed,
        message: "This file changed after upload or is missing. It is blocked.",
      });
    }

    await prisma.$transaction(async (tx) => {
      if (doc.integrityStatus !== "VERIFIED") {
        await tx.document.update({
          where: { id: doc.id },
          data: { integrityStatus: "VERIFIED" },
        });
      }
      await appendAudit(
        {
          actorId: user.id,
          action: disposition === "inline" ? "DOCUMENT_VIEWED" : "DOCUMENT_DOWNLOADED",
          entity: "document",
          entityId: doc.id,
        },
        tx,
      );
    });
    const detected = detectAllowedMedia(bytes, doc.fileName);
    const contentType = detected?.mime ?? "application/pdf";
    const ext = detected?.ext ?? ".pdf";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName(doc.fileName, ext)}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Integrity-SHA256", computed);
    res.send(bytes);
  });
}

export function documentsRouter(): Router {
  const r = Router();

  route(
    r,
    "post",
    "/parcels/:id/documents",
    ["LEGAL"],
    singleFile,
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const file = req.file;
      if (!file || !detectAllowedMedia(file.buffer, file.originalname))
        return res
          .status(400)
          .json({ error: "Only PDF, DOCX, PNG, JPG, or WebP files can be uploaded." });
      const rawDocType = req.body?.docType;
      const type = rawDocType ? findType(rawDocType) : findType("Supporting Attachment");
      if (!type) return res.status(400).json({ error: "Choose the document type from the list." });
      const expiresOn = parseExpiry(type, req.body?.expiresOn);
      if (typeof expiresOn === "string") return res.status(400).json({ error: expiresOn });
      const user = currentUser(res);
      const doc = await saveVersion(
        file,
        { parcelId: parcel.id, docType: type.name, expiresOn, uploadedById: user.id },
        (tx, d) =>
          appendAudit(
            { actorId: user.id, action: "DOCUMENT_UPLOADED", entity: "document", entityId: d.id },
            tx,
          ),
      );
      res.status(201).json(summary(doc));
    }),
  );

  route(
    r,
    "get",
    "/parcels/:id/documents",
    READERS,
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const docs = await prisma.document.findMany({
        // Current versions only: superseded ones are under "Versions"; deleted ones are hidden.
        where: { parcelId: parcel.id, deletedAt: null, status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
      });
      res.json({ parcel: { id: parcel.id, name: parcel.name }, documents: docs.map(summary) });
    }),
  );

  route(
    r,
    "get",
    "/documents/:id",
    READERS,
    h(async (req, res) => {
      const doc = await readableDocument(res, req.params.id);
      if (!doc) return;
      const parcel = await prisma.parcel.findUniqueOrThrow({
        where: { id: doc.parcelId },
        select: { id: true, name: true },
      });
      res.json({ ...summary(doc), parcel });
    }),
  );

  // D2: all versions of a document, newest first. Each keeps its own hash and check.
  route(
    r,
    "get",
    "/documents/:id/versions",
    READERS,
    h(async (req, res) => {
      const doc = await readableDocument(res, req.params.id);
      if (!doc) return;
      const versions = await prisma.document.findMany({
        where: { groupId: doc.groupId, deletedAt: null },
        orderBy: { version: "desc" },
      });
      res.json({ versions: versions.map(summary) });
    }),
  );

  // D2: replace = upload a new version. Same rules as upload; the old version is SUPERSEDED.
  route(
    r,
    "post",
    "/documents/:id/replace",
    ["LEGAL"],
    singleFile,
    h(async (req, res) => {
      const old = await readableDocument(res, req.params.id);
      if (!old) return;
      const file = req.file;
      if (!file || !detectAllowedMedia(file.buffer, file.originalname))
        return res
          .status(400)
          .json({ error: "Only PDF, DOCX, PNG, JPG, or WebP files can be uploaded." });
      if (old.status === "SUPERSEDED")
        return res.status(409).json({ error: "Only the current version can be replaced." });
      // A renewed time-bound document has a new expiry date (D10); other types keep none.
      const oldType = findType(old.docType);
      const expiresOn = oldType ? parseExpiry(oldType, req.body?.expiresOn) : null;
      if (typeof expiresOn === "string") return res.status(400).json({ error: expiresOn });
      const user = currentUser(res);
      const doc = await saveVersion(
        file,
        {
          parcelId: old.parcelId,
          docType: old.docType,
          expiresOn,
          uploadedById: user.id,
          groupId: old.groupId,
          version: old.version + 1,
          // A new scan of the same original keeps the original's custody status (FR-13).
          status: old.status,
        },
        async (tx, d) => {
          // Guarded update: a parallel replace of the same version loses and rolls back.
          const superseded = await tx.document.updateMany({
            where: { id: old.id, status: { not: "SUPERSEDED" }, deletedAt: null },
            data: { status: "SUPERSEDED" },
          });
          if (superseded.count === 0) throw new Conflict();
          await appendAudit(
            {
              actorId: user.id,
              action: "DOCUMENT_REPLACED",
              entity: "document",
              entityId: d.id,
              details: { documentId: d.id, oldVersionId: old.id, newVersionId: d.id },
            },
            tx,
          );
        },
      ).catch((e) => {
        if (e instanceof Conflict) return null;
        throw e;
      });
      if (!doc) return res.status(409).json({ error: "Only the current version can be replaced." });
      res.status(201).json(summary(doc));
    }),
  );

  // D3: soft delete. The document and all its versions are hidden; files and hashes stay.
  route(
    r,
    "delete",
    "/documents/:id",
    ["LEGAL"],
    h(async (req, res) => {
      const doc = await readableDocument(res, req.params.id);
      if (!doc) return;
      const user = currentUser(res);
      await prisma.$transaction(async (tx) => {
        await tx.document.updateMany({
          where: { groupId: doc.groupId, deletedAt: null },
          data: { deletedAt: new Date(), deletedById: user.id },
        });
        await appendAudit(
          {
            actorId: user.id,
            action: "DOCUMENT_DELETED",
            entity: "document",
            entityId: doc.id,
            details: { documentId: doc.id, parcelId: doc.parcelId },
          },
          tx,
        );
      });
      res.status(204).end();
    }),
  );

  route(r, "get", "/documents/:id/view", READERS, serve("inline"));
  route(r, "get", "/documents/:id/download", READERS, serve("attachment"));

  // Separate Document History (chronological revisions & lifecycle, earliest -> latest)
  // and Document Logs (user-initiated audit trail) for all documents on a parcel.
  route(
    r,
    "get",
    "/parcels/:id/documents/tracking",
    ["LEGAL", "MANAGEMENT"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      res.json(await buildDocumentTracking(parcel.id));
    }),
  );

  // Separate Document History and Document Logs scoped to a single document (and its version group).
  route(
    r,
    "get",
    "/documents/:id/tracking",
    ["LEGAL", "MANAGEMENT"],
    h(async (req, res) => {
      const doc = await readableDocument(res, req.params.id);
      if (!doc) return;
      res.json(await buildDocumentTracking(doc.parcelId, doc.groupId));
    }),
  );

  return r;
}
