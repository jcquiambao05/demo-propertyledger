-- Add user profile, avatar, security question, and theme/font personalization columns
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "position" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "avatar_path" TEXT,
  ADD COLUMN IF NOT EXISTS "security_question" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "security_answer_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "theme" VARCHAR(32) NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "font_size" VARCHAR(16) NOT NULL DEFAULT 'md';
