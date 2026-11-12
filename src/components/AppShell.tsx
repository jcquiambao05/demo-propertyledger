"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, ORG_NAME } from "@/demo/config";
import { ROLE_LABEL, ROLE_NAV, useRole } from "@/demo/role";

const NAME: Record<string, string> = {
  legal: "Atty. Juan Ramos",
  management: "Maria Santos",
  tenant: "Lito Cruz",
  it: "Ana Dizon",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const pathname = usePathname();
  const nav = ROLE_NAV[role];

  return (
    <div className="flex min-h-[calc(100vh-1.75rem)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
            EP
          </span>
          <span className="text-sm font-semibold leading-tight">{APP_NAME}</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1 px-2">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  active ? "bg-brand-soft text-brand" : "text-ink hover:bg-pill-bg"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-4 py-4 text-xs text-muted">{ORG_NAME}</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-line bg-surface px-6">
          <input
            type="search"
            aria-label="Search"
            placeholder={role === "it" ? "Search users or log entries" : "Search properties"}
            className="w-72 rounded-md border border-line bg-page px-3 py-1.5 text-sm placeholder:text-muted"
          />
          <div className="ml-auto flex items-center gap-4 text-sm">
            <button type="button" aria-label="Notifications" className="text-muted hover:text-ink">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </button>
            <span className="text-muted">
              {NAME[role]} · {ROLE_LABEL[role]}
            </span>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
        <footer className="px-6 pb-4 text-xs text-muted">
          © 2026 {ORG_NAME}. For internal use only.
        </footer>
      </div>
    </div>
  );
}
