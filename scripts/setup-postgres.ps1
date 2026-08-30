param(
  [Parameter(Mandatory = $true)]
  [string]$PostgresPassword,

  [string]$PostgresUser = "postgres",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$AppUser = "approvals",
  [string]$AppPassword = "approvals",
  [string]$AppDatabase = "approvals"
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psql)) {
  throw "psql not found at $psql. Install PostgreSQL or update this path."
}

$env:PGPASSWORD = $PostgresPassword

Write-Host "Creating role and database if they do not exist..."

& $psql -U $PostgresUser -h $HostName -p $Port -d postgres -v ON_ERROR_STOP=1 -c @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$AppUser') THEN
    CREATE ROLE $AppUser LOGIN PASSWORD '$AppPassword';
  END IF;
END
`$`$;
"@

$dbExists = & $psql -U $PostgresUser -h $HostName -p $Port -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$AppDatabase'"
if ($dbExists -ne "1") {
  & $psql -U $PostgresUser -h $HostName -p $Port -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $AppDatabase OWNER $AppUser;"
}

& $psql -U $PostgresUser -h $HostName -p $Port -d $AppDatabase -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO $AppUser;"

Write-Host "Database '$AppDatabase' is ready for user '$AppUser'."
