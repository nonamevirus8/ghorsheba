-- GhorSheba Master Phase 2 — authentication & role security (Postgres).
--
-- Additive and idempotent: safe to re-run over a database that already
-- has these changes. No existing rows are removed or altered except
-- that pre-existing admin accounts (created before permission levels
-- existed) are marked 'super', matching the server-side default.
--
-- Backup before applying (Supabase dashboard → Database → Backups, or):
--   pg_dump "$DATABASE_URL" > ghorsheba-backup-before-0003.sql
-- Rollback (only if this migration must be undone):
--   DROP TABLE IF EXISTS auth_attempts;
--   ALTER TABLE users DROP COLUMN IF EXISTS admin_level;

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level text;
--> statement-breakpoint
UPDATE users SET admin_level = 'super' WHERE role = 'admin' AND admin_level IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_attempts (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scope text NOT NULL,
  key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS auth_attempts_scope_key ON auth_attempts (scope, key);
