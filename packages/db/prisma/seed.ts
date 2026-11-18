// Synthetic seed data — STUDY_CONTEXT §12 only. No real people, parcels or documents.
// Coordinates are approximate, synthetic (reused from the demo mock data).
// Password comes from SEED_USER_PASSWORD; it is never hard-coded or printed.
// Users start without MFA; each sets up TOTP at first sign-in (FR-02).
import { PrismaClient, Role, ParcelStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const USERS: { email: string; name: string; role: Role; locked?: boolean }[] = [
  { email: "juan.ramos@xcement.example", name: "Atty. Juan Ramos", role: Role.LEGAL },
  { email: "rico.lim@xcement.example", name: "Rico Lim", role: Role.LEGAL },
  { email: "maria.santos@xcement.example", name: "Maria Santos", role: Role.MANAGEMENT },
  {
    email: "paolo.reyes@xcement.example",
    name: "Paolo Reyes",
    role: Role.MANAGEMENT,
    locked: true,
  },
  { email: "lito.cruz@xcement.example", name: "Lito Cruz", role: Role.TENANT },
  { email: "ana.dizon@xcement.example", name: "Ana Dizon", role: Role.IT_ADMIN },
];

const PARCELS: {
  name: string;
  province: string;
  titleNo?: string;
  taxDecNo?: string;
  areaHa: string;
  lat: number; // approximate, synthetic
  lng: number; // approximate, synthetic
  status: ParcelStatus;
}[] = [
  {
    name: "Iligan Plant Site Lot 7",
    province: "Lanao del Norte",
    titleNo: "TCT T-112-2016-0457",
    areaHa: "6.80",
    lat: 8.23,
    lng: 124.24,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Teresa Plant Buffer Lot 3",
    province: "Rizal",
    titleNo: "TCT T-077-2019-0221",
    areaHa: "2.15",
    lat: 14.56,
    lng: 121.21,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Norzagaray Quarry Parcel A",
    province: "Bulacan",
    titleNo: "TCT T-041-2018-0012",
    taxDecNo: "TD 03-0412-00921",
    areaHa: "4.25",
    lat: 14.91,
    lng: 121.04,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Bacnotan Plant Access Road",
    province: "La Union",
    titleNo: "TCT T-019-2017-0094",
    areaHa: "0.90",
    lat: 16.72,
    lng: 120.35,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Antipolo Buffer Zone Lot 2",
    province: "Rizal",
    titleNo: "TCT T-077-2020-0310",
    areaHa: "1.40",
    lat: 14.59,
    lng: 121.18,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Bulacan Depot Lot 5",
    province: "Bulacan",
    titleNo: "TCT T-041-2021-0188",
    areaHa: "0.75",
    lat: 14.81,
    lng: 121.05,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Danao Warehouse Lot",
    province: "Cebu",
    taxDecNo: "TD 08-0412-00317",
    areaHa: "1.10",
    lat: 10.52,
    lng: 124.03,
    status: ParcelStatus.APPROVED,
  },
  {
    name: "Davao Terminal Lot",
    province: "Davao del Sur",
    titleNo: "TCT T-203-2026-0019",
    areaHa: "3.30",
    lat: 7.19,
    lng: 125.45,
    status: ParcelStatus.PENDING,
  },
];

// §12: Tenant Lito Cruz has view access to Bulacan Depot Lot 5.
const TENANT_ASSIGNMENTS: [string, string][] = [
  ["lito.cruz@xcement.example", "Bulacan Depot Lot 5"],
];

async function main() {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 15) {
    throw new Error("Set SEED_USER_PASSWORD (at least 15 characters) before seeding.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 5 failed attempts -> 15-minute lock

  const users = new Map<string, string>();
  for (const u of USERS) {
    const data = {
      name: u.name,
      role: u.role,
      passwordHash,
      failedAttempts: u.locked ? 5 : 0,
      lockedUntil: u.locked ? lockedUntil : null,
    };
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: data,
      create: { email: u.email, ...data },
    });
    users.set(u.email, row.id);
  }

  const createdById = users.get("juan.ramos@xcement.example")!;
  const parcels = new Map<string, string>();
  for (const p of PARCELS) {
    const existing = await prisma.parcel.findFirst({ where: { name: p.name } });
    const data = {
      name: p.name,
      province: p.province,
      titleNo: p.titleNo ?? null,
      taxDecNo: p.taxDecNo ?? null,
      areaHa: p.areaHa,
      status: p.status,
      createdById,
    };
    const row = existing
      ? await prisma.parcel.update({ where: { id: existing.id }, data })
      : await prisma.parcel.create({ data });
    await prisma.$executeRaw`
      UPDATE parcels SET location = ST_SetSRID(ST_MakePoint(${p.lng}::float8, ${p.lat}::float8), 4326)
      WHERE id = ${row.id}::uuid`;
    parcels.set(p.name, row.id);
  }

  for (const [email, parcelName] of TENANT_ASSIGNMENTS) {
    const userId = users.get(email)!;
    const parcelId = parcels.get(parcelName)!;
    await prisma.tenantAssignment.upsert({
      where: { userId_parcelId: { userId, parcelId } },
      update: {},
      create: { userId, parcelId },
    });
  }

  console.log(
    `Seeded ${users.size} users, ${parcels.size} parcels, ${TENANT_ASSIGNMENTS.length} tenant assignment.`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
