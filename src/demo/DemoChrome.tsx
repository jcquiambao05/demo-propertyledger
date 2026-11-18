"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEMO_MODE } from "./config";
import { ROLE_HOME, ROLE_LABEL, useRole, type Role } from "./role";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

/** Demo banner, role switcher and the dark theme for the IT role (DEMO_PAGES §0, §1). */
export function DemoChrome({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole();
  const pathname = usePathname();
  const router = useRouter();
  const signedOutPage = pathname.startsWith("/login");

  useEffect(() => {
    document.body.dataset.theme = role === "it" && !signedOutPage ? "dark" : "light";
  }, [role, signedOutPage]);

  return (
    <>
      {DEMO_MODE && (
        <div
          role="status"
          className="flex h-7 items-center justify-center bg-warn-bg text-xs font-medium text-warn-fg"
        >
          Demo — synthetic data
        </div>
      )}
      {children}
      {DEMO_MODE && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-line bg-surface p-1 text-xs shadow-lg">
          <span className="px-2 text-muted">Role</span>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => {
                setRole(r);
                router.push(ROLE_HOME[r]);
              }}
              className={`rounded-md px-2.5 py-1.5 font-medium ${
                role === r ? "bg-brand text-white" : "text-ink hover:bg-pill-bg"
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
