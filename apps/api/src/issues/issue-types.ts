// FR-16 interim issue types and priorities — docs/build/DECISIONS.md D12. Types come from the
// paper's Chapter I; kept in this one file so the Legal Department's list (STUDY_CONTEXT §14)
// can replace it. Also the list the AI triage chooses from (D15, step B2).
export const ISSUE_TYPES = [
  "Boundary dispute",
  "Title defect (annotation or correction at the Registry of Deeds)",
  "Tax delinquency",
  "Right-of-way conflict",
  "Tenancy or occupancy concern",
  "Other",
] as const;

// Design detail — the paper names priority but not its values (D12).
export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

export const STATUSES = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED"] as const;
