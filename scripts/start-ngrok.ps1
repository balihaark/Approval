param(
  [string]$AuthToken,
  [string]$Domain,
  [int]$Port = 3001,
  [string]$Ngrok = "C:\Users\hp\approval\tools\ngrok.exe",
  [string]$LocalEnv = "C:\Users\hp\approval\scripts\ngrok.local.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Ngrok)) {
  throw "ngrok not found at $Ngrok"
}

if (-not $Domain -and (Test-Path $LocalEnv)) {
  $line = Get-Content $LocalEnv | Where-Object { $_ -match '^NGROK_DOMAIN=' } | Select-Object -First 1
  if ($line) { $Domain = $line.Substring('NGROK_DOMAIN='.Length).Trim() }
}

if ($AuthToken) {
  Write-Host "Saving ngrok authtoken..." -ForegroundColor Cyan
  & $Ngrok config add-authtoken $AuthToken
  if ($LASTEXITCODE -ne 0) { throw "Failed to save authtoken" }
}

Write-Host "Starting ngrok -> http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Keep this window open. Backend must be running on port $Port."
Write-Host ""

if ($Domain) {
  Write-Host "Using static domain: https://$Domain"
  Write-Host "Pub/Sub push URL:"
  Write-Host "  https://$Domain/webhooks/gmail?token=<GMAIL_PUSH_TOKEN>"
  Write-Host ""
  & $Ngrok http $Port --domain=$Domain
} else {
  Write-Host "No -Domain passed. Using a random ngrok URL (changes each restart)."
  Write-Host "For a stable free domain: https://dashboard.ngrok.com/domains"
  & $Ngrok http $Port
}
