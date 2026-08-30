# Sharing this project

The repo is **self-contained**. Your teammate clones it and creates **her own** credentials — you do **not** send `.env` files or tokens.

Full guide: **[SETUP.md](SETUP.md)** (local Postgres, no Docker) + **[docs/ENV_SETUP.md](docs/ENV_SETUP.md)**

---

## What she does

**Needs:** Node 20+, PostgreSQL 16+, Git

```powershell
git clone <repo-url>
cd approval

# Create app DB (Windows — her postgres superuser password)
.\scripts\setup-postgres.ps1 -PostgresPassword "HER_POSTGRES_PASSWORD"

npm run setup    # once — env files, install, migrate, admin
npm run dev      # every time
```

Open **http://localhost:3000** — `admin@blauplug.local` / `ChangeMe123!`

For Gmail, she follows **docs/ENV_SETUP.md** and pastes **her own** OAuth / refresh token / Pub/Sub secrets.

---

## What is in git (safe to clone)

- Source code, migrations, scripts, docs  
- `.env.example`, `frontend/.env.local.example`, `scripts/ngrok.local.env.example`  

## What is NOT in git (she creates locally)

- `.env`, `backend/.env`, `frontend/.env.local`  
- `scripts/ngrok.local.env`  
- Any OAuth refresh tokens or API secrets  

---

## If you zip instead of git clone

Include everything except `node_modules/`, `.next/`, `backend/dist/`, and any `.env` / token files.

She still follows **SETUP.md** and **docs/ENV_SETUP.md**.
