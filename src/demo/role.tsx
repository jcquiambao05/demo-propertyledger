"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Role = "legal" | "management" | "tenant" | "it";

export const ROLE_LABEL: Record<Role, string> = {
  legal: "Legal",
  management: "Management",
  tenant: "Tenant",
  it: "IT",
};

export const ROLE_HOME: Record<Role, string> = {
  legal: "/home",
  management: "/dashboard",
  tenant: "/my-properties",
  it: "/admin/audit",
};

export const ROLE_NAV: Record<Role, { href: string; label: string }[]> = {
  legal: [
    { href: "/home", label: "Home" },
    { href: "/map", label: "Map" },
    { href: "/properties", label: "Properties" },
    { href: "/issues", label: "Issues" },
    { href: "/due-dates", label: "Due dates" },
  ],
  management: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/map", label: "Map" },
    { href: "/approvals", label: "Approvals" },
    { href: "/properties", label: "Properties" },
  ],
  tenant: [{ href: "/my-properties", label: "My properties" }],
  it: [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/audit", label: "Audit log" },
    { href: "/admin/health", label: "System health" },
    { href: "/admin/security", label: "Security settings" },
  ],
};

/** Demo sign-in: the email prefix picks the role. */
export function roleFromEmail(email: string): Role {
  const p = email.trim().toLowerCase().split("@")[0];
  if (p === "maria") return "management";
  if (p === "lito") return "tenant";
  if (p === "ana") return "it";
  return "legal";
}

const KEY = "demo-role";

type Ctx = { role: Role; setRole: (r: Role) => void };
const RoleCtx = createContext<Ctx>({ role: "legal", setRole: () => {} });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("legal");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY) as Role | null;
      if (saved && saved in ROLE_LABEL) setRoleState(saved);
    } catch {
      /* storage unavailable: stay on the default role */
    }
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    try {
      window.localStorage.setItem(KEY, r);
    } catch {
      /* ignore */
    }
  }, []);

  return <RoleCtx.Provider value={{ role, setRole }}>{children}</RoleCtx.Provider>;
}

export const useRole = () => useContext(RoleCtx);
