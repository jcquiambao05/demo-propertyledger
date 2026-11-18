import { Redis } from "ioredis";
import { config } from "./config.js";

let client: Redis | undefined;

/** Lazily connected Redis client for sessions, MFA challenges and rate limits. */
export function redis(): Redis {
  client ??= new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}

/**
 * Increment a counter and make sure it expires, in one MULTI (NFR-01). EXPIRE NX (Redis 7) sets
 * the TTL only when the key has none, so a live window is never extended and a counter that
 * somehow lost its TTL is repaired on the next hit instead of blocking forever.
 */
export async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const res = await redis().multi().incr(key).expire(key, ttlSeconds, "NX").exec();
  const [err, value] = res?.[0] ?? [new Error("Redis MULTI failed"), null];
  if (err) throw err;
  return Number(value);
}
