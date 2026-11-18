-- FR-13 custody tracking of originals (DECISIONS D5–D7).

CREATE TYPE "CustodyAction" AS ENUM ('RELEASED', 'RETURNED', 'SENT_FOR_PROCESSING');
CREATE TYPE "HolderType" AS ENUM ('COMPANY_VAULT', 'BANK', 'GOVERNMENT_OFFICE');

CREATE TABLE "custody_records" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "action" "CustodyAction" NOT NULL,
    "holder_type" "HolderType" NOT NULL,
    "holder_name" TEXT NOT NULL,
    "reference_no" TEXT,
    "release_date" DATE,
    "expected_return_date" DATE,
    "processing_stage" VARCHAR(120),
    "note" TEXT,
    "status_after" "DocumentStatus" NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "custody_records_document_id_idx" ON "custody_records"("document_id");

ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D7: every update adds a row; no row is edited or deleted.
CREATE FUNCTION custody_records_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'custody_records is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custody_records_no_update_delete
  BEFORE UPDATE OR DELETE ON "custody_records"
  FOR EACH ROW EXECUTE FUNCTION custody_records_append_only();
