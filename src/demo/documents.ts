// Synthetic documents and custody records. Hashes are fake.
import { properties } from "./mock-data";

export type DocStatus = "verified" | "failed";

export type Doc = {
  id: string;
  propertyId: string;
  name: string;
  type: string;
  version: number;
  status: DocStatus;
  custody: { holder: string; note?: string; reason?: string; reference?: string; dueBack?: string };
};

export const hashes = {
  surveyStored: "a41d7f08c3e92b56d0f1847ea3c95b2760d8e1f493ab5c70e2d9168f4b03a7c9",
  surveyComputed: "a41d7f08c3e92b56d0f1847ea3c95b2760d8e1f493ab5c70e2d9168f4b03a7d4",
};

export const FAILED_PROPERTY = "norzagaray";

const norzagaray: Doc[] = [
  {
    id: "survey-plan",
    propertyId: "norzagaray",
    name: "Survey Plan",
    type: "Survey plan",
    version: 1,
    status: "failed",
    custody: { holder: "Company vault" },
  },
  {
    id: "tax-clearance",
    propertyId: "norzagaray",
    name: "Tax Clearance",
    type: "Tax clearance",
    version: 1,
    status: "verified",
    custody: { holder: "Company vault", note: "Expires Dec 1, 2026" },
  },
  {
    id: "norzagaray-title",
    propertyId: "norzagaray",
    name: "Owner's Duplicate Certificate of Title T-041-2018-0012",
    type: "Owner's duplicate title",
    version: 1,
    status: "verified",
    custody: {
      holder: "BDO, Makati Branch",
      reason: "Loan collateral",
      reference: "Loan Acct. 0012-XXXXX",
      dueBack: "Mar 15, 2027",
    },
  },
];

/** Other parcels get one verified record built from their title reference. */
export const docsFor = (propertyId: string): Doc[] => {
  if (propertyId === "norzagaray") return norzagaray;
  const p = properties.find((x) => x.id === propertyId);
  if (!p) return [];
  const isTd = p.titleRef.startsWith("TD");
  return [
    {
      id: `${p.id}-title`,
      propertyId: p.id,
      name: isTd ? `Tax Declaration ${p.titleRef.replace("TD ", "")}` : `Transfer Certificate of Title ${p.titleRef.replace("TCT ", "")}`,
      type: isTd ? "Tax declaration" : "Title",
      version: 1,
      status: "verified",
      custody: { holder: "Company vault" },
    },
  ];
};

export const findDoc = (id: string) => norzagaray.find((d) => d.id === id);
