-- Approvals ↔ central_db cutover, 2026-09-09.
--
-- Approvals is now SSO-only. Local password login, lockout, and change-password
-- machinery are gone. Every Employee row is now a projection of central's
-- BIGINT emp_id; the local `role` column (USER/ADMIN) is the only field that
-- is NOT sourced from central and is set by a dev via SQL (see
-- decision_approvals_admin_manual). See also:
--   - decision_approvals_no_role      (no approvals_role in central)
--   - decision_approvals_sso_only      (no local password path)
--   - decision_approvals_admin_manual  (ADMIN via SQL, not central)
--
-- DESTRUCTIVE: the local Employee.employeeId column is retyped from INT to
-- BIGINT. Existing rows are TRUNCATEd because pre-cutover employeeIds were
-- local integers (1000-based, unrelated to central's BIGINT emp_ids). Every
-- user re-projects on their next SSO login. Historical Approval / Party /
-- Decision / ActivityLog rows reference employees only by email, so they
-- survive intact.

BEGIN;

TRUNCATE TABLE "Employee" RESTART IDENTITY CASCADE;

ALTER TABLE "Employee"
  DROP COLUMN IF EXISTS "passwordHash",
  DROP COLUMN IF EXISTS "failedLoginAttempts",
  DROP COLUMN IF EXISTS "lockedUntil",
  DROP COLUMN IF EXISTS "mustChangePassword";

ALTER TABLE "Employee"
  ALTER COLUMN "employeeId" TYPE BIGINT USING "employeeId"::BIGINT;

COMMIT;
