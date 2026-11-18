// FR-19, FR-20, NFR-03: append-only SHA-256 hash-chained audit log.
// entry_hash = SHA-256(prev_hash + entry data); the first prev_hash is 64 zeros.
// Entries hold IDs and actions only — never document content or personal data.
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db.js";

export const GENESIS_HASH = "0".repeat(64);

// Serializes appends so two writers never chain onto the same previous entry.
const AUDIT_LOCK_KEY = 7_311_904;

/** Event details: IDs and enum values only, never document content or personal data. */
export type AuditDetails = Record<string, string | number | boolean | null>;

export interface AuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details?: AuditDetails;
}

interface HashedFields {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: Date;
  /** Canonical JSON text as stored; null or absent for entries without details. */
  details?: string | null;
}

/** Sorted keys, so the stored text (and the hash) never depend on key order. */
export function canonicalDetails(d: AuditDetails | undefined): string | null {
  if (!d) return null;
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(d)
        .sort()
        .map((k) => [k, d[k]]),
    ),
  );
}

export function computeEntryHash(prevHash: string, e: HashedFields): string {
  const data = JSON.stringify([
    e.actorId ?? null,
    e.action,
    e.entity,
    e.entityId ?? null,
    e.createdAt.toISOString(),
    // Appended only when present, so entries written before details existed hash the same.
    ...(e.details != null ? [e.details] : []),
  ]);
  return createHash("sha256")
    .update(prevHash + data)
    .digest("hex");
}

/**
 * Append one entry while holding the chain lock. Pass the caller's transaction so the state
 * change and its audit entry commit or roll back together; without one, the entry gets its
 * own transaction (for events with no state change, such as ACCESS_DENIED).
 */
export async function appendAudit(input: AuditInput, tx?: Prisma.TransactionClient) {
  return tx ? appendIn(tx, input) : prisma.$transaction((t) => appendIn(t, input));
}

async function appendIn(tx: Prisma.TransactionClient, input: AuditInput) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})::text`;
  const last = await tx.auditLog.findFirst({
    orderBy: { id: "desc" },
    select: { entryHash: true },
  });
  const prevHash = last?.entryHash ?? GENESIS_HASH;
  const createdAt = new Date();
  const details = canonicalDetails(input.details);
  const entryHash = computeEntryHash(prevHash, { ...input, createdAt, details });
  return tx.auditLog.create({
    data: {
      prevHash,
      entryHash,
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      createdAt,
      details,
    },
  });
}

export interface ChainResult {
  ok: boolean;
  checked: number;
  /** Id of the first entry whose link or hash does not match, as a string. */
  firstBrokenId: string | null;
  reason: "prev_hash" | "entry_hash" | null;
}

/** FR-20: walk the whole chain in id order and recompute every hash. */
export async function verifyChain(db: Db): Promise<ChainResult> {
  const batch = 1000;
  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  let cursor: bigint | undefined;

  for (;;) {
    const rows = await db.auditLog.findMany({
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.prevHash !== expectedPrev) {
        return { ok: false, checked, firstBrokenId: r.id.toString(), reason: "prev_hash" };
      }
      if (computeEntryHash(r.prevHash, r) !== r.entryHash) {
        return { ok: false, checked, firstBrokenId: r.id.toString(), reason: "entry_hash" };
      }
      expectedPrev = r.entryHash;
      checked++;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { ok: true, checked, firstBrokenId: null, reason: null };
}
