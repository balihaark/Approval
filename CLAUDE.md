# approvals — CLAUDE.md

Fastify (Node/TS) + Next.js + Postgres (`approvals`). Internal approval workflow: Gmail-ingested approval emails are routed to approvers in sequence; the final decision replies in the original Gmail thread.

**Approvals does not own employee identity.** Post 2026-09-09 cutover, every SSO login round-trips `central_db /api/employees/by-email` via the `approvals` scope, and every authenticated request re-verifies `is_active` against central (fail-closed). Approvals' local `Employee` table is a thin projection — `employeeId` is central's BIGINT `emp_id`.

Login is **SSO-only** through Login-Auth via **bpi-main's workspace launcher**. There is no standalone "Sign in with Login-Auth" flow on the approvals side — the user signs in once at bpi-main, then clicks the Approvals tile, which asks for a fresh TOTP and hands off a per-app JWT to `/sso/callback`.

---

## Layout

```
backend/                                Fastify API
  src/
    config.ts                           env loader + CENTRAL_DB_URL / APPROVALS_API_KEY
    index.ts                            server bootstrap (BigInt→JSON global patch here)
    plugins/auth.ts                     ⭐ authenticate — cookie JWT + central re-verify; requireAdmin
    routes/
      auth.ts                           /auth/sso/callback (JWT + central), /auth/logout, /auth/me
      approvals.ts                      approval CRUD
      admin.ts                          read-only /admin/users, gmail admin, stats
      webhooks.ts                       Gmail push webhook
      gmail-setup.ts                    OAuth setup
    services/centralDb.service.ts       ⭐ httpx-alike fetch client — getEmployeeByEmail, getEmployeeById
    lib/gmail/                          Gmail ingestion + parser + watch
    lib/audit.ts                        activity_log writer
    jobs/scheduler.ts                   reconcile + watch renewal
  prisma/
    schema.prisma                       Employee (BigInt) + Approval/Party/Decision/ActivityLog + Gmail state
    migrations/
      20260909130000_central_db_cutover/  ⭐ BIGINT retype + drop password columns (TRUNCATEs Employee)
    seed.ts                             no-op (SSO-only; employees materialize on first login)

frontend/                               Next.js app-router
  src/
    app/login/page.tsx                  single "Sign in with Login-Auth" button
    app/sso/callback/page.tsx           POSTs token to /auth/sso/callback, redirects to /received
    app/admin/users/page.tsx            read-only directory (no create/reset/deactivate)
    components/AuthProvider.tsx         session bootstrap via /auth/me
```

---

## Ground rules (locked in)

1. **SSO-only.** `POST /auth/login`, `POST /auth/change-password`, `passwordHash`, `mustChangePassword`, `failedLoginAttempts`, `lockedUntil` are gone and are not coming back. If Login-Auth is down, approvals is down — matches LMA + HR Portal cutover.
2. **Central is the identity source.** SSO callback resolves the token's email against `GET /api/employees/by-email` under the `approvals` scope (`APPROVALS_API_KEY`). No employee → 401. `is_active === false` → 401. Central unreachable → 503.
3. **`Employee.employeeId` is BIGINT.** It IS central's `emp_id`. Never generate a local one, never `MAX(employeeId)+1`. The Prisma model uses `BigInt` and the server patches `BigInt.prototype.toJSON` at the top of [src/index.ts](backend/src/index.ts) so every response serializes as a string.
4. **`Employee.role` (USER/ADMIN) is local and manual.** No central column drives it, no SSO claim writes it (the pre-cutover `payload.role`/`roles.approvals`/`roles.dpps` code is gone). Promote a user via `UPDATE "Employee" SET role='ADMIN' WHERE email='x@blauplug.com';` on the approvals DB. On re-login the SSO callback preserves the existing local `role`.
5. **Fail-closed re-verify on every authenticated request.** `plugins/auth.ts::authenticate` re-hits central after verifying the session cookie. HR-side deactivation revokes approvals access within one request. When the re-hit says inactive, the local row is marked `isActive=false` and `tokenVersion` is bumped so any other cookie also dies.
6. **`Party.email` is still an email string** — approval threads are keyed on the address that appeared on the Gmail message, not on emp_id. Employees may or may not exist in the local `Employee` table (external addressees appear on threads without ever signing in). Do NOT try to enforce a FK from `Party.email` to `Employee.email`.
7. **`admin@blauplug.local` is not seeded anymore.** The old bootstrap admin was a password-login concept. First admin after this cutover: whoever signs in via SSO first, then a dev bumps their row to ADMIN.

---

## SSO handoff (end-to-end)

The user never types their password on the approvals origin. The flow:

1. User signs in at bpi-main (`/login` → Login-Auth's email/OTP/password/TOTP) — main SSO JWT lands in `localStorage.accessToken` on bpi-main.
2. User clicks the **Approvals** tile on `bpi-main /dashboard/employee`. The tile opens `/app-verify?appId=Approvals&appUrl=${approvals}/sso/callback&appName=Approvals` in a new tab.
3. `/app-verify` prompts for a 6-digit TOTP code and POSTs to Login-Auth `/auth/generate-app-token` with the main JWT as bearer + the code. **Approvals must be in Login-Auth's `allowedApps` whitelist** (`auth.controller.ts::generateAppToken`).
4. Login-Auth mints a per-app HS256 JWT (same 8h TTL, claims: `emp_id, central_emp_id, email, first_name, mobile_number, role, appId: "Approvals", purpose: "app_access", jti, exp`) and returns `{ token, user }`.
5. bpi-main redirects the browser to `${approvals}/sso/callback?token=<per-app-JWT>` (LMA/VMA-style — NOT the DPPS/HR-Portal `#session=` hash bucket).
6. Approvals `/sso/callback` POSTs the token to `POST /auth/sso/callback` → JWT verify with `LOGIN_AUTH_JWT_SECRET` → central `getEmployeeByEmail` → project local Employee row → session cookie set → redirect to `/received`.

**Approvals' own `/login` page is a dead end** — it just tells the user to open the workspace. It doesn't try to bounce them to Login-Auth directly (Login-Auth doesn't accept a `returnUrl`; it only ever redirects to `bpi-main`).

## Wiring

**Config (`.env` for local, `backend/.env` mirrored):**

```dotenv
DATABASE_URL=postgresql://approvals:approvals@localhost:5432/approvals
JWT_SECRET=<32+ char random for approvals' own session cookie>

# Login-Auth JWT (same HS256 secret Login-Auth signs with)
LOGIN_AUTH_JWT_SECRET=<matches Login-Auth>
# LOGIN_AUTH_ISSUER=  (optional — enforce iss claim)
# LOGIN_AUTH_AUDIENCE= (optional — enforce aud claim)

# central_db read API
CENTRAL_DB_URL=http://127.0.0.1:8000
APPROVALS_API_KEY=<same value set on central as APPROVALS_API_KEY>
```

**Central side:** `permission.py` `approvals` scope reads `emp_id, employee_code, first_name, last_name, email, employment_status, is_active`. `auth.py` looks up `APPROVALS_API_KEY` env var. Set both on the central deploy and coordinate a `docker compose up -d --force-recreate app` — new env vars need a reload ([[feedback_docker_env_reload]]).

**Frontend (`frontend/.env.local`):**

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_BPI_MAIN_URL=http://localhost:3000
```

`NEXT_PUBLIC_BPI_MAIN_URL` is where `/login` sends the browser (bpi-main's origin). The actual token handoff comes back the other way, from bpi-main's `/app-verify` to `${approvals}/sso/callback?token=…`.

**bpi-main side** (root of bpi-main's env):

```dotenv
NEXT_PUBLIC_APPROVALS_URL=https://approvals.example.com/sso/callback
```

The tile lives in `bpi-main/src/app/dashboard/employee/page.js` (`blauplugApps` + `blauplugAppMap`); the Approvals `appId` is on Login-Auth's `allowedApps` whitelist in `auth.controller.ts::generateAppToken`.

---

## Gotchas

1. **Central down = every request 503s** (SSO callback AND every authenticated request). Intentional per fail-closed pattern. If you're debugging a mystery outage, check central first.
2. **`APPROVALS_API_KEY` missing = every SSO / authenticated request 500s.** `centralDb.service._client()` refuses to send anonymous requests. In dev, if you see `identity service unavailable` even though central is up, first check whether the env is loaded.
3. **`BigInt.prototype.toJSON` is patched globally** in `src/index.ts`. Every emp_id in every JSON response is a string. If a client parses it as `Number` it's still safe (central's emp_ids fit `Number.MAX_SAFE_INTEGER` by construction) — but prefer keeping it as a string to match the rest of the stack.
4. **Migration `20260909130000_central_db_cutover` TRUNCATEs Employee.** Local integer employeeIds (1001-based) can't hold central's BIGINT and there was no meaningful correspondence between the two — every user re-projects on their next SSO login. Historical approval / decision / activity rows survive because they reference `Party.email` strings, not `Employee.employeeId`.
5. **No employee provisioning inside approvals.** Ground rule from root [CLAUDE.md](../CLAUDE.md): HR creates employees only in central via the Vue dashboard. If an SSO login returns 401 "Employee not found in central directory", the fix is in central, not here.
6. **`role` in the Login-Auth JWT is ignored.** Only `email`, `emp_id`/`central_emp_id`, and optionally `first_name` are consumed. Login-Auth's generic `role` claim is not `approvals_role` (there is no such column — [[decision_approvals_no_role]]) and reading it would silently mis-promote users.
7. **`AdminOnly` guard is client-side.** The server enforces `requireAdmin` on every `/admin/*` route — never rely on the UI hiding a button.
8. **Session cookie invalidation.** Bumping `tokenVersion` on the local row invalidates every issued cookie for that user (the JWT carries `tv`, `authenticate` compares). Logout, deactivation, and central-side deactivation all bump it. If you add a "revoke sessions" admin action later, use the same lever.
9. **`/app-verify` opens in a new tab.** bpi-main's launcher uses `window.open(..., "_blank")`, so users land on approvals in a fresh tab. That means approvals' own `/login` is only ever hit if (a) the session cookie expired, or (b) they bookmarked the app. In both cases the "Open BlauPlug workspace" button is correct — Login-Auth cannot bounce a user back to approvals directly.

---

## Commands

```powershell
# Backend
cd approvals\backend
npm install
npx prisma migrate deploy
npm run dev                     # tsx watch on :3001

# Frontend
cd approvals\frontend
npm install
npm run dev                     # Next on :3000

# Sanity: ask central what it knows about someone via approvals' key
curl -s "http://127.0.0.1:8000/api/employees/by-email?email=you@blauplug.com" `
     -H "x-api-key: $env:APPROVALS_API_KEY"

# Promote a signed-in user to ADMIN (dev-run SQL, per decision_approvals_admin_manual)
psql -d approvals -c "UPDATE \"Employee\" SET role='ADMIN' WHERE email='you@blauplug.com';"

# Inspect who has signed in
psql -d approvals -c "SELECT \"employeeId\", email, role, \"isActive\", \"lastLoginAt\" FROM \"Employee\" ORDER BY \"lastLoginAt\" DESC NULLS LAST;"
```

See root [CLAUDE.md](../CLAUDE.md) for the umbrella architecture and [../CENTRAL_DB_INTEGRATION.md](../CENTRAL_DB_INTEGRATION.md) for the migration story.
