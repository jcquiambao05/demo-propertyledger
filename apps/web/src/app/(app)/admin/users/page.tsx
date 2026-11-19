"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PaginationBar } from "@/components/PaginationBar";

const USERS_PAGE_SIZE = 5;

interface User {
  id: string;
  email: string;
  name: string;
  role: "LEGAL" | "MANAGEMENT" | "TENANT" | "IT_ADMIN";
  isActive: boolean;
  mfaEnabled: boolean;
  locked: boolean;
  lastSignIn: string | null;
}

const ROLE: Record<User["role"], string> = {
  LEGAL: "Legal Department",
  MANAGEMENT: "Management",
  TENANT: "Tenant",
  IT_ADMIN: "IT Administrator",
};

type RoleFilter = "ALL" | User["role"];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needCode, setNeedCode] = useState<null | (() => Promise<void>)>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [confirmDeactivateUser, setConfirmDeactivateUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setUsers(await api<User[]>("/admin/users"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    setError("");
    setNotice("");
    const attempt = async () => {
      await run();
      setNotice(done);
      setNeedCode(null);
      await load();
    };
    try {
      await attempt();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && /authenticator/i.test(e.message)) {
        setNeedCode(() => attempt);
      } else setError((e as Error).message);
    }
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    try {
      await api("/auth/step-up", { method: "POST", body: JSON.stringify({ code }) });
      await needCode?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const post = (path: string, body?: object) =>
    api(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [users, roleFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, search]);

  const pagedUsers = useMemo(() => {
    const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE)));
    return filtered.slice((safePage - 1) * USERS_PAGE_SIZE, safePage * USERS_PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#76B82A]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
              Team &amp; Permissions
            </p>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            User Directory
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Manage team accounts, roles, and two-factor authentication.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary">
            + Add user
          </button>
        )}
      </div>

      {notice && (
        <p className="animate-fade-up rounded-xl border border-brand-border bg-brand-soft px-4 py-3 text-xs font-medium text-brand">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger">
          {error}
        </p>
      )}

      {needCode && (
        <div className="bento-shell">
          <form onSubmit={submitCode} className="bento-core flex flex-wrap items-end gap-3 p-4 text-sm">
            <div>
              <label htmlFor="code" className="label">
                Enter the 6-digit code from your authenticator app to confirm
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                className="field w-36 font-mono tabular-nums"
              />
            </div>
            <button type="submit" className="btn-primary">
              Confirm
            </button>
            <button type="button" onClick={() => setNeedCode(null)} className="btn-secondary">
              Cancel
            </button>
          </form>
        </div>
      )}

      {adding && (
        <div className="bento-shell">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              void act(async () => {
                await post("/admin/users", body);
                setAdding(false);
              }, "User added. They set up their authenticator app at first sign-in.");
            }}
            className="bento-core grid gap-4 text-sm sm:grid-cols-2"
          >
            <div>
              <label className="label">
                Name
                <input name="name" required maxLength={120} className="field" />
              </label>
            </div>
            <div>
              <label className="label">
                Email
                <input name="email" type="email" required className="field" />
              </label>
            </div>
            <div>
              <label className="label">
                Role
                <select name="role" defaultValue="LEGAL" className="field">
                  {Object.entries(ROLE).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label className="label">
                Temporary password (at least 15 characters)
                <input
                  name="password"
                  type="password"
                  required
                  minLength={15}
                  maxLength={128}
                  autoComplete="new-password"
                  className="field"
                />
              </label>
            </div>
            <div className="flex gap-2.5 sm:col-span-2">
              <button type="submit" className="btn-primary">
                Save user
              </button>
              <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bento-shell">
        <div className="bento-core overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F8FAF8] px-5 py-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user name or email…"
              aria-label="Search users"
              className="w-64 rounded-lg border border-[#C8D3C8] bg-white px-3 py-1.5 text-xs text-ink placeholder:text-[#84968B] focus:border-brand focus:outline-none"
            />

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#DCE3DC] bg-white p-0.5">
              {(
                [
                  { id: "ALL", label: "All Roles" },
                  { id: "LEGAL", label: "Legal" },
                  { id: "MANAGEMENT", label: "Management" },
                  { id: "TENANT", label: "Tenant" },
                  { id: "IT_ADMIN", label: "IT Admin" },
                ] as { id: RoleFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    roleFilter === tab.id
                      ? "bg-[#1A472A] text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-[#F7F9F6] text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">MFA</th>
                  <th className="px-5 py-3">Last sign-in</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody key={page} className="animate-fade-up divide-y divide-line">
                {pagedUsers.map((u) => (
                  <tr key={u.id} className="align-top transition-colors hover:bg-[#F8FAF8]">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-ink">{u.name}</p>
                      <p className="font-mono text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-medium text-[#3E5046]">
                      {ROLE[u.role]}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {u.mfaEnabled ? (
                        <span className="pill-ok">Set up</span>
                      ) : (
                        <span className="pill">Not yet</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                      {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      {!u.isActive ? (
                        <span className="pill">Inactive</span>
                      ) : u.locked ? (
                        <span className="pill-danger">Locked</span>
                      ) : (
                        <span className="pill-ok">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex flex-wrap justify-end gap-3 text-xs font-medium">
                        {u.locked && (
                          <button
                            type="button"
                            className="text-brand hover:underline"
                            onClick={() =>
                              act(() => post(`/admin/users/${u.id}/unlock`), `${u.name} unlocked.`)
                            }
                          >
                            Unlock
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-brand hover:underline"
                          onClick={() => setManaging(managing === u.id ? null : u.id)}
                        >
                          {managing === u.id ? "Done" : "Manage"}
                        </button>
                      </div>
                      {managing === u.id && (
                        <div className="animate-fade-up mt-3 rounded-xl border border-line bg-[#F4F6F3] p-3 text-left space-y-2.5">
                          <label className="label">
                            Change role
                            <select
                              defaultValue={u.role}
                              className="field"
                              onChange={(e) =>
                                act(
                                  () =>
                                    api(`/admin/users/${u.id}`, {
                                      method: "PATCH",
                                      body: JSON.stringify({ role: e.target.value }),
                                    }),
                                  `${u.name} is now ${ROLE[e.target.value as User["role"]]}.`,
                                )
                              }
                            >
                              {Object.entries(ROLE).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="flex flex-wrap gap-3 pt-1 text-xs font-medium">
                            <button
                              type="button"
                              className="text-brand hover:underline"
                              onClick={() =>
                                act(
                                  () => post(`/admin/users/${u.id}/end-sessions`),
                                  `Signed ${u.name} out of all devices.`,
                                )
                              }
                            >
                              Sign out everywhere
                            </button>
                            <button
                              type="button"
                              className="text-brand hover:underline"
                              onClick={() =>
                                act(
                                  () => post(`/admin/users/${u.id}/reset-mfa`),
                                  `${u.name} will set up a new authenticator next time they sign in.`,
                                )
                              }
                            >
                              Reset MFA
                            </button>
                            {u.isActive && (
                              <button
                                type="button"
                                className="text-danger hover:underline"
                                onClick={() => setConfirmDeactivateUser(u)}
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-xs text-muted">No users match your search.</p>
          )}
          <PaginationBar
            page={page}
            pageSize={USERS_PAGE_SIZE}
            totalItems={filtered.length}
            onPageChange={setPage}
          />
        </div>
      </div>

      <ConfirmModal
        open={Boolean(confirmDeactivateUser)}
        title={`Deactivate ${confirmDeactivateUser?.name ?? "user"}?`}
        description="They'll be signed out right away and won't be able to log in."
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setConfirmDeactivateUser(null)}
        onConfirm={() => {
          const target = confirmDeactivateUser;
          setConfirmDeactivateUser(null);
          if (!target) return;
          void act(
            () => post(`/admin/users/${target.id}/deactivate`),
            `${target.name} has been deactivated.`,
          );
        }}
      />
    </div>
  );
}
