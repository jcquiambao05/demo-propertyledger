// FR-14 document completeness checklist — docs/build/DECISIONS.md D10.
// Each required type shows Present / Missing / Expired; time-bound documents on file are listed
// too. Current versions only; deleted documents do not count (D3). Readers per §4; IT refused.
import { Router } from "express";
import { prisma } from "../db.js";
import { route, h } from "../rbac/route.js";
import { readableParcel } from "../parcels/access.js";
import { DOCUMENT_TYPES, REQUIRED_TYPES, findType, todayManila } from "./document-types.js";

type State = "PRESENT" | "MISSING" | "EXPIRED";

export function checklistRouter(): Router {
  const r = Router();

  route(
    r,
    "get",
    "/document-types",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (_req, res) => {
      res.json(DOCUMENT_TYPES);
    }),
  );

  route(
    r,
    "get",
    "/parcels/:id/checklist",
    ["LEGAL", "MANAGEMENT", "TENANT"],
    h(async (req, res) => {
      const parcel = await readableParcel(res, req.params.id);
      if (!parcel) return;
      // D10: a parcel with an OCT or TCT is titled; one with only a tax declaration is untitled.
      const classification = parcel.titleNo ? "TITLED" : "UNTITLED";
      const docs = await prisma.document.findMany({
        where: { parcelId: parcel.id, deletedAt: null, status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        select: { id: true, docType: true, expiresOn: true },
      });
      const today = todayManila();
      const expired = (d: { expiresOn: Date | null }) =>
        !!d.expiresOn && d.expiresOn.toISOString().slice(0, 10) < today;
      const item = (type: string) => {
        const ofType = docs.filter((d) => findType(d.docType)?.name === type);
        // Prefer a document that is still valid over an expired one of the same type.
        const best = ofType.find((d) => !expired(d)) ?? ofType[0];
        const state: State = !best ? "MISSING" : expired(best) ? "EXPIRED" : "PRESENT";
        return {
          type,
          required: (REQUIRED_TYPES[classification] as readonly string[]).includes(type),
          state,
          documentId: best?.id ?? null,
          expiresOn: best?.expiresOn ? best.expiresOn.toISOString().slice(0, 10) : null,
        };
      };
      const timeBoundOnFile = DOCUMENT_TYPES.filter(
        (t) => t.timeBound && docs.some((d) => findType(d.docType)?.name === t.name),
      ).map((t) => t.name);
      const items = [...REQUIRED_TYPES[classification], ...timeBoundOnFile].map(item);
      res.json({
        classification,
        complete: items.every((i) => i.state === "PRESENT"),
        items,
      });
    }),
  );

  return r;
}
