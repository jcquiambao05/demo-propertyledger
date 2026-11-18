// STUDY_CONTEXT §8 setting 11 (locked on): re-enter MFA for sensitive actions. A current TOTP
// code opens a 5-minute window for this session only (design detail; D13 says "need MFA
// re-entry"). Codes are single-use (same replay guard as sign-in).
import type { Response } from "express";
import { Router } from "express";
import { authenticator } from "otplib";
import { prisma } from "../db.js";
import { redis, incrWithTtl } from "../redis.js";
import { security } from "../config.js";
import { decryptSecret } from "../auth/secrets.js";
import { recordFailedAttempt } from "../auth/routes.js";
import { endAllSessions } from "../auth/sessions.js";
import { route, h, currentUser } from "../rbac/route.js";

const WINDOW_SECONDS = security.mfaChallengeMinutes * 60;
const stepKey = (sid: string) => `stepup:${sid}`;

/** Answers 400 MFA_REQUIRED and returns false unless this session re-entered MFA recently. */
export async function requireStepUp(res: Response): Promise<boolean> {
  const { sid } = currentUser(res);
  if (await redis().get(stepKey(sid))) return true;
  res.status(400).json({
    error: "Enter a current code from your authenticator app to continue.",
    code: "MFA_REQUIRED",
  });
  return false;
}

export function stepUpRouter(): Router {
  const r = Router();
  route(
    r,
    "post",
    "/auth/step-up",
    ["IT_ADMIN"],
    h(async (req, res) => {
      const u = currentUser(res);
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      // Atomic per-account attempt counter, taken BEFORE the code is tested, so parallel
      // guesses cannot all slip in ahead of the lock (security review). Same window as the lock.
      const attempts = `stepup-att:${u.id}`;
      const n = await incrWithTtl(attempts, security.lockMinutes * 60);
      if (n > security.mfaMaxAttempts)
        return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      const user = await prisma.user.findUnique({ where: { id: u.id } });
      if (!user || (user.lockedUntil && user.lockedUntil > new Date()))
        return res.status(423).json({ error: "This account is locked for 15 minutes." });
      const valid =
        /^\d{6}$/.test(code) &&
        !!user.totpSecretEnc &&
        authenticator.check(code, decryptSecret(user.totpSecretEnc));
      const fresh =
        valid && (await redis().set(`totp-used:${u.id}:${code}`, "1", "EX", 120, "NX")) === "OK";
      if (!fresh) {
        // Same per-account counter and 15-minute lock as sign-in (setting 7); a lock signs
        // the user out everywhere, so a stolen session cannot keep guessing.
        if (await recordFailedAttempt(u.id, "MFA_FAILED")) {
          await endAllSessions(u.id);
          return res.status(423).json({ error: "This account is locked for 15 minutes." });
        }
        return res.status(400).json({ error: "That code is not correct or has expired." });
      }
      // Re-check right before granting: a lock may have fired during this request.
      const now = await prisma.user.findUnique({
        where: { id: u.id },
        select: { lockedUntil: true },
      });
      if (now?.lockedUntil && now.lockedUntil > new Date())
        return res.status(423).json({ error: "This account is locked for 15 minutes." });
      await redis().del(attempts);
      await redis().set(stepKey(u.sid), "1", "EX", WINDOW_SECONDS);
      res.json({ ok: true, validForSeconds: WINDOW_SECONDS });
    }),
  );
  return r;
}
