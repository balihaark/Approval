#!/usr/bin/env bash
# =============================================================================
# approvals — DB operator commands. EC2 / Linux edition.
#
# Run from `approvals/` (parent of this scripts/ dir):
#     ./scripts/db-ops.sh <command> [args]
#
# Assumes docker + docker-compose-plugin are installed on the EC2 host:
#     sudo yum install -y docker            # Amazon Linux 2023
#     sudo systemctl enable --now docker
#     sudo usermod -aG docker ec2-user      # log out/in after
#
# The compose file is approvals/docker-compose.yml. Postgres container name
# is `approvals-postgres`, service name is `postgres`.
# =============================================================================

set -euo pipefail

cmd="${1:-help}"
shift || true

_wait_pg() {
    echo "waiting for postgres to accept connections..."
    for _ in $(seq 1 30); do
        if docker compose exec -T postgres pg_isready -U approvals -d approvals >/dev/null 2>&1; then
            echo "postgres is up on localhost:5432"
            return 0
        fi
        sleep 2
    done
    echo "timed out waiting for postgres" >&2
    return 1
}

case "$cmd" in

    # -------------------------------------------------------------------------
    # 1. Bring up postgres only (backend can stay off while you seed / inspect).
    # -------------------------------------------------------------------------
    start)
        docker compose up -d postgres
        _wait_pg
        ;;

    # -------------------------------------------------------------------------
    # 2. Bring up the whole stack (postgres + backend).
    #    Backend's Dockerfile ENTRYPOINT runs `prisma migrate deploy` on start,
    #    so migrations apply automatically. Includes the cutover that TRUNCATES
    #    Employee (see approvals/CLAUDE.md gotcha 4 — everyone re-projects on
    #    their next SSO login).
    # -------------------------------------------------------------------------
    up)
        docker compose up -d --build
        _wait_pg
        docker compose logs --tail=50 backend
        ;;

    # -------------------------------------------------------------------------
    # 3. Explicit migrate — only needed if you're running Prisma outside the
    #    container (rare on EC2; usually the backend container handles it).
    # -------------------------------------------------------------------------
    migrate)
        docker compose exec -T backend npx prisma migrate deploy
        ;;

    # -------------------------------------------------------------------------
    # 4. Interactive psql shell inside the postgres container.
    # -------------------------------------------------------------------------
    psql)
        docker compose exec -it postgres psql -U approvals -d approvals
        ;;

    # -------------------------------------------------------------------------
    # 5. Who has signed in? Employee populates on first SSO login.
    # -------------------------------------------------------------------------
    who)
        docker compose exec -T postgres psql -U approvals -d approvals -c '
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
ORDER BY "lastLoginAt" DESC NULLS LAST;'
        ;;

    # -------------------------------------------------------------------------
    # 6. Promote a signed-in user to ADMIN. role is local + manual — SSO never
    #    sets it (see decision_approvals_admin_manual).
    # -------------------------------------------------------------------------
    admin)
        email="${1:-}"
        [[ -z "$email" ]] && { echo "usage: $0 admin <email>" >&2; exit 2; }
        docker compose exec -T postgres psql -U approvals -d approvals \
            -c "UPDATE \"Employee\" SET role='ADMIN' WHERE email='$email' RETURNING \"employeeId\", email, role;"
        ;;

    # -------------------------------------------------------------------------
    # 7. Revoke every active session for a user (bumps tokenVersion — every
    #    issued cookie fails the tv check on next request).
    # -------------------------------------------------------------------------
    revoke)
        email="${1:-}"
        [[ -z "$email" ]] && { echo "usage: $0 revoke <email>" >&2; exit 2; }
        docker compose exec -T postgres psql -U approvals -d approvals \
            -c "UPDATE \"Employee\" SET \"tokenVersion\" = \"tokenVersion\" + 1 WHERE email='$email';"
        ;;

    # -------------------------------------------------------------------------
    # 8. What does central say about this user? Confirms SSO login can find
    #    them BEFORE they try to log in and get a 401. Needs APPROVALS_API_KEY
    #    exported and CENTRAL_DB_URL reachable from the EC2 host.
    # -------------------------------------------------------------------------
    central)
        email="${1:-}"
        [[ -z "$email" ]] && { echo "usage: $0 central <email>" >&2; exit 2; }
        [[ -z "${APPROVALS_API_KEY:-}" ]] && { echo "APPROVALS_API_KEY not exported" >&2; exit 2; }
        : "${CENTRAL_DB_URL:=http://127.0.0.1:8000}"
        curl -sS -H "x-api-key: $APPROVALS_API_KEY" \
            "$CENTRAL_DB_URL/api/employees/by-email?email=$email" | jq .
        ;;

    # -------------------------------------------------------------------------
    # 9. Row counts.
    # -------------------------------------------------------------------------
    counts)
        docker compose exec -T postgres psql -U approvals -d approvals -c "
SELECT 'Employee' AS \"table\", COUNT(*) FROM \"Employee\"
UNION ALL SELECT 'Approval',       COUNT(*) FROM \"Approval\"
UNION ALL SELECT 'Party',          COUNT(*) FROM \"Party\"
UNION ALL SELECT 'Decision',       COUNT(*) FROM \"Decision\"
UNION ALL SELECT 'ActivityLog',    COUNT(*) FROM \"ActivityLog\"
UNION ALL SELECT 'UnprocessedMail',COUNT(*) FROM \"UnprocessedMail\";"
        ;;

    # -------------------------------------------------------------------------
    # 10. Backup / restore. Backups land in /var/backups/approvals on the host.
    # -------------------------------------------------------------------------
    dump)
        mkdir -p /var/backups/approvals
        out="/var/backups/approvals/approvals-$(date +%Y%m%d-%H%M%S).sql"
        docker compose exec -T postgres pg_dump -U approvals -d approvals > "$out"
        echo "wrote $out"
        ;;
    restore)
        in="${1:-}"
        [[ ! -f "$in" ]] && { echo "no such file: $in" >&2; exit 2; }
        docker compose exec -T postgres psql -U approvals -d approvals < "$in"
        ;;

    # -------------------------------------------------------------------------
    # 11. Nuke everything and re-migrate. ⚠️ Deletes the pgdata volume.
    #     Only for dev / staging EC2. Do NOT run this in prod.
    # -------------------------------------------------------------------------
    reset)
        echo "⚠️  This DROPS the approvals_pgdata volume. Ctrl+C in 10s to abort."
        sleep 10
        docker compose down -v
        docker compose up -d postgres
        _wait_pg
        docker compose up -d backend
        ;;

    # -------------------------------------------------------------------------
    # 12. Health snapshot.
    # -------------------------------------------------------------------------
    status)
        docker compose ps
        echo
        docker compose exec -T backend wget -qO- http://localhost:3001/health || echo "backend /health did not respond"
        ;;

    logs)
        docker compose logs -f --tail=100 "${1:-}"
        ;;

    help|*)
        cat <<'EOF'
approvals db-ops — commands:

  start                Bring up postgres only
  up                   Bring up postgres + backend (backend applies migrations)
  migrate              Run `prisma migrate deploy` explicitly
  psql                 Interactive psql inside the container
  who                  List Employee rows (populated on first SSO login)
  admin <email>        Promote signed-in user to ADMIN
  revoke <email>       Bump tokenVersion — kills all cookies for that user
  central <email>      Ask central_db what it knows about this user
  counts               Row counts across all tables
  dump                 pg_dump to /var/backups/approvals/
  restore <file.sql>   Restore from a dump
  reset                Drop volume + re-migrate  (⚠️ destructive)
  status               `docker compose ps` + backend /health probe
  logs [svc]           Tail logs (default: all services)
EOF
        ;;
esac
