"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  async function onClick() {
    // End the Redis session on the API, then clear the NextAuth cookie.
    await fetch("/api/core/auth/logout", { method: "POST" }).catch(() => undefined);
    await signOut({ callbackUrl: "/login" });
  }
  return (
    <button type="button" onClick={onClick} className="text-sm underline">
      Sign out
    </button>
  );
}
