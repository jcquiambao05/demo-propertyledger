// FR-16 legal issue tracking — docs/build/DECISIONS.md D12, STUDY_CONTEXT §6 module 7.
// Legal Department creates issues and changes their status (a note is required each time);
// Management and assigned Tenants view only; IT refused (§4). Audit entries hold IDs and
// statuses only, never the issue text.
import { Router } from "express";
import type { IssuePriority, IssueStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { appendAudit } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { readableParcel, UUID } from "../parcels/access.js";
import { ISSUE_TYPES, PRIORITIES, STATUSES } from "./issue-types.js";

const READERS = ["LEGAL", "MANAGEMENT", "TENANT"] as const;

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

async function changedByNames(ids: string[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export function issuesRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/issue-types",
    READERS,
    h(async (_req, res) => {
      res.json({ types: ISSUE_TYPES, priorities: PRIORITIES, statuses: STATUSES });
    }),
  );

  // Assignee choices: active Legal Department users (D12).
  route(
    r,
    "get",
    "/issues/assignees",
    ["LEGAL"],
    h(async (_req, res) => {
      res.json(
        await prisma.user.findMany({
          where: { role: "LEGAL", isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      );
    }),
  );

  route(
    r,
    "get",
    "/parcels/:id/issues",
    READERS,
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const issues = await prisma.issue.findMany({
        where: { parcelId: parcel.id },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: { assignee: { select: { id: true, name: true } } },
      });
      res.json(issues);
    }),
  );

  route(
    r,
    "post",
    "/parcels/:id/issues",
    ["LEGAL"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      const title = text(req.body?.title, 200);
      if (!title) return res.status(400).json({ error: "Enter a short title for the issue." });
      const type = req.body?.type;
      if (!ISSUE_TYPES.includes(type))
        return res.status(400).json({ error: "Choose the issue type from the list." });
      const priority = req.body?.priority as IssuePriority;
      if (!PRIORITIES.includes(priority))
        return res.status(400).json({ error: "Choose High, Medium or Low." });
      const assigneeId = req.body?.assigneeId;
      const assignee =
        typeof assigneeId === "string" && UUID.test(assigneeId)
          ? await prisma.user.findUnique({ where: { id: assigneeId } })
          : null;
      if (!assignee || assignee.role !== "LEGAL" || !assignee.isActive)
        return res.status(400).json({ error: "Assign the issue to a Legal Department user." });
      const user = currentUser(res);
      const issue = await prisma.$transaction(async (tx) => {
        const i = await tx.issue.create({
          data: {
            parcelId: parcel.id,
            title,
            type,
            priority,
            assigneeId: assignee.id,
            description: text(req.body?.description, 4000),
            createdById: user.id,
          },
          include: { assignee: { select: { id: true, name: true } } },
        });
        await appendAudit(
          {
            actorId: user.id,
            action: "ISSUE_CREATED",
            entity: "issue",
            entityId: i.id,
            details: { issueId: i.id, parcelId: parcel.id },
          },
          tx,
        );
        return i;
      });
      res.status(201).json(issue);
    }),
  );

  /** Load an issue whose parcel the user may read, or answer the response and return null. */
  async function readableIssue(res: Parameters<typeof readableParcel>[0], id: string) {
    if (!UUID.test(id)) {
      res.status(404).json({ error: "not_found" });
      return null;
    }
    const issue = await prisma.issue.findUnique({ where: { id } });
    if (!issue) {
      res.status(404).json({ error: "not_found" });
      return null;
    }
    return (await readableParcel(res, issue.parcelId)) ? issue : null;
  }

  route(
    r,
    "get",
    "/issues/:id",
    READERS,
    h(async (req, res) => {
      const found = await readableIssue(res, req.params.id);
      if (!found) return;
      const issue = await prisma.issue.findUniqueOrThrow({
        where: { id: found.id },
        include: {
          assignee: { select: { id: true, name: true } },
          changes: { orderBy: { createdAt: "desc" } },
        },
      });
      const names = await changedByNames(issue.changes.map((c) => c.changedById));
      res.json({
        ...issue,
        changes: issue.changes.map((c) => ({
          id: c.id,
          from: c.fromStatus,
          to: c.toStatus,
          note: c.note,
          by: names.get(c.changedById) ?? null,
          createdAt: c.createdAt,
        })),
      });
    }),
  );

  route(
    r,
    "post",
    "/issues/:id/status",
    ["LEGAL"],
    h(async (req, res) => {
      const issue = await readableIssue(res, req.params.id);
      if (!issue) return;
      const to = req.body?.status as IssueStatus;
      if (!STATUSES.includes(to))
        return res.status(400).json({ error: "Choose a status from the list." });
      if (to === issue.status)
        return res.status(400).json({ error: "The issue already has this status." });
      const note = text(req.body?.note, 2000);
      if (!note) return res.status(400).json({ error: "Add a note that explains the change." });
      const user = currentUser(res);
      const updated = await prisma.$transaction(async (tx) => {
        // Guarded on the status we read, so two parallel changes cannot both apply.
        const u = await tx.issue.updateMany({
          where: { id: issue.id, status: issue.status },
          data: { status: to },
        });
        if (u.count === 0) return null;
        await tx.issueStatusChange.create({
          data: {
            issueId: issue.id,
            fromStatus: issue.status,
            toStatus: to,
            note,
            changedById: user.id,
          },
        });
        await appendAudit(
          {
            actorId: user.id,
            action: "ISSUE_STATUS_CHANGED",
            entity: "issue",
            entityId: issue.id,
            details: { issueId: issue.id, from: issue.status, to },
          },
          tx,
        );
        return tx.issue.findUniqueOrThrow({
          where: { id: issue.id },
          include: { assignee: { select: { id: true, name: true } } },
        });
      });
      if (!updated)
        return res
          .status(409)
          .json({ error: "The issue changed meanwhile. Reload and try again." });
      res.json(updated);
    }),
  );

  return r;
}
