// FR-01 (Google Workspace SSO, allow-list by email), FR-02 (TOTP still required after Google).
import { describe, it, expect, afterAll, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, lastAudit } from "../test/helpers.js";
import { verifyGoogleIdToken } from "./google.js";
import { encryptSecret } from "./secrets.js";

vi.mock("./google.js", () => ({ verifyGoogleIdToken: vi.fn() }));
const verify = vi.mocked(verifyGoogleIdToken);

const app = createApp();
const ID_TOKEN = "header.payload.signature";
// Google sign-in is only for accounts that already set up TOTP with their password.
const enrolled = () => ({ mfaEnabled: true, totpSecretEnc: encryptSecret("JBSWY3DPEHPK3PXP") });

beforeEach(() => verify.mockReset());

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("POST /auth/google", () => {
  it("issues a one-time handoff for a registered email; the handoff yields an MFA challenge once", async () => {
    const u = await makeUser("LEGAL", enrolled());
    verify.mockResolvedValue({ email: u.email.toUpperCase() });

    const step1 = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(step1.status).toBe(200);
    expect(step1.body.handoff).toMatch(/^[0-9a-f]{64}$/);
    expect(step1.body.mfaToken).toBeUndefined();
    expect(verify).toHaveBeenCalledWith(ID_TOKEN);

    const step2 = await request(app)
      .post("/auth/google/handoff")
      .send({ handoff: step1.body.handoff });
    expect(step2.status).toBe(200);
    expect(step2.body.mfaToken).toMatch(/^[0-9a-f]{64}$/);
    expect(step2.body.mfaSetup).toBeNull();

    const reused = await request(app)
      .post("/auth/google/handoff")
      .send({ handoff: step1.body.handoff });
    expect(reused.status).toBe(401);
  });

  it("refuses a Google account with no user row and audits LOGIN_FAILED", async () => {
    verify.mockResolvedValue({ email: "nobody-registered@gmail.example" });
    const res = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(res.status).toBe(401);
    expect(res.body.handoff).toBeUndefined();
    expect(await lastAudit("LOGIN_FAILED")).toBeTruthy();
  });

  it("refuses a token Google does not accept", async () => {
    verify.mockResolvedValue(null);
    const res = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(res.status).toBe(401);
  });

  it("refuses a missing token without calling Google", async () => {
    const res = await request(app).post("/auth/google").send({});
    expect(res.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses an inactive account and audits it with its id", async () => {
    const u = await makeUser("MANAGEMENT");
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    verify.mockResolvedValue({ email: u.email });
    const res = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(res.status).toBe(401);
    const entry = await lastAudit("LOGIN_FAILED");
    expect(entry?.entityId).toBe(u.id);
  });

  it("answers 423 for a locked account", async () => {
    const u = await makeUser("TENANT", enrolled());
    await prisma.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date(Date.now() + 60_000) },
    });
    verify.mockResolvedValue({ email: u.email });
    const res = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(res.status).toBe(423);
    expect(await lastAudit("LOGIN_BLOCKED_LOCKED")).toBeTruthy();
  });

  it("refuses an account without TOTP set up (first sign-in must use the password)", async () => {
    const u = await makeUser("LEGAL");
    verify.mockResolvedValue({ email: u.email });
    const res = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MFA_NOT_ENROLLED");
    expect(res.body.handoff).toBeUndefined();
  });

  it("limits Google sign-ins per email to 20 a minute (replayed tokens)", async () => {
    const u = await makeUser("LEGAL", enrolled());
    verify.mockResolvedValue({ email: u.email });
    for (let i = 0; i < 20; i++) {
      expect((await request(app).post("/auth/google").send({ idToken: ID_TOKEN })).status).toBe(200);
    }
    const res = await request(app).post("/auth/google").send({ idToken: ID_TOKEN });
    expect(res.status).toBe(429);
  });

  it("rejects a malformed handoff", async () => {
    const res = await request(app).post("/auth/google/handoff").send({ handoff: "../x" });
    expect(res.status).toBe(400);
  });
});
