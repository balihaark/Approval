# Environment & credentials setup

After you **clone** the repo, you create **your own** secrets. Nothing sensitive is in git — only `.env.example` templates.

**Quick path:** run `npm run setup` first (creates env files + database). Then fill in the values below and restart with `npm run dev`.

---

## Where env files live

| File | Purpose | How it is created |
|------|---------|-------------------|
| `.env` | Root copy (some tools read this) | `npm run setup` copies from `.env.example` |
| `backend/.env` | **Main backend config** — Gmail, DB, JWT | Same — must match `.env` |
| `frontend/.env.local` | Frontend API URL | `npm run setup` copies from `frontend/.env.local.example` |

**Rule:** keep `.env` and `backend/.env` **identical** for backend variables.

**Never commit** `.env`, `backend/.env`, `frontend/.env.local`, or `scripts/ngrok.local.env`.

---

## Checklist

### Minimum (app runs, no live email)

- [ ] Clone repo + `npm run setup`
- [ ] Optionally change `JWT_SECRET` (recommended even locally)
- [ ] `npm run dev` → http://localhost:3000

### Full Gmail (email ingest + send replies)

- [ ] Google Cloud project + Gmail API enabled
- [ ] OAuth client → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Monitoring Gmail account → `GMAIL_USER`
- [ ] Refresh token → `GMAIL_REFRESH_TOKEN`
- [ ] Pub/Sub topic → `GMAIL_PUBSUB_TOPIC`
- [ ] Push secret → `GMAIL_PUSH_TOKEN`
- [ ] (Local only) ngrok tunnel for Pub/Sub push — or skip and use polling

---

## Part 1 — App secrets (everyone)

Open **`backend/.env`** (and keep `.env` in sync).

### `DATABASE_URL`

**What:** PostgreSQL connection string.

**Default (after `scripts/setup-postgres.ps1` — local Postgres):**

```
DATABASE_URL=postgresql://approvals:approvals@localhost:5432/approvals
```

**How to get it:** run the DB create step in **[SETUP.md](../SETUP.md)** (creates user/db `approvals`). Only change if you use different Postgres credentials.

---

### `JWT_SECRET`

**What:** Signs login session cookies. Must stay private.

**How to generate** (pick one):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Where to paste** — in both `.env` and `backend/.env`:

```
JWT_SECRET=paste-your-random-string-here
```

The template default works for local dev. Use a unique random value before deploying.

---

### `PORT`, `FRONTEND_URL`, `NODE_ENV`

Usually leave as-is for local development:

```
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

---

### Frontend — `frontend/.env.local`

**Default (already set by setup):**

```
NEXT_PUBLIC_API_URL=/api
```

No change needed locally — Next.js proxies `/api` → `http://localhost:3001`.

---

## Part 2 — Google Cloud & Gmail OAuth

You need a **Google account** that owns the **monitoring inbox** (the mailbox that receives approval emails when people CC it).

Example: if employees CC `yourname@gmail.com`, that address is `GMAIL_USER`.

### Step 2.1 — Create a Google Cloud project

1. Open https://console.cloud.google.com/
2. **Select a project** → **New project** → name it (e.g. `approvals-app`)
3. With that project selected, go to **APIs & Services → Library**
4. Enable **Gmail API** and **Cloud Pub/Sub API**

### Step 2.2 — OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External** (personal Gmail) or **Internal** (Google Workspace)
3. Fill app name, support email, developer contact
4. **Scopes → Add or remove scopes** → add:
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.send`
5. **Test users** (External only): add the Gmail address you will sign in with (`GMAIL_USER`)
6. Save

### Step 2.3 — OAuth client (Web application)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Web application**
3. **Authorized redirect URIs** — add exactly:

   ```
   http://localhost:3001/gmail/oauth/callback
   ```

4. Create → copy **Client ID** and **Client secret**

**Where to paste** in `backend/.env`:

```
GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3001/gmail/oauth/callback
GMAIL_USER=your-monitoring-inbox@gmail.com
```

Replace `GMAIL_USER` with the Gmail you will sign in as (the inbox you monitor).

---

### Step 2.4 — Refresh token (`GMAIL_REFRESH_TOKEN`)

**What:** Long-lived token so the server can read/send mail without you logging in every time.

**How to get it:**

1. Save the OAuth client values above in `backend/.env`
2. From repo root:

   ```bash
   npm run gmail:auth
   ```

3. Open the URL printed in the terminal
4. Sign in as **`GMAIL_USER`** and allow access
5. The script prints:

   ```
   GMAIL_REFRESH_TOKEN=1//0g...
   ```

6. Paste that value into `backend/.env` (and `.env`)

**Alternative:** start the app, log in as admin → **Admin → Gmail → Connect Gmail**.

**If no refresh token is returned:** revoke the app at https://myaccount.google.com/permissions and run `npm run gmail:auth` again.

---

## Part 3 — Pub/Sub (instant email push)

**Optional for local dev.** Without Pub/Sub, set `GMAIL_RECONCILE_MINUTES=1` and the app polls Gmail every minute instead.

### Step 3.1 — Create a topic

1. Google Cloud Console → **Pub/Sub → Topics → Create topic**
2. Topic ID: e.g. `gmail-approvals`
3. Create

### Step 3.2 — Allow Gmail to publish

Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) if needed, then:

```bash
gcloud config set project YOUR_GCP_PROJECT_ID

gcloud pubsub topics add-iam-policy-binding gmail-approvals \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

### Step 3.3 — Push subscription

**Generate a push secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Where to paste** in `backend/.env`:

```
GMAIL_PUBSUB_TOPIC=projects/YOUR_GCP_PROJECT_ID/topics/gmail-approvals
GMAIL_PUSH_TOKEN=paste-the-hex-you-just-generated
```

**Push endpoint URL** (for the subscription):

```
https://YOUR_PUBLIC_API_HOST/webhooks/gmail?token=SAME_GMAIL_PUSH_TOKEN
```

In Cloud Console → **Pub/Sub → Subscriptions → Create subscription**:

| Field | Value |
|-------|-------|
| Delivery type | Push |
| Endpoint URL | URL above |
| Topic | `gmail-approvals` |

For **local development**, `YOUR_PUBLIC_API_HOST` is your ngrok domain (Part 4).

### Step 3.4 — Renew Gmail watch

After env vars are set and the API is reachable at the push URL:

```bash
npm run gmail:watch
```

Or in the app: **Admin → Gmail → Renew watch**.

---

## Part 4 — Local HTTPS tunnel (ngrok)

Pub/Sub needs a **public HTTPS** URL. For local dev, use ngrok.

### Step 4.1 — ngrok account & authtoken

1. Sign up: https://dashboard.ngrok.com/signup
2. Copy authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
3. Save it (one time):

   ```powershell
   .\scripts\setup-ngrok.ps1 -AuthToken "YOUR_NGROK_AUTHTOKEN"
   ```

   This token goes in ngrok’s own config — **not** in `backend/.env`.

### Step 4.2 — Free static domain

1. https://dashboard.ngrok.com/domains → **New domain**
2. Copy it, e.g. `my-approvals.ngrok-free.app`
3. Optional — save for scripts:

   ```powershell
   copy scripts\ngrok.local.env.example scripts\ngrok.local.env
   # Edit NGROK_DOMAIN=my-approvals.ngrok-free.app
   ```

### Step 4.3 — Run tunnel

Terminal 1: `npm run dev`

Terminal 2:

```powershell
.\scripts\start-ngrok.ps1 -Domain "my-approvals.ngrok-free.app"
```

### Step 4.4 — Point Pub/Sub at ngrok

Edit your Pub/Sub push subscription endpoint to:

```
https://my-approvals.ngrok-free.app/webhooks/gmail?token=YOUR_GMAIL_PUSH_TOKEN
```

(`YOUR_GMAIL_PUSH_TOKEN` = same value as in `backend/.env`.)

Verify:

```powershell
Invoke-WebRequest https://my-approvals.ngrok-free.app/health
```

More detail: **[NGROK_SETUP.md](./NGROK_SETUP.md)**.

---

## Part 5 — Polling-only mode (no ngrok)

If you skip Pub/Sub and ngrok entirely:

In `backend/.env`:

```
GMAIL_RECONCILE_MINUTES=1
```

Leave `GMAIL_PUBSUB_TOPIC` and `GMAIL_PUSH_TOKEN` empty.

You still need OAuth + refresh token (Part 2) for Gmail read/send. New mail appears within ~1 minute.

---

## Variable reference

| Variable | Required | Where to get it | Paste in |
|----------|----------|-----------------|----------|
| `DATABASE_URL` | Yes | Default from local Postgres setup | `.env`, `backend/.env` |
| `JWT_SECRET` | Yes | Generate random 32+ bytes | `.env`, `backend/.env` |
| `GOOGLE_CLIENT_ID` | For Gmail | GCP → Credentials → OAuth client | `.env`, `backend/.env` |
| `GOOGLE_CLIENT_SECRET` | For Gmail | Same OAuth client | `.env`, `backend/.env` |
| `GOOGLE_REDIRECT_URI` | For Gmail | `http://localhost:3001/gmail/oauth/callback` | `.env`, `backend/.env` |
| `GMAIL_USER` | For Gmail | Your monitoring Gmail address | `.env`, `backend/.env` |
| `GMAIL_REFRESH_TOKEN` | For Gmail | `npm run gmail:auth` or Admin → Connect | `.env`, `backend/.env` |
| `GMAIL_PUBSUB_TOPIC` | For push | GCP Pub/Sub topic full name | `.env`, `backend/.env` |
| `GMAIL_PUSH_TOKEN` | For push / prod | Generate random hex | `.env`, `backend/.env` |
| `GMAIL_RECONCILE_MINUTES` | No | Use `1` for fast local polling | `.env`, `backend/.env` |
| `NEXT_PUBLIC_API_URL` | Yes | Default `/api` | `frontend/.env.local` |
| ngrok authtoken | For local push | ngrok dashboard | ngrok CLI config only |
| ngrok domain | For local push | ngrok dashboard | `scripts/ngrok.local.env` (optional) |

---

## After editing env files

Restart the backend: stop `npm run dev` and run it again. Env is read at startup.

Verify Gmail (optional):

```bash
npm run gmail:verify --workspace=backend
```

---

## Related docs

- **[SETUP.md](../SETUP.md)** — clone, install, run the app
- **[GMAIL_SETUP.md](./GMAIL_SETUP.md)** — technical Gmail/Pub/Sub reference
- **[NGROK_SETUP.md](./NGROK_SETUP.md)** — ngrok day-to-day usage
- **[SECURITY.md](./SECURITY.md)** — auth and production hardening
