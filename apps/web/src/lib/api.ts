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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    await signOut({ callbackUrl: "/login" });
    throw new ApiError(401, "Your session has ended. Please sign in again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "Something went wrong.");
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
