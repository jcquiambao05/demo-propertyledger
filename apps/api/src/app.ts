import express, { type NextFunction, type Request, type Response } from "express";
import { route, assertAllRoutesDeclared } from "./rbac/route.js";
import { authRouter } from "./auth/routes.js";
import { parcelsRouter } from "./parcels/routes.js";
import { mapRouter } from "./parcels/map.js";
import { documentsRouter } from "./documents/routes.js";
import { custodyRouter } from "./documents/custody.js";
import { checklistRouter } from "./documents/checklist.js";
import { rptRouter } from "./rpt/routes.js";
import { issuesRouter } from "./issues/routes.js";
import { usersRouter } from "./users/routes.js";
import { stepUpRouter } from "./users/step-up.js";
import { auditAdminRouter } from "./audit/admin.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  route(app, "get", "/health", "public", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(authRouter());
  app.use(mapRouter()); // before /parcels/:id
  app.use(parcelsRouter());
  app.use(documentsRouter());
  app.use(custodyRouter());
  app.use(checklistRouter());
  app.use(rptRouter());
  app.use(issuesRouter());
  app.use(stepUpRouter());
  app.use(usersRouter());
  app.use(auditAdminRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  // Errors without stack traces (STUDY_CONTEXT §8).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (process.env.NODE_ENV !== "test")
      console.error(err instanceof Error ? err.message : "error");
    res.status(500).json({ error: "Something went wrong." });
  });

  assertAllRoutesDeclared(app);
  return app;
}
