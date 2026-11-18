"use client";
// FR-16 legal issues on the parcel record (DECISIONS D9 Issues tab, D12). Figure (V2x Issues).
// Legal Department records issues and changes status with a note; others view only.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Issue {
  id: string;
  title: string;
  type: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED";
  description: string | null;
  assignee: { id: string; name: string };
  createdAt: string;
}

interface Change {
  id: string;
  from: string;
  to: string;
  note: string;
  by: string | null;
  createdAt: string;
}

const STATUS: Record<Issue["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
};
const PRIORITY: Record<Issue["priority"], string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export function IssuesTab({ parcelId, canEdit }: { parcelId: string; canEdit: boolean }) {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setIssues(await api<Issue[]>(`/parcels/${parcelId}/issues`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [parcelId]);

  useEffect(() => {
    void load();
    api<{ types: string[] }>("/issue-types").then(
      (r) => setTypes(r.types),
      () => undefined,
    );
    if (canEdit)
      api<{ id: string; name: string }[]>("/issues/assignees").then(setAssignees, () => undefined);
  }, [load, canEdit]);

  async function toggle(id: string) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    try {
      setChanges((await api<{ changes: Change[] }>(`/issues/${id}`)).changes);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function post(path: string, form: HTMLFormElement, done: () => Promise<void> | void) {
    setError("");
    try {
      await api(path, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      await done();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!issues) return <p className="text-sm text-muted">Loading…</p>;
  const open = issues.filter((i) => i.status !== "RESOLVED");

  return (
    <div className="card space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{open.length === 0 ? "No open legal issues." : `${open.length} open legal issue(s).`}</p>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-brand hover:underline"
          >
            Record an issue
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void post(`/parcels/${parcelId}/issues`, e.currentTarget, () => setAdding(false));
          }}
          className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label htmlFor="iss-title" className="label">
              Short title
            </label>
            <input id="iss-title" name="title" required maxLength={200} className="field" />
          </div>
          <div>
            <label htmlFor="iss-type" className="label">
              Type
            </label>
            <select id="iss-type" name="type" required defaultValue="" className="field">
              <option value="" disabled>
                Choose a type
              </option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="iss-priority" className="label">
              Priority
            </label>
            <select id="iss-priority" name="priority" defaultValue="MEDIUM" className="field">
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div>
            <label htmlFor="iss-assignee" className="label">
              Assigned to
            </label>
            <select id="iss-assignee" name="assigneeId" required defaultValue="" className="field">
              <option value="" disabled>
                Choose a Legal Department user
              </option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="iss-desc" className="label">
              Description (optional)
            </label>
            <textarea
              id="iss-desc"
              name="description"
              rows={3}
              maxLength={4000}
              className="field"
            />
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className="btn-primary">
              Save issue
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {issues.length > 0 && (
        <ul className="divide-y divide-line">
          {issues.map((i) => (
            <li key={i.id} className="space-y-2 py-2">
              <button
                type="button"
                onClick={() => toggle(i.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="font-medium">{i.title}</span>
                  <span className="text-muted">
                    {" "}
                    · {i.type} · {i.assignee.name}
                  </span>
                </span>
                <span className="flex gap-2">
                  {i.priority === "HIGH" && i.status !== "RESOLVED" && (
                    <span className="pill-warning">High</span>
                  )}
                  <span className="text-muted">{STATUS[i.status]}</span>
                </span>
              </button>
              {openId === i.id && (
                <div className="space-y-2 rounded-lg bg-page p-3">
                  <p className="text-muted">Priority: {PRIORITY[i.priority]}</p>
                  {i.description && <p>{i.description}</p>}
                  {changes.length > 0 && (
                    <ul className="space-y-1">
                      {changes.map((c) => (
                        <li key={c.id}>
                          <span className="font-medium">{STATUS[c.to as Issue["status"]]}</span>
                          <span className="text-muted">
                            {" "}
                            · {new Date(c.createdAt).toLocaleDateString()}
                            {c.by && ` by ${c.by}`}
                          </span>
                          <p>{c.note}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        void post(`/issues/${i.id}/status`, form, async () => {
                          form.reset();
                          setChanges((await api<{ changes: Change[] }>(`/issues/${i.id}`)).changes);
                        });
                      }}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <div>
                        <label htmlFor={`st-${i.id}`} className="label">
                          New status
                        </label>
                        <select id={`st-${i.id}`} name="status" className="field">
                          {Object.entries(STATUS)
                            .filter(([v]) => v !== i.status)
                            .map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="min-w-[220px] flex-1">
                        <label htmlFor={`note-${i.id}`} className="label">
                          Note (required)
                        </label>
                        <input
                          id={`note-${i.id}`}
                          name="note"
                          required
                          maxLength={2000}
                          className="field"
                        />
                      </div>
                      <button type="submit" className="btn-secondary">
                        Change status
                      </button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
