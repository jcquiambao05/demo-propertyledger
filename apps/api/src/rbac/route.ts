// FR-03, NFR-09: deny-by-default RBAC enforced in API middleware on every route.
// Every route is registered through `route()` with an explicit access declaration;
// `assertAllRoutesDeclared()` makes the app refuse to start if any route skipped it.
import type { Express, NextFunction, Request, RequestHandler, Response, Router } from "express";
import type { Role } from "@prisma/client";
import { decode } from "next-auth/jwt";
import { config, security } from "../config.js";
import { getSession, deleteSession } from "../auth/sessions.js";
import { prisma } from "../db.js";
import { appendAudit } from "../audit/chain.js";
import { incrWithTtl } from "../redis.js";

export type Access = "public" | readonly Role[];

export interface AuthedUser {
  id: string;
  role: Role;
  sid: string;
}

const DECLARED = Symbol.for("epl.access");

type Method = "get" | "post" | "patch" | "put" | "delete";

const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

async function resolveUser(req: Request): Promise<AuthedUser | null> {
  for (const name of SESSION_COOKIES) {
    try {
      const raw = readCookie(req, name);
      if (!raw) continue;
      const token = await decode({ token: raw, secret: config.nextAuthSecret });
      const sid = typeof token?.sid === "string" ? token.sid : null;
      if (!sid) return null;
      const s = await getSession(sid);
      if (!s) return null;
      // Re-check the account on every request: a deactivated user or a changed role
      // ends the session instead of keeping stale permissions.
      const user = await prisma.user.findUnique({
        where: { id: s.userId },
        select: { role: true, isActive: true },
      });
      if (!user || !user.isActive || user.role !== s.role) {
        await deleteSession(sid);
        return null;
      }
      return { id: s.userId, role: user.role, sid };
    } catch {
      return null;
    }
  }
  return null;
}

export function currentUser(res: Response): AuthedUser {
  const u = res.locals.user as AuthedUser | undefined;
  if (!u) throw new Error("currentUser() used on a public route");
  return u;
}

/** Log ACCESS_DENIED (IDs and actions only) and answer 403. */
export async function deny(res: Response, entity: string, entityId: string | null) {
  const u = res.locals.user as AuthedUser | undefined;
  await appendAudit({ actorId: u?.id ?? null, action: "ACCESS_DENIED", entity, entityId });
  res.status(403).json({ error: "forbidden" });
}

function guard(access: Access, label: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (access === "public") return next();
      const user = await resolveUser(req);
      if (!user) return res.status(401).json({ error: "unauthenticated" });
      res.locals.user = user;

      // NFR-01: per-user request limit (100/min -> 429).
      const bucket = `rl:${user.id}:${Math.floor(Date.now() / 60000)}`;
      const count = await incrWithTtl(bucket, 70);
      if (count > security.requestsPerMinute)
        return res.status(429).json({ error: "too_many_requests" });

      if (!access.includes(user.role)) return deny(res, "route", label);
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Async handler wrapper so rejected promises reach the error handler. */
export function h(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function route(
  router: Router | Express,
  method: Method,
  path: string,
  access: Access,
  ...handlers: RequestHandler[]
): void {
  const g = guard(access, `${method.toUpperCase()} ${path}`) as RequestHandler & {
    [DECLARED]?: Access;
  };
  g[DECLARED] = access;
  (router[method] as (p: string, ...fns: RequestHandler[]) => unknown).call(
    router,
    path,
    g,
    ...handlers,
  );
}

interface Layer {
  route?: { path: string; stack: { handle: { [DECLARED]?: Access } }[] };
  name?: string;
  handle?: { stack?: Layer[] };
}

/** Throw if any registered route was added without `route()` (deny by default). */
export function assertAllRoutesDeclared(app: Express): void {
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        const first = layer.route.stack[0]?.handle;
        if (!first || first[DECLARED] === undefined) {
          throw new Error(`Route ${layer.route.path} has no access declaration`);
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((app as unknown as { _router: { stack: Layer[] } })._router.stack);
}
