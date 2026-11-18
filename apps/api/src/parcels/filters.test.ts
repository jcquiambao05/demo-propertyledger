// FR-06 spatial filtering — DECISIONS D14: region, province and municipality from the parcel's
// stored fields; distance from a reference parcel (e.g. a plant site) within a radius in km,
// PostGIS ST_DWithin on geography, parameterized queries only. No polygons, no geocoding.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { closeRedis } from "../redis.js";
import { makeUser, cookieFor } from "../test/helpers.js";

const app = createApp();
const c: Record<string, string> = {};
const ids: Record<string, string> = {};
const p: Record<string, string> = {};
const tag = `F${Date.now()}`;

async function parcel(key: string, body: object) {
  const res = await request(app)
    .post("/parcels")
    .set("Cookie", c.LEGAL)
    .send({ name: `${tag} ${key}`, titleNo: `TCT ${key}`, areaHa: 1, ...body });
  expect(res.status).toBe(201);
  await request(app).post(`/parcels/${res.body.id}/approve`).set("Cookie", c.MANAGEMENT);
  p[key] = res.body.id;
}

const map = async (query: string, role = "LEGAL") =>
  request(app).get(`/parcels/map?${query}`).set("Cookie", c[role]);
const names = (body: { name: string }[]) =>
  body
    .map((m) => m.name.replace(`${tag} `, ""))
    .filter((n) => !n.includes(" "))
    .sort();

beforeAll(async () => {
  for (const role of ["LEGAL", "MANAGEMENT", "TENANT", "IT_ADMIN"] as const) {
    const u = await makeUser(role);
    ids[role] = u.id;
    c[role] = await cookieFor(u);
  }
  // Synthetic points: Norzagaray plant, a lot ~5 km away, Teresa (~40 km), Iligan (~800 km).
  await parcel("Plant", {
    region: `R3-${tag}`,
    province: `Bulacan-${tag}`,
    municipality: "Norzagaray",
    lat: 14.91,
    lng: 121.05,
  });
  await parcel("Near", {
    region: `R3-${tag}`,
    province: `Bulacan-${tag}`,
    municipality: "Santa Maria",
    lat: 14.87,
    lng: 121.03,
  });
  await parcel("Teresa", {
    region: `R4A-${tag}`,
    province: `Rizal-${tag}`,
    municipality: "Teresa",
    lat: 14.56,
    lng: 121.21,
  });
  await parcel("Iligan", {
    region: `R10-${tag}`,
    province: `Lanao-${tag}`,
    municipality: "Iligan City",
    lat: 8.23,
    lng: 124.24,
  });
});

afterAll(async () => {
  await closeRedis();
  await prisma.$disconnect();
});

describe("FR-06 administrative filters (D14)", () => {
  it("filters by region, province and municipality", async () => {
    expect(names((await map(`region=R3-${tag}`)).body)).toEqual(["Near", "Plant"]);
    expect(names((await map(`province=Rizal-${tag}`)).body)).toEqual(["Teresa"]);
    expect(names((await map(`province=Bulacan-${tag}&municipality=Santa%20Maria`)).body)).toEqual([
      "Near",
    ]);
  });

  it("lists the stored values to choose from", async () => {
    const res = await request(app).get("/parcels/filters").set("Cookie", c.LEGAL);
    expect(res.status).toBe(200);
    expect(res.body.regions).toContain(`R3-${tag}`);
    expect(res.body.provinces).toContain(`Lanao-${tag}`);
    expect(res.body.municipalities).toContain("Iligan City");
  });
});

describe("FR-06 distance from a reference parcel (D14)", () => {
  it("returns parcels within the radius of the reference parcel", async () => {
    expect(
      names((await map(`near=${p.Plant}&radiusKm=10`)).body).filter((n) => n !== "Plant"),
    ).toEqual(["Near"]);
    const wide = names((await map(`near=${p.Plant}&radiusKm=60`)).body);
    expect(wide).toEqual(expect.arrayContaining(["Near", "Teresa"]));
    expect(wide).not.toContain("Iligan");
  });

  it("combines distance with an administrative filter", async () => {
    expect(names((await map(`near=${p.Plant}&radiusKm=60&province=Rizal-${tag}`)).body)).toEqual([
      "Teresa",
    ]);
  });

  it("refuses a bad radius or reference", async () => {
    expect((await map(`near=${p.Plant}&radiusKm=0`)).status).toBe(400);
    expect((await map(`near=${p.Plant}&radiusKm=abc`)).status).toBe(400);
    expect((await map(`near=${p.Plant}&radiusKm=5000`)).status).toBe(400);
    expect((await map("near=not-a-uuid&radiusKm=5")).status).toBe(400);
  });

  it("a Tenant cannot use a parcel they are not assigned to as the reference", async () => {
    await prisma.tenantAssignment.create({ data: { userId: ids.TENANT, parcelId: p.Near } });
    expect((await map(`near=${p.Plant}&radiusKm=10`, "TENANT")).status).toBe(404);
    const own = await map(`near=${p.Near}&radiusKm=10`, "TENANT");
    expect(own.status).toBe(200);
    expect(names(own.body)).toEqual(["Near"]);
  });
});
