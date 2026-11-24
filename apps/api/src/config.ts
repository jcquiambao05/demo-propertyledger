// Env vars only; values are never logged (STUDY_CONTEXT §8).
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  get nextAuthSecret() {
    return required("NEXTAUTH_SECRET");
  },
  get mfaKeyHex() {
    const k = required("MFA_ENCRYPTION_KEY");
    if (!/^[0-9a-fA-F]{64}$/.test(k))
      throw new Error("MFA_ENCRYPTION_KEY must be 64 hex characters");
    return k;
  },
  get redisUrl() {
    return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? "uploads";
  },
};

// STUDY_CONTEXT §8 security settings (defaults; the settings page is not in this build).
export const security = {
  failedSignInLimit: 3,
  lockMinutes: 0.5, // 30-second cooldown after 3 consecutive failed attempts
  lockSeconds: 30,
  requestsPerMinute: 100,
  inactivityMinutes: 30,
  maxSessionHours: 12,
  mfaChallengeMinutes: 5,
  mfaMaxAttempts: 5,
  maxUploadBytes: 20 * 1024 * 1024,
};
