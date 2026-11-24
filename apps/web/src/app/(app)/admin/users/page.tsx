"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ConfirmModal";
import { Modal } from "@/components/Modal";
import { PaginationBar } from "@/components/PaginationBar";
import { Toast } from "@/components/Toast";

const USERS_PAGE_SIZE = 5;

interface User {
  id: string;
  email: string;
  name: string;
  position: string | null;
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

interface PendingAdminAction {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "brand" | "danger";
  execute: (adminPassword: string) => Promise<void>;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [page, setPage] = useState(1);

  // Edit User Drawer/Form State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editRole, setEditRole] = useState<User["role"]>("LEGAL");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Mandatory Admin Password Confirmation Modal State
  const [pendingAction, setPendingAction] = useState<PendingAdminAction | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPwError, setAdminPwError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

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

  function openEditUser(u: User) {
    if (editingUserId === u.id) {
      setEditingUserId(null);
      return;
    }
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditPosition(u.position ?? "");
    setEditRole(u.role);
    setEditPassword("");
    setShowEditPassword(false);
    setError("");
  }

  function requestAdminConfirmation(action: PendingAdminAction) {
    setError("");
    setAdminPassword("");
    setAdminPwError("");
    setPendingAction(action);
  }

  async function submitAdminConfirmation(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAction) return;
    if (!adminPassword) {
      setAdminPwError("Enter your admin password to confirm this change.");
      return;
    }
    setAdminPwError("");
    setActionBusy(true);
    try {
      await pendingAction.execute(adminPassword);
      setPendingAction(null);
      setAdminPassword("");
      await load();
    } catch (err) {
      setAdminPwError((err as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  const editPwRules = useMemo(() => {
    return [
      { id: "len", label: "8+ characters", met: editPassword.length >= 8 },
      { id: "upper", label: "Uppercase (A–Z)", met: /[A-Z]/.test(editPassword) },
      { id: "lower", label: "Lowercase (a–z)", met: /[a-z]/.test(editPassword) },
      { id: "num", label: "Number (0–9)", met: /[0-9]/.test(editPassword) },
      { id: "spec", label: "Special character", met: /[^A-Za-z0-9]/.test(editPassword) },
    ];
  }, [editPassword]);

  function handleQueueUserSave(u: User) {
    setError("");
    const trimmedName = editName.trim();
    const trimmedPos = editPosition.trim();

    if (!trimmedName) {
      setError("Account name cannot be empty.");
      return;
    }
    if (editPassword && !editPwRules.every((r) => r.met)) {
      setError(
        "New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
      );
      return;
    }

    const payload: Record<string, unknown> = {};
    if (trimmedName !== u.name) payload.name = trimmedName;
    if ((trimmedPos || null) !== (u.position || null)) payload.position = trimmedPos;
    if (editRole !== u.role) payload.role = editRole;
    if (editPassword) payload.password = editPassword;

    if (Object.keys(payload).length === 0) {
      setError("No changes were made to this account.");
      return;
    }

    const summaryParts: string[] = [];
    if (payload.name) summaryParts.push(`name to "${trimmedName}"`);
    if (payload.position !== undefined)
      summaryParts.push(`position to "${trimmedPos || "None"}"`);
    if (payload.role) summaryParts.push(`role to ${ROLE[editRole]}`);
    if (payload.password) summaryParts.push("reset account password");

    requestAdminConfirmation({
      title: `Confirm account changes for ${u.name}`,
      description: `You are about to update ${summaryParts.join(", ")}. Enter your own admin password to verify and save.`,
      confirmLabel: "Verify & Save Changes",
      variant: "brand",
      execute: async (confirmedAdminPassword) => {
        await api(`/admin/users/${u.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, adminPassword: confirmedAdminPassword }),
        });
        setNotice(`Updated account for ${trimmedName}.`);
        setEditingUserId(null);
        setEditPassword("");
      },
    });
  }

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
            Team &amp; Permissions
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            User Directory
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Manage team accounts, names, passwords, roles, and two-factor authentication.
          </p>
        </div>
        {!adding && (
          <div className="flex items-center gap-2">
            <Link href="/admin/audit" className="btn-secondary">
              Verify Audit Chain →
            </Link>
            <button type="button" onClick={() => setAdding(true)} className="btn-primary">
              + Add user
            </button>
          </div>
        )}
      </div>

      {/* IT Admin Home Overview KPI Strip */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className="bento-shell">
          <div className="bento-core flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted">Active Accounts</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
                {users.filter((u) => u.isActive && !u.locked).length}
              </p>
            </div>
            <span className="pill-ok">Healthy</span>
          </div>
        </div>
        <div className="bento-shell">
          <div className="bento-core flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted">MFA Enrolled</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-brand">
                {users.filter((u) => u.mfaEnabled).length} / {users.length}
              </p>
            </div>
            <span className="pill">TOTP</span>
          </div>
        </div>
        <div className="bento-shell">
          <div className="bento-core flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted">Locked Accounts</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
                {users.filter((u) => u.locked).length}
              </p>
            </div>
            <Link href="/admin/audit" className="text-xs font-semibold text-brand hover:underline">
              Audit Log →
            </Link>
          </div>
        </div>
      </div>

      <Toast message={notice} onClose={() => setNotice("")} />
      {error && (
        <p
          role="alert"
          className="animate-fade-up rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {adding && (
        <div className="bento-shell">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              requestAdminConfirmation({
                title: `Create new account for ${String(body.name || "user")}?`,
                description:
                  "Enter your admin password to authorize creating this corporate account.",
                confirmLabel: "Verify & Create User",
                variant: "brand",
                execute: async (confirmedAdminPassword) => {
                  await api("/admin/users", {
                    method: "POST",
                    body: JSON.stringify({ ...body, adminPassword: confirmedAdminPassword }),
                  });
                  setAdding(false);
                  setNotice(
                    "User added. They set up their authenticator app at first sign-in.",
                  );
                },
              });
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
                Position / Title
                <input
                  name="position"
                  maxLength={120}
                  placeholder="e.g., Senior Legal Counsel"
                  className="field"
                />
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
            <div className="sm:col-span-2">
              <label className="label">
                Temporary password (min 8 chars with uppercase, lowercase, number &amp; special
                character)
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted px-5 py-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user name or email…"
              aria-label="Search users"
              className="w-64 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
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
                      ? "bg-brand-fill text-brand-fg"
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
              <thead className="border-b border-line bg-surface-muted text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Role &amp; Position</th>
                  <th className="px-5 py-3">MFA</th>
                  <th className="px-5 py-3">Last sign-in</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody key={page} className="animate-fade-up divide-y divide-line">
                {pagedUsers.map((u) => {
                  const isEditing = editingUserId === u.id;
                  return (
                    <tr key={u.id} className="align-top transition-colors hover:bg-surface-muted">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-ink">{u.name}</p>
                        <p className="font-mono text-xs text-muted">{u.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium text-ink">
                        <p>{ROLE[u.role]}</p>
                        {u.position && (
                          <p className="mt-0.5 text-[11px] font-normal text-muted">{u.position}</p>
                        )}
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
                                requestAdminConfirmation({
                                  title: `Unlock ${u.name}?`,
                                  description:
                                    "Clears failed login attempts and unlocks this account. Enter your admin password to confirm.",
                                  confirmLabel: "Verify & Unlock",
                                  execute: async (pw) => {
                                    await api(`/admin/users/${u.id}/unlock`, {
                                      method: "POST",
                                      body: JSON.stringify({ adminPassword: pw }),
                                    });
                                    setNotice(`${u.name} unlocked.`);
                                  },
                                })
                              }
                            >
                              Unlock
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-brand hover:underline"
                            onClick={() => openEditUser(u)}
                          >
                            {isEditing ? "Close" : "Edit / Manage"}
                          </button>
                        </div>

                        {isEditing && (
                          <div className="animate-fade-up mt-3 w-full min-w-[300px] max-w-md ml-auto rounded-2xl border border-line bg-surface p-4 text-left shadow-sm space-y-3.5">
                            <div className="flex items-center justify-between border-b border-line pb-2">
                              <span className="text-xs font-semibold text-ink">
                                Edit Account — {u.name}
                              </span>
                              <span className="font-mono text-[10px] text-muted">
                                Requires Admin Password
                              </span>
                            </div>

                            <div>
                              <label className="label">
                                Account Name
                                <input
                                  type="text"
                                  value={editName}
                                  maxLength={120}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="field text-xs"
                                />
                              </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="label">
                                  Position / Title
                                  <input
                                    type="text"
                                    value={editPosition}
                                    maxLength={120}
                                    onChange={(e) => setEditPosition(e.target.value)}
                                    placeholder="e.g. Senior Legal Counsel"
                                    className="field text-xs"
                                  />
                                </label>
                              </div>

                              <div>
                                <label className="label">
                                  Assigned Role
                                  <select
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value as User["role"])}
                                    className="field text-xs"
                                  >
                                    {Object.entries(ROLE).map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center justify-between">
                                <label htmlFor={`edit-pw-${u.id}`} className="label">
                                  Reset / Change Password (Optional)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowEditPassword((v) => !v)}
                                  className="text-[11px] font-medium text-brand hover:underline"
                                >
                                  {showEditPassword ? "Hide" : "Show"}
                                </button>
                              </div>
                              <input
                                id={`edit-pw-${u.id}`}
                                type={showEditPassword ? "text" : "password"}
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                placeholder="Leave blank to keep current password"
                                autoComplete="new-password"
                                className="field text-xs"
                              />
                              {editPassword && (
                                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-muted p-2 text-[10px]">
                                  {editPwRules.map((r) => (
                                    <span
                                      key={r.id}
                                      className={
                                        r.met ? "font-semibold text-brand" : "text-muted"
                                      }
                                    >
                                      {r.met ? "✓" : "·"} {r.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="btn-secondary py-1.5 text-xs"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQueueUserSave(u)}
                                className="btn-primary py-1.5 text-xs"
                              >
                                Save Changes…
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-xs font-medium">
                              <button
                                type="button"
                                className="text-brand hover:underline"
                                onClick={() =>
                                  requestAdminConfirmation({
                                    title: `Sign ${u.name} out of all devices?`,
                                    description:
                                      "Ends all active sessions for this user immediately. Enter your admin password to confirm.",
                                    confirmLabel: "Verify & End Sessions",
                                    execute: async (pw) => {
                                      await api(`/admin/users/${u.id}/end-sessions`, {
                                        method: "POST",
                                        body: JSON.stringify({ adminPassword: pw }),
                                      });
                                      setNotice(`Signed ${u.name} out of all devices.`);
                                    },
                                  })
                                }
                              >
                                Sign out everywhere
                              </button>
                              <button
                                type="button"
                                className="text-brand hover:underline"
                                onClick={() =>
                                  requestAdminConfirmation({
                                    title: `Reset MFA for ${u.name}?`,
                                    description:
                                      "Clears their current TOTP authenticator secret so they can enroll a new device on next login.",
                                    confirmLabel: "Verify & Reset MFA",
                                    execute: async (pw) => {
                                      await api(`/admin/users/${u.id}/reset-mfa`, {
                                        method: "POST",
                                        body: JSON.stringify({ adminPassword: pw }),
                                      });
                                      setNotice(
                                        `${u.name} will set up a new authenticator next time they sign in.`,
                                      );
                                    },
                                  })
                                }
                              >
                                Reset MFA
                              </button>
                              {u.isActive && (
                                <button
                                  type="button"
                                  className="text-danger hover:underline"
                                  onClick={() =>
                                    requestAdminConfirmation({
                                      title: `Deactivate ${u.name}?`,
                                      description:
                                        "They will be signed out immediately and blocked from signing in. Enter your admin password to confirm.",
                                      confirmLabel: "Verify & Deactivate",
                                      variant: "danger",
                                      execute: async (pw) => {
                                        await api(`/admin/users/${u.id}/deactivate`, {
                                          method: "POST",
                                          body: JSON.stringify({ adminPassword: pw }),
                                        });
                                        setNotice(`${u.name} has been deactivated.`);
                                        setEditingUserId(null);
                                      },
                                    })
                                  }
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
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

      {/* MANDATORY ADMIN PASSWORD VERIFICATION MODAL */}
      <Modal
        open={Boolean(pendingAction)}
        onClose={() => {
          if (!actionBusy) setPendingAction(null);
        }}
        busy={actionBusy}
        ariaLabelledBy="admin-pw-confirm-title"
        maxWidthClass="max-w-md"
      >
        {pendingAction && (
          <form onSubmit={submitAdminConfirmation} className="p-6 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">
                Admin Security Verification
              </p>
              <h2
                id="admin-pw-confirm-title"
                className="mt-1 text-base font-semibold tracking-[-0.015em] text-ink"
              >
                {pendingAction.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {pendingAction.description}
              </p>
            </div>

            {adminPwError && (
              <p
                role="alert"
                className="rounded-xl border border-danger-border bg-danger-bg px-3.5 py-2.5 text-xs text-danger"
              >
                {adminPwError}
              </p>
            )}

            <div>
              <label htmlFor="confirm-admin-pw" className="label">
                Your Admin Password
              </label>
              <input
                id="confirm-admin-pw"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter your admin password to confirm"
                className="field"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setPendingAction(null)}
                className="btn-secondary rounded-xl px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className={
                  pendingAction.variant === "danger"
                    ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#912018] disabled:opacity-50"
                    : "btn-primary rounded-xl px-4 py-2"
                }
              >
                {actionBusy && <Spinner />}
                <span>{actionBusy ? "Verifying…" : pendingAction.confirmLabel}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
