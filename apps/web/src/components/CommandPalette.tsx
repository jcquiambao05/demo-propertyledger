"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Role } from "@/lib/auth";
import type { Parcel } from "@/lib/types";
import { formatAreaSqm } from "@/lib/area";
import { Modal } from "@/components/Modal";

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: "Module" | "Parcel";
  href: string;
  badge?: string;
}

const MODULES_BY_ROLE: Record<Role, CommandItem[]> = {
  LEGAL: [
    { id: "m-map", title: "Spatial Overview", subtitle: "Interactive geospatial portfolio command center", category: "Module", href: "/map", badge: "HOME" },
    { id: "m-prop", title: "Properties Registry", subtitle: "Browse all titled and untitled land parcels", category: "Module", href: "/properties" },
    { id: "m-new", title: "Register New Parcel", subtitle: "Submit a new land record for management approval", category: "Module", href: "/properties/new" },
    { id: "m-due", title: "Due Dates & RPT Alerts", subtitle: "Monitor real property tax schedules and document expiry", category: "Module", href: "/due-dates" },
    { id: "m-set", title: "Settings & Personalization", subtitle: "Profile avatar, 6 color themes, font size, and local security", category: "Module", href: "/settings" },
  ],
  MANAGEMENT: [
    { id: "m-dash", title: "Executive Dashboard", subtitle: "Portfolio KPIs, pending approvals, and compliance overview", category: "Module", href: "/dashboard", badge: "HOME" },
    { id: "m-map", title: "Spatial Overview", subtitle: "Interactive geospatial portfolio command center", category: "Module", href: "/map" },
    { id: "m-app", title: "Approvals Queue", subtitle: "Review, approve, or return pending parcel submissions", category: "Module", href: "/approvals" },
    { id: "m-prop", title: "Properties Registry", subtitle: "Browse all corporate land parcels", category: "Module", href: "/properties" },
    { id: "m-due", title: "Due Dates & RPT Alerts", subtitle: "Monitor real property tax schedules and document expiry", category: "Module", href: "/due-dates" },
    { id: "m-set", title: "Settings & Personalization", subtitle: "Profile avatar, 6 color themes, font size, and local security", category: "Module", href: "/settings" },
  ],
  TENANT: [
    { id: "m-map", title: "My Assigned Properties", subtitle: "Interactive spatial map of assigned parcels", category: "Module", href: "/map", badge: "HOME" },
    { id: "m-set", title: "Settings & Personalization", subtitle: "Profile avatar, 6 color themes, font size, and local security", category: "Module", href: "/settings" },
  ],
  IT_ADMIN: [
    { id: "m-audit", title: "Cryptographic Audit Log", subtitle: "Verify SHA-256 hash chain and system events", category: "Module", href: "/admin/audit", badge: "HOME" },
    { id: "m-users", title: "User Directory & RBAC", subtitle: "Manage corporate accounts, roles, and MFA status", category: "Module", href: "/admin/users" },
    { id: "m-set", title: "Settings & Personalization", subtitle: "Profile avatar, 6 color themes, font size, and local security", category: "Module", href: "/settings" },
  ],
};

export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onCustomOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("epl:open-command", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("epl:open-command", onCustomOpen);
    };
  }, []);

  useEffect(() => {
    if (open && role !== "IT_ADMIN" && parcels.length === 0) {
      api<Parcel[]>("/parcels").then(setParcels, () => undefined);
    }
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, role, parcels.length]);

  const items = useMemo<CommandItem[]>(() => {
    const mods = MODULES_BY_ROLE[role] ?? [];
    const parcelItems: CommandItem[] = parcels.map((p) => ({
      id: `p-${p.id}`,
      title: p.name,
      subtitle: [p.province, p.titleNo || p.taxDecNo, formatAreaSqm(p.areaHa)]
        .filter(Boolean)
        .join(" · "),
      category: "Parcel",
      href: `/properties/${p.id}`,
      badge: p.status,
    }));
    const all = [...mods, ...parcelItems];
    if (!query.trim()) return all;
    const q = query.trim().toLowerCase();
    return all.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        (i.badge && i.badge.toLowerCase().includes(q)),
    );
  }, [role, parcels, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function select(item: CommandItem) {
    setOpen(false);
    router.push(item.href);
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel="Quick Jump Command Bar"
      maxWidthClass="max-w-xl"
      align="top"
    >
      <div className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-muted"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) =>
                  items.length ? (i - 1 + items.length) % items.length : 0,
                );
              } else if (e.key === "Enter" && items[activeIndex]) {
                e.preventDefault();
                select(items[activeIndex]);
              }
            }}
            placeholder="Jump to any parcel, province, title number, or module…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
            ESC
          </kbd>
        </div>

        <ul className="max-h-[340px] overflow-y-auto p-2">
          {items.map((item, idx) => {
            const active = idx === activeIndex;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => select(item)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                    active ? "bg-brand-soft text-ink" : "text-ink hover:bg-surface-muted"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {item.category}
                      </span>
                      <p className="truncate text-sm font-medium">{item.title}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{item.subtitle}</p>
                  </div>
                  {item.badge && (
                    <span className="pill-ok shrink-0 font-mono text-[10px] uppercase">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="py-10 text-center text-xs text-muted">
              No matching parcels or modules found.
            </li>
          )}
        </ul>

        <div className="flex items-center justify-between border-t border-line bg-surface-muted px-4 py-2 text-[11px] text-muted">
          <span>Use ↑↓ arrows to navigate, Enter to open</span>
          <span className="font-mono">Eagle Property Ledger</span>
        </div>
      </div>
    </Modal>
  );
}
