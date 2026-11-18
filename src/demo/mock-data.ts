// Synthetic data only (docs/STUDY_CONTEXT.md §12, docs/demo/DEMO_PAGES.md §0).
// Swap for API calls in real sprints. Wording follows STUDY_CONTEXT §3.

export type ProblemKind = "tax" | "dispute" | "documents";

export type Problem = { kind: ProblemKind; text: string; severity: "danger" | "warn" };

export type Property = {
  id: string;
  name: string;
  province: string;
  titleRef: string;
  area: string;
  lat: number;
  lng: number;
  waitingApproval?: boolean;
  problems: Problem[];
};

// Parcels, titles, areas and problems: docs/STUDY_CONTEXT.md section 12 only (incoming copy). Coordinates are approximate.
export const properties: Property[] = [
  {
    id: "iligan",
    name: "Iligan Plant Site Lot 7",
    province: "Lanao del Norte",
    titleRef: "TCT T-112-2016-0457",
    area: "6.80 ha",
    lat: 8.23,
    lng: 124.24,
    problems: [
      { kind: "tax", text: "RPT 2026 Q3 overdue ₱184,320", severity: "danger" },
      { kind: "dispute", text: "Boundary dispute", severity: "warn" },
      { kind: "documents", text: "Title annotation at the Registry of Deeds", severity: "warn" },
    ],
  },
  {
    id: "teresa",
    name: "Teresa Plant Buffer Lot 3",
    province: "Rizal",
    titleRef: "TCT T-077-2019-0221",
    area: "2.15 ha",
    lat: 14.56,
    lng: 121.21,
    problems: [
      { kind: "tax", text: "RPT 2026 Q3 overdue ₱62,500", severity: "danger" },
      { kind: "dispute", text: "Right-of-way claim", severity: "warn" },
    ],
  },
  {
    id: "norzagaray",
    name: "Norzagaray Quarry Parcel A",
    province: "Bulacan",
    titleRef: "TCT T-041-2018-0012 · TD 03-0412-00921",
    area: "4.25 ha",
    lat: 14.91,
    lng: 121.04,
    problems: [
      { kind: "documents", text: "Survey plan failed integrity check", severity: "danger" },
      { kind: "documents", text: "Tax clearance expires Dec 1, 2026", severity: "warn" },
      { kind: "tax", text: "RPT Q4 ₱12,225 due Dec 31", severity: "warn" },
    ],
  },
  {
    id: "bacnotan",
    name: "Bacnotan Plant Access Road",
    province: "La Union",
    titleRef: "TCT T-019-2017-0094",
    area: "0.90 ha",
    lat: 16.72,
    lng: 120.35,
    problems: [{ kind: "dispute", text: "Right-of-way dispute", severity: "warn" }],
  },
  {
    id: "antipolo",
    name: "Antipolo Buffer Zone Lot 2",
    province: "Rizal",
    titleRef: "TCT T-077-2020-0310",
    area: "1.40 ha",
    lat: 14.59,
    lng: 121.18,
    problems: [],
  },
  {
    id: "bulacan-depot",
    name: "Bulacan Depot Lot 5",
    province: "Bulacan",
    titleRef: "TCT T-041-2021-0188",
    area: "0.75 ha",
    lat: 14.81,
    lng: 121.05,
    problems: [],
  },
  {
    id: "danao",
    name: "Danao Warehouse Lot",
    province: "Cebu",
    titleRef: "TD 08-0412-00317",
    area: "1.10 ha",
    lat: 10.52,
    lng: 124.03,
    problems: [],
  },
  {
    id: "davao-terminal",
    name: "Davao Terminal Lot",
    province: "Davao del Sur",
    titleRef: "TCT T-203-2026-0019",
    area: "3.30 ha",
    lat: 7.19,
    lng: 125.45,
    waitingApproval: true,
    problems: [],
  },
];

/** Parcels the demo Tenant (Lito Cruz) may view. */
export const TENANT_ASSIGNED = ["bulacan-depot", "antipolo"];

export const needsAttention = (p: Property) => p.problems.length > 0;

export type DemoUser = {
  prefix: string;
  name: string;
  role: "legal" | "management" | "tenant" | "it";
};

export const users: DemoUser[] = [
  { prefix: "juan", name: "Atty. Juan Ramos", role: "legal" },
  { prefix: "maria", name: "Maria Santos", role: "management" },
  { prefix: "lito", name: "Lito Cruz", role: "tenant" },
  { prefix: "ana", name: "Ana Dizon", role: "it" },
];

/** Fake async delay (300-600 ms) for loading states. */
export const fakeDelay = () => new Promise<void>((r) => setTimeout(r, 300 + Math.random() * 300));
