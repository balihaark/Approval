-- Run as a PostgreSQL superuser, then point DATABASE_URL at this role.
CREATE USER approvals WITH PASSWORD 'approvals';
CREATE DATABASE approvals OWNER approvals;
GRANT ALL PRIVILEGES ON DATABASE approvals TO approvals;
