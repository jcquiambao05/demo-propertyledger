"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Role } from "@/lib/auth";
import type { Parcel } from "@/lib/types";

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
  ],
  MANAGEMENT: [
    { id: "m-map", title: "Spatial Overview", subtitle: "Interactive geospatial portfolio command center", category: "Module", href: "/map", badge: "HOME" },
    { id: "m-app", title: "Approvals Queue", subtitle: "Review, approve, or return pending parcel submissions", category: "Module", href: "/approvals" },
    { id: "m-prop", title: "Properties Registry", subtitle: "Browse all corporate land parcels", category: "Module", href: "/properties" },
    { id: "m-due", title: "Due Dates & RPT Alerts", subtitle: "Monitor real property tax schedules and document expiry", category: "Module", href: "/due-dates" },
  ],
  TENANT: [
    { id: "m-map", title: "My Assigned Properties", subtitle: "Interactive spatial map of assigned parcels", category: "Module", href: "/map", badge: "HOME" },
  ],
  IT_ADMIN: [
    { id: "m-audit", title: "Cryptographic Audit Log", subtitle: "Verify SHA-256 hash chain and system events", category: "Module", href: "/admin/audit", badge: "HOME" },
    { id: "m-users", title: "User Directory & RBAC", subtitle: "Manage corporate accounts, roles, and MFA status", category: "Module", href: "/admin/users" },
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
      } else if (e.key === "Escape") {
        setOpen(false);
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
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, role, parcels.length]);

  const items = useMemo<CommandItem[]>(() => {
    const mods = MODULES_BY_ROLE[role] ?? [];
    const parcelItems: CommandItem[] = parcels.map((p) => ({
      id: `p-${p.id}`,
      title: p.name,
      subtitle: [p.province, p.titleNo || p.taxDecNo, `${p.areaHa.toFixed(2)} ha`]
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#0D1712]/45 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Jump Command Bar"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-[22px] border border-[#D4DDD4] bg-[#E8EDE7] p-1.5 shadow-[0_28px_80px_-12px_rgba(12,22,17,0.38)]"
      >
        <div className="overflow-hidden rounded-[17px] border border-[#DCE3DC] bg-white">
          <div className="flex items-center gap-3 border-b border-[#DCE3DC] px-4 py-3.5">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[#56685E]"
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
              className="w-full bg-transparent text-sm text-ink placeholder:text-[#84968B] focus:outline-none"
            />
            <kbd className="rounded border border-[#DCE3DC] bg-[#F4F6F3] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#56685E]">
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
                      active ? "bg-[#EAF2EC] text-[#121D17]" : "text-ink hover:bg-[#F4F6F3]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#F0F3EE] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#56685E]">
                          {item.category}
                        </span>
                        <p className="truncate text-sm font-medium">{item.title}</p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">{item.subtitle}</p>
                    </div>
                    {item.badge && (
                      <span className="shrink-0 rounded-full border border-[#B7D3BF] bg-white px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#1A472A]">
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

          <div className="flex items-center justify-between border-t border-[#DCE3DC] bg-[#F8FAF8] px-4 py-2 text-[11px] text-muted">
            <span>Use ↑↓ arrows to navigate, Enter to open</span>
            <span className="font-mono">Eagle Property Ledger</span>
          </div>
        </div>
      </div>
    </div>
  );
}
