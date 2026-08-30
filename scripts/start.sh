#!/usr/bin/env bash
# Start backend + frontend (macOS / Linux). Usually invoked via: npm run dev

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "Starting BlauPlug Approvals..."
echo "  App:  http://localhost:3000"
echo "  API:  http://localhost:3001/health"
echo "  Ctrl+C to stop both servers"
echo ""

npx concurrently -k -n backend,frontend -c blue,green \
  "npm run dev:backend" \
  "npm run dev:frontend"
