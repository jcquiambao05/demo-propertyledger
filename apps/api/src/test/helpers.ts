// Test-only helpers: synthetic users and NextAuth session cookies.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import type { Role } from "@prisma/client";
import { prisma } from "../db.js";
import { createSession } from "../auth/sessions.js";

export const TEST_PASSWORD = "synthetic-test-password-123";
const hash = bcrypt.hashSync(TEST_PASSWORD, 4);

export async function makeUser(
  role: Role,
  extra: { mfaEnabled?: boolean; totpSecretEnc?: string } = {},
) {
  const tag = randomBytes(4).toString("hex");
  return prisma.user.create({
    data: {
      email: `t-${role.toLowerCase()}-${tag}@xcement.example`,
      name: `Test ${role} ${tag}`,
      role,
      passwordHash: hash,
      ...extra,
    },
  });
}

/** Cookie header for a signed-in user (Redis session + NextAuth JWT holding the sid). */
export async function cookieFor(user: { id: string; role: Role }): Promise<string> {
  const sid = await createSession(user.id, user.role);
  const token = await encode({ token: { sid }, secret: process.env.NEXTAUTH_SECRET! });
  return `next-auth.session-token=${token}`;
}

export async function lastAudit(action: string) {
  return prisma.auditLog.findFirst({ where: { action }, orderBy: { id: "desc" } });
}
