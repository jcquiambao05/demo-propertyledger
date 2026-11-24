"use client";
// Browser-side calls to the Express API through the same-origin /api/core proxy.
import { signOut } from "next-auth/react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const GET_CACHE_TTL_MS = 10_000;
const responseCache = new Map<string, CacheEntry>();
const inflightGets = new Map<string, Promise<unknown>>();

// Endpoints whose responses may be safely memoized for rapid repeated mounts
const CACHEABLE_PREFIXES = ["/document-types", "/parcels/filters"];

function isCacheableGet(path: string, method: string): boolean {
  if (method !== "GET") return false;
  return CACHEABLE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function clearApiCache(): void {
  responseCache.clear();
  inflightGets.clear();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();

  if (method !== "GET") {
    responseCache.clear();
  } else if (isCacheableGet(path, method)) {
    const cached = responseCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    const existing = inflightGets.get(path);
    if (existing) {
      return (await existing) as T;
    }
  }

  const requestPromise = (async () => {
    const res = await fetch(`/api/core${path}`, {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
    if (res.status === 401) {
      clearApiCache();
      await signOut({ callbackUrl: "/login" });
      throw new ApiError(401, "Your session has ended. Please sign in again.");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? "Something went wrong.");
    }
    if (res.status === 204) return undefined as T;
    const json = (await res.json()) as T;
    if (isCacheableGet(path, method)) {
      responseCache.set(path, { expiresAt: Date.now() + GET_CACHE_TTL_MS, data: json });
    }
    return json;
  })();

  if (isCacheableGet(path, method)) {
    inflightGets.set(path, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inflightGets.delete(path);
    }
  }

  return await requestPromise;
}
