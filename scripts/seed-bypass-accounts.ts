// scripts/seed-bypass-accounts.ts
// Creates/resets bypass accounts for each of the 4 roles:
// IT_ADMIN, LEGAL, MANAGEMENT, TENANT
// Password for all: "password"
// Also backfills Region, Municipality, and Classification on seeded parcels so spatial filtering works out of the box.

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ACCOUNTS = [
  {
    email: "admin",
    name: "Admin Bypass",
    role: Role.IT_ADMIN,
  },
  {
    email: "legaldept",
    name: "Legal Dept Bypass",
    role: Role.LEGAL,
  },
  {
    email: "management",
    name: "Management Bypass",
    role: Role.MANAGEMENT,
  },
  {
    email: "tenant",
    name: "Tenant Bypass",
    role: Role.TENANT,
  },
];

const PARCEL_ENRICHMENT: Record<
  string,
  { region: string; municipality: string; classification: string }
> = {
  "Iligan Plant Site Lot 7": {
    region: "Region X (Northern Mindanao)",
    municipality: "Iligan City",
    classification: "TITLED",
  },
  "Teresa Plant Buffer Lot 3": {
    region: "Region IV-A (CALABARZON)",
    municipality: "Teresa",
    classification: "TITLED",
  },
  "Norzagaray Quarry Parcel A": {
    region: "Region III (Central Luzon)",
    municipality: "Norzagaray",
    classification: "TITLED",
  },
  "Bacnotan Plant Access Road": {
    region: "Region I (Ilocos Region)",
    municipality: "Bacnotan",
    classification: "TITLED",
  },
  "Antipolo Buffer Zone Lot 2": {
    region: "Region IV-A (CALABARZON)",
    municipality: "Antipolo City",
    classification: "TITLED",
  },
  "Bulacan Depot Lot 5": {
    region: "Region III (Central Luzon)",
    municipality: "San Ildefonso",
    classification: "TITLED",
  },
  "Danao Warehouse Lot": {
    region: "Region VII (Central Visayas)",
    municipality: "Danao City",
    classification: "UNTITLED",
  },
  "Davao Terminal Lot": {
    region: "Region XI (Davao Region)",
    municipality: "Davao City",
    classification: "TITLED",
  },
};

async function main() {
  const passwordHash = await bcrypt.hash("password", 10);

  console.log("Seeding bypass accounts (password: 'password')...");

  let tenantUserId: string | null = null;
  let legalUserId: string | null = null;
  for (const acc of ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      update: {
        name: acc.name,
        role: acc.role,
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        isActive: true,
      },
      create: {
        email: acc.email,
        name: acc.name,
        role: acc.role,
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        isActive: true,
      },
    });
    if (acc.role === Role.TENANT) tenantUserId = user.id;
    if (acc.role === Role.LEGAL) legalUserId = user.id;
    console.log(`✓ ${acc.role.padEnd(11)} -> username/email: "${acc.email}" (id: ${user.id})`);
  }

  console.log("Enriching parcel region, municipality, and classification metadata...");
  for (const [name, data] of Object.entries(PARCEL_ENRICHMENT)) {
    await prisma.parcel.updateMany({
      where: { name },
      data,
    });
  }

  if (legalUserId) {
    const rptSamples: {
      parcelName: string;
      year: number;
      quarter: number;
      amount: string;
      dueDate: string;
    }[] = [
      {
        parcelName: "Norzagaray Quarry Parcel A",
        year: 2026,
        quarter: 4,
        amount: "184500.00",
        dueDate: "2026-12-31",
      },
      {
        parcelName: "Iligan Plant Site Lot 7",
        year: 2026,
        quarter: 4,
        amount: "312000.00",
        dueDate: "2026-12-31",
      },
      {
        parcelName: "Teresa Plant Buffer Lot 3",
        year: 2026,
        quarter: 4,
        amount: "96400.00",
        dueDate: "2026-12-10",
      },
      {
        parcelName: "Danao Warehouse Lot",
        year: 2026,
        quarter: 3,
        amount: "64250.00",
        dueDate: "2026-09-30",
      },
    ];

    for (const s of rptSamples) {
      const parcel = await prisma.parcel.findFirst({ where: { name: s.parcelName } });
      if (!parcel) continue;
      await prisma.rptSchedule.upsert({
        where: {
          parcelId_year_quarter: {
            parcelId: parcel.id,
            year: s.year,
            quarter: s.quarter,
          },
        },
        update: {},
        create: {
          parcelId: parcel.id,
          year: s.year,
          quarter: s.quarter,
          amount: s.amount,
          dueDate: new Date(`${s.dueDate}T00:00:00.000Z`),
          createdById: legalUserId,
        },
      });
    }
  }

  if (tenantUserId) {
    const depot = await prisma.parcel.findFirst({ where: { name: "Bulacan Depot Lot 5" } });
    if (depot) {
      await prisma.tenantAssignment.upsert({
        where: { userId_parcelId: { userId: tenantUserId, parcelId: depot.id } },
        update: {},
        create: { userId: tenantUserId, parcelId: depot.id },
      });
    }
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Failed to seed bypass accounts:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
