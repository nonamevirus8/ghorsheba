-- Master Phase 4 — Professional Dashboard (portable Postgres edition).
--
-- Adds two nullable columns to `professionals`:
--   available_days    — JSON array of weekday numbers (0 = Sunday …
--                       6 = Saturday) the professional works; NULL
--                       means no per-day restriction.
--   verification_note — the admin's note on the latest verification
--                       decision, shown to the professional (e.g. the
--                       reason an application was rejected).
--
-- Backup: take a Supabase dashboard backup or `pg_dump` before
-- applying. Rollback: both columns are additive and nullable; older
-- code ignores them, so rollback is optional — if needed:
--   ALTER TABLE professionals DROP COLUMN IF EXISTS available_days;
--   ALTER TABLE professionals DROP COLUMN IF EXISTS verification_note;
-- No existing rows are changed by this migration.
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS available_days text;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verification_note text;
