-- Master Phase 6 — Social Media, Contact + Support (portable Postgres edition).
--
-- Adds:
--   settings.business_address / settings.office_hours — owner-filled
--     public contact details for the Contact page and footer. NULL
--     until the owner sets them; the UI shows nothing while empty.
--   social_links — owner-supplied social media links (platform, label,
--     URL, enabled flag, display order). Starts EMPTY by design: no
--     seed rows, no placeholder accounts (audit Decision 4). The site
--     renders only enabled rows; an empty table means no social icons
--     anywhere. URLs are validated server-side per platform domain.
--   support_tickets + support_ticket_messages — the support ticket
--     system (open → in_progress → waiting_customer → resolved →
--     closed). One owner per ticket; only the owner or a support/super
--     admin can read or post to a thread. The existing `complaints`
--     table and flow are untouched.
--
-- Fully idempotent: safe to re-apply over a populated database.
-- Backup: take a Supabase dashboard backup or `pg_dump` before
-- applying. Rollback (drops only what this migration added):
--   DROP TABLE IF EXISTS support_ticket_messages;
--   DROP TABLE IF EXISTS support_tickets;
--   DROP TABLE IF EXISTS social_links;
--   ALTER TABLE settings DROP COLUMN IF EXISTS office_hours;
--   ALTER TABLE settings DROP COLUMN IF EXISTS business_address;
-- No existing rows are changed by this migration.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_address text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS office_hours text;
CREATE TABLE IF NOT EXISTS social_links (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  platform text NOT NULL,
  label text,
  url text NOT NULL,
  enabled integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code text NOT NULL UNIQUE,
  user_id integer NOT NULL REFERENCES users(id),
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  booking_code text,
  status text NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ticket_id integer NOT NULL REFERENCES support_tickets(id),
  author_id integer NOT NULL REFERENCES users(id),
  author_role text NOT NULL,
  body text NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id);
