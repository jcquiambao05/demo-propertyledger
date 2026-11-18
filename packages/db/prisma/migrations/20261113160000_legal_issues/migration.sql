-- FR-16 legal issue tracking (DECISIONS D12; STUDY_CONTEXT §6 module 7).
CREATE TYPE "IssuePriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED');

CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" "IssuePriority" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "assignee_id" UUID NOT NULL,
    "description" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issues_parcel_id_idx" ON "issues"("parcel_id");
ALTER TABLE "issues" ADD CONSTRAINT "issues_parcel_id_fkey"
  FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every status change needs a note (module 7); the changes are append-only.
CREATE TABLE "issue_status_changes" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "from_status" "IssueStatus" NOT NULL,
    "to_status" "IssueStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_status_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issue_status_changes_issue_id_idx" ON "issue_status_changes"("issue_id");
ALTER TABLE "issue_status_changes" ADD CONSTRAINT "issue_status_changes_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION issue_status_changes_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'issue_status_changes is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issue_status_changes_no_update_delete
  BEFORE UPDATE OR DELETE ON "issue_status_changes"
  FOR EACH ROW EXECUTE FUNCTION issue_status_changes_append_only();
