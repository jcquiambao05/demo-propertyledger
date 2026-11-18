// FR-19, FR-20, NFR-03: append-only hash-chained audit log.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db.js";
import { appendAudit, verifyChain, computeEntryHash, GENESIS_HASH } from "./chain.js";

afterAll(() => prisma.$disconnect());

describe("audit chain", () => {
  it("links each entry to the previous one; the first prev_hash is 64 zeros", async () => {
    const a = await appendAudit({ actorId: null, action: "TEST_A", entity: "test", entityId: "1" });
    const b = await appendAudit({ actorId: null, action: "TEST_B", entity: "test", entityId: "2" });
    expect(b.prevHash).toBe(a.entryHash);
    const first = await prisma.auditLog.findFirstOrThrow({ orderBy: { id: "asc" } });
    expect(first.prevHash).toBe(GENESIS_HASH);
    expect(GENESIS_HASH).toBe("0".repeat(64));
    expect(b.entryHash).toBe(computeEntryHash(b.prevHash, b));
  });

  it("an entry appended inside a caller's transaction rolls back with it (review finding a)", async () => {
    const rollback = new Error("rollback");
    // Unique per run: the log is append-only, so rows from earlier runs stay.
    const action = `TEST_TX_ROLLBACK_${Date.now()}`;
    await prisma
      .$transaction(async (tx) => {
        await appendAudit({ actorId: null, action, entity: "test", entityId: "9" }, tx);
        throw rollback;
      })
      .catch((e) => {
        if (e !== rollback) throw e;
      });
    expect(await prisma.auditLog.findFirst({ where: { action } })).toBeNull();
    expect((await verifyChain(prisma)).ok).toBe(true);
  });

  it("hashes details as canonical JSON; entries without details hash as before", async () => {
    const createdAt = new Date("2026-11-13T00:00:00.000Z");
    const base = { actorId: null, action: "X", entity: "document", entityId: "1", createdAt };
    expect(computeEntryHash(GENESIS_HASH, { ...base, details: null })).toBe(
      computeEntryHash(GENESIS_HASH, base),
    );
    const e = await appendAudit({
      actorId: null,
      action: "TEST_DETAILS",
      entity: "document",
      entityId: "2",
      details: { newVersionId: "b", oldVersionId: "a" },
    });
    expect(e.details).toBe('{"newVersionId":"b","oldVersionId":"a"}');
    const swapped = await appendAudit({
      actorId: null,
      action: "TEST_DETAILS",
      entity: "document",
      entityId: "3",
      details: { oldVersionId: "a", newVersionId: "b" },
    });
    expect(swapped.details).toBe(e.details);
    expect(computeEntryHash(e.prevHash, e)).toBe(e.entryHash);
    expect((await verifyChain(prisma)).ok).toBe(true);
  });

  it("rejects UPDATE and DELETE on audit_logs (DB trigger)", async () => {
    await appendAudit({ actorId: null, action: "TEST_C", entity: "test", entityId: "3" });
    await expect(
      prisma.$executeRaw`UPDATE audit_logs SET action = 'EDITED' WHERE action = 'TEST_C'`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM audit_logs WHERE action = 'TEST_C'`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow(/append-only/);
  });

  it("verifies an intact chain and reports the first edited entry", async () => {
    const intact = await verifyChain(prisma);
    expect(intact.ok).toBe(true);

    const target = await appendAudit({
      actorId: null,
      action: "TEST_D",
      entity: "test",
      entityId: "4",
    });
    const rollback = new Error("rollback");
    let broken: Awaited<ReturnType<typeof verifyChain>> | undefined;
    // Disable the trigger only inside this transaction; the rollback restores everything.
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete`;
        await tx.$executeRaw`UPDATE audit_logs SET entity_id = '999' WHERE id = ${target.id}`;
        broken = await verifyChain(tx);
        throw rollback;
      })
      .catch((e) => {
        if (e !== rollback) throw e;
      });
    expect(broken?.ok).toBe(false);
    expect(broken?.firstBrokenId).toBe(target.id.toString());

    expect((await verifyChain(prisma)).ok).toBe(true);
  });
});
