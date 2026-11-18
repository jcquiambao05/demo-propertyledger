export type ParcelStatus = "PENDING" | "APPROVED" | "RETURNED";

export interface Parcel {
  id: string;
  name: string;
  province: string;
  region: string | null;
  municipality: string | null;
  titleNo: string | null;
  taxDecNo: string | null;
  classification: string | null;
  areaHa: number;
  status: ParcelStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  location: { lat: number; lng: number } | null;
}

export interface DocumentSummary {
  id: string;
  fileName: string;
  docType: string | null;
  sizeBytes: number;
  integrityStatus: "VERIFIED" | "FAILED";
  status: string;
  version: number;
  createdAt: string;
}

export interface ParcelDetail extends Parcel {
  documents: DocumentSummary[];
}

export interface HistoryEntry {
  id: string;
  action: string;
  actor: string;
  /** Plain sentence (D9), e.g. "Rico Lim uploaded Survey Plan". */
  text: string;
  createdAt: string;
}

/** FR-09 Custody tab row (D9). */
export interface ParcelCustodyRow {
  documentId: string;
  label: string;
  status: string;
  action: string | null;
  holderType: string | null;
  holderName: string | null;
  expectedReturnDate: string | null;
  processingStage: string | null;
  updatedAt: string | null;
}
