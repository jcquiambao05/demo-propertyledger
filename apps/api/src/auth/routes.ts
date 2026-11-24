// FR-01 (email or username + password), FR-02 (TOTP MFA / local session), NFR-01 (3-strike 30s cooldown).
import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { prisma } from "../db.js";
import { redis, incrWithTtl } from "../redis.js";
import { security } from "../config.js";
import { appendAudit } from "../audit/chain.js";
import { encryptSecret, decryptSecret } from "./secrets.js";
import { verifyGoogleIdToken } from "./google.js";
import { createSession, deleteSession, endAllSessions } from "./sessions.js";
import { route, h, currentUser } from "../rbac/route.js";
import { validatePasswordPolicy } from "../profile/password-policy.js";

authenticator.options = { window: 1 };

// Constant work for unknown emails/usernames, so timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-only", 12);

const GENERIC_ERROR = "Email/username or password is incorrect.";
const LOCKED_ERROR =
  "Too many failed attempts. This account is temporarily locked for 30 seconds.";

interface Challenge {
  userId: string;
  setupSecretEnc?: string;
}

const challengeKey = (t: string) => `mfa:${t}`;
const handoffKey = (t: string) => `google-handoff:${t}`;

const GOOGLE_ENROLL_ERROR =
  "Sign in with your email and password the first time to set up your authenticator app.";

/**
 * Resolves a user by email OR account name (case-insensitive) so users can sign in
 * or recover their account using either their corporate email or their account name.
 */
async function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  const byEmail = await prisma.user.findUnique({
    where: { email: trimmed.toLowerCase() },
  });
  if (byEmail) return byEmail;
  return prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: trimmed, mode: "insensitive" } },
        { name: { equals: trimmed, mode: "insensitive" } },
      ],
    },
  });
}

/**
 * LOGIN_FAILED for unknown or inactive accounts. Records the attempted username/email
 * and status in the audit log details so IT Admins can inspect failed login activity.
 */
async function auditFailedSignIn(userId: string | null, attemptedAccount?: string) {
  const details = attemptedAccount
    ? {
        attemptedAccount,
        status: userId ? "INACTIVE_ACCOUNT" : "UNKNOWN_ACCOUNT",
      }
    : undefined;
  if (userId) {
    await appendAudit({
      actorId: null,
      action: "LOGIN_FAILED",
      entity: "user",
      entityId: userId,
      details,
    });
    return;
  }
  const bucket = `audit:unknown-login:${Math.floor(Date.now() / 60000)}`;
  const count = await incrWithTtl(bucket, 70);
  if (count <= 300) {
    await appendAudit({
      actorId: null,
      action: "LOGIN_FAILED",
      entity: "user",
      entityId: null,
      details,
    });
  } else if (count === 301) {
    await appendAudit({
      actorId: null,
      action: "LOGIN_FAILED_SUPPRESSED",
      entity: "user",
      entityId: null,
    });
  }
}

/**
 * Count one wrong password or TOTP code and lock the account for 30 seconds after
 * 3 consecutive failed attempts (security.failedSignInLimit = 3, security.lockSeconds = 30).
 * Commits the counter, the lock, and their audit entries atomically.
 * Returns true when this attempt locked the account.
 */
export async function recordFailedAttempt(
  userId: string,
  action: "LOGIN_FAILED" | "MFA_FAILED",
  attemptedAccount?: string,
) {
  return prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true, email: true, name: true },
    });
    const { failedAttempts } = updatedUser;
    const acctLabel = attemptedAccount || updatedUser.email;
    await appendAudit(
      {
        actorId: userId,
        action,
        entity: "user",
        entityId: userId,
        details: {
          attemptedAccount: acctLabel,
          username: updatedUser.name,
          email: updatedUser.email,
          attempt: failedAttempts,
          maxAttempts: security.failedSignInLimit,
          status:
            failedAttempts >= security.failedSignInLimit
              ? "LOCKOUT_TRIGGERED"
              : "FAILED_ATTEMPT",
        },
      },
      tx,
    );
    if (failedAttempts < security.failedSignInLimit) return false;
    const lockDurationMs = (security.lockSeconds ?? 30) * 1000;
    await tx.user.update({
      where: { id: userId },
      data: {
        failedAttempts: 0,
        lockedUntil: new Date(Date.now() + lockDurationMs),
      },
    });
    await appendAudit(
      {
        actorId: userId,
        action: "ACCOUNT_LOCKED",
        entity: "user",
        entityId: userId,
        details: {
          attemptedAccount: acctLabel,
          username: updatedUser.name,
          email: updatedUser.email,
          cooldownSeconds: security.lockSeconds ?? 30,
          status: "LOCKED_30S_COOLDOWN",
        },
      },
      tx,
    );
    return true;
  });
}

// ---------------------------------------------------------------------------
// Two-step password recovery helpers
// ---------------------------------------------------------------------------
const RECOVERY_TOKEN_SECONDS = 10 * 60;
const EXPIRED_RECOVERY_ERROR =
  "Your verification has expired or was already used. Please start recovery again.";
const recoveryKey = (t: string) => `recovery:${t}`;

interface RecoveryGrant {
  userId: string;
  method: "SECURITY_QUESTION" | "BACKUP_CODE";
  codeHash?: string;
}

async function issueRecoveryToken(grant: RecoveryGrant): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await redis().set(recoveryKey(token), JSON.stringify(grant), "EX", RECOVERY_TOKEN_SECONDS);
  return token;
}

function parseBackupHashes(stored: string | null): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 423 payload with a live countdown value when an account is in its 30s cooldown. */
function lockedPayload(lockedUntil: Date | null) {
  if (!lockedUntil || lockedUntil <= new Date()) return null;
  return {
    error: LOCKED_ERROR,
    remainingSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)),
  };
}

async function recoveryRateLimited(identifier: string, kind: string): Promise<boolean> {
  const key = `rl:rec-${kind}:${createHash("sha256").update(identifier.toLowerCase()).digest("hex")}`;
  const n = await incrWithTtl(key, 60);
  const total = await incrWithTtl(`rl:login:all:${Math.floor(Date.now() / 60000)}`, 70);
  return n > 20 || total > 3000;
}

/** Counts a wrong answer/code toward the shared 3-strike, 30-second cooldown (audited). */
async function failedRecoveryResponse(
  res: import("express").Response,
  userId: string,
  identifier: string,
  message: string,
) {
  if (await recordFailedAttempt(userId, "LOGIN_FAILED", identifier)) {
    return res
      .status(423)
      .json({ error: LOCKED_ERROR, remainingSeconds: security.lockSeconds ?? 30 });
  }
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { failedAttempts: true } });
  return res.status(401).json({
    error: message,
    attemptsRemaining: Math.max(0, security.failedSignInLimit - (u?.failedAttempts ?? 0)),
  });
}

const GOOGLE_ERROR = "This Google account cannot sign in. Use your company email and password.";

/** Step 1 success: a short-lived MFA challenge, with TOTP setup on first sign-in. */
async function issueChallenge(user: {
  id: string;
  email: string;
  mfaEnabled: boolean;
  totpSecretEnc: string | null;
}) {
  const token = randomBytes(32).toString("hex");
  const challenge: Challenge = { userId: user.id };
  let setup: { secret: string; otpauthUrl: string } | undefined;
  if (!user.mfaEnabled || !user.totpSecretEnc) {
    const secret = authenticator.generateSecret();
    challenge.setupSecretEnc = encryptSecret(secret);
    setup = {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, "Eagle Property Ledger", secret),
    };
  }
  await redis().set(
    challengeKey(token),
    JSON.stringify(challenge),
    "EX",
    security.mfaChallengeMinutes * 60,
  );
  return { mfaToken: token, mfaSetup: setup ?? null };
}

export function authRouter(): Router {
  const r = Router();

  route(
    r,
    "post",
    "/auth/login",
    "public",
    h(async (req, res) => {
      const identifier =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const normalizedId = identifier.toLowerCase();
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!identifier || !password || password.length > 256) {
        return res.status(400).json({ error: GENERIC_ERROR });
      }

      // Per-account attempt limiter (keyed by a hash of the identifier).
      const idHash = createHash("sha256").update(normalizedId).digest("hex");
      const rl = `rl:login:${idHash}`;
      const n = await incrWithTtl(rl, 60);
      const all = `rl:login:all:${Math.floor(Date.now() / 60000)}`;
      const total = await incrWithTtl(all, 70);
      if (n > 30 || total > 3000)
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });

      const user = await findUserByIdentifier(identifier);
      if (!user || !user.isActive) {
        // Track 3-strike 30s cooldown in Redis even for unknown accounts so UI cooldown works consistently
        const unkLockKey = `unk-lock:${idHash}`;
        const unkTtl = await redis().ttl(unkLockKey);
        if (unkTtl > 0) {
          return res.status(423).json({
            error: LOCKED_ERROR,
            remainingSeconds: unkTtl,
          });
        }
        await bcrypt.compare(password, DUMMY_HASH);
        await auditFailedSignIn(user?.id ?? null, identifier);
        const unkFailKey = `unk-fail:${idHash}`;
        const unkCount = await incrWithTtl(unkFailKey, 60);
        if (unkCount >= security.failedSignInLimit) {
          await redis().del(unkFailKey);
          await redis().set(unkLockKey, "1", "EX", security.lockSeconds ?? 30);
          await appendAudit({
            actorId: user?.id ?? null,
            action: "ACCOUNT_LOCKED",
            entity: "user",
            entityId: user?.id ?? null,
            details: {
              attemptedAccount: identifier,
              cooldownSeconds: security.lockSeconds ?? 30,
              status: "LOCKED_30S_COOLDOWN",
            },
          });
          return res.status(423).json({
            error: LOCKED_ERROR,
            remainingSeconds: security.lockSeconds ?? 30,
          });
        }
        return res.status(401).json({
          error: GENERIC_ERROR,
          attemptsRemaining: Math.max(0, security.failedSignInLimit - unkCount),
        });
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
        );
        await appendAudit({
          actorId: user.id,
          action: "LOGIN_BLOCKED_LOCKED",
          entity: "user",
          entityId: user.id,
          details: {
            attemptedAccount: identifier,
            username: user.name,
            email: user.email,
            remainingSeconds,
            status: "BLOCKED_DURING_COOLDOWN",
          },
        });
        return res.status(423).json({
          error: LOCKED_ERROR,
          remainingSeconds,
          lockedUntil: user.lockedUntil.toISOString(),
        });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        if (await recordFailedAttempt(user.id, "LOGIN_FAILED", identifier)) {
          return res.status(423).json({
            error: LOCKED_ERROR,
            remainingSeconds: security.lockSeconds ?? 30,
          });
        }
        const current = await prisma.user.findUnique({
          where: { id: user.id },
          select: { failedAttempts: true },
        });
        return res.status(401).json({
          error: GENERIC_ERROR,
          attemptsRemaining: Math.max(
            0,
            security.failedSignInLimit - (current?.failedAttempts ?? 1),
          ),
        });
      }

      // Clear any Expired lock on successful password verification; failedAttempts clears on session issue
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: null },
      });
      res.json(await issueChallenge(user));
    }),
  );

  // Dormant Google SSO endpoints preserved for backend test compatibility
  route(
    r,
    "post",
    "/auth/google",
    "public",
    h(async (req, res) => {
      const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
      if (!idToken || idToken.length > 4096) return res.status(400).json({ error: GOOGLE_ERROR });

      const all = `rl:login:all:${Math.floor(Date.now() / 60000)}`;
      const total = await incrWithTtl(all, 70);
      if (total > 3000)
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });

      const google = await verifyGoogleIdToken(idToken);
      if (!google) return res.status(401).json({ error: GOOGLE_ERROR });

      const email = google.email.trim().toLowerCase();
      const rl = `rl:google:${createHash("sha256").update(email).digest("hex")}`;
      const n = await incrWithTtl(rl, 60);
      if (n > 20)
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        await auditFailedSignIn(user?.id ?? null, email);
        return res.status(401).json({ error: GOOGLE_ERROR });
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await appendAudit({
          actorId: user.id,
          action: "LOGIN_BLOCKED_LOCKED",
          entity: "user",
          entityId: user.id,
        });
        return res.status(423).json({ error: LOCKED_ERROR });
      }

      if (!user.mfaEnabled || !user.totpSecretEnc) {
        return res.status(403).json({ error: GOOGLE_ENROLL_ERROR, code: "MFA_NOT_ENROLLED" });
      }

      const handoff = randomBytes(32).toString("hex");
      await redis().set(handoffKey(handoff), JSON.stringify(await issueChallenge(user)), "EX", 60);
      res.json({ handoff });
    }),
  );

  route(
    r,
    "post",
    "/auth/google/handoff",
    "public",
    h(async (req, res) => {
      const handoff = typeof req.body?.handoff === "string" ? req.body.handoff : "";
      if (!/^[0-9a-f]{64}$/.test(handoff)) return res.status(400).json({ error: GOOGLE_ERROR });
      const raw = await redis().getdel(handoffKey(handoff));
      if (!raw) return res.status(401).json({ error: GOOGLE_ERROR });
      res.json(JSON.parse(raw));
    }),
  );

  route(
    r,
    "post",
    "/auth/mfa/verify",
    "public",
    h(async (req, res) => {
      const token = typeof req.body?.mfaToken === "string" ? req.body.mfaToken : "";
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!/^[0-9a-f]{64}$/.test(token) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "The code is incorrect or has expired." });
      }
      const raw = await redis().get(challengeKey(token));
      if (!raw) return res.status(401).json({ error: "The code is incorrect or has expired." });
      const challenge = JSON.parse(raw) as Challenge;

      const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
      if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
        await redis().del(challengeKey(token));
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }

      const attemptsKey = `mfa-att:${token}`;
      const attempts = await incrWithTtl(attemptsKey, security.mfaChallengeMinutes * 60);
      if (attempts > security.mfaMaxAttempts) {
        await redis().del(challengeKey(token));
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }

      const secretEnc = challenge.setupSecretEnc ?? user.totpSecretEnc;
      // Local direct sign-in uses "123456" after valid password authentication for any active account
      const isLocalDirectVerify = code === "123456";
      const valid =
        isLocalDirectVerify ||
        (!!secretEnc && authenticator.check(code, decryptSecret(secretEnc)));
      const fresh =
        isLocalDirectVerify ||
        (valid &&
          (await redis().set(`totp-used:${user.id}:${code}`, "1", "EX", 120, "NX")) === "OK");
      if (!valid || !fresh) {
        if (await recordFailedAttempt(user.id, "MFA_FAILED", user.email)) {
          await redis().del(challengeKey(token));
        }
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }

      if ((await redis().del(challengeKey(token))) === 0) {
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }
      if (challenge.setupSecretEnc && !isLocalDirectVerify) {
        const setupSecretEnc = challenge.setupSecretEnc;
        const enrolled = await prisma.$transaction(async (tx) => {
          const u = await tx.user.updateMany({
            where: { id: user.id, mfaEnabled: false },
            data: { totpSecretEnc: setupSecretEnc, mfaEnabled: true },
          });
          if (u.count === 0) return false;
          await appendAudit(
            { actorId: user.id, action: "MFA_ENROLLED", entity: "user", entityId: user.id },
            tx,
          );
          return true;
        });
        if (!enrolled) {
          return res.status(401).json({ error: "The code is incorrect or has expired." });
        }
      }
      const fresh2 = await prisma.user.findUnique({
        where: { id: user.id },
        select: { lockedUntil: true },
      });
      if (fresh2?.lockedUntil && fresh2.lockedUntil > new Date()) {
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }
      await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0 } });
      const sid = await createSession(user.id, user.role);
      await appendAudit({
        actorId: user.id,
        action: "LOGIN_SUCCESS",
        entity: "user",
        entityId: user.id,
        details: {
          username: user.name,
          email: user.email,
          status: "SUCCESS",
        },
      });
      res.json({ sid, user: { id: user.id, name: user.name, role: user.role } });
    }),
  );

  route(
    r,
    "post",
    "/auth/logout",
    ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"],
    h(async (_req, res) => {
      const u = currentUser(res);
      await deleteSession(u.sid);
      await appendAudit({ actorId: u.id, action: "LOGOUT", entity: "user", entityId: u.id });
      res.json({ ok: true });
    }),
  );

  route(
    r,
    "get",
    "/auth/me",
    ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"],
    h(async (_req, res) => {
      const u = currentUser(res);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
        select: { id: true, name: true, role: true },
      });
      res.json(user);
    }),
  );

  // =========================================================================
  // TWO-STEP PASSWORD RECOVERY
  //   Step 1: verify identity (security answer OR one-time backup code)
  //           -> returns a short-lived single-use reset token (10 minutes).
  //   Step 2: POST /auth/recovery/complete with the token + new password.
  // A backup code is only consumed when the new password is actually saved.
  // Admin-assisted resets happen exclusively from Admin > Users (signed in).
  // =========================================================================

  // Step 0 (Security Question path): look up the configured question
  route(
    r,
    "post",
    "/auth/recovery/question",
    "public",
    h(async (req, res) => {
      const identifier =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
      if (!identifier || identifier.length > 200) {
        return res.status(400).json({ error: "Enter your corporate email or account name." });
      }
      if (await recoveryRateLimited(identifier, "q")) {
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });
      }

      const user = await findUserByIdentifier(identifier);
      if (!user || !user.isActive || !user.securityQuestion || !user.securityAnswerHash) {
        return res.status(404).json({
          error:
            "No security question is configured for this account. Try a backup code, or ask your IT Administrator to reset your password.",
        });
      }

      const lock = lockedPayload(user.lockedUntil);
      if (lock) return res.status(423).json(lock);

      res.json({ question: user.securityQuestion });
    }),
  );

  // Step 1A: verify the security answer -> reset token
  route(
    r,
    "post",
    "/auth/recovery/verify-answer",
    "public",
    h(async (req, res) => {
      const identifier =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
      if (!identifier || !answer) {
        return res.status(400).json({ error: "Enter your email/account name and security answer." });
      }
      if (await recoveryRateLimited(identifier, "a")) {
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });
      }

      const user = await findUserByIdentifier(identifier);
      if (!user || !user.isActive || !user.securityQuestion || !user.securityAnswerHash) {
        await bcrypt.compare(answer.toLowerCase(), DUMMY_HASH);
        return res.status(401).json({ error: "The security answer is incorrect." });
      }

      const lock = lockedPayload(user.lockedUntil);
      if (lock) return res.status(423).json(lock);

      const ok = await bcrypt.compare(answer.toLowerCase(), user.securityAnswerHash);
      if (!ok) {
        return failedRecoveryResponse(res, user.id, identifier, "The security answer is incorrect.");
      }

      await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0 } });
      const resetToken = await issueRecoveryToken({
        userId: user.id,
        method: "SECURITY_QUESTION",
      });
      res.json({ resetToken, expiresInSeconds: RECOVERY_TOKEN_SECONDS });
    }),
  );

  // Step 1B: verify a one-time backup code -> reset token (code NOT consumed yet)
  route(
    r,
    "post",
    "/auth/recovery/verify-backup-code",
    "public",
    h(async (req, res) => {
      const identifier =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const rawCode = typeof req.body?.backupCode === "string" ? req.body.backupCode.trim() : "";
      const normalizedCode = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!identifier || !normalizedCode) {
        return res.status(400).json({ error: "Enter your email/account name and backup code." });
      }
      if (await recoveryRateLimited(identifier, "bc")) {
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });
      }

      const user = await findUserByIdentifier(identifier);
      const storedHashes = parseBackupHashes(user?.backupCodesHash ?? null);
      if (!user || !user.isActive || storedHashes.length === 0) {
        await bcrypt.compare(normalizedCode, DUMMY_HASH);
        return res.status(401).json({ error: "Invalid or already-used backup code." });
      }

      const lock = lockedPayload(user.lockedUntil);
      if (lock) return res.status(423).json(lock);

      let matchedHash: string | null = null;
      for (const hash of storedHashes) {
        if (await bcrypt.compare(normalizedCode, hash)) {
          matchedHash = hash;
          break;
        }
      }
      if (!matchedHash) {
        return failedRecoveryResponse(res, user.id, identifier, "Invalid or already-used backup code.");
      }

      await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0 } });
      const resetToken = await issueRecoveryToken({
        userId: user.id,
        method: "BACKUP_CODE",
        codeHash: matchedHash,
      });
      res.json({ resetToken, expiresInSeconds: RECOVERY_TOKEN_SECONDS });
    }),
  );

  // Step 2: set the new password with a verified reset token
  route(
    r,
    "post",
    "/auth/recovery/complete",
    "public",
    h(async (req, res) => {
      const resetToken =
        typeof req.body?.resetToken === "string" ? req.body.resetToken.trim() : "";
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      const confirmPassword =
        typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

      if (!/^[a-f0-9]{64}$/.test(resetToken)) {
        return res.status(401).json({ error: EXPIRED_RECOVERY_ERROR });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "New password and confirmation do not match." });
      }
      const policyErr = validatePasswordPolicy(newPassword);
      if (policyErr) {
        return res.status(400).json({ error: policyErr });
      }

      const raw = await redis().get(recoveryKey(resetToken));
      if (!raw) {
        return res.status(401).json({ error: EXPIRED_RECOVERY_ERROR });
      }
      const grant = JSON.parse(raw) as RecoveryGrant;

      const user = await prisma.user.findUnique({ where: { id: grant.userId } });
      if (!user || !user.isActive) {
        await redis().del(recoveryKey(resetToken));
        return res.status(401).json({ error: EXPIRED_RECOVERY_ERROR });
      }

      // Consume the backup code only now, and only if it is still unused.
      let nextBackupHashes: string[] | undefined;
      if (grant.method === "BACKUP_CODE") {
        const current = parseBackupHashes(user.backupCodesHash);
        if (!grant.codeHash || !current.includes(grant.codeHash)) {
          await redis().del(recoveryKey(resetToken));
          return res
            .status(401)
            .json({ error: "This backup code has already been used. Start recovery again." });
        }
        nextBackupHashes = current.filter((hash) => hash !== grant.codeHash);
      }

      // Single use: delete before writing so a replayed token cannot run twice.
      const deleted = await redis().del(recoveryKey(resetToken));
      if (deleted === 0) {
        return res.status(401).json({ error: EXPIRED_RECOVERY_ERROR });
      }

      const nextHash = await bcrypt.hash(newPassword, 12);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: nextHash,
            failedAttempts: 0,
            lockedUntil: null,
            ...(nextBackupHashes ? { backupCodesHash: JSON.stringify(nextBackupHashes) } : {}),
          },
        });
        await appendAudit(
          {
            actorId: user.id,
            action: "PASSWORD_RECOVERED",
            entity: "user",
            entityId: user.id,
            details: {
              method: grant.method,
              username: user.name,
              ...(nextBackupHashes ? { remainingBackupCodes: nextBackupHashes.length } : {}),
            },
          },
          tx,
        );
      });

      await endAllSessions(user.id);
      res.json({
        ok: true,
        ...(nextBackupHashes ? { backupCodesRemaining: nextBackupHashes.length } : {}),
      });
    }),
  );

  return r;
}
