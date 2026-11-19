"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  async function onClick() {
    await fetch("/api/core/auth/logout", { method: "POST" }).catch(() => undefined);
    await signOut({ callbackUrl: "/login" });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-muted transition-colors hover:text-danger"
    >
      Sign out
    </button>
  );
}
