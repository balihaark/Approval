

## Repository layout

- `backend/` — Approvals API and Prisma migrations.
- `frontend/` — Approvals web application.
- `database/` — database ownership and setup guide.
- `login-auth/` — local reference checkout of the separate Login-Auth repository. It is intentionally ignored and is not part of this repository.

## Local approvals run

1. Copy `.env.example` to `.env` and fill the approvals/Gmail values.
2. Run `npm install`.
3. Run `npm run db:deploy` and `npm run db:seed`.
4. Run `npm run dev`.

## Login-Auth run with mock SMS

1. Clone the Login-Auth repository separately, then copy its `backend/.env.example` to `backend/.env`.
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

## SSO + Central DB (required)

Post 2026-09-09 cutover, Approvals authenticates exclusively via Login-Auth SSO and looks up every employee against Central DB under the `approvals` scope. **Entry is via bpi-main's workspace launcher**, not a standalone button on approvals — see [CLAUDE.md § SSO handoff](CLAUDE.md).

Three coordinated pieces:

1. **Login-Auth** — `Approvals` in the `allowedApps` list inside `generateAppToken`.
2. **bpi-main** — `NEXT_PUBLIC_APPROVALS_URL` + the Approvals tile in `dashboard/employee/page.js`.
3. **Approvals** —

   ```dotenv
   # backend/.env
   LOGIN_AUTH_JWT_SECRET=<same HS256 secret Login-Auth signs with>
   CENTRAL_DB_URL=https://central.example.com
   APPROVALS_API_KEY=<matches central's APPROVALS_API_KEY env var>

   # frontend/.env.local
   NEXT_PUBLIC_BPI_MAIN_URL=https://blauplug.example.com
   ```

The per-app JWT minted by Login-Auth carries `email`, `emp_id`, `central_emp_id`, `first_name`, `role`, `appId: "Approvals"`. Approvals only trusts `email` + optional `emp_id`/`central_emp_id`/`first_name`; central is the source of truth for identity + activity. Any `role`/`roles.*` claim is ignored — USER/ADMIN is local and dev-assigned.

Use a production secret manager for all `.env` values. Do not commit `.env` files or Gmail, Central DB, JWT, or MSG91 credentials.
