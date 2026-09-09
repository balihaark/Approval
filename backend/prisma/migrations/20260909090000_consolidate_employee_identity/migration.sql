ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Employee" AS e
SET
  "passwordHash" = u."passwordHash",
  "tokenVersion" = u."tokenVersion",
  "failedLoginAttempts" = u."failedLoginAttempts",
  "lockedUntil" = u."lockedUntil",
  "mustChangePassword" = u."mustChangePassword",
  "lastLoginAt" = COALESCE(e."lastLoginAt", u."lastLoginAt")
FROM "User" AS u
WHERE e."email" = u."email";

UPDATE "Employee"
SET "passwordHash" = '$2a$12$OSYJiv6wtvvYhD5pPNWmgub07WRfSeurENsgro30HP2r4a2fI5XhC',
    "mustChangePassword" = true
WHERE "passwordHash" IS NULL;

ALTER TABLE "Employee" ALTER COLUMN "passwordHash" SET NOT NULL;
DROP TABLE IF EXISTS "User";
