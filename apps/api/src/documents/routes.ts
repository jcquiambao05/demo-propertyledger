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

/** Thrown inside a transaction to roll it back when a guarded update finds nothing to change. */
class Conflict extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: security.maxUploadBytes, files: 1 },
});

function singleFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: "Upload one PDF file of up to 20 MB." });
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

/** Safe download name: letters, digits, dot, dash and underscore only. */
function safeName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base || "document"}.pdf`;
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

/** PDF only, checked by content (magic bytes), not by extension. */
function isPdf(file: Express.Multer.File | undefined): file is Express.Multer.File {
  return (
    !!file && file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString("latin1") === "%PDF-"
  );
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
  const storagePath = `${id}.pdf`;
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
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName(doc.fileName)}"`);
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
      if (!isPdf(file)) return res.status(400).json({ error: "Only PDF files can be uploaded." });
      const type = findType(req.body?.docType);
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
      if (!isPdf(file)) return res.status(400).json({ error: "Only PDF files can be uploaded." });
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

  return r;
}
