-- FR-15 RPT schedules (DECISIONS D11; STUDY_CONTEXT §6 module 8: quarterly due dates).
CREATE TYPE "RptStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

CREATE TABLE "rpt_schedules" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "RptStatus" NOT NULL DEFAULT 'UNPAID',
    "or_number" TEXT,
    "paid_date" DATE,
    "receipt_document_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rpt_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rpt_schedules_quarter_check" CHECK ("quarter" BETWEEN 1 AND 4),
    CONSTRAINT "rpt_schedules_amount_check" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "rpt_schedules_parcel_id_year_quarter_key" ON "rpt_schedules"("parcel_id", "year", "quarter");
CREATE INDEX "rpt_schedules_due_date_idx" ON "rpt_schedules"("due_date");

ALTER TABLE "rpt_schedules" ADD CONSTRAINT "rpt_schedules_parcel_id_fkey"
  FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rpt_schedules" ADD CONSTRAINT "rpt_schedules_receipt_document_id_fkey"
  FOREIGN KEY ("receipt_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
