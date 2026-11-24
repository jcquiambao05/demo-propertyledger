// FR-19 full log view and FR-20 chain verification, IT Administrator only.
// Entries expose IDs, actions, hashes, and auth/lockout event metadata — never parcel or document content.
import { Router } from "express";
import { prisma } from "../db.js";
import { route, h, currentUser } from "../rbac/route.js";
import { appendAudit, verifyChain } from "./chain.js";

function parseAuditDetails(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function auditAdminRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/admin/audit",
    ["IT_ADMIN"],
    h(async (_req, res) => {
      const entries = await prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 150 });
      const actors = await prisma.user.findMany({
        where: {
          id: {
            in: [
              ...entries.map((e) => e.actorId).filter((x): x is string => !!x),
              ...entries
                .filter((e) => e.entity === "user" && e.entityId)
                .map((e) => e.entityId as string),
            ],
          },
        },
        select: { id: true, name: true, email: true },
      });
      const userById = new Map(actors.map((a) => [a.id, a]));
      const total = await prisma.auditLog.count();
      res.json({
        total,
        entries: entries.map((e) => {
          const details = parseAuditDetails(e.details);
          const actorUser = e.actorId ? userById.get(e.actorId) : undefined;
          const targetUser =
            e.entity === "user" && e.entityId ? userById.get(e.entityId) : undefined;
          const attemptedAccount =
            (typeof details?.attemptedAccount === "string" && details.attemptedAccount) ||
            (typeof details?.username === "string" && details.username) ||
            (typeof details?.email === "string" && details.email) ||
            actorUser?.email ||
            targetUser?.email ||
            null;
          const status =
            (typeof details?.status === "string" && details.status) ||
            (e.action === "LOGIN_FAILED" || e.action === "MFA_FAILED"
              ? "FAILED_ATTEMPT"
              : e.action === "ACCOUNT_LOCKED" || e.action === "LOGIN_BLOCKED_LOCKED"
                ? "LOCKED_30S_COOLDOWN"
                : e.action === "LOGIN_SUCCESS"
                  ? "AUTHENTICATED"
                  : null);
          const actorLabel = actorUser
            ? `${actorUser.name} (${actorUser.email})`
            : attemptedAccount
              ? `${attemptedAccount} (Attempted)`
              : "System";

          return {
            id: e.id.toString(),
            action: e.action,
            entity: e.entity,
            entityId: e.entityId,
            actor: actorLabel,
            attemptedAccount,
            status,
            details,
            createdAt: e.createdAt,
            prevHash: e.prevHash,
            entryHash: e.entryHash,
          };
        }),
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
