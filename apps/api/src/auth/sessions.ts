// Sessions live in Redis (NFR-01). The NextAuth JWT carries only the session id (sid).
// Inactivity timeout 30 min (sliding TTL); maximum session length 12 h.
import { randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { redis } from "../redis.js";
import { security } from "../config.js";

export interface SessionData {
  userId: string;
  role: Role;
  createdAt: number;
}

const key = (sid: string) => `sess:${sid}`;
const ttlSeconds = () => security.inactivityMinutes * 60;

export async function createSession(userId: string, role: Role): Promise<string> {
  const sid = randomBytes(32).toString("hex");
  const data: SessionData = { userId, role, createdAt: Date.now() };
  await redis().set(key(sid), JSON.stringify(data), "EX", ttlSeconds());
  await redis().sadd(`user-sessions:${userId}`, sid);
  // The index of a user's sessions expires with the longest possible session (review finding g).
  await redis().expire(`user-sessions:${userId}`, security.maxSessionHours * 3600);
  return sid;
}

/** Returns the live session and slides its inactivity window, or null. */
export async function getSession(sid: string): Promise<SessionData | null> {
  if (!/^[0-9a-f]{64}$/.test(sid)) return null;
  const raw = await redis().get(key(sid));
  if (!raw) return null;
  const data = JSON.parse(raw) as SessionData;
  if (Date.now() - data.createdAt > security.maxSessionHours * 3600 * 1000) {
    await deleteSession(sid);
    return null;
  }
  await redis().expire(key(sid), ttlSeconds());
  return data;
}

export async function deleteSession(sid: string): Promise<void> {
  const raw = await redis().get(key(sid));
  await redis().del(key(sid));
  if (raw) await redis().srem(`user-sessions:${(JSON.parse(raw) as SessionData).userId}`, sid);
}

/** Setting 12: sign out all sessions of a user (also used on role change and deactivation). */
export async function endAllSessions(userId: string): Promise<number> {
  const sids = await redis().smembers(`user-sessions:${userId}`);
  if (sids.length) await redis().del(...sids.map(key), ...sids.map((s) => `stepup:${s}`));
  await redis().del(`user-sessions:${userId}`);
  return sids.length;
}
