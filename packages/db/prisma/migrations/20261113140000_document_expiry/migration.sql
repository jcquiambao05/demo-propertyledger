-- FR-14 / FR-15: time-bound documents (tax clearance, certification, permit) carry an
-- expiry date (DECISIONS D10).
ALTER TABLE "documents" ADD COLUMN "expires_on" DATE;
