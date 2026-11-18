import type { ParcelStatus } from "@/lib/types";

// Color only where action is needed: amber for a returned record (Legal must correct it).
export function StatusPill({ status }: { status: ParcelStatus }) {
  if (status === "RETURNED") return <span className="pill-warning">Returned with remarks</span>;
  if (status === "PENDING") return <span className="pill border border-dashed border-muted">Waiting for approval</span>;
  return <span className="pill">Approved</span>;
}

export const ACTION_LABEL: Record<string, string> = {
  PARCEL_SUBMITTED: "Submitted for approval",
  PARCEL_APPROVED: "Approved",
  PARCEL_RETURNED: "Returned with remarks",
  PARCEL_RESUBMITTED: "Corrected and resubmitted",
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_VIEWED: "Document viewed",
  DOCUMENT_DOWNLOADED: "Document downloaded",
  INTEGRITY_FAIL: "Integrity check failed",
  ACCESS_DENIED: "Access refused",
};
