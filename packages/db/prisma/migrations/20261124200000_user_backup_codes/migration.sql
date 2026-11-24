-- Add one-time backup codes hash column for multi-path local password recovery
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "backup_codes_hash" TEXT;
