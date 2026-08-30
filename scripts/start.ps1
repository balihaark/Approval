# Start backend + frontend (Windows). Usually invoked via: npm run dev

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host ""
Write-Host "Starting BlauPlug Approvals..." -ForegroundColor Cyan
Write-Host "  App:  http://localhost:3000" -ForegroundColor White
Write-Host "  API:  http://localhost:3001/health" -ForegroundColor White
Write-Host "  Ctrl+C to stop both servers" -ForegroundColor DarkGray
Write-Host ""

npx concurrently -k -n backend,frontend -c blue,green `
  "npm run dev:backend" `
  "npm run dev:frontend"
