# Database setup

This repository has two independent databases. Keep them separate.

| Service | Database | Schema source |
| --- | --- | --- |
| Approvals | `approvals` | `../backend/prisma/schema.prisma` and `../backend/prisma/migrations/` |
| Login-Auth | `login_auth` | its `backend/migrations/init_login_auth_db.sql` |

## Approvals

Set `DATABASE_URL` in the repository-root `.env`, then run:

```powershell
npm run db:deploy
npm run db:seed
```

`Employee.employeeId` is the primary unique employee key. The approvals database owns approval workflow data and its local session data only.

## Login-Auth

Login-Auth owns only authentication material (`auth_credentials`, TOTP data, and its employee-ID bridge). It must not write employee identity data into the approvals database.

In the separate Login-Auth repository, create `backend/.env` from `backend/.env.example`, set a dedicated `DATABASE_URL`, then create its database with:

```powershell
psql -f backend/migrations/init_login_auth_db.sql
```

When Central DB is available, Login-Auth reads employees through `CENTRAL_DB_URL` using `CENTRAL_DB_API_KEY`.
