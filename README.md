# BlauPlug Approvals

Internal approval workflow: approval emails are read from a monitored Gmail inbox, routed to approvers in sequence, and the final decision is sent as a reply in the original Gmail thread.

**Login is SSO-only via Login-Auth ↔ central_db.** There is no local password path. Every SSO login and every authenticated request is verified against `central_db`; if central is unreachable, approvals is unreachable (fail-closed, matches the pattern used by LMA and HR Portal).

## Start locally

Prerequisites: Node.js 20+, PostgreSQL 16+, and Git. You also need a running `central_db` + `Login-Auth` (they can run on the same host).

```powershell
git clone <repository-url>
cd approvals
.\scripts\setup-postgres.ps1 -PostgresPassword "YOUR_POSTGRES_SUPERUSER_PASSWORD"
npm run setup
npm run dev
```

Open http://localhost:3000 and click **Sign in with Login-Auth**. The API health check is http://localhost:3001/health.

`npm run setup` installs dependencies, creates missing environment files, and applies Prisma migrations. It does not create any user accounts — employees materialize on first SSO login by projecting from central.

The first user who signs in becomes a regular `USER`. To grant `ADMIN`, a developer runs:

```powershell
psql -d approvals -c "UPDATE \"Employee\" SET role='ADMIN' WHERE email='you@blauplug.com';"
```

See [CLAUDE.md](CLAUDE.md) for the full ground rules.

## Configuration handoff

Credentials are deliberately not committed. Copy the examples (or run `npm run setup`) and put real values only in these ignored files:

| File | Used by | Contents |
|---|---|---|
| `.env` | project scripts | Copy of backend settings |
| `backend/.env` | Approvals API | database, session secret, central + Login-Auth wiring, Gmail |
| `frontend/.env.local` | Approvals browser app | API and Login-Auth browser URLs |

Keep `.env` and `backend/.env` identical for shared backend settings. Never commit them, Gmail OAuth tokens, JWT secrets, or Central DB keys.

### Minimum settings

Before deployment, set a production `DATABASE_URL`, a unique 32+ character `JWT_SECRET` (for approvals' own session cookie), `FRONTEND_URL`, `NODE_ENV=production`, and the central + Login-Auth block below in both `.env` and `backend/.env`.

### Login-Auth SSO + central_db (required)

The user enters Approvals **through bpi-main's workspace launcher**, not through a standalone button on the approvals origin. See [CLAUDE.md § SSO handoff](CLAUDE.md) for the step-by-step.

For the flow to work end-to-end three coordinated bits must be in place:

1. **Login-Auth**: `Approvals` in the `allowedApps` whitelist inside `auth.controller.ts::generateAppToken`.
2. **bpi-main**: `NEXT_PUBLIC_APPROVALS_URL=https://approvals.example.com/sso/callback` plus the Approvals tile in `bpi-main/src/app/dashboard/employee/page.js` (`blauplugApps` + `blauplugAppMap`).
3. **Approvals**: envs below.

Set in `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=https://approvals-api.example.com
NEXT_PUBLIC_BPI_MAIN_URL=https://blauplug.example.com
```

`NEXT_PUBLIC_BPI_MAIN_URL` is where `/login` redirects when a user hits approvals without a valid session cookie — pointing them at the workspace so they can enter through the launcher.

In `.env` and `backend/.env`, configure JWT verification + central lookup:

```dotenv
LOGIN_AUTH_JWT_SECRET=<same HS256 secret Login-Auth signs with>
LOGIN_AUTH_ISSUER=<optional expected issuer>
LOGIN_AUTH_AUDIENCE=<optional expected audience>

CENTRAL_DB_URL=https://central.example.com
APPROVALS_API_KEY=<matches central's APPROVALS_API_KEY env var>
```

The per-app JWT (minted by Login-Auth's `generate-app-token`) contains `email`, `emp_id`, `central_emp_id`, `first_name`, and `role`. Approvals reads only `email` (required) plus `emp_id`/`central_emp_id`/`first_name` (optional) — central is the source of truth for identity + activity. Any `role` / `roles.*` claim is ignored: ADMIN is a local, dev-assigned distinction on the approvals database.

### Gmail

Gmail is optional until the organisation wants email ingestion and replies. Add the Google OAuth client values, monitoring inbox, refresh token, and optionally Pub/Sub push values to `.env` and `backend/.env`. The complete copy-and-paste guide is [docs/ENV_SETUP.md](docs/ENV_SETUP.md).

For a local Gmail test without a public webhook, set `GMAIL_RECONCILE_MINUTES=1`; the app polls the inbox. For instant push delivery, configure a public HTTPS endpoint and `GMAIL_PUSH_TOKEN` as documented in the guide.

## Useful commands

```powershell
npm run dev
npm run db:deploy
npm run db:seed
npm run build --workspace=backend
npm run build --workspace=frontend
npm run gmail:auth
npm run gmail:verify --workspace=backend
```

## More documentation

- [SETUP.md](SETUP.md) - local PostgreSQL and installation details
- [HANDOFF.md](HANDOFF.md) - ownership boundaries, Central DB contract, and SSO cutover notes
- [docs/ENV_SETUP.md](docs/ENV_SETUP.md) - Gmail, Google Cloud, Pub/Sub, and ngrok setup
- [database/README.md](database/README.md) - database ownership and setup
- [docs/SECURITY.md](docs/SECURITY.md) - security controls and deployment hardening
