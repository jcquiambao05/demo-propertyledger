"use client";
// DEMO_PAGES page 33 (V33 IT users), IT Administrator, dark-blue theme. FR-04 (DECISIONS D13).
// Users with role, MFA, last sign-in and locked status. Every change needs a recent
// authenticator code (setting 11); guardrails are enforced by the API.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

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

const FIELD = "mt-1 w-full rounded-md border border-it-line bg-it-page px-3 py-2 text-sm text-it-text";
const BTN = "rounded-lg bg-it-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const LINK = "text-it-accent hover:underline";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needCode, setNeedCode] = useState<null | (() => Promise<void>)>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

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

  /** Runs an action; if the API asks for MFA re-entry, shows the code box and retries after it. */
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Users</h1>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={BTN}>
            Add user
          </button>
        )}
      </div>
      {notice && <p className="text-sm text-it-ok">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm text-it-bad">
          {error}
        </p>
      )}

      {needCode && (
        <form
          onSubmit={submitCode}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-it-line bg-it-surface p-4 text-sm"
        >
          <div>
            <label htmlFor="code" className="text-it-muted">
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
              className={`${FIELD} w-32`}
            />
          </div>
          <button type="submit" className={BTN}>
            Confirm
          </button>
          <button type="button" onClick={() => setNeedCode(null)} className={LINK}>
            Cancel
          </button>
        </form>
      )}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const body = Object.fromEntries(new FormData(e.currentTarget));
            void act(async () => {
              await post("/admin/users", body);
              setAdding(false);
            }, "User added. They set up their authenticator app at first sign-in.");
          }}
          className="grid gap-3 rounded-xl border border-it-line bg-it-surface p-4 text-sm sm:grid-cols-2"
        >
          <label className="text-it-muted">
            Name
            <input name="name" required maxLength={120} className={FIELD} />
          </label>
          <label className="text-it-muted">
            Email
            <input name="email" type="email" required className={FIELD} />
          </label>
          <label className="text-it-muted">
            Role
            <select name="role" defaultValue="LEGAL" className={FIELD}>
              {Object.entries(ROLE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-it-muted">
            Temporary password (at least 15 characters)
            <input
              name="password"
              type="password"
              required
              minLength={15}
              maxLength={128}
              autoComplete="new-password"
              className={FIELD}
            />
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className={BTN}>
              Save user
            </button>
            <button type="button" onClick={() => setAdding(false)} className={LINK}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-it-line bg-it-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-it-line text-it-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">MFA</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-it-line align-top last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-it-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3">{ROLE[u.role]}</td>
                <td className="px-4 py-3">{u.mfaEnabled ? "Set up" : "Not yet"}</td>
                <td className="px-4 py-3 text-it-muted">
                  {u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  {!u.isActive ? (
                    <span className="text-it-muted">Inactive</span>
                  ) : u.locked ? (
                    <span className="rounded-full bg-it-badbg px-2 py-0.5 text-xs text-it-bad">
                      Locked
                    </span>
                  ) : (
                    "Active"
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    {u.locked && (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() =>
                          act(() => post(`/admin/users/${u.id}/unlock`), `${u.name} unlocked.`)
                        }
                      >
                        Unlock
                      </button>
                    )}
                    <button
                      type="button"
                      className={LINK}
                      onClick={() => setManaging(managing === u.id ? null : u.id)}
                    >
                      {managing === u.id ? "Close" : "Manage"}
                    </button>
                  </div>
                  {managing === u.id && (
                    <div className="mt-3 space-y-2">
                      <label className="block text-xs text-it-muted">
                        Change role
                        <select
                          defaultValue={u.role}
                          className={FIELD}
                          onChange={(e) =>
                            act(
                              () =>
                                api(`/admin/users/${u.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ role: e.target.value }),
                                }),
                              `${u.name} is now ${ROLE[e.target.value as User["role"]]}. Their sessions ended.`,
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
                      <div className="flex flex-wrap gap-3 text-xs">
                        <button
                          type="button"
                          className={LINK}
                          onClick={() =>
                            act(
                              () => post(`/admin/users/${u.id}/end-sessions`),
                              `${u.name} was signed out everywhere.`,
                            )
                          }
                        >
                          Sign out everywhere
                        </button>
                        <button
                          type="button"
                          className={LINK}
                          onClick={() =>
                            act(
                              () => post(`/admin/users/${u.id}/reset-mfa`),
                              `${u.name} sets up a new authenticator at next sign-in.`,
                            )
                          }
                        >
                          Reset MFA
                        </button>
                        {u.isActive && (
                          <button
                            type="button"
                            className="text-it-bad hover:underline"
                            onClick={() =>
                              window.confirm(`Deactivate ${u.name}? They can no longer sign in.`) &&
                              act(
                                () => post(`/admin/users/${u.id}/deactivate`),
                                `${u.name} was deactivated.`,
                              )
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
