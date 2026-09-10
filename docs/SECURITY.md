# Security

Org-oriented controls built into the Approvals App.

## Authentication & sessions

- **SSO-only** via Login-Auth ↔ central_db. No local password path.
- Login-Auth mints an **HS256 JWT**; approvals verifies with `LOGIN_AUTH_JWT_SECRET` and optional `iss` / `aud` enforcement.
- After JWT verify, approvals looks the employee up in **central_db** under the `approvals` scope. Not present → 401. Not active → 401. Central unreachable → 503 (fail-closed, matches LMA + HR Portal).
- Every authenticated request re-verifies `is_active` against central. HR-side deactivation revokes access within one request.
- **HttpOnly** session cookie (`approvals_token`); no bearer tokens in the browser.
- Session lifetime **12 hours** (`SESSION_MAX_AGE_SECONDS`).
- Cookie includes `tokenVersion`; logout / central-side deactivation **invalidate** old sessions.
- Rate limit: **10 SSO callbacks / minute** per IP; global **~120 req/min** in production.

## Authorization

- Party-only access to approvals (requester / approver / participant).
- Admin override for decide requires a **reason** and is audited.
- Admin APIs and UI gated (`requireAdmin` + `AdminOnly`).
- USER/ADMIN is a local, dev-assigned distinction on the approvals DB. Central holds no `approvals_role`; SSO claims are never used to elevate.
- Email simulation (`/admin/simulate-email`) **disabled in production**.

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
- No passwords stored at all (SSO-only)
- Activity log records SSO login success/failure, decisions, admin actions

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
