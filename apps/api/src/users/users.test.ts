// FR-04 user management + NFR-09 Tenant assignment — DECISIONS D13, STUDY_CONTEXT §3 guardrails,
// §8 settings 4 (password ≥ 15), 5 (block common passwords), 11 (MFA re-entry), 12 (end sessions).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis, redis } from "../redis.js";
import { encryptSecret } from "../auth/secrets.js";
import { createSession } from "../auth/sessions.js";
import { makeUser, cookieFor, lastAudit, TEST_PASSWORD } from "../test/helpers.js";

const app = createApp();
const SECRET = "JBSWY3DPEHPK3PXP";
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
let it2 = "";
let it2Id = "";

const enrolled = () => ({ mfaEnabled: true, totpSecretEnc: encryptSecret(SECRET) });

async function stepUp(cookie: string) {
  return request(app)
    .post("/auth/step-up")
    .set("Cookie", cookie)
    .send({ code: authenticator.generate(SECRET) });
}

const admin = (method: "post" | "patch", path: string, body: object = {}, cookie = c.IT_ADMIN) =>
  request(app)[method](path).set("Cookie", cookie).send(body);

const newUser = (role = "LEGAL") => ({
  email: `new-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}@xcement.example`,
  name: `New ${role}`,
  role,
  password: "a-long-synthetic-passphrase-42",
});

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role, role === "IT_ADMIN" ? enrolled() : {});
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
  const second = await makeUser("IT_ADMIN", enrolled());
  it2Id = second.id;
  it2 = await cookieFor(second);
  await stepUp(c.IT_ADMIN);
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("MFA re-entry for sensitive IT actions (setting 11)", () => {
  it("refuses an action without a recent step-up, and a wrong code", async () => {
    const res = await admin("post", "/admin/users", newUser(), it2);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MFA_REQUIRED");
    expect(
      (await request(app).post("/auth/step-up").set("Cookie", it2).send({ code: "000000" })).status,
    ).toBe(400);
  });
});

describe("FR-04 user management (D13)", () => {
  it("lists users with role, MFA, lock and active state for IT only", async () => {
    const res = await request(app).get("/admin/users").set("Cookie", c.IT_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        role: expect.any(String),
        mfaEnabled: expect.any(Boolean),
        locked: expect.any(Boolean),
        isActive: expect.any(Boolean),
      }),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|totpSecret/);
    expect((await request(app).get("/admin/users").set("Cookie", c.LEGAL)).status).toBe(403);
  });

  it("creates a user with a password of at least 15 characters that is not a common password", async () => {
    expect(
      (await admin("post", "/admin/users", { ...newUser(), password: "short-pass" })).status,
    ).toBe(400);
    expect(
      (await admin("post", "/admin/users", { ...newUser(), password: "passwordpassword" })).status,
    ).toBe(400);
    expect(
      (await admin("post", "/admin/users", { ...newUser(), role: "SUPER_ADMIN" })).status,
    ).toBe(400);
    const body = newUser("MANAGEMENT");
    const res = await admin("post", "/admin/users", body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: body.email,
      role: "MANAGEMENT",
      isActive: true,
      mfaEnabled: false,
    });
    expect((await admin("post", "/admin/users", body)).status).toBe(409);
    expect(JSON.parse((await lastAudit("USER_CREATED"))!.details!)).toEqual({
      userId: res.body.id,
      role: "MANAGEMENT",
    });
  });

  it("changes a role, ends that user's sessions and logs ROLE_CHANGED", async () => {
    const u = (await admin("post", "/admin/users", newUser("LEGAL"))).body;
    const sid = await createSession(u.id, "LEGAL");
    const res = await admin("patch", `/admin/users/${u.id}`, { role: "MANAGEMENT" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("MANAGEMENT");
    expect(await redis().get(`sess:${sid}`)).toBeNull();
    expect(JSON.parse((await lastAudit("ROLE_CHANGED"))!.details!)).toEqual({
      userId: u.id,
      from: "LEGAL",
      to: "MANAGEMENT",
    });
  });

  it("IT cannot change their own role", async () => {
    expect((await admin("patch", `/admin/users/${ids.IT_ADMIN}`, { role: "LEGAL" })).status).toBe(
      400,
    );
  });

  it("deactivates a user (sessions end) and refuses to deactivate or demote the last active IT Administrator", async () => {
    const u = (await admin("post", "/admin/users", newUser("TENANT"))).body;
    const sid = await createSession(u.id, "TENANT");
    expect((await admin("post", `/admin/users/${u.id}/deactivate`)).status).toBe(200);
    expect(await redis().get(`sess:${sid}`)).toBeNull();
    expect(await lastAudit("USER_DEACTIVATED")).toBeTruthy();

    // Leave exactly one active IT Administrator (this test's actor), then try to remove it.
    await prisma.user.updateMany({
      where: { role: "IT_ADMIN", id: { not: ids.IT_ADMIN } },
      data: { isActive: false },
    });
    expect((await admin("post", `/admin/users/${ids.IT_ADMIN}/deactivate`)).status).toBe(409);
    await prisma.user.update({ where: { id: it2Id }, data: { isActive: true } });
  });

  it("unlocks an account, resets MFA and ends sessions, each logged as USER_UPDATED", async () => {
    const u = await makeUser("LEGAL", enrolled());
    await prisma.user.update({
      where: { id: u.id },
      data: { lockedUntil: new Date(Date.now() + 600_000), failedAttempts: 5 },
    });
    expect((await admin("post", `/admin/users/${u.id}/unlock`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lockedUntil).toBeNull();

    expect((await admin("post", `/admin/users/${u.id}/reset-mfa`)).status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.mfaEnabled).toBe(false);
    expect(after.totpSecretEnc).toBeNull();

    const sid = await createSession(u.id, "LEGAL");
    expect((await admin("post", `/admin/users/${u.id}/end-sessions`)).status).toBe(200);
    expect(await redis().get(`sess:${sid}`)).toBeNull();
    expect(JSON.parse((await lastAudit("USER_UPDATED"))!.details!)).toEqual({
      userId: u.id,
      change: "SESSIONS_ENDED",
    });
  });

  it("allows IT Admin to edit a user's name and reset their password after verifying the admin's own password", async () => {
    const targetUser = await makeUser("LEGAL");

    // Wrong admin password rejected with 401
    const wrongAdminPw = await request(app)
      .patch(`/admin/users/${targetUser.id}`)
      .set("Cookie", it2)
      .send({
        name: "Atty. Updated Name",
        password: "NewStrong#2026",
        adminPassword: "wrong-admin-password",
      });
    expect(wrongAdminPw.status).toBe(401);

    // Weak target password rejected with 400
    const weakPw = await request(app)
      .patch(`/admin/users/${targetUser.id}`)
      .set("Cookie", it2)
      .send({
        name: "Atty. Updated Name",
        password: "weak",
        adminPassword: TEST_PASSWORD,
      });
    expect(weakPw.status).toBe(400);

    // Valid admin password updates target user's name and password
    const okRes = await request(app)
      .patch(`/admin/users/${targetUser.id}`)
      .set("Cookie", it2)
      .send({
        name: "Atty. Updated Name",
        position: "Chief Legal Officer",
        password: "NewStrong#2026",
        adminPassword: TEST_PASSWORD,
      });
    expect(okRes.status).toBe(200);
    expect(okRes.body.name).toBe("Atty. Updated Name");
    expect(okRes.body.position).toBe("Chief Legal Officer");

    // Target user can log in with the new password set by the admin
    const loginRes = await request(app).post("/auth/login").send({
      email: targetUser.email,
      password: "NewStrong#2026",
    });
    expect(loginRes.status).toBe(200);
  });
});

describe("NFR-09 Tenant assignment (D13)", () => {
  let parcelId = "";
  beforeAll(async () => {
    const p = await request(app)
      .post("/parcels")
      .set("Cookie", c.LEGAL)
      .send({
        name: `Assign Lot ${Date.now()}`,
        province: "Bulacan",
        titleNo: "TCT T-21",
        areaHa: 1,
        lat: 14.9,
        lng: 121,
      });
    parcelId = p.body.id;
  });

  it("only works on an approved parcel and only for Tenant users", async () => {
    const assign = (userId: string) =>
      request(app).post(`/parcels/${parcelId}/tenants`).set("Cookie", c.LEGAL).send({ userId });
    expect((await assign(ids.TENANT)).status).toBe(409); // still pending
    await request(app).post(`/parcels/${parcelId}/approve`).set("Cookie", c.MANAGEMENT);
    expect((await assign(ids.MANAGEMENT)).status).toBe(400);
    expect((await assign(ids.TENANT)).status).toBe(201);
    expect((await assign(ids.TENANT)).status).toBe(409);
    expect(JSON.parse((await lastAudit("TENANT_ASSIGNED"))!.details!)).toEqual({
      parcelId,
      userId: ids.TENANT,
    });

    expect((await request(app).get(`/parcels/${parcelId}`).set("Cookie", c.TENANT)).status).toBe(
      200,
    );
    const del = await request(app)
      .delete(`/parcels/${parcelId}/tenants/${ids.TENANT}`)
      .set("Cookie", c.LEGAL);
    expect(del.status).toBe(204);
    expect(await lastAudit("TENANT_UNASSIGNED")).toBeTruthy();
    expect((await request(app).get(`/parcels/${parcelId}`).set("Cookie", c.TENANT)).status).toBe(
      403,
    );
  });

  it.each(["MANAGEMENT", "TENANT", "IT_ADMIN"])("refuses assignment by %s", async (role) => {
    const res = await request(app)
      .post(`/parcels/${parcelId}/tenants`)
      .set("Cookie", c[role])
      .send({ userId: ids.TENANT });
    expect(res.status).toBe(403);
  });
});

describe("security review fixes", () => {
  it("two parallel deactivations cannot remove the last active IT Administrator", async () => {
    const a = await makeUser("IT_ADMIN", enrolled());
    const b = await makeUser("IT_ADMIN", enrolled());
    // Only a, b and this test's actor are active IT Administrators.
    await prisma.user.updateMany({
      where: { role: "IT_ADMIN", id: { notIn: [a.id, b.id, ids.IT_ADMIN] } },
      data: { isActive: false },
    });
    await admin("post", `/admin/users/${a.id}/deactivate`);
    const results = await Promise.all([
      admin("post", `/admin/users/${b.id}/deactivate`),
      admin("post", `/admin/users/${ids.IT_ADMIN}/deactivate`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.user.count({ where: { role: "IT_ADMIN", isActive: true } })).toBe(1);
    await prisma.user.updateMany({
      where: { id: { in: [b.id, ids.IT_ADMIN, it2Id] } },
      data: { isActive: true },
    });
  });

  it("wrong step-up codes count toward the account lock, which ends all sessions", async () => {
    const u = await makeUser("IT_ADMIN", enrolled());
    const cookie = await cookieFor(u);
    const sid = await createSession(u.id, "IT_ADMIN");
    for (let i = 0; i < 5; i++) {
      await request(app).post("/auth/step-up").set("Cookie", cookie).send({ code: "000000" });
    }
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.lockedUntil && after.lockedUntil > new Date()).toBe(true);
    expect(await redis().get(`sess:${sid}`)).toBeNull();
  });
});

describe("step-up guessing in parallel", () => {
  it("cannot test more than 5 codes per account, even when sent at once", async () => {
    const u = await makeUser("IT_ADMIN", enrolled());
    const cookie = await cookieFor(u);
    const res = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        request(app)
          .post("/auth/step-up")
          .set("Cookie", cookie)
          .send({ code: String(100000 + i) }),
      ),
    );
    const tested = res.filter((r) => r.status === 400).length;
    expect(tested).toBeLessThanOrEqual(5);
  });
});
