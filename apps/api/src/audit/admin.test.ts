// FR-20: IT Administrator verifies the audit chain; other roles are refused.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor, lastAudit } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
let itId = "";

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    if (role === "IT_ADMIN") itId = u.id;
    c[role] = await cookieFor(u);
  }
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("audit log administration", () => {
  it("IT lists entries (IDs and actions only) and verifies the chain", async () => {
    const list = await request(app).get("/admin/audit").set("Cookie", c.IT_ADMIN);
    expect(list.status).toBe(200);
    expect(Object.keys(list.body.entries[0]).sort()).toEqual(
      ["action", "actor", "createdAt", "entity", "entryHash", "entityId", "id", "prevHash"].sort(),
    );

    const v = await request(app).post("/admin/audit/verify").set("Cookie", c.IT_ADMIN);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ ok: true, firstBrokenId: null });
    expect(v.body.checked).toBeGreaterThan(0);
    expect(await lastAudit("AUDIT_CHAIN_VERIFIED")).toMatchObject({ actorId: itId });
  });

  it.each(["LEGAL", "MANAGEMENT", "TENANT"])(
    "%s cannot open the full log or run verification",
    async (role) => {
      expect((await request(app).get("/admin/audit").set("Cookie", c[role])).status).toBe(403);
      expect((await request(app).post("/admin/audit/verify").set("Cookie", c[role])).status).toBe(
        403,
      );
    },
  );
});
