// FR-15 daily due-date and expiry check — docs/build/DECISIONS.md D11, STUDY_CONTEXT §8
// settings 18 (alert days 30, 7, 0) and 19 (recipients). Emails name the parcel, the item and
// the date only. Each alert is sent once per item and alert day; every send logs ALERT_SENT.
// Without SMTP or recipients the check still updates statuses, skips sending and warns.
import cron from "node-cron";
import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import { appendAudit } from "../audit/chain.js";
import { todayManila } from "../documents/document-types.js";

export const ALERT_DAYS = [30, 7, 0] as const; // setting 18 (locked)

export interface AlertMessage {
  to: string[];
  subject: string;
  text: string;
  kind: "RPT" | "DOCUMENT_EXPIRY";
  itemId: string;
  parcelId: string;
  daysBefore: number;
}

export type Send = (m: AlertMessage) => Promise<void>;

export interface CheckResult {
  skipped: boolean;
  sent: number;
  markedOverdue: number;
  markedExpired: number;
}

/** YYYY-MM-DD plus n days. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const asDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

export async function runDueDateCheck(opts: {
  now?: Date;
  send: Send | null;
  recipients: string[];
}): Promise<CheckResult> {
  const today = todayManila(opts.now);

  // Statuses first, whether or not email is configured.
  const overdue = await prisma.rptSchedule.updateMany({
    where: { status: "UNPAID", dueDate: { lt: asDate(today) } },
    data: { status: "OVERDUE" },
  });
  const expiring = await prisma.document.findMany({
    where: { status: "ACTIVE", deletedAt: null, expiresOn: { lt: asDate(today) } },
    select: { id: true, parcelId: true },
  });
  for (const d of expiring) {
    await prisma.$transaction(async (tx) => {
      const u = await tx.document.updateMany({
        where: { id: d.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (u.count === 0) return;
      await appendAudit(
        {
          actorId: null,
          action: "DOCUMENT_EXPIRED",
          entity: "document",
          entityId: d.id,
          details: { documentId: d.id, parcelId: d.parcelId },
        },
        tx,
      );
    });
  }
  const base = { markedOverdue: overdue.count, markedExpired: expiring.length };

  if (!opts.send || opts.recipients.length === 0) {
    console.warn(
      "Due-date alerts skipped: email is not configured (SMTP_HOST and ALERT_RECIPIENTS).",
    );
    return { skipped: true, sent: 0, ...base };
  }

  const days = new Map(ALERT_DAYS.map((n) => [addDays(today, n), n]));
  const dates = [...days.keys()].map(asDate);
  const messages: AlertMessage[] = [];

  const rpt = await prisma.rptSchedule.findMany({
    where: { status: { not: "PAID" }, dueDate: { in: dates } },
    include: { parcel: { select: { name: true } } },
  });
  for (const s of rpt) {
    const due = ymdOf(s.dueDate);
    messages.push({
      to: opts.recipients,
      subject: `RPT falls due on ${due}: ${s.parcel.name}`,
      text: `RPT ${s.year} Q${s.quarter} for ${s.parcel.name} falls due on ${due}. (Ref. ${s.id})`,
      kind: "RPT",
      itemId: s.id,
      parcelId: s.parcelId,
      daysBefore: days.get(due)!,
    });
  }

  const docs = await prisma.document.findMany({
    where: { deletedAt: null, status: { not: "SUPERSEDED" }, expiresOn: { in: dates } },
    include: { parcel: { select: { name: true } } },
  });
  for (const d of docs) {
    const exp = ymdOf(d.expiresOn!);
    const label = d.docType ?? "Document";
    messages.push({
      to: opts.recipients,
      subject: `${label} expires on ${exp}: ${d.parcel.name}`,
      text: `${label} for ${d.parcel.name} expires on ${exp}. (Ref. ${d.id})`,
      kind: "DOCUMENT_EXPIRY",
      itemId: d.id,
      parcelId: d.parcelId,
      daysBefore: days.get(exp)!,
    });
  }

  let sent = 0;
  for (const m of messages) {
    // Once per item and alert day, even if the check runs again ("Run check now").
    const key = `alert:${m.kind}:${m.itemId}:${m.daysBefore}`;
    if ((await redis().set(key, "1", "EX", 3 * 24 * 3600, "NX")) !== "OK") continue;
    try {
      await opts.send(m);
    } catch (e) {
      await redis().del(key); // retry on the next run
      console.warn(`Alert email failed for ${m.kind} ${m.itemId}: ${(e as Error).message}`);
      continue;
    }
    await appendAudit({
      actorId: null,
      action: "ALERT_SENT",
      entity: m.kind === "RPT" ? "rpt_schedule" : "document",
      entityId: m.itemId,
      details: { kind: m.kind, itemId: m.itemId, parcelId: m.parcelId, daysBefore: m.daysBefore },
    });
    sent++;
  }
  return { skipped: false, sent, ...base };
}

/** SMTP from env (values never logged). Null when not configured. */
export function mailerFromEnv(): Send | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "no-reply@localhost";
  return async (m) => {
    await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text });
  };
}

/** Setting 19: ALERT_RECIPIENTS, comma-separated. */
export function recipientsFromEnv(): string[] {
  return (process.env.ALERT_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runConfiguredCheck(now = new Date()) {
  const result = await runDueDateCheck({
    now,
    send: mailerFromEnv(),
    recipients: recipientsFromEnv(),
  });
  await redis().set("scheduler:last-run", now.toISOString());
  return result;
}

/** node-cron daily job; time from ALERT_TIME (HH:MM, default 07:00 Asia/Manila). */
export function startScheduler() {
  const [h, m] = (process.env.ALERT_TIME ?? "07:00").split(":").map(Number);
  const hour = Number.isInteger(h) && h >= 0 && h < 24 ? h : 7;
  const minute = Number.isInteger(m) && m >= 0 && m < 60 ? m : 0;
  cron.schedule(
    `${minute} ${hour} * * *`,
    () => {
      runConfiguredCheck().catch((e) =>
        console.error(`Due-date check failed: ${(e as Error).message}`),
      );
    },
    { timezone: "Asia/Manila" },
  );
}
