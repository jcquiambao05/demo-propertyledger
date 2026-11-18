-- FR-06 spatial filtering (DECISIONS D14): filters use the parcel's stored region, province and
-- municipality. Region is entered at registration (no fixed list in the paper).
ALTER TABLE "parcels" ADD COLUMN "region" TEXT;
CREATE INDEX "parcels_location_geog_idx" ON "parcels" USING GIST (("location"::geography));
