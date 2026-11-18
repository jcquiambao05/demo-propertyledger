// NFR-01, FR-19 (review finding a): a failed sign-in attempt and its audit entry are saved
// together. If the audit write fails, the attempt counter is not changed either.
import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser } from "../test/helpers.js";
import * as chain from "../audit/chain.js";

const app = createApp();

afterAll(async () => {
  vi.restoreAllMocks();
  await closeRedis();
  await prisma.$disconnect();
});

describe("failed attempts are atomic with their audit entry", () => {
  it("does not count a wrong password when LOGIN_FAILED cannot be written", async () => {
    const u = await makeUser("LEGAL");
    const spy = vi.spyOn(chain, "appendAudit").mockRejectedValueOnce(new Error("audit down"));
    const res = await request(app)
      .post("/auth/login")
      .send({ email: u.email, password: "wrong-password-xyz" });
    spy.mockRestore();
    expect(res.status).toBe(500);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.failedAttempts).toBe(0);
  });
});
