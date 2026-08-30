param(
  [Parameter(Mandatory = $true)]
  [string]$AuthToken,

  [string]$Ngrok = "C:\Users\hp\approval\tools\ngrok.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Ngrok)) {
  throw "ngrok not found at $Ngrok"
}

& $Ngrok config add-authtoken $AuthToken
if ($LASTEXITCODE -ne 0) { throw "Failed to save authtoken" }

Write-Host ""
Write-Host "Authtoken saved." -ForegroundColor Green
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Open https://dashboard.ngrok.com/domains"
Write-Host "  2. Create / claim a Free Domain (e.g. something.ngrok-free.app)"
Write-Host "  3. Run:"
Write-Host '     .\scripts\start-ngrok.ps1 -Domain "something.ngrok-free.app"'
Write-Host "  4. Set Pub/Sub push once to:"
Write-Host "     https://something.ngrok-free.app/webhooks/gmail?token=<GMAIL_PUSH_TOKEN>"
