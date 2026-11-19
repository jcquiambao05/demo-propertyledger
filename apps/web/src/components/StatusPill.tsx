import type { ParcelStatus } from "@/lib/types";

export function StatusPill({ status }: { status: ParcelStatus }) {
  if (status === "RETURNED") {
    return (
      <span className="pill-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning-dot" aria-hidden="true" />
        Returned with remarks
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="pill border-dashed border-[#D0D5DD]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#98A2B3]" aria-hidden="true" />
        Waiting for approval
      </span>
    );
  }
  return (
    <span className="pill-ok">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
      Approved
    </span>
  );
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
