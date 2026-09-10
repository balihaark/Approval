# =============================================================================
# approvals — DB operator commands.
#
# Run from `approvals/` (parent of this scripts/ dir):
#     powershell -File scripts/db-ops.ps1                   # menu
#     powershell -File scripts/db-ops.ps1 <command>         # direct
#
# Or copy individual blocks into your shell — none of these are chained.
# =============================================================================

$ErrorActionPreference = "Stop"

# -----------------------------------------------------------------------------
# 1. Bring up JUST postgres (backend can stay off while you seed / inspect).
# -----------------------------------------------------------------------------
function Start-Postgres {
    docker compose up -d postgres
    Write-Host "waiting for postgres to accept connections..."
    do {
        Start-Sleep -Seconds 2
        $ok = docker compose exec -T postgres pg_isready -U approvals -d approvals 2>$null
    } while (-not $ok -or $LASTEXITCODE -ne 0)
    Write-Host "postgres is up on localhost:5432"
}

# -----------------------------------------------------------------------------
# 2. Apply Prisma migrations (idempotent). Runs `prisma migrate deploy`.
#    The cutover migration TRUNCATEs Employee — expected, everyone re-projects
#    on next SSO login (see approvals/CLAUDE.md gotcha 4).
# -----------------------------------------------------------------------------
function Invoke-Migrate {
    Push-Location backend
    try {
        npx prisma migrate deploy
    } finally {
        Pop-Location
    }
}

# -----------------------------------------------------------------------------
# 3. Interactive psql shell inside the container.
# -----------------------------------------------------------------------------
function Open-Psql {
    docker compose exec -it postgres psql -U approvals -d approvals
}

# -----------------------------------------------------------------------------
# 4. See who has signed in (Employee is populated on first SSO login).
# -----------------------------------------------------------------------------
function Show-Employees {
    docker compose exec -T postgres psql -U approvals -d approvals -c @'
SELECT
  "employeeId",
  email,
  "firstName",
  "lastName",
  role,
  "isActive",
  "tokenVersion",
  "lastLoginAt"
FROM "Employee"
ORDER BY "lastLoginAt" DESC NULLS LAST;
'@
}

# -----------------------------------------------------------------------------
# 5. Promote a signed-in user to ADMIN. role is local + manual — SSO never
#    sets it (decision_approvals_admin_manual).
# -----------------------------------------------------------------------------
function Set-Admin([string]$email) {
    if (-not $email) { throw "Usage: Set-Admin <email>" }
    docker compose exec -T postgres psql -U approvals -d approvals `
        -c "UPDATE `"Employee`" SET role='ADMIN' WHERE email='$email' RETURNING `"employeeId`", email, role;"
}

# -----------------------------------------------------------------------------
# 6. Revoke all active sessions for a user (bumps tokenVersion — every issued
#    cookie fails the tv check on next request). Local logout, effectively.
# -----------------------------------------------------------------------------
function Revoke-Sessions([string]$email) {
    if (-not $email) { throw "Usage: Revoke-Sessions <email>" }
    docker compose exec -T postgres psql -U approvals -d approvals `
        -c "UPDATE `"Employee`" SET `"tokenVersion`" = `"tokenVersion`" + 1 WHERE email='$email';"
}

# -----------------------------------------------------------------------------
# 7. Quick sanity: what does central say about this user? Confirms the SSO
#    login path will find them. Requires APPROVALS_API_KEY in the shell.
# -----------------------------------------------------------------------------
function Test-CentralLookup([string]$email) {
    if (-not $email) { throw "Usage: Test-CentralLookup <email>" }
    if (-not $env:APPROVALS_API_KEY) { throw "APPROVALS_API_KEY not set in shell" }
    $centralUrl = if ($env:CENTRAL_DB_URL) { $env:CENTRAL_DB_URL } else { "http://127.0.0.1:8000" }
    Invoke-RestMethod `
        -Uri "$centralUrl/api/employees/by-email?email=$email" `
        -Headers @{ "x-api-key" = $env:APPROVALS_API_KEY }
}

# -----------------------------------------------------------------------------
# 8. Row counts for a glance at scale.
# -----------------------------------------------------------------------------
function Show-Counts {
    docker compose exec -T postgres psql -U approvals -d approvals -c @'
SELECT 'Employee' AS table, COUNT(*) FROM "Employee"
UNION ALL SELECT 'Approval',       COUNT(*) FROM "Approval"
UNION ALL SELECT 'Party',          COUNT(*) FROM "Party"
UNION ALL SELECT 'Decision',       COUNT(*) FROM "Decision"
UNION ALL SELECT 'ActivityLog',    COUNT(*) FROM "ActivityLog"
UNION ALL SELECT 'UnprocessedMail',COUNT(*) FROM "UnprocessedMail";
'@
}

# -----------------------------------------------------------------------------
# 9. Nuke everything and start clean. ⚠️ Deletes the pgdata volume.
# -----------------------------------------------------------------------------
function Reset-Database {
    Write-Warning "This DROPS the approvals_pgdata volume. Ctrl+C to abort."
    Start-Sleep -Seconds 5
    docker compose down -v
    docker compose up -d postgres
    Start-Sleep -Seconds 5
    Invoke-Migrate
}

# -----------------------------------------------------------------------------
# 10. Dump / restore.
# -----------------------------------------------------------------------------
function Backup-Database([string]$outPath = "approvals-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql") {
    docker compose exec -T postgres pg_dump -U approvals -d approvals > $outPath
    Write-Host "wrote $outPath"
}
function Restore-Database([string]$inPath) {
    if (-not (Test-Path $inPath)) { throw "no such file: $inPath" }
    Get-Content $inPath | docker compose exec -T postgres psql -U approvals -d approvals
}

# -----------------------------------------------------------------------------
# Dispatch: `scripts/db-ops.ps1 start` etc.
# -----------------------------------------------------------------------------
if ($args.Count -gt 0) {
    switch ($args[0]) {
        "start"    { Start-Postgres }
        "migrate"  { Invoke-Migrate }
        "psql"     { Open-Psql }
        "who"      { Show-Employees }
        "admin"    { Set-Admin $args[1] }
        "revoke"   { Revoke-Sessions $args[1] }
        "central"  { Test-CentralLookup $args[1] }
        "counts"   { Show-Counts }
        "reset"    { Reset-Database }
        "dump"     { Backup-Database $args[1] }
        "restore"  { Restore-Database $args[1] }
        default {
            Write-Host "unknown command: $($args[0])"
            Write-Host "commands: start | migrate | psql | who | admin <email> | revoke <email> | central <email> | counts | reset | dump [path] | restore <path>"
        }
    }
}
