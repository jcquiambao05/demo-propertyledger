// FR-14 document types and the interim required set — docs/build/DECISIONS.md D10.
// Kept in this one file so the Legal Department's final list (STUDY_CONTEXT §14) can replace it.
// Also the type list the AI classifier chooses from (D15, step B1).

export interface DocumentType {
  name: string;
  /** Time-bound documents carry an expiry date (D10). Titles never expire (§18). */
  timeBound: boolean;
}

export const DOCUMENT_TYPES: DocumentType[] = [
  { name: "Certificate of Title", timeBound: false }, // OCT or TCT, owner's duplicate
  { name: "Tax Declaration", timeBound: false },
  { name: "RPT Official Receipt", timeBound: false },
  { name: "Deed of Sale", timeBound: false },
  { name: "Survey Plan", timeBound: false },
  { name: "Tax Clearance", timeBound: true },
  { name: "Certification", timeBound: true },
  { name: "Permit", timeBound: true },
  { name: "Site Photo / Media", timeBound: false },
  { name: "Supporting Attachment", timeBound: false },
  { name: "Other", timeBound: false },
];

/** D10 interim required set, by whether the parcel has a title (OCT/TCT) or only a tax declaration. */
export const REQUIRED_TYPES = {
  TITLED: [
    "Certificate of Title",
    "Tax Declaration",
    "RPT Official Receipt",
    "Deed of Sale",
    "Survey Plan",
  ],
  UNTITLED: ["Tax Declaration", "RPT Official Receipt", "Deed of Sale", "Survey Plan"],
} as const;

export function findType(name: unknown): DocumentType | undefined {
  if (typeof name !== "string") return undefined;
  const n = name.trim().toLowerCase();
  return DOCUMENT_TYPES.find((t) => t.name.toLowerCase() === n);
}

/** Today's date in the Philippines (YYYY-MM-DD), for expiry checks. */
export function todayManila(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}
