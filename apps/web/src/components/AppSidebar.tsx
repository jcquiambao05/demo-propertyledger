"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import type { Role } from "@/lib/auth";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useTheme } from "@/components/ThemeContext";

interface NavItem {
  href: string;
  label: string;
  pill: string;
  exact?: boolean;
  icon: ReactNode;
}

const ROLE_SHORT_LABEL: Record<Role, string> = {
  LEGAL: "LEGAL",
  MANAGEMENT: "MGMT",
  TENANT: "TENANT",
  IT_ADMIN: "IT ADMIN",
};

const ROLE_FULL_LABEL: Record<Role, string> = {
  LEGAL: "Legal Department",
  MANAGEMENT: "Management",
  TENANT: "Tenant",
  IT_ADMIN: "IT Administrator",
};

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
  map: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2.75a6.75 6.75 0 0 0-6.75 6.75c0 4.65 5.1 10.15 6.13 11.2a.88.88 0 0 0 1.24 0c1.03-1.05 6.13-6.55 6.13-11.2A6.75 6.75 0 0 0 12 2.75Zm0 9.25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
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
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
    { href: "/dashboard", label: "Executive Dashboard", pill: "DASHBOARD", icon: ICONS.home },
    { href: "/map", label: "Spatial Overview", pill: "MAP", icon: ICONS.map },
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

function initialsFrom(name: string): string {
  const parts = name
    .replace(/^Atty\.\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function shortFirstName(name: string): string {
  const cleaned = name.replace(/^Atty\.\s*/i, "").trim();
  const first = cleaned.split(/\s+/)[0] || "User";
  return first.length > 8 ? `${first.slice(0, 7)}…` : first;
}

export function AppSidebar({
  userName = "Authorized User",
  role,
}: {
  userName?: string;
  role: Role;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS[role];
  const { profile, resolvedAvatarSrc, clearActiveUserSession } = useTheme();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  const displayName = profile?.name || userName;
  const displayPosition = profile?.position || ROLE_FULL_LABEL[role];
  const showAvatarImg = Boolean(resolvedAvatarSrc && !avatarLoadError);
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  useEffect(() => {
    setAvatarLoadError(false);
  }, [resolvedAvatarSrc]);

  async function handleSignOut() {
    setSigningOut(true);
    clearActiveUserSession();
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
      {/* DESKTOP LEFT SQUIRCLE ICON DOCK (md+) */}
      <aside
        aria-label="Primary Navigation"
        style={{
          backgroundColor: "var(--epl-sidebar-bg)",
          borderColor: "var(--epl-line)",
        }}
        className="sticky top-0 z-30 hidden h-[100dvh] w-[96px] shrink-0 flex-col items-center justify-between border-r py-5 select-none md:flex"
      >
        {/* TOP OF SIDEBAR: Active User Profile Avatar & Name/Role Status Indicator (Non-Clickable) */}
        <div
          role="status"
          aria-label={`Signed in as ${displayName} (${ROLE_FULL_LABEL[role]})`}
          className="group relative flex flex-col items-center gap-1.5"
        >
          <div
            style={{
              backgroundColor: "var(--epl-sidebar-tile)",
              color: "var(--epl-sidebar-ink)",
              borderColor: "var(--epl-brand-border)",
            }}
            className="relative flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[18px] border-2 shadow-sm"
          >
            {showAvatarImg && resolvedAvatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedAvatarSrc}
                alt={displayName}
                onError={() => setAvatarLoadError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-mono text-sm font-bold tracking-tight">
                {initialsFrom(displayName)}
              </span>
            )}
            {/* Active Session Online Dot */}
            <span
              aria-hidden="true"
              className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald-500"
            />
          </div>

          {/* Compact Name + Role Status Indicator Below Avatar */}
          <div className="flex flex-col items-center text-center leading-tight">
            <span className="max-w-[78px] truncate text-[11px] font-semibold text-ink">
              {shortFirstName(displayName)}
            </span>
            <span className="mt-0.5 rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-brand-soft-fg">
              {ROLE_SHORT_LABEL[role]}
            </span>
          </div>

          {/* Floating Identity Status Card on Hover */}
          <div
            aria-hidden="true"
            style={{
              backgroundColor: "var(--epl-surface)",
              color: "var(--epl-ink)",
              borderColor: "var(--epl-line)",
            }}
            className="pointer-events-none absolute left-[calc(100%+14px)] top-0 z-50 w-56 rounded-2xl border p-3.5 opacity-0 -translate-x-1.5 scale-95 shadow-xl transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                Active Session
              </span>
            </div>
            <p className="mt-1.5 truncate text-xs font-semibold text-ink">{displayName}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{displayPosition}</p>
            <div className="mt-2 border-t border-line pt-2">
              <span className="pill-ok text-[10px]">{ROLE_FULL_LABEL[role]}</span>
            </div>
          </div>
        </div>

        {/* CENTER OF SIDEBAR: Primary Module Navigation Links */}
        <nav
          style={{
            backgroundColor: "var(--epl-sidebar-dock)",
            borderColor: "var(--epl-line)",
          }}
          className="relative flex flex-col items-center gap-2.5 rounded-[26px] border p-2.5 shadow-[0_8px_24px_-6px_rgba(12,18,15,0.08)]"
        >
          {items.map((item) => {
            const active = isActive(item);
            return (
              <div key={item.href} className="group relative flex items-center justify-center">
                {active && (
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: "var(--epl-brand)" }}
                    className="absolute -left-2.5 h-5 w-[3px] rounded-r-full"
                  />
                )}

                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  style={{
                    backgroundColor: active
                      ? "var(--epl-sidebar-tile-active)"
                      : "var(--epl-sidebar-tile)",
                    color: active ? "var(--epl-sidebar-ink)" : "var(--epl-sidebar-muted)",
                  }}
                  className={`flex items-center justify-center rounded-[18px] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    active
                      ? "h-[56px] w-[56px] shadow-[0_2px_10px_rgba(12,18,15,0.08)]"
                      : "h-[50px] w-[50px] hover:h-[56px] hover:w-[56px]"
                  }`}
                >
                  {item.icon}
                </Link>

                {/* Floating Uppercase Pill Tag on Right */}
                <span
                  aria-hidden="true"
                  style={{
                    backgroundColor: "var(--epl-surface)",
                    color: "var(--epl-ink)",
                    borderColor: "var(--epl-line)",
                  }}
                  className="pointer-events-none absolute left-[calc(100%+16px)] z-50 whitespace-nowrap rounded-[8px] border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] opacity-0 -translate-x-1.5 scale-95 shadow-md transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
                >
                  {item.pill}
                </span>
              </div>
            );
          })}
        </nav>

        {/* BOTTOM OF SIDEBAR: Settings Button Grouped with Sign Out (Logout) */}
        <div
          style={{
            backgroundColor: "var(--epl-sidebar-dock)",
            borderColor: "var(--epl-line)",
          }}
          className="flex flex-col items-center gap-2 rounded-[24px] border p-2 shadow-[0_8px_24px_-6px_rgba(12,18,15,0.08)]"
        >
          {/* Dedicated Settings Button */}
          <div className="group relative flex items-center justify-center">
            {settingsActive && (
              <span
                aria-hidden="true"
                style={{ backgroundColor: "var(--epl-brand)" }}
                className="absolute -left-2 h-5 w-[3px] rounded-r-full"
              />
            )}

            <Link
              href="/settings"
              aria-label="Settings & Personalization"
              aria-current={settingsActive ? "page" : undefined}
              style={{
                backgroundColor: settingsActive
                  ? "var(--epl-sidebar-tile-active)"
                  : "var(--epl-sidebar-tile)",
                color: settingsActive ? "var(--epl-sidebar-ink)" : "var(--epl-sidebar-muted)",
              }}
              className={`flex items-center justify-center rounded-[16px] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                settingsActive
                  ? "h-[50px] w-[50px] shadow-[0_2px_10px_rgba(12,18,15,0.08)]"
                  : "h-[46px] w-[46px] hover:h-[50px] hover:w-[50px]"
              }`}
            >
              {ICONS.settings}
            </Link>

            <span
              aria-hidden="true"
              style={{
                backgroundColor: "var(--epl-surface)",
                color: "var(--epl-ink)",
                borderColor: "var(--epl-line)",
              }}
              className="pointer-events-none absolute left-[calc(100%+16px)] z-50 whitespace-nowrap rounded-[8px] border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] opacity-0 -translate-x-1.5 scale-95 shadow-md transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
            >
              SETTINGS
            </span>
          </div>

          <div
            style={{ backgroundColor: "var(--epl-line)" }}
            className="h-px w-7"
            aria-hidden="true"
          />

          {/* Sign Out Button */}
          <div className="group relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => setConfirmSignOut(true)}
              aria-label="Sign out"
              style={{
                backgroundColor: "var(--epl-sidebar-tile)",
                color: "var(--epl-sidebar-muted)",
              }}
              className="flex h-[46px] w-[46px] items-center justify-center rounded-[16px] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:h-[50px] hover:w-[50px] hover:!bg-danger-bg hover:!text-danger"
            >
              {ICONS.signOut}
            </button>

            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[calc(100%+16px)] z-50 whitespace-nowrap rounded-[8px] border border-danger-border bg-danger-bg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-danger opacity-0 -translate-x-1.5 scale-95 shadow-md transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100"
            >
              SIGN OUT
            </span>
          </div>
        </div>
      </aside>

      {/* MOBILE FIXED BOTTOM NAVIGATION BAR (< md) */}
      <nav
        aria-label="Mobile Navigation"
        style={{
          backgroundColor: "var(--epl-surface)",
          borderColor: "var(--epl-line)",
        }}
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t px-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur-md shadow-[0_-8px_24px_rgba(12,18,15,0.12)] select-none md:hidden"
      >
        {/* Non-clickable Active User Avatar Indicator on Mobile Left */}
        <div
          role="status"
          aria-label={`Signed in as ${displayName}`}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1"
        >
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-soft text-brand-soft-fg">
            {showAvatarImg && resolvedAvatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedAvatarSrc}
                alt={displayName}
                onError={() => setAvatarLoadError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-mono text-[10px] font-bold">{initialsFrom(displayName)}</span>
            )}
          </span>
          <span className="max-w-[48px] truncate text-[9px] font-semibold text-muted">
            {shortFirstName(displayName)}
          </span>
        </div>

        {items.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 transition-colors ${
                active ? "text-brand" : "text-muted hover:text-ink"
              }`}
            >
              <span
                className={`flex h-7 w-10 items-center justify-center rounded-xl transition-all ${
                  active ? "bg-brand-soft text-brand-soft-fg" : ""
                }`}
              >
                <span className="scale-[0.78]">{item.icon}</span>
              </span>
              <span className="text-[9.5px] font-semibold tracking-tight">{item.pill}</span>
            </Link>
          );
        })}

        <Link
          href="/settings"
          aria-label="Settings & Personalization"
          aria-current={settingsActive ? "page" : undefined}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 transition-colors ${
            settingsActive ? "text-brand" : "text-muted hover:text-ink"
          }`}
        >
          <span
            className={`flex h-7 w-10 items-center justify-center rounded-xl transition-all ${
              settingsActive ? "bg-brand-soft text-brand-soft-fg" : ""
            }`}
          >
            <span className="scale-[0.82]">{ICONS.settings}</span>
          </span>
          <span className="text-[9.5px] font-semibold tracking-tight">SETTINGS</span>
        </Link>

        <button
          type="button"
          onClick={() => setConfirmSignOut(true)}
          aria-label="Sign out"
          className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-muted transition-colors hover:text-danger"
        >
          <span className="flex h-7 w-10 items-center justify-center rounded-xl">
            <span className="scale-[0.78]">{ICONS.signOut}</span>
          </span>
          <span className="text-[9.5px] font-semibold tracking-tight">EXIT</span>
        </button>
      </nav>

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
