"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import type { Role } from "@/lib/auth";
import { ConfirmModal } from "@/components/ConfirmModal";

interface NavItem {
  href: string;
  label: string;
  pill: string;
  exact?: boolean;
  icon: ReactNode;
}

const ICONS = {
  home: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.58 3.47a2.25 2.25 0 0 1 2.84 0l6.25 5.12c.53.43.83 1.08.83 1.76v8.4A2.25 2.25 0 0 1 18.25 21H5.75A2.25 2.25 0 0 1 3.5 18.75v-8.4c0-.68.3-1.33.83-1.76l6.25-5.12ZM12 16.25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        fill="currentColor"
      />
    </svg>
  ),
  properties: (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.6 6.2c.4-.9 1.3-1.4 2.3-1.2l3.8.8a2.2 2.2 0 0 1 1.7 2.5l-1.5 8.6a2.2 2.2 0 0 1-2.5 1.8l-3.8-.7a2.2 2.2 0 0 1-1.7-2.6l1.7-9.2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="11" y="7.5" width="7.5" height="12" rx="2.4" fill="currentColor" />
      <path
        d="M12.5 7.5V6.2a2.2 2.2 0 0 1 4.4 0v1.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  register: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.5 3.5A2.5 2.5 0 0 0 4 6v12a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18V8.83a2.5 2.5 0 0 0-.73-1.77l-2.33-2.33a2.5 2.5 0 0 0-1.77-.73H6.5Zm6.5 5a1 1 0 0 0-2 0v2.5H8.5a1 1 0 1 0 0 2H11v2.5a1 1 0 1 0 2 0V13h2.5a1 1 0 1 0 0-2H13V8.5Z"
        fill="currentColor"
      />
    </svg>
  ),
  approvals: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.28 2.68a2 2 0 0 1 1.44 0l6 2.25A2 2 0 0 1 20 6.8v4.95c0 4.92-3.27 8.76-7.42 10.1a1.9 1.9 0 0 1-1.16 0C7.27 20.5 4 16.67 4 11.75V6.8a2 2 0 0 1 1.28-1.87l6-2.25Zm3.93 7.6a.9.9 0 0 0-1.27-1.28L11 11.94 9.81 10.75a.9.9 0 0 0-1.27 1.27l1.82 1.82a.9.9 0 0 0 1.28 0l3.57-3.56Z"
        fill="currentColor"
      />
    </svg>
  ),
  dueDates: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.25 5.5A2.75 2.75 0 0 0 3.5 8.25v7.5a2.75 2.75 0 0 0 2.75 2.75h11.5a2.75 2.75 0 0 0 2.75-2.75v-7.5a2.75 2.75 0 0 0-2.75-2.75H6.25Zm1.4 3.22a.85.85 0 0 0-.9 1.44l4.8 3a.85.85 0 0 0 .9 0l4.8-3a.85.85 0 1 0-.9-1.44L12 11.44 7.65 8.72Z"
        fill="currentColor"
      />
    </svg>
  ),
  users: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm-2.5-10a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Zm5 0a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Zm-4.38 2.18a.85.85 0 0 1 1.18-.2 2.2 2.2 0 0 0 2.4 0 .85.85 0 1 1 .98 1.4 3.9 3.9 0 0 1-4.36 0 .85.85 0 0 1-.2-1.2Z"
        fill="currentColor"
      />
    </svg>
  ),
  audit: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.25 4.5A2.75 2.75 0 0 0 3.5 7.25v9.5a2.75 2.75 0 0 0 2.75 2.75h11.5a2.75 2.75 0 0 0 2.75-2.75v-9.5a2.75 2.75 0 0 0-2.75-2.75H6.25Zm1.72 4.47a.85.85 0 0 1 1.2 0l2.4 2.4a.85.85 0 0 1 0 1.2l-2.4 2.4a.85.85 0 1 1-1.2-1.2l1.8-1.8-1.8-1.8a.85.85 0 0 1 0-1.2Zm4.78 4.48a.85.85 0 0 0 0 1.7h3.5a.85.85 0 0 0 0-1.7h-3.5Z"
        fill="currentColor"
      />
    </svg>
  ),
  signOut: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.75 4A2.75 2.75 0 0 0 4 6.75v10.5A2.75 2.75 0 0 0 6.75 20h4.5a1 1 0 1 0 0-2h-4.5a.75.75 0 0 1-.75-.75V6.75c0-.41.34-.75.75-.75h4.5a1 1 0 1 0 0-2h-4.5Zm9.53 4.22a1 1 0 0 0-1.42 1.42l1.8 1.79H10a1 1 0 1 0 0 2h6.66l-1.8 1.79a1 1 0 1 0 1.42 1.42l3.5-3.5a1 1 0 0 0 0-1.42l-3.5-3.5Z"
        fill="currentColor"
      />
    </svg>
  ),
};

const NAV_ITEMS: Record<Role, NavItem[]> = {
  LEGAL: [
    { href: "/map", label: "Spatial Overview", pill: "MAP", icon: ICONS.home },
    { href: "/properties", label: "Properties", pill: "PROPERTIES", exact: true, icon: ICONS.properties },
    { href: "/properties/new", label: "Register Parcel", pill: "REGISTER", icon: ICONS.register },
    { href: "/due-dates", label: "Due Dates & RPT", pill: "DUE DATES", icon: ICONS.dueDates },
  ],
  MANAGEMENT: [
    { href: "/map", label: "Spatial Overview", pill: "MAP", icon: ICONS.home },
    { href: "/approvals", label: "Approvals Queue", pill: "APPROVALS", icon: ICONS.approvals },
    { href: "/properties", label: "Properties", pill: "PROPERTIES", exact: true, icon: ICONS.properties },
    { href: "/due-dates", label: "Due Dates & RPT", pill: "DUE DATES", icon: ICONS.dueDates },
  ],
  TENANT: [
    { href: "/map", label: "My Properties", pill: "MAP", icon: ICONS.home },
  ],
  IT_ADMIN: [
    { href: "/admin/audit", label: "Audit Log", pill: "AUDIT", icon: ICONS.audit },
    { href: "/admin/users", label: "User Directory", pill: "USERS", icon: ICONS.users },
  ],
};

export function AppSidebar({
  role,
}: {
  userName?: string;
  role: Role;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS[role];
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/core/auth/logout", { method: "POST" }).catch(() => undefined);
    await signOut({ callbackUrl: "/login" });
  }

  function isActive(item: NavItem) {
    if (item.exact) {
      return (
        pathname === item.href ||
        (item.href === "/properties" &&
          pathname.startsWith("/properties/") &&
          pathname !== "/properties/new")
      );
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <>
      <aside
        aria-label="Primary Navigation"
        className="sticky top-0 z-30 flex h-[100dvh] w-[96px] shrink-0 flex-col items-center justify-center border-r border-[#DCE3DC] bg-[#F0F3EE]/65 select-none"
      >
        {/* Vertically-Centered Rounded Dock Pill Track */}
        <nav className="relative flex flex-col items-center gap-3 rounded-[26px] border border-[#DCE3DC]/90 bg-[#E4E8E1]/55 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_8px_24px_-6px_rgba(18,29,23,0.05)]">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <div key={item.href} className="group relative flex items-center justify-center">
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-2.5 h-5 w-[3px] rounded-r-full bg-[#111914]"
                  />
                )}

                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-center rounded-[18px] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    active
                      ? "h-[60px] w-[60px] bg-[#E3E7E0] text-[#111914] shadow-[0_2px_10px_rgba(18,29,23,0.05)]"
                      : "h-[54px] w-[54px] bg-[#E9ECE6] text-[#7A857E] hover:h-[60px] hover:w-[60px] hover:bg-[#E1E6DE] hover:text-[#111914]"
                  }`}
                >
                  {item.icon}
                </Link>

                {/* Floating Uppercase Pill Tag on Right */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[calc(100%+16px)] z-50 whitespace-nowrap rounded-[8px] bg-[#DEE3DC] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#111914] opacity-0 -translate-x-1.5 scale-95 shadow-[0_2px_8px_rgba(18,29,23,0.06)] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
                >
                  {item.pill}
                </span>
              </div>
            );
          })}

          {/* Hairline separator inside dock before Sign Out */}
          <div className="my-0.5 h-px w-8 bg-[#D3DBD2]" aria-hidden="true" />

          {/* Sign Out Squircle Tile at Bottom of Centered Dock */}
          <div className="group relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => setConfirmSignOut(true)}
              aria-label="Sign out"
              className="flex h-[54px] w-[54px] items-center justify-center rounded-[18px] bg-[#E9ECE6] text-[#7A857E] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:h-[60px] hover:w-[60px] hover:bg-[#F5E4E2] hover:text-[#B42318]"
            >
              {ICONS.signOut}
            </button>

            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[calc(100%+16px)] z-50 whitespace-nowrap rounded-[8px] bg-[#F5E4E2] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#B42318] opacity-0 -translate-x-1.5 scale-95 shadow-[0_2px_8px_rgba(18,29,23,0.06)] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
            >
              SIGN OUT
            </span>
          </div>
        </nav>
      </aside>

      <ConfirmModal
        open={confirmSignOut}
        title="Sign out now?"
        description="You can sign back in anytime with your account."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        variant="danger"
        busy={signingOut}
        onConfirm={handleSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </>
  );
}
