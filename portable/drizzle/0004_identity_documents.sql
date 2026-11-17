-- GhorSheba — professional identity documents (owner's NID policy,
-- decided 2026-11-17).
--
-- Stores the NID front photo and the NID back photo uploaded at
-- professional registration. Bytes live ONLY in this
-- table (base64 text) — never in the public `blobs` table — so the
-- public /api/blob endpoint cannot serve them. The only read path is
-- the getIdentityDocument action (owning professional, or an
-- operations/super admin whose view is written to the admin log).
--
-- Retention: documents are kept while the professional's account
-- exists; the owner has not set a time limit — that decision is
-- still open.
--
-- Additive and idempotent. Backup before applying (Supabase dashboard
-- → Database → Backups, or pg_dump). Rollback:
--   DROP TABLE IF EXISTS identity_documents;

CREATE TABLE IF NOT EXISTS identity_documents (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  professional_id integer NOT NULL REFERENCES professionals(id),
  kind text NOT NULL,
  content_type text NOT NULL,
  data_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS identity_documents_professional_idx ON identity_documents (professional_id);
