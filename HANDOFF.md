# Manager handoff

## Repository layout

- `backend/` — Approvals API and Prisma migrations.
- `frontend/` — Approvals web application.
- `database/` — database ownership and setup guide.
- `login-auth/` — local reference checkout of the separate manager-owned Login-Auth repository. It is intentionally ignored and is not part of this repository.

## Local approvals run

1. Copy `.env.example` to `.env` and fill the approvals/Gmail values.
2. Run `npm install`.
3. Run `npm run db:deploy` and `npm run db:seed`.
4. Run `npm run dev`.

## Login-Auth run with mock SMS

1. Clone the manager-owned Login-Auth repository separately, then copy its `backend/.env.example` to `backend/.env`.
2. Use a dedicated Login-Auth database, not the approvals database.
3. Set `MSG91_MOCK=true` and set `MSG91_API_KEY`, `MSG91_TEMPLATE_ID`, and `MSG91_SENDER_ID` to non-empty placeholder values such as `mock`. The current Login-Auth startup validation requires them even in mock mode.
4. Configure `CENTRAL_DB_URL` and `CENTRAL_DB_API_KEY` when the Central DB service is available.
5. Run Login-Auth's fresh-install database script described in `database/README.md`, install its backend/frontend dependencies, then start its backend and frontend.

## Central DB contract

Login-Auth expects an HTTP service, not a PostgreSQL connection string:

```text
GET /api/employees/by-email?email=<work-email>
GET /api/employees/by-mobile?mobile=<10-digit-mobile>
Header: x-api-key: <CENTRAL_DB_API_KEY>
```

For each active employee, Central DB must return `emp_id`, `email`, `first_name`, `mobile_number`, `employment_status`, and the app-role fields used by Login-Auth.

## SSO cutover

The current Approvals app remains fully functional with local employee login. Set Login-Auth's browser URL through `NEXT_PUBLIC_LOGIN_AUTH_URL` in `frontend/.env.local`. Do not enable Central-DB SSO until Login-Auth and Approvals agree on the token contract: signing algorithm/key distribution, issuer, audience, stable employee identifier, callback URL, and logout/revocation behavior.

Use a production secret manager for all `.env` values. Do not commit `.env` files or Gmail, Central DB, JWT, or MSG91 credentials.
