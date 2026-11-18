// FR-01 (email/password and Google SSO), FR-02 (TOTP MFA), NFR-01.
// Step 1 POST /auth/login checks the password and returns a short-lived MFA challenge.
// Step 2 POST /auth/mfa/verify (called by NextAuth's Credentials provider) checks the
// TOTP code and creates the Redis session whose id goes into the NextAuth JWT.
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
import { createSession, deleteSession } from "./sessions.js";
import { route, h, currentUser } from "../rbac/route.js";

authenticator.options = { window: 1 };

// Constant work for unknown emails, so timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-only", 12);

const GENERIC_ERROR = "Email or password is incorrect.";
const LOCKED_ERROR = "Too many failed attempts. This account is locked for 15 minutes.";

interface Challenge {
  userId: string;
  setupSecretEnc?: string;
}

const challengeKey = (t: string) => `mfa:${t}`;
const handoffKey = (t: string) => `google-handoff:${t}`;

const GOOGLE_ENROLL_ERROR =
  "Sign in with your email and password the first time to set up your authenticator app.";

/**
 * LOGIN_FAILED for step 1 (password or Google). Known but inactive accounts are always
 * audited with their id. Unknown emails: individual entries up to 300 per minute; past that,
 * one summary entry per minute so the activity is recorded but cannot flood the append-only log.
 */
async function auditFailedSignIn(userId: string | null) {
  if (userId) {
    await appendAudit({ actorId: null, action: "LOGIN_FAILED", entity: "user", entityId: userId });
    return;
  }
  const bucket = `audit:unknown-login:${Math.floor(Date.now() / 60000)}`;
  const count = await incrWithTtl(bucket, 70);
  if (count <= 300) {
    await appendAudit({ actorId: null, action: "LOGIN_FAILED", entity: "user", entityId: null });
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
 * Count one wrong password or TOTP code and lock the account at the limit. The counter, the
 * lock and their audit entries (LOGIN_FAILED or MFA_FAILED, then ACCOUNT_LOCKED) commit
 * together. The UPDATE row lock serializes parallel wrong guesses, so none can skip the lock.
 * Returns true when this attempt locked the account.
 */
export async function recordFailedAttempt(userId: string, action: "LOGIN_FAILED" | "MFA_FAILED") {
  return prisma.$transaction(async (tx) => {
    const { failedAttempts } = await tx.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    await appendAudit({ actorId: userId, action, entity: "user", entityId: userId }, tx);
    if (failedAttempts < security.failedSignInLimit) return false;
    await tx.user.update({
      where: { id: userId },
      data: {
        failedAttempts: 0,
        lockedUntil: new Date(Date.now() + security.lockMinutes * 60_000),
      },
    });
    await appendAudit(
      { actorId: userId, action: "ACCOUNT_LOCKED", entity: "user", entityId: userId },
      tx,
    );
    return true;
  });
}

const GOOGLE_ERROR = "This Google account cannot sign in. Use your company email and password.";

/** Step 1 success (password or Google): a short-lived MFA challenge, with TOTP setup on first sign-in. */
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
    // Shown once, only to this user, so they can add it to an authenticator app.
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
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password || password.length > 256) {
        return res.status(400).json({ error: GENERIC_ERROR });
      }

      // Per-account attempt limiter (keyed by a hash of the email; no IP addresses stored).
      const rl = `rl:login:${createHash("sha256").update(email).digest("hex")}`;
      const n = await incrWithTtl(rl, 60);
      // Global throttle before any bcrypt or DB work. Set high (3000/min, far above the
      // expected load of a Legal Department) so it only trips under a flood. No IP addresses
      // are used or stored (NFR-04 decision pending).
      const all = `rl:login:all:${Math.floor(Date.now() / 60000)}`;
      const total = await incrWithTtl(all, 70);
      if (n > 20 || total > 3000)
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        await bcrypt.compare(password, DUMMY_HASH);
        await auditFailedSignIn(user?.id ?? null);
        return res.status(401).json({ error: GENERIC_ERROR });
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

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        if (await recordFailedAttempt(user.id, "LOGIN_FAILED")) {
          return res.status(423).json({ error: LOCKED_ERROR });
        }
        return res.status(401).json({ error: GENERIC_ERROR });
      }

      // The failure counter is cleared only after MFA succeeds, so wrong codes add up
      // across challenges (password success alone does not reset it).
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: null } });
      res.json(await issueChallenge(user));
    }),
  );

  // FR-01 Google Workspace SSO, allow-list by email: the Google account must match an
  // existing user row (no auto-create). TOTP is still required afterwards (FR-02).
  // The web app's NextAuth callback posts the Google ID token here, then sends the browser
  // to /login/google with a single-use handoff; the browser trades it for the MFA challenge,
  // so the TOTP setup secret never appears in a URL.
  route(
    r,
    "post",
    "/auth/google",
    "public",
    h(async (req, res) => {
      const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
      if (!idToken || idToken.length > 4096) return res.status(400).json({ error: GOOGLE_ERROR });

      // Same global throttle as password sign-in, before the outbound call to Google.
      const all = `rl:login:all:${Math.floor(Date.now() / 60000)}`;
      const total = await incrWithTtl(all, 70);
      if (total > 3000)
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });

      const google = await verifyGoogleIdToken(idToken);
      if (!google) return res.status(401).json({ error: GOOGLE_ERROR });

      const email = google.email.trim().toLowerCase();
      // Per-email limiter on the verified email, so one replayed ID token (valid until it
      // expires) cannot drive unlimited sign-in attempts or audit writes.
      const rl = `rl:google:${createHash("sha256").update(email).digest("hex")}`;
      const n = await incrWithTtl(rl, 60);
      if (n > 20)
        return res.status(429).json({ error: "Too many requests. Try again in a minute." });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        await auditFailedSignIn(user?.id ?? null);
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

      // Google proves the mailbox, not the password. The authenticator must already be set
      // up through a password sign-in, so Google alone can never enrol a new TOTP secret.
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
      // A locked account cannot finish MFA with a challenge issued before the lock.
      if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
        await redis().del(challengeKey(token));
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }

      // Atomic attempt counter per challenge, checked before the code is tested.
      const attemptsKey = `mfa-att:${token}`;
      const attempts = await incrWithTtl(attemptsKey, security.mfaChallengeMinutes * 60);
      if (attempts > security.mfaMaxAttempts) {
        await redis().del(challengeKey(token));
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }

      const secretEnc = challenge.setupSecretEnc ?? user.totpSecretEnc;
      const valid = !!secretEnc && authenticator.check(code, decryptSecret(secretEnc));
      // A code is accepted once per user (no replay within its validity window).
      const fresh =
        valid && (await redis().set(`totp-used:${user.id}:${code}`, "1", "EX", 120, "NX")) === "OK";
      if (!valid || !fresh) {
        // Wrong codes count toward the same sign-in lock as wrong passwords, across challenges.
        if (await recordFailedAttempt(user.id, "MFA_FAILED")) {
          await redis().del(challengeKey(token));
        }
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }

      // Consume the challenge atomically: only one request can turn it into a session.
      if ((await redis().del(challengeKey(token))) === 0) {
        return res.status(401).json({ error: "The code is incorrect or has expired." });
      }
      if (challenge.setupSecretEnc) {
        // Enrollment only for an account that has never enrolled: an old setup challenge
        // can never replace a secret the user already set up.
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
      // Re-check the lock right before the session: it may have fired during this request.
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

  return r;
}
