# Approvals App — Phase 1 MVP

Internal approval tracker for **BlauPlug Innovations Pvt. Ltd.** Employees send approval requests by email and CC a **monitoring inbox** (your `GMAIL_USER`). This app ingests those messages via the **Gmail API**, turns them into structured records, and lets approvers **Approve / Reject in the web app**. The decision is then sent back as a **reply on the original Gmail thread**.

There is **no Microsoft Graph / Exchange / Entra** integration.

## Quick start (local Postgres — no Docker)

**Prerequisites:** [Node.js 20+](https://nodejs.org), [PostgreSQL 16+](https://www.postgresql.org/download/), [Git](https://git-scm.com)

```powershell
# 1. Create app database (Windows — use your postgres superuser password)
.\scripts\setup-postgres.ps1 -PostgresPassword "YOUR_POSTGRES_SUPERUSER_PASSWORD"

# 2. Install, migrate, seed admin
npm run setup

# 3. Run (every time)
npm run dev
```

Open **http://localhost:3000** — admin `admin@blauplug.local` / `ChangeMe123!`

**Full clone guide:** **[SETUP.md](SETUP.md)** · **Your own secrets & Gmail:** **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)**

---

## Manual setup (same idea, step by step)

1. Install Node 20+ and PostgreSQL. Remember the `postgres` superuser password. Start the PostgreSQL service.

2. Clone and create the app DB:

```bash
git clone <repo-url>
cd approval
```

```powershell
.\scripts\setup-postgres.ps1 -PostgresPassword "YOUR_POSTGRES_SUPERUSER_PASSWORD"
```

3. Env files are created by `npm run setup` (or copy manually):

```bash
copy .env.example .env
copy .env.example backend\.env
copy frontend\.env.local.example frontend\.env.local
```

Default `DATABASE_URL` (matches the script above):

```
DATABASE_URL=postgresql://approvals:approvals@localhost:5432/approvals
```

4. Install, migrate, seed, run:

```bash
npm install
cd backend && npx prisma migrate deploy && npx prisma db seed && cd ..
npm run dev
```

Or use `npm run setup` then `npm run dev`.

- Web app: http://localhost:3000  
- API: http://localhost:3001/health  

Bootstrap admin (change password after first login):

| Email | Role |
|---|---|
| `admin@blauplug.local` | Admin |

Create real org users under **Admin → People** using their work Gmail / company emails (must match From / To / CC on approval mail).

To wipe demo seed data from an older install:

```bash
cd backend
npm run data:clear-seed
```

To share the repo, see **[SHARE.md](SHARE.md)**. Teammates clone and create their own credentials via **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)** — never commit `.env` or tokens.

Admins manage Gmail connection and unprocessed mail under **Gmail** / **Unprocessed**.

Security controls (sessions, lockout, password policy, CSRF, webhooks): see **[docs/SECURITY.md](docs/SECURITY.md)**.

## What Phase 1 includes

- Gmail OAuth2 for a single monitoring mailbox (`GMAIL_USER`)
- Push ingestion via Google Cloud Pub/Sub (`users.watch`) + webhook
- Reconciliation sweep (`users.history.list` / `users.messages.list`)
- Threading / dedup on Gmail `threadId` + Message-ID
- Sent / Received / Part-of dashboards, search & filter
- In-app Approve / Reject (reason required on reject) + threaded Gmail reply
- Append-only activity log; party-only access at the API (admin override)
- Quarantine queue for mail that does not parse as an approval

## Deploy sketch (AWS)

- Frontend: Amplify (Next.js)
- Backend: EC2 (or ECS) running the Fastify API
- Database: RDS PostgreSQL (managed — not Docker Desktop)
- Secrets: store `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` in Secrets Manager / SSM — never in the image

See **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)** for step-by-step credentials (OAuth, refresh token, Pub/Sub, where to paste each value). Technical reference: **[docs/GMAIL_SETUP.md](docs/GMAIL_SETUP.md)** and **[docs/NGROK_SETUP.md](docs/NGROK_SETUP.md)**.
