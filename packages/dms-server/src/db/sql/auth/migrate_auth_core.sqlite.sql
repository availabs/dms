-- Idempotent migrations for auth tables (SQLite). See migrate_auth_core.sql
-- for the contract; this is the SQLite dialect of the same migrations.

-- `failed_logins` was missing from auth_tables.sqlite.sql entirely (not just
-- this migration file) — checkIfIpIsLocked/insertFailedLoginAttempt in
-- auth/utils/queries.js have always assumed it exists, so any SQLite auth
-- database created before this fix has no table backing the login-lockout
-- check and every login attempt fails with "no such table: failed_logins".
-- See auth_tables.sqlite.sql for the matching create-script fix (covers
-- fresh databases; this covers existing ones).
CREATE TABLE IF NOT EXISTS failed_logins (
    ip TEXT NOT NULL,
    attempted_at TEXT DEFAULT (datetime('now')) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_failed_logins_ip ON failed_logins(ip);
