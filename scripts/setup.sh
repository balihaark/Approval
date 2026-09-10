#!/usr/bin/env bash
# One-time project setup (macOS / Linux). Run from repo root:
#   npm run setup
# or:
#   bash scripts/setup.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { echo ""; echo "==> $1"; }

echo ""
echo "BlauPlug Approvals — one-time setup"
echo "===================================="

step "Checking Node.js (need v20+)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install from https://nodejs.org (LTS 20+)."
  exit 1
fi
NODE_MAJOR="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Need Node v20+; found $(node -v)"
  exit 1
fi
echo "  OK $(node -v)"

step "Creating env files (skipped if they already exist)"
copy_if_missing() {
  if [ ! -f "$2" ]; then
    cp "$1" "$2"
    echo "  Created $2"
  else
    echo "  Keep existing $2"
  fi
}
copy_if_missing ".env.example" ".env"
copy_if_missing ".env.example" "backend/.env"
copy_if_missing "frontend/.env.local.example" "frontend/.env.local"

step "Installing dependencies (npm install)"
if ! npm install; then
  echo "  Retrying without postinstall scripts..."
  npm install --ignore-scripts
fi

step "Using local PostgreSQL (DATABASE_URL in .env)"
echo "  Expected default: postgresql://approvals:approvals@localhost:5432/approvals"
echo "  If migrate fails, create the DB first (see SETUP.md Step 2)."

step "Applying database migrations and bootstrap admin"
(
  cd backend
  npx prisma generate || {
    echo "prisma generate failed — stop any running dev servers (npm run dev), then run npm run setup again"
    exit 1
  }
  npx prisma migrate deploy
  npx prisma db seed
)

echo ""
echo "Setup complete."
echo ""
echo "Next: start the app"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000 and click 'Sign in with Login-Auth' — SSO-only."
echo "  Ensure central_db + Login-Auth are running and APPROVALS_API_KEY / LOGIN_AUTH_JWT_SECRET are set in backend/.env."
echo "  First user gets USER; promote yourself to ADMIN via:"
echo "    psql -d approvals -c \"UPDATE \\\"Employee\\\" SET role='ADMIN' WHERE email='you@blauplug.com';\""
echo ""
echo "Gmail is optional — see docs/ENV_SETUP.md to create your own Google OAuth, tokens, and Pub/Sub."
