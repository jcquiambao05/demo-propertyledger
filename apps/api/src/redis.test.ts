// NFR-01: rate-limit and attempt counters always expire (security review: a counter left
// without a TTL would block the account or route for good).
import { describe, it, expect, afterAll } from "vitest";
import { redis, closeRedis, incrWithTtl } from "./redis.js";

afterAll(() => closeRedis());

describe("incrWithTtl", () => {
  it("counts and sets the expiry in one step", async () => {
    const k = `test:incr:${Date.now()}`;
    expect(await incrWithTtl(k, 60)).toBe(1);
    expect(await incrWithTtl(k, 60)).toBe(2);
    const ttl = await redis().ttl(k);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("repairs a counter that was left without an expiry, without extending a live one", async () => {
    const k = `test:incr:stuck:${Date.now()}`;
    await redis().set(k, "7");
    expect(await redis().ttl(k)).toBe(-1);
    expect(await incrWithTtl(k, 30)).toBe(8);
    expect(await redis().ttl(k)).toBeGreaterThan(0);
  });
});
