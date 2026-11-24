import type { ParcelStatus } from "@/lib/types";

export function StatusPill({ status }: { status: ParcelStatus }) {
  if (status === "RETURNED") {
    return <span className="pill-warning">Returned for changes</span>;
  }
  if (status === "PENDING") {
    return <span className="pill border-dashed border-line">Waiting for approval</span>;
  }
  return <span className="pill-ok">Approved</span>;
}

export const ACTION_LABEL: Record<string, string> = {
  PARCEL_SUBMITTED: "Sent for review",
  PARCEL_APPROVED: "Approved",
  PARCEL_RETURNED: "Returned for changes",
  PARCEL_RESUBMITTED: "Updated and resent",
  DOCUMENT_UPLOADED: "File uploaded",
  DOCUMENT_VIEWED: "File viewed",
  DOCUMENT_DOWNLOADED: "File downloaded",
  INTEGRITY_FAIL: "File check failed",
  ACCESS_DENIED: "Access blocked",
};
