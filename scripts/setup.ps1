# One-time project setup (Windows). Run from repo root:
#   npm run setup
# or:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "BlauPlug Approvals — one-time setup" -ForegroundColor White
Write-Host "====================================" -ForegroundColor DarkGray

# Node.js
Write-Step "Checking Node.js (need v20+)"
$nodeVersion = node -v 2>$null
if (-not $nodeVersion) {
  throw "Node.js not found. Install from https://nodejs.org (LTS 20+)."
}
$major = [int]($nodeVersion -replace '^v(\d+)\..*', '$1')
if ($major -lt 20) {
  throw "Node $nodeVersion found; need v20 or newer."
}
Write-Host "  OK $nodeVersion"

# Env files
Write-Step "Creating env files (skipped if they already exist)"
$envPairs = @(
  @{ Src = ".env.example"; Dst = ".env" },
  @{ Src = ".env.example"; Dst = "backend\.env" },
  @{ Src = "frontend\.env.local.example"; Dst = "frontend\.env.local" }
)
foreach ($pair in $envPairs) {
  if (-not (Test-Path $pair.Dst)) {
    Copy-Item $pair.Src $pair.Dst
    Write-Host "  Created $($pair.Dst)"
  } else {
    Write-Host "  Keep existing $($pair.Dst)"
  }
}

# Install
Write-Step "Installing dependencies (npm install)"
npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Retrying without postinstall scripts..." -ForegroundColor Yellow
  npm install --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

# Database — local PostgreSQL (no Docker required)
Write-Step "Using local PostgreSQL (DATABASE_URL in .env)"
Write-Host "  Expected default: postgresql://approvals:approvals@localhost:5432/approvals"
Write-Host "  If migrate fails, create the DB first:" -ForegroundColor DarkGray
Write-Host '    .\scripts\setup-postgres.ps1 -PostgresPassword "YOUR_POSTGRES_SUPERUSER_PASSWORD"' -ForegroundColor Yellow

# Migrations + seed
Write-Step "Applying database migrations and bootstrap admin"
Push-Location backend
npx prisma generate
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  throw "prisma generate failed — stop any running dev servers (npm run dev), then run npm run setup again"
}
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "prisma migrate deploy failed" }
npx prisma db seed
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "prisma db seed failed" }
Pop-Location

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next: start the app" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then open http://localhost:3000 and click 'Sign in with Login-Auth' — SSO-only." -ForegroundColor White
Write-Host "  Ensure central_db + Login-Auth are running and APPROVALS_API_KEY / LOGIN_AUTH_JWT_SECRET are set in backend/.env." -ForegroundColor DarkGray
Write-Host "  First user gets USER; promote yourself to ADMIN via:" -ForegroundColor DarkGray
Write-Host "    psql -d approvals -c \"UPDATE `"Employee`" SET role='ADMIN' WHERE email='you@blauplug.com';\"" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Gmail is optional — see docs/ENV_SETUP.md to create your own Google OAuth, tokens, and Pub/Sub." -ForegroundColor DarkGray
