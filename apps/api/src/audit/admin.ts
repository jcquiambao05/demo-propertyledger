// FR-19 full log view and FR-20 chain verification, IT Administrator only.
// Entries expose IDs, actions and hashes — never parcel or document content.
import { Router } from "express";
import { prisma } from "../db.js";
import { route, h, currentUser } from "../rbac/route.js";
import { appendAudit, verifyChain } from "./chain.js";

export function auditAdminRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/admin/audit",
    ["IT_ADMIN"],
    h(async (_req, res) => {
      const entries = await prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 100 });
      const actors = await prisma.user.findMany({
        where: { id: { in: entries.map((e) => e.actorId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      });
      const names = new Map(actors.map((a) => [a.id, a.name]));
      const total = await prisma.auditLog.count();
      res.json({
        total,
        entries: entries.map((e) => ({
          id: e.id.toString(),
          action: e.action,
          entity: e.entity,
          entityId: e.entityId,
          actor: e.actorId ? (names.get(e.actorId) ?? "Unknown user") : "System",
          createdAt: e.createdAt,
          prevHash: e.prevHash,
          entryHash: e.entryHash,
        })),
      });
    }),
  );

  route(
    r,
    "post",
    "/admin/audit/verify",
    ["IT_ADMIN"],
    h(async (_req, res) => {
      const started = Date.now();
      const result = await verifyChain(prisma);
      const user = currentUser(res);
      await appendAudit({
        actorId: user.id,
        action: result.ok ? "AUDIT_CHAIN_VERIFIED" : "AUDIT_CHAIN_BROKEN",
        entity: "audit_log",
        entityId: result.firstBrokenId,
      });
      res.json({ ...result, ms: Date.now() - started, verifiedAt: new Date() });
    }),
  );

  return r;
}
