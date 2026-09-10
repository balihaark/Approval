# Quick start (clone → local Postgres → your own credentials)

Anyone can **clone this repo** and run the app with **their own** secrets. Nothing sensitive is stored in git.

This guide uses **local PostgreSQL** (no Docker).

---

## Before you start

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 20+ | https://nodejs.org |
| **PostgreSQL** | 16+ (18 is fine) | https://www.postgresql.org/download/ |
| **Git** | Any recent | https://git-scm.com |

During PostgreSQL install, **remember the `postgres` superuser password** — you need it in Step 2.

Confirm Postgres is running (Windows: Services → `postgresql-x64-18` or similar should be **Running**).

For **live Gmail** (optional): a Google account and Google Cloud project. You create all tokens yourself — see **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)**.

---

## Step 1 — Clone

```bash
git clone <repo-url>
cd approval
```

There is **no** `.env` in the repo. Setup creates it from examples.

---

## Step 2 — Create the app database (one time)

This creates role `approvals` / database `approvals` (matches the default `DATABASE_URL` in `.env.example`).

**Windows** (PostgreSQL installed under `C:\Program Files\PostgreSQL\18`):

```powershell
.\scripts\setup-postgres.ps1 -PostgresPassword "YOUR_POSTGRES_SUPERUSER_PASSWORD"
```

Replace `YOUR_POSTGRES_SUPERUSER_PASSWORD` with the password you set when installing PostgreSQL.

**macOS / Linux** (with `psql` on PATH):

```bash
psql -U postgres -h localhost -c "CREATE USER approvals WITH PASSWORD 'approvals';"
psql -U postgres -h localhost -c "CREATE DATABASE approvals OWNER approvals;"
psql -U postgres -h localhost -d approvals -c "GRANT ALL ON SCHEMA public TO approvals;"
```

If the user/database already exists, you can skip this step.

Default connection string (already in `.env.example`):

```
DATABASE_URL=postgresql://approvals:approvals@localhost:5432/approvals
```

---

## Step 3 — One-time project setup

```bash
npm run setup
```

This:

1. Creates `.env`, `backend/.env`, and `frontend/.env.local` from examples  
2. Runs `npm install`  
3. Applies database migrations and creates the bootstrap admin  

---

## Step 4 — Run the app

```bash
npm run dev
```

Open **http://localhost:3000** and click **Sign in with Login-Auth**. Approvals is SSO-only — a local `central_db` + `Login-Auth` must be running (see the umbrella [../CLAUDE.md](../CLAUDE.md) for how to start them).

Your first sign-in creates a `USER` row. To promote yourself to admin:

```powershell
psql -d approvals -c "UPDATE \"Employee\" SET role='ADMIN' WHERE email='you@blauplug.com';"
```

---

## Step 5 — Your own credentials (Gmail & secrets)

When you want email ingest and replies, follow:

### **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)**

| What you create | Where you paste it |
|-----------------|-------------------|
| `JWT_SECRET` (random string) | `.env` + `backend/.env` |
| Google OAuth client ID & secret | `.env` + `backend/.env` |
| Monitoring Gmail address | `GMAIL_USER` in `.env` |
| Gmail refresh token | `GMAIL_REFRESH_TOKEN` (via `npm run gmail:auth`) |
| Pub/Sub topic + push token | `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_TOKEN` |
| ngrok authtoken & domain | ngrok config + Pub/Sub push URL (local only) |

After editing env files, restart: stop `npm run dev` and run it again.

**Easiest local Gmail path:** complete Part 2 (OAuth + refresh token) in ENV_SETUP, set `GMAIL_RECONCILE_MINUTES=1`, skip Pub/Sub/ngrok. Mail syncs within ~1 minute.

---

## What to try

1. Sign in as admin  
2. **Admin → People** — add users with real email addresses  
3. Configure Gmail (Step 5) → **Admin → Gmail → Connect** / **Renew watch**  
4. CC your monitoring inbox on a test email, or use **New request** in the app  

---

## Commands

| Command | When |
|---------|------|
| `.\scripts\setup-postgres.ps1 -PostgresPassword "..."` | First time — create app DB (Windows) |
| `npm run setup` | First clone (or after new migrations) |
| `npm run dev` | Every time you run the app |
| `npm run gmail:auth` | After OAuth client ID/secret are in `.env` |
| `npm run gmail:watch` | After Pub/Sub is configured |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `psql not found` / setup-postgres fails | Install PostgreSQL; on Windows ensure version path in the script matches (default is 18) |
| Cannot connect to database | Start the PostgreSQL Windows service; check password and that `approvals` DB exists |
| Wrong password / auth failed | Re-run `setup-postgres.ps1` with the correct superuser password, or fix `DATABASE_URL` in `.env` and `backend/.env` |
| Port 3000 or 3001 in use | Stop other dev servers |
| Login fails | Use admin credentials above; re-run `npm run setup` if DB is empty |
| Gmail not working | Follow [docs/ENV_SETUP.md](docs/ENV_SETUP.md) |
| `EPERM` / prisma generate | Stop `npm run dev`, then `npm run setup` again |

---

## More docs

- **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)** — how to get every secret and where to paste it  
- **[docs/GMAIL_SETUP.md](docs/GMAIL_SETUP.md)** — Gmail API technical reference  
- **[docs/NGROK_SETUP.md](docs/NGROK_SETUP.md)** — local HTTPS tunnel for Pub/Sub  
- **[docs/SECURITY.md](docs/SECURITY.md)** — auth and production notes  
