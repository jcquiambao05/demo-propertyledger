// FR-05 base: parcel points stored as PostGIS geometry(Point, 4326).
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db.js";
import { setParcelLocation, getParcelLocation } from "./geo.js";

afterAll(() => prisma.$disconnect());

describe("parcel location", () => {
  it("writes and reads a Point 4326 through parameterized SQL", async () => {
    const p = await prisma.parcel.create({
      data: {
        name: "Geo test parcel",
        province: "Bulacan",
        areaHa: "1.0000",
        createdById: "00000000-0000-0000-0000-000000000000",
      },
    });
    await setParcelLocation(prisma, p.id, { lat: 14.91, lng: 121.04 });
    expect(await getParcelLocation(prisma, p.id)).toEqual({ lat: 14.91, lng: 121.04 });
    await prisma.parcel.delete({ where: { id: p.id } });
  });

  it("rejects coordinates outside valid ranges", async () => {
    await expect(
      setParcelLocation(prisma, "00000000-0000-0000-0000-000000000000", { lat: 91, lng: 0 }),
    ).rejects.toThrow(/coordinates/);
  });
});
