# BlauPlug Approvals

Internal approval workflow: approval emails are read from a monitored Gmail inbox, routed to approvers in sequence, and the final decision is sent as a reply in the original Gmail thread.

This repository is ready to run locally without any organisation credentials. Gmail and Login-Auth SSO are optional integrations: add their URLs and credentials to the untracked environment files when those services are ready.

## Start locally

Prerequisites: Node.js 20+, PostgreSQL 16+, and Git.

```powershell
git clone <repository-url>
cd approval
.\scripts\setup-postgres.ps1 -PostgresPassword "YOUR_POSTGRES_SUPERUSER_PASSWORD"
npm run setup
npm run dev
```

Open http://localhost:3000. The API health check is http://localhost:3001/health.

`npm run setup` installs dependencies, creates missing environment files, applies Prisma migrations, and seeds local accounts. It does not overwrite existing environment files.

Local accounts:

| Account | Password | Role |
|---|---|---|
| `admin@blauplug.local` | `ChangeMe123!` | Admin |
| `balihaar.kaur@blauplug.com` | `Balihaar21123` | User |
| `abbas.shaikh@blauplug.com` | `Balihaar21123` | User |
| `shreya.kumar@blauplug.com` | `Balihaar21123` | User |
| `chandana.rama@blauplug.com` | `Balihaar21123` | User |

Change the bootstrap admin password after its first login. Do not use these seeded accounts in a shared or production environment.

## Configuration handoff

Credentials are deliberately not committed. Copy the examples (or run `npm run setup`) and put real values only in these ignored files:

| File | Used by | Contents |
|---|---|---|
| `.env` | project scripts | Copy of backend settings |
| `backend/.env` | Approvals API | database, session secret, Gmail, SSO verification |
| `frontend/.env.local` | Approvals browser app | API and Login-Auth browser URLs |

Keep `.env` and `backend/.env` identical for shared backend settings. Never commit them, Gmail OAuth tokens, JWT secrets, Central DB keys, or SMS credentials.

### Minimum settings

The generated defaults run the app against local PostgreSQL. Before deployment, set a production `DATABASE_URL`, a unique 32+ character `JWT_SECRET`, `FRONTEND_URL`, and `NODE_ENV=production` in both `.env` and `backend/.env`.

### Login-Auth SSO

Local password login continues to work even if Login-Auth is unavailable. To turn on the Sign in with Login-Auth button, set this in `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_LOGIN_AUTH_URL=https://login-auth.example.com
```

Login-Auth must redirect the browser back to:

```text
https://approvals.example.com/sso/callback?token=<signed-JWT>
```

In `.env` and `backend/.env`, configure the JWT verification contract:

```dotenv
LOGIN_AUTH_JWT_SECRET=<same-HS256-secret-used-by-Login-Auth>
LOGIN_AUTH_ISSUER=<optional-expected-issuer>
LOGIN_AUTH_AUDIENCE=<optional-expected-audience>
```

The token must contain the employee email. `emp_id` (or `central_emp_id`), `first_name`, and an approvals/admin role are supported when supplied. Confirm the signing algorithm, secret/key distribution, issuer, audience, callback URL, and logout policy with the Login-Auth owner before production cutover. The current implementation verifies HS256 tokens.

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
