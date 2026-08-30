# Security

Org-oriented controls built into the Approvals App.

## Authentication & sessions

- Email/password login with **bcrypt** (12 rounds)
- **HttpOnly** session cookie (`approvals_token`); no bearer tokens in the browser
- Session lifetime **12 hours** (`SESSION_MAX_AGE_SECONDS`)
- Cookie includes `tokenVersion`; logout / password change / deactivate **invalidate** old sessions
- Inactive users cannot authenticate
- After **5 failed logins**, account locks for **15 minutes**
- Login rate limit: **5 attempts / 15 minutes** per IP
- New users and bootstrap admin: **must change password** before using the app
- Password policy: 12+ chars, upper + lower + number + symbol; common phrases blocked

## Authorization

- Party-only access to approvals (requester / approver / participant)
- Admin override for decide requires a **reason** and is audited
- Admin APIs and UI gated (`requireAdmin` + `AdminOnly`)
- Cannot deactivate yourself or remove the **last admin**
- Email simulation (`/admin/simulate-email`) **disabled in production**

## API hardening

- CORS limited to `FRONTEND_URL` (+ optional `CORS_ORIGIN`)
- **Origin / Referer check** on mutating requests (CSRF defense for cookie sessions)
- Helmet security headers on the API
- Global rate limit (~120 req/min in production)
- Request body limit 256 KB; 30s request timeout
- Production: strong `JWT_SECRET` required; `GMAIL_PUSH_TOKEN` required
- Webhook push token compared with constant-time equality
- Gmail OAuth uses a **state** cookie to prevent CSRF

## Data

- Source of truth: PostgreSQL (`Approval`, `Party`, `Decision`, `ActivityLog`, …)
- Passwords never stored in plaintext
- Activity log records login success/failure, user admin changes, decisions

## Operator checklist

1. Set a long random `JWT_SECRET` (32+ characters)
2. Set a strong unique `GMAIL_PUSH_TOKEN` and keep the webhook URL private
3. Change the bootstrap admin password immediately (`/account/password`)
4. Create people with temporary passwords; they must change on first login
5. Deactivate leavers under **People** (invalidates their sessions)
6. Never commit `.env`; store secrets in a vault in production
7. Serve the app over **HTTPS** in production (`secure` cookies)
8. Use one browser profile per tester account (tabs share the same session cookie)

## Frontend headers

Next.js sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict referrer policy.
