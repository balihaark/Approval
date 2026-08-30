# ngrok (local Pub/Sub push)

No custom domain needed. Free ngrok accounts can claim **one static hostname**.

**Prerequisites:** complete OAuth + refresh token in **[ENV_SETUP.md](./ENV_SETUP.md)** first. You need `GMAIL_PUSH_TOKEN` in `backend/.env` before configuring Pub/Sub.

---

## One-time setup

### 1. Create ngrok account

https://dashboard.ngrok.com/signup

### 2. Copy your authtoken

https://dashboard.ngrok.com/get-started/your-authtoken

This is **your** token — do not commit it. It is stored in ngrok’s config, not in `backend/.env`.

### 3. Save the token

```powershell
cd C:\path\to\approval
.\scripts\setup-ngrok.ps1 -AuthToken "YOUR_NGROK_AUTHTOKEN"
```

### 4. Claim a free static domain

1. Open https://dashboard.ngrok.com/domains  
2. **New Domain** / claim free domain  
3. Copy it, e.g. `my-approvals.ngrok-free.app`
4. Optional — save for scripts:

   ```powershell
   copy scripts\ngrok.local.env.example scripts\ngrok.local.env
   # Set NGROK_DOMAIN=my-approvals.ngrok-free.app
   ```

---

## Every time you develop (with Pub/Sub push)

**Terminal 1 — app**

```bash
npm run dev
```

**Terminal 2 — ngrok**

```powershell
.\scripts\start-ngrok.ps1 -Domain "my-approvals.ngrok-free.app"
```

---

## Pub/Sub push URL (set once in Google Cloud)

Use the **same** `GMAIL_PUSH_TOKEN` from `backend/.env`:

```
https://my-approvals.ngrok-free.app/webhooks/gmail?token=YOUR_GMAIL_PUSH_TOKEN
```

Google Cloud → **Pub/Sub → Subscriptions** → your push subscription → Edit → paste that URL → Save.

Then renew watch: **Admin → Gmail → Renew watch** or:

```bash
npm run gmail:watch
```

---

## Verify

With API + ngrok running:

```powershell
Invoke-WebRequest https://my-approvals.ngrok-free.app/health
```

Expect `{"ok":true,...}`.

---

## Notes

- If you omit `-Domain`, ngrok still works but the URL changes every restart (update Pub/Sub again).
- **Easier local option:** skip ngrok entirely — set `GMAIL_RECONCILE_MINUTES=1` and use polling. See **[ENV_SETUP.md](./ENV_SETUP.md) Part 5**.
- Binary path: `tools\ngrok.exe` (not in git — download from ngrok if missing).
