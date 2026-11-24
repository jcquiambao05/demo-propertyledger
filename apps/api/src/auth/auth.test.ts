// FR-01 (email/password), FR-02 (TOTP), FR-03 (deny-by-default RBAC), NFR-01 (lockout).
import { describe, it, expect, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { authenticator } from "otplib";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { route, assertAllRoutesDeclared } from "../rbac/route.js";
import { makeUser, cookieFor, lastAudit, TEST_PASSWORD } from "../test/helpers.js";

const app = createApp();

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("sign-in with password and TOTP", () => {
  it("sets up TOTP on first sign-in, then signs in with a code", async () => {
    const u = await makeUser("LEGAL");
    const step1 = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: TEST_PASSWORD });
    expect(step1.status).toBe(200);
    expect(step1.body.mfaSetup.secret).toBeTruthy();

    const code = authenticator.generate(step1.body.mfaSetup.secret);
    const step2 = await request(app)
      .post("/auth/mfa/verify")
      .send({ mfaToken: step1.body.mfaToken, code });
    expect(step2.status).toBe(200);
    expect(step2.body.sid).toMatch(/^[0-9a-f]{64}$/);
    expect(step2.body.user.role).toBe("LEGAL");

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.mfaEnabled).toBe(true);
    expect(stored.totpSecretEnc).not.toContain(step1.body.mfaSetup.secret);

    const again = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: TEST_PASSWORD });
    expect(again.body.mfaSetup).toBeNull();
    const ok = await request(app)
      .post("/auth/mfa/verify")
      .send({
        mfaToken: again.body.mfaToken,
        code: authenticator.clone({ epoch: Date.now() + 30_000 }).generate(step1.body.mfaSetup.secret),
      });
    expect(ok.status).toBe(200);
    expect(await lastAudit("LOGIN_SUCCESS")).toMatchObject({ actorId: u.id });
  });

  it("rejects a wrong TOTP code", async () => {
    const u = await makeUser("MANAGEMENT");
    const step1 = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: TEST_PASSWORD });
    const bad = await request(app)
      .post("/auth/mfa/verify")
      .send({ mfaToken: step1.body.mfaToken, code: "000000" });
    expect(bad.status).toBe(401);
  });

  it("gives the same generic error for an unknown email and a wrong password", async () => {
    const u = await makeUser("LEGAL");
    const wrong = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: "not-the-password" });
    const unknown = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@xcement.example", password: "not-the-password" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it("locks the account for 30 seconds after 3 consecutive failed attempts", async () => {
    const u = await makeUser("LEGAL");
    for (let i = 0; i < 2; i++) {
      const r = await request(app)
        .post("/auth/login")
        .send({ email: u.email, password: "wrong-password" });
      expect(r.status).toBe(401);
    }
    const third = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: "wrong-password" });
    expect(third.status).toBe(423);
    expect(third.body.remainingSeconds).toBeLessThanOrEqual(30);
    const correct = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: TEST_PASSWORD });
    expect(correct.status).toBe(423);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const seconds = (stored.lockedUntil!.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThanOrEqual(30);
    expect(await lastAudit("ACCOUNT_LOCKED")).toMatchObject({ actorId: u.id });
  });
});

describe("deny-by-default RBAC", () => {
  it("returns 401 without a session and 200 with one", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401);
    const u = await makeUser("TENANT");
    const res = await request(app)
      .get("/auth/me")
      .set("Cookie", await cookieFor(u));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("TENANT");
  });

  it("answers 403 and logs ACCESS_DENIED for a role that is not allowed", async () => {
    const mini = express();
    route(mini, "get", "/it-only", ["IT_ADMIN"], (_req, res) => {
      res.json({ ok: true });
    });
    const u = await makeUser("LEGAL");
    const res = await request(mini)
      .get("/it-only")
      .set("Cookie", await cookieFor(u));
    expect(res.status).toBe(403);
    expect(await lastAudit("ACCESS_DENIED")).toMatchObject({
      actorId: u.id,
      entityId: "GET /it-only",
    });
  });

  it("refuses to start when a route has no access declaration", () => {
    const bad = express();
    bad.get("/undeclared", (_req, res) => {
      res.json({});
    });
    expect(() => assertAllRoutesDeclared(bad)).toThrow(/no access declaration/);
  });

  it("rejects a forged session cookie", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "next-auth.session-token=forged");
    expect(res.status).toBe(401);
  });
});

describe("security review fixes", () => {
  it("accepts a TOTP code only once (no replay) and consumes the challenge", async () => {
    const u = await makeUser("LEGAL");
    const s1 = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
    const secret = s1.body.mfaSetup.secret as string;
    const code = authenticator.generate(secret);
    const first = await request(app).post("/auth/mfa/verify").send({ mfaToken: s1.body.mfaToken, code });
    expect(first.status).toBe(200);
    const reuseToken = await request(app).post("/auth/mfa/verify").send({ mfaToken: s1.body.mfaToken, code });
    expect(reuseToken.status).toBe(401);
    const s2 = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
    const replay = await request(app).post("/auth/mfa/verify").send({ mfaToken: s2.body.mfaToken, code });
    expect(replay.status).toBe(401);
  });

  it("locks after 3 parallel wrong passwords", async () => {
    const u = await makeUser("LEGAL");
    await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app).post("/auth/login").send({ email: u.email, password: "wrong-password" }),
      ),
    );
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.lockedUntil).not.toBeNull();
  });

  it("ends the session when the user is deactivated", async () => {
    const u = await makeUser("MANAGEMENT");
    const cookie = await cookieFor(u);
    expect((await request(app).get("/auth/me").set("Cookie", cookie)).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect((await request(app).get("/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});

describe("reviewer findings", () => {
  it("an old setup challenge cannot replace an enrolled secret", async () => {
    const u = await makeUser("LEGAL");
    const a = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
    const b = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
    const ok = await request(app)
      .post("/auth/mfa/verify")
      .send({ mfaToken: a.body.mfaToken, code: authenticator.generate(a.body.mfaSetup.secret) });
    expect(ok.status).toBe(200);
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).totpSecretEnc;
    const hijack = await request(app)
      .post("/auth/mfa/verify")
      .send({ mfaToken: b.body.mfaToken, code: authenticator.generate(b.body.mfaSetup.secret) });
    expect(hijack.status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).totpSecretEnc).toBe(before);
  });

  it("3 wrong MFA codes across challenges lock the account", async () => {
    const u = await makeUser("MANAGEMENT");
    for (let i = 0; i < 3; i++) {
      const s = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
      expect(s.status).toBe(200);
      await request(app).post("/auth/mfa/verify").send({ mfaToken: s.body.mfaToken, code: "000000" });
    }
    const after = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
    expect(after.status).toBe(423);
  });

  it("a malformed session cookie gives 401, not 500", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "next-auth.session-token=%E0%A4%A");
    expect(res.status).toBe(401);
  });
});

describe("lock applies to outstanding MFA challenges", () => {
  it("a challenge issued before the lock cannot complete sign-in", async () => {
    const u = await makeUser("LEGAL");
    const held = await request(app).post("/auth/login").send({ email: u.email, password: TEST_PASSWORD });
    await prisma.user.update({ where: { id: u.id }, data: { lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    const res = await request(app)
      .post("/auth/mfa/verify")
      .send({ mfaToken: held.body.mfaToken, code: authenticator.generate(held.body.mfaSetup.secret) });
    expect(res.status).toBe(401);
  });
});
