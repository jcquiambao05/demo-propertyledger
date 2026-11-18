"use client";
// NFR-09 Tenant assignment (DECISIONS D13): the Legal Department gives a Tenant read-only
// access to an approved parcel. Management can see who is assigned.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Person {
  id: string;
  name: string;
  email: string;
}

export function TenantsCard({ parcelId, canEdit }: { parcelId: string; canEdit: boolean }) {
  const [assigned, setAssigned] = useState<Person[]>([]);
  const [tenants, setTenants] = useState<Person[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setAssigned(await api<Person[]>(`/parcels/${parcelId}/tenants`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [parcelId]);

  useEffect(() => {
    void load();
    if (canEdit) api<Person[]>("/tenants").then(setTenants, () => undefined);
  }, [load, canEdit]);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const available = tenants.filter((t) => !assigned.some((a) => a.id === t.id));

  return (
    <div className="card space-y-3 text-sm">
      <h2 className="font-semibold">Tenant access (read-only)</h2>
      {assigned.length === 0 ? (
        <p className="text-muted">No Tenant can see this parcel.</p>
      ) : (
        <ul className="divide-y divide-line">
          {assigned.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span>{a.name}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    run(() => api(`/parcels/${parcelId}/tenants/${a.id}`, { method: "DELETE" }))
                  }
                  className="text-danger hover:underline"
                >
                  Remove access
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const userId = String(new FormData(e.currentTarget).get("userId") ?? "");
            void run(() =>
              api(`/parcels/${parcelId}/tenants`, {
                method: "POST",
                body: JSON.stringify({ userId }),
              }),
            );
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label htmlFor="tenant" className="label">
              Give access to
            </label>
            <select id="tenant" name="userId" required defaultValue="" className="field">
              <option value="" disabled>
                Choose a Tenant
              </option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            Give access
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
