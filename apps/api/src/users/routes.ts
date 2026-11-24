// FR-04 user management (IT Administrator) and NFR-09 Tenant assignment (Legal Department) —
// docs/build/DECISIONS.md D13, STUDY_CONTEXT §3 guardrails and §8 settings 4, 5, 11, 12.
// No super admin: the last active IT Administrator cannot be deactivated or demoted, and IT
// cannot change their own role. Every IT write needs a recent MFA re-entry (step-up).
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../db.js";
import { appendAudit, type AuditDetails } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { readableParcel, UUID } from "../parcels/access.js";
import { endAllSessions } from "../auth/sessions.js";
import { requireStepUp } from "./step-up.js";
import { isCommonPassword } from "./common-passwords.js";
import { validatePasswordPolicy } from "../profile/password-policy.js";

const ROLES: Role[] = ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 15; // setting 4
const MAX_PASSWORD = 128; // "≥ 64 allowed"

const select = {
  id: true,
  email: true,
  name: true,
  position: true,
  role: true,
  isActive: true,
  mfaEnabled: true,
  lockedUntil: true,
  createdAt: true,
} as const;

type Listed = Prisma.UserGetPayload<{ select: typeof select }>;

function present(u: Listed, lastSignIn: Date | null = null) {
  const { lockedUntil, ...rest } = u;
  return { ...rest, locked: !!lockedUntil && lockedUntil > new Date(), lastSignIn };
}

function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > MAX_PASSWORD) {
    return "Password must be at least 8 characters (with uppercase, lowercase, number, and special character).";
  }
  if (isCommonPassword(pw)) return "This password is too common. Choose another one.";
  // Accept either the 8-char complexity policy OR a 15+ character passphrase
  const policyErr = validatePasswordPolicy(pw);
  if (!policyErr) return null;
  if (pw.length >= MIN_PASSWORD) return null;
  return policyErr;
}

/**
 * Verifies admin authorization via the admin's own password (mandatory password confirmation
 * modal in User Directory) or falls back to a recent MFA step-up session token.
 */
async function verifyAdminConfirmation(req: Request, res: Response): Promise<boolean> {
  if (req.body && req.body.adminPassword !== undefined) {
    const adminPw = typeof req.body.adminPassword === "string" ? req.body.adminPassword : "";
    if (!adminPw) {
      res.status(400).json({ error: "Enter your admin password to confirm this change." });
      return false;
    }
    const me = currentUser(res);
    const adminUser = await prisma.user.findUnique({
      where: { id: me.id },
      select: { id: true, passwordHash: true, lockedUntil: true },
    });
    if (!adminUser || (adminUser.lockedUntil && adminUser.lockedUntil > new Date())) {
      res.status(423).json({ error: "This account is locked for 15 minutes." });
      return false;
    }
    const ok = await bcrypt.compare(adminPw, adminUser.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Your admin password is incorrect." });
      return false;
    }
    return true;
  }
  return requireStepUp(res);
}

async function audit(
  actorId: string,
  action: string,
  userId: string,
  details: AuditDetails,
  tx?: Prisma.TransactionClient,
) {
  await appendAudit(
    { actorId, action, entity: "user", entityId: userId, details: { userId, ...details } },
    tx,
  );
}

/** Load the target user or answer 404. */
async function target(res: Response, id: string) {
  const u = UUID.test(id) ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!u) res.status(404).json({ error: "not_found" });
  return u;
}

/** Thrown inside a transaction to roll it back when the guardrail would be broken. */
class LastItAdmin extends Error {}

/**
 * Guardrail (§3): removing this user's IT role or access must leave an active IT Administrator.
 * Runs inside the caller's transaction and locks the active IT rows (FOR UPDATE), so two
 * parallel requests cannot each see "one other left" and remove both (security review).
 */
async function assertNotLastActiveIt(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM users WHERE role = 'IT_ADMIN' AND is_active FOR UPDATE`;
  if (!rows.some((r) => r.id !== userId)) throw new LastItAdmin();
}

const LAST_IT = "This is the last active IT Administrator.";

/** Runs the transaction; answers null when the guardrail rolled it back. */
const guarded = <T>(p: Promise<T>) =>
  p.catch((e) => {
    if (e instanceof LastItAdmin) return null;
    throw e;
  });

export function usersRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/admin/users",
    ["IT_ADMIN"],
    h(async (_req, res) => {
      const users = await prisma.user.findMany({
        select,
        orderBy: [{ role: "asc" }, { name: "asc" }],
      });
      const last = await prisma.auditLog.groupBy({
        by: ["actorId"],
        where: { action: "LOGIN_SUCCESS", actorId: { in: users.map((u) => u.id) } },
        _max: { createdAt: true },
      });
      const lastBy = new Map(last.map((l) => [l.actorId, l._max.createdAt]));
      res.json(users.map((u) => present(u, lastBy.get(u.id) ?? null)));
    }),
  );

  route(
    r,
    "post",
    "/admin/users",
    ["IT_ADMIN"],
    h(async (req, res) => {
      if (!(await verifyAdminConfirmation(req, res))) return;
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
      const position =
        typeof req.body?.position === "string" && req.body.position.trim()
          ? req.body.position.trim().slice(0, 120)
          : null;
      const role = req.body?.role as Role;
      if (!EMAIL.test(email) || email.length > 200)
        return res.status(400).json({ error: "Enter a valid email address." });
      if (!name) return res.status(400).json({ error: "Enter the person's name." });
      if (!ROLES.includes(role))
        return res.status(400).json({ error: "Choose one of the four roles." });
      const pwProblem = passwordProblem(req.body?.password);
      if (pwProblem) return res.status(400).json({ error: pwProblem });
      const me = currentUser(res);
      try {
        const user = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email,
              name,
              position,
              role,
              passwordHash: await bcrypt.hash(req.body.password, 12),
            },
            select,
          });
          await audit(me.id, "USER_CREATED", u.id, { role }, tx);
          return u;
        });
        res.status(201).json(present(user));
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
          return res.status(409).json({ error: "A user with this email already exists." });
        throw e;
      }
    }),
  );

  route(
    r,
    "patch",
    "/admin/users/:id",
    ["IT_ADMIN"],
    h(async (req, res) => {
      if (!(await verifyAdminConfirmation(req, res))) return;
      const u = await target(res, req.params.id);
      if (!u) return;
      const me = currentUser(res);
      const data: Prisma.UserUpdateInput = {};
      if (req.body?.name !== undefined) {
        const name = typeof req.body.name === "string" ? req.body.name.trim().slice(0, 120) : "";
        if (!name) return res.status(400).json({ error: "Enter the person's name." });
        if (name !== u.name) data.name = name;
      }
      if (req.body?.position !== undefined) {
        const pos =
          typeof req.body.position === "string" ? req.body.position.trim().slice(0, 120) : "";
        const nextPos = pos || null;
        if (nextPos !== u.position) data.position = nextPos;
      }
      const role = req.body?.role as Role | undefined;
      if (role !== undefined && role !== u.role) {
        if (!ROLES.includes(role))
          return res.status(400).json({ error: "Choose one of the four roles." });
        if (u.id === me.id)
          return res.status(400).json({ error: "You cannot change your own role." });
        data.role = role;
      }
      let passwordChanged = false;
      if (req.body?.password !== undefined && String(req.body.password).length > 0) {
        const policyErr = validatePasswordPolicy(req.body.password);
        if (policyErr) return res.status(400).json({ error: policyErr });
        data.passwordHash = await bcrypt.hash(req.body.password, 12);
        data.failedAttempts = 0;
        data.lockedUntil = null;
        passwordChanged = true;
      }
      if (Object.keys(data).length === 0)
        return res.status(400).json({ error: "Nothing to change." });
      const updated = await guarded(
        prisma.$transaction(async (tx) => {
          if (data.role && u.role === "IT_ADMIN") await assertNotLastActiveIt(tx, u.id);
          const x = await tx.user.update({ where: { id: u.id }, data, select });
          if (data.role) await audit(me.id, "ROLE_CHANGED", u.id, { from: u.role, to: role! }, tx);
          if (data.name) await audit(me.id, "USER_UPDATED", u.id, { change: "NAME" }, tx);
          if (data.position !== undefined)
            await audit(me.id, "USER_UPDATED", u.id, { change: "POSITION" }, tx);
          if (passwordChanged)
            await audit(me.id, "USER_UPDATED", u.id, { change: "PASSWORD_RESET" }, tx);
          return x;
        }),
      );
      if (!updated) return res.status(409).json({ error: LAST_IT });
      // A role change or password reset ends the user's sessions.
      if (data.role || passwordChanged) await endAllSessions(u.id);
      res.json(present(updated));
    }),
  );

  route(
    r,
    "post",
    "/admin/users/:id/deactivate",
    ["IT_ADMIN"],
    h(async (req, res) => {
      if (!(await verifyAdminConfirmation(req, res))) return;
      const u = await target(res, req.params.id);
      if (!u) return;
      if (!u.isActive) return res.status(409).json({ error: "This account is already inactive." });
      const me = currentUser(res);
      const updated = await guarded(
        prisma.$transaction(async (tx) => {
          if (u.role === "IT_ADMIN") await assertNotLastActiveIt(tx, u.id);
          const x = await tx.user.update({
            where: { id: u.id },
            data: { isActive: false },
            select,
          });
          await audit(me.id, "USER_DEACTIVATED", u.id, {}, tx);
          return x;
        }),
      );
      if (!updated) return res.status(409).json({ error: LAST_IT });
      await endAllSessions(u.id);
      res.json(present(updated));
    }),
  );

  const simple = (
    path: string,
    change: string,
    data: Prisma.UserUpdateInput | null,
    endSessions: boolean,
  ) =>
    route(
      r,
      "post",
      path,
      ["IT_ADMIN"],
      h(async (req, res) => {
        if (!(await verifyAdminConfirmation(req, res))) return;
        const u = await target(res, req.params.id);
        if (!u) return;
        const me = currentUser(res);
        const updated = await prisma.$transaction(async (tx) => {
          const x = data
            ? await tx.user.update({ where: { id: u.id }, data, select })
            : await tx.user.findUniqueOrThrow({ where: { id: u.id }, select });
          await audit(me.id, "USER_UPDATED", u.id, { change }, tx);
          return x;
        });
        if (endSessions) await endAllSessions(u.id);
        res.json(present(updated));
      }),
    );

  simple("/admin/users/:id/unlock", "UNLOCKED", { lockedUntil: null, failedAttempts: 0 }, false);
  simple(
    "/admin/users/:id/reset-mfa",
    "MFA_RESET",
    { mfaEnabled: false, totpSecretEnc: null },
    true,
  );
  simple("/admin/users/:id/end-sessions", "SESSIONS_ENDED", null, true);

  // ---- NFR-09 Tenant assignment (Legal Department, §3) ----

  route(
    r,
    "get",
    "/tenants",
    ["LEGAL"],
    h(async (_req, res) => {
      res.json(
        await prisma.user.findMany({
          where: { role: "TENANT", isActive: true },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        }),
      );
    }),
  );

  route(
    r,
    "get",
    "/parcels/:id/tenants",
    ["LEGAL", "MANAGEMENT"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const rows = await prisma.tenantAssignment.findMany({
        where: { parcelId: parcel.id },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      res.json(rows.map((a) => a.user));
    }),
  );

  route(
    r,
    "post",
    "/parcels/:id/tenants",
    ["LEGAL"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      if (parcel.status !== "APPROVED")
        return res.status(409).json({ error: "Assign Tenants only to approved parcels." });
      const userId = req.body?.userId;
      const t =
        typeof userId === "string" && UUID.test(userId)
          ? await prisma.user.findUnique({ where: { id: userId } })
          : null;
      if (!t || t.role !== "TENANT" || !t.isActive)
        return res.status(400).json({ error: "Choose an active user with the Tenant role." });
      const me = currentUser(res);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.tenantAssignment.create({ data: { userId: t.id, parcelId: parcel.id } });
          await appendAudit(
            {
              actorId: me.id,
              action: "TENANT_ASSIGNED",
              entity: "parcel",
              entityId: parcel.id,
              details: { parcelId: parcel.id, userId: t.id },
            },
            tx,
          );
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
          return res.status(409).json({ error: "This Tenant is already assigned." });
        throw e;
      }
      res.status(201).json({ id: t.id, name: t.name, email: t.email });
    }),
  );

  route(
    r,
    "delete",
    "/parcels/:id/tenants/:userId",
    ["LEGAL"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const userId = req.params.userId;
      if (!UUID.test(userId)) return res.status(404).json({ error: "not_found" });
      const me = currentUser(res);
      const removed = await prisma.$transaction(async (tx) => {
        const d = await tx.tenantAssignment.deleteMany({ where: { userId, parcelId: parcel.id } });
        if (d.count === 0) return false;
        await appendAudit(
          {
            actorId: me.id,
            action: "TENANT_UNASSIGNED",
            entity: "parcel",
            entityId: parcel.id,
            details: { parcelId: parcel.id, userId },
          },
          tx,
        );
        return true;
      });
      if (!removed) return res.status(404).json({ error: "not_found" });
      res.status(204).end();
    }),
  );

  return r;
}
