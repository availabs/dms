-- Idempotent migrations for auth tables (PostgreSQL). See CLAUDE.md's
-- "Schema migrations" section for the contract this file follows.
--
-- Every statement here must be safe to re-run — this executes on every init.

-- `failed_logins` was missing from auth_tables.sql entirely (not just this
-- migration file) — checkIfIpIsLocked/insertFailedLoginAttempt in
-- auth/utils/queries.js have always assumed it exists, so any pgEnv created
-- before this fix has no table backing the login-lockout check and every
-- login attempt fails. See auth_tables.sql for the matching create-script fix
-- (covers fresh databases; this covers existing ones).
CREATE TABLE IF NOT EXISTS public.failed_logins (
    ip text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_failed_logins_ip ON public.failed_logins(ip);
