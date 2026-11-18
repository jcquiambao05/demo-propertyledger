-- FR-10 replace (version history) and soft delete (DECISIONS D2, D3); FR-13 lifecycle status (D4).

CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'UNDER_PROCESSING', 'WITH_THIRD_PARTY', 'EXPIRED', 'SUPERSEDED', 'MISSING', 'RECALLED');

ALTER TABLE "documents"
  ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "group_id" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by_id" UUID;

-- Every existing document is the first version of its own group.
UPDATE "documents" SET "group_id" = "id";
ALTER TABLE "documents" ALTER COLUMN "group_id" SET NOT NULL;

CREATE UNIQUE INDEX "documents_group_id_version_key" ON "documents"("group_id", "version");
CREATE INDEX "documents_parcel_id_idx" ON "documents"("parcel_id");

-- FR-19: optional event details (IDs and enum values only, never content or personal data).
-- Stored as canonical JSON text so the hash input is byte-stable; NULL for older entries,
-- whose hashes are unchanged.
ALTER TABLE "audit_logs" ADD COLUMN "details" TEXT;
