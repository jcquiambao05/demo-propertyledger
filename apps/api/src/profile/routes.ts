import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Role } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { appendAudit } from "../audit/chain.js";
import { route, h, currentUser } from "../rbac/route.js";
import { validatePasswordPolicy } from "./password-policy.js";

const ALL_ROLES: Role[] = ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"];

export const ALLOWED_THEMES = [
  "default",
  "white",
  "dark",
  "charcoal-gold",
  "sage-terracotta",
  "espresso-sky",
  "midnight-lime",
] as const;

export const ALLOWED_FONT_SIZES = ["sm", "md", "lg"] as const;

const DEFAULT_POSITION_BY_ROLE: Record<Role, string> = {
  LEGAL: "Legal Counsel",
  MANAGEMENT: "Executive Management",
  TENANT: "Authorized Lessee Representative",
  IT_ADMIN: "Systems & Security Administrator",
};

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
});

function singleAvatar(req: Request, res: Response, next: NextFunction) {
  upload.single("avatar")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Profile image is too large (maximum 5 MB)." });
      return;
    }
    if (err) {
      res.status(400).json({ error: "Invalid image upload." });
      return;
    }
    next();
  });
}

function detectImageFormat(buf: Buffer): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export function profileRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/profile",
    ALL_ROLES,
    h(async (_req, res) => {
      const me = currentUser(res);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: {
          id: true,
          email: true,
          name: true,
          position: true,
          role: true,
          avatarPath: true,
          securityQuestion: true,
          securityAnswerHash: true,
          backupCodesHash: true,
          theme: true,
          fontSize: true,
        },
      });
      let backupCodesRemaining = 0;
      if (user.backupCodesHash) {
        try {
          const parsed = JSON.parse(user.backupCodesHash);
          if (Array.isArray(parsed)) backupCodesRemaining = parsed.length;
        } catch {
          backupCodesRemaining = 0;
        }
      }
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        position: user.position || DEFAULT_POSITION_BY_ROLE[user.role],
        role: user.role,
        hasAvatar: Boolean(user.avatarPath),
        securityQuestion: user.securityQuestion ?? null,
        hasSecurityQuestion: Boolean(user.securityQuestion && user.securityAnswerHash),
        backupCodesRemaining,
        theme: user.theme || "default",
        fontSize: user.fontSize || "md",
      });
    }),
  );

  route(
    r,
    "patch",
    "/profile/preferences",
    ALL_ROLES,
    h(async (req, res) => {
      const me = currentUser(res);
      const data: { theme?: string; fontSize?: string } = {};

      if (req.body?.theme !== undefined) {
        const theme = typeof req.body.theme === "string" ? req.body.theme.trim() : "";
        if (!(ALLOWED_THEMES as readonly string[]).includes(theme)) {
          return res.status(400).json({ error: "Invalid theme option." });
        }
        data.theme = theme;
      }

      if (req.body?.fontSize !== undefined) {
        const fontSize = typeof req.body.fontSize === "string" ? req.body.fontSize.trim() : "";
        if (!(ALLOWED_FONT_SIZES as readonly string[]).includes(fontSize)) {
          return res.status(400).json({ error: "Invalid font size option." });
        }
        data.fontSize = fontSize;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "Nothing to update." });
      }

      const updated = await prisma.user.update({
        where: { id: me.id },
        data,
        select: { theme: true, fontSize: true },
      });

      res.json(updated);
    }),
  );

  route(
    r,
    "post",
    "/profile/avatar",
    ALL_ROLES,
    singleAvatar,
    h(async (req, res) => {
      const me = currentUser(res);
      const file = req.file;
      if (!file || file.size === 0) {
        return res.status(400).json({ error: "Choose an image file to upload." });
      }
      const fmt = detectImageFormat(file.buffer);
      if (!fmt) {
        return res.status(400).json({ error: "Only PNG, JPG, and WebP images are supported." });
      }

      const existing = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { avatarPath: true },
      });

      const avatarsDir = path.join(config.uploadDir, "avatars");
      await mkdir(avatarsDir, { recursive: true });
      const fileName = `${randomUUID()}.${fmt.ext}`;
      const relPath = path.join("avatars", fileName);
      const fullPath = path.join(config.uploadDir, relPath);

      await writeFile(fullPath, file.buffer);

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: me.id },
          data: { avatarPath: relPath },
        });
        await appendAudit(
          {
            actorId: me.id,
            action: "AVATAR_UPDATED",
            entity: "user",
            entityId: me.id,
          },
          tx,
        );
      });

      if (existing.avatarPath) {
        await unlink(path.join(config.uploadDir, existing.avatarPath)).catch(() => undefined);
      }

      res.status(201).json({ hasAvatar: true });
    }),
  );

  route(
    r,
    "get",
    "/profile/avatar",
    ALL_ROLES,
    h(async (_req, res) => {
      const me = currentUser(res);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { avatarPath: true },
      });
      if (!user.avatarPath) {
        return res.status(404).json({ error: "not_found" });
      }
      const fullPath = path.join(config.uploadDir, user.avatarPath);
      let buf: Buffer;
      try {
        buf = await readFile(fullPath);
      } catch {
        return res.status(404).json({ error: "not_found" });
      }
      const fmt = detectImageFormat(buf);
      res.setHeader("Content-Type", fmt?.mime ?? "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(buf);
    }),
  );

  route(
    r,
    "delete",
    "/profile/avatar",
    ALL_ROLES,
    h(async (_req, res) => {
      const me = currentUser(res);
      const existing = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { avatarPath: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: me.id },
          data: { avatarPath: null },
        });
        await appendAudit(
          {
            actorId: me.id,
            action: "AVATAR_REMOVED",
            entity: "user",
            entityId: me.id,
          },
          tx,
        );
      });

      if (existing.avatarPath) {
        await unlink(path.join(config.uploadDir, existing.avatarPath)).catch(() => undefined);
      }

      res.json({ hasAvatar: false });
    }),
  );

  route(
    r,
    "post",
    "/profile/password",
    ALL_ROLES,
    h(async (req, res) => {
      const me = currentUser(res);
      const currentPassword =
        typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      const confirmPassword =
        typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

      if (!currentPassword) {
        return res.status(400).json({ error: "Enter your current password." });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "New password and confirmation do not match." });
      }
      const policyErr = validatePasswordPolicy(newPassword);
      if (policyErr) {
        return res.status(400).json({ error: policyErr });
      }

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { id: true, passwordHash: true },
      });

      const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!currentOk) {
        return res.status(401).json({ error: "Your current password is incorrect." });
      }

      const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
      if (sameAsOld) {
        return res
          .status(400)
          .json({ error: "New password must be different from your current password." });
      }

      const nextHash = await bcrypt.hash(newPassword, 12);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: me.id },
          data: { passwordHash: nextHash },
        });
        await appendAudit(
          {
            actorId: me.id,
            action: "PASSWORD_CHANGED",
            entity: "user",
            entityId: me.id,
          },
          tx,
        );
      });

      res.json({ ok: true });
    }),
  );

  route(
    r,
    "put",
    "/profile/security-question",
    ALL_ROLES,
    h(async (req, res) => {
      const me = currentUser(res);
      const currentPassword =
        typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
      const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";

      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Re-enter your current password to save your security question." });
      }
      if (question.length < 5 || question.length > 255) {
        return res
          .status(400)
          .json({ error: "Choose or enter a security question (5 to 255 characters)." });
      }
      if (answer.length < 2 || answer.length > 200) {
        return res
          .status(400)
          .json({ error: "Enter an answer of at least 2 characters for your security question." });
      }

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { id: true, passwordHash: true },
      });

      const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!currentOk) {
        return res.status(401).json({ error: "Your current password is incorrect." });
      }

      const answerHash = await bcrypt.hash(answer.toLowerCase(), 12);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: me.id },
          data: {
            securityQuestion: question,
            securityAnswerHash: answerHash,
          },
        });
        await appendAudit(
          {
            actorId: me.id,
            action: "SECURITY_QUESTION_UPDATED",
            entity: "user",
            entityId: me.id,
          },
          tx,
        );
      });

      res.json({
        ok: true,
        securityQuestion: question,
        hasSecurityQuestion: true,
      });
    }),
  );

  // Generate 6 one-time-use backup codes (requires current password verification)
  route(
    r,
    "post",
    "/profile/backup-codes",
    ALL_ROLES,
    h(async (req, res) => {
      const me = currentUser(res);
      const currentPassword =
        typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";

      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Enter your current password to generate backup codes." });
      }

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { id: true, passwordHash: true },
      });

      const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!currentOk) {
        return res.status(401).json({ error: "Your current password is incorrect." });
      }

      const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      const codes: string[] = [];
      const hashes: string[] = [];

      for (let i = 0; i < 6; i++) {
        const bytes = randomBytes(8);
        let raw = "";
        for (let j = 0; j < 8; j++) {
          raw += alphabet[bytes[j] % alphabet.length];
        }
        const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
        codes.push(formatted);
        hashes.push(await bcrypt.hash(raw, 10));
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: me.id },
          data: { backupCodesHash: JSON.stringify(hashes) },
        });
        await appendAudit(
          {
            actorId: me.id,
            action: "BACKUP_CODES_GENERATED",
            entity: "user",
            entityId: me.id,
            details: { count: 6 },
          },
          tx,
        );
      });

      res.status(201).json({
        codes,
        backupCodesRemaining: 6,
      });
    }),
  );

  return r;
}
