-- GhorSheba — Master Phase 3: customer dashboard + checkout support,
-- plus audit fix D-1 (TrxID uniqueness is per-provider, not global).
--
-- Changes:
--   1. settings gains the manual-payment receiving MFS number +
--      provider (shown at checkout once an admin sets them; NULL until
--      then — no number is invented).
--   2. D-1: the payments table's column-level UNIQUE on
--      provider_trx_id (constraint payments_provider_trx_id_key) is
--      replaced by a composite UNIQUE index on (provider,
--      provider_trx_id). All existing rows are preserved — the change
--      only RELAXES which future rows are accepted (the same TrxID on
--      a different provider), it cannot invalidate existing data.
--   3. New tables: addresses (customer saved addresses),
--      refund_requests (customer refund requests — request only, no
--      money moves), account_deletion_requests.
--
-- Additive and idempotent (safe to re-apply). Backup before applying
-- (Supabase dashboard → Database → Backups, or pg_dump). Rollback:
--   DROP TABLE IF EXISTS account_deletion_requests;
--   DROP TABLE IF EXISTS refund_requests;
--   DROP TABLE IF EXISTS addresses;
--   DROP INDEX IF EXISTS payments_provider_trx_unique;
--   ALTER TABLE payments ADD CONSTRAINT payments_provider_trx_id_key
--     UNIQUE (provider_trx_id);  -- only valid if no cross-provider
--     duplicate TrxIDs were submitted while D-1 was in effect
--   ALTER TABLE settings DROP COLUMN IF EXISTS payment_receive_provider;
--   ALTER TABLE settings DROP COLUMN IF EXISTS payment_receive_number;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS payment_receive_number TEXT;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN IF NOT EXISTS payment_receive_provider TEXT;
--> statement-breakpoint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_trx_id_key;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_trx_unique ON payments (provider, provider_trx_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS addresses (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL REFERENCES users(id),
  label text NOT NULL,
  upazila text NOT NULL,
  area text,
  address text NOT NULL,
  phone text,
  is_default integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS addresses_user_idx ON addresses (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS refund_requests (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id integer NOT NULL REFERENCES bookings(id),
  customer_id integer NOT NULL REFERENCES users(id),
  payment_id integer REFERENCES payments(id),
  reason text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS refund_requests_customer_idx ON refund_requests (customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS refund_requests_booking_idx ON refund_requests (booking_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id integer NOT NULL REFERENCES users(id),
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS account_deletion_requests_user_idx ON account_deletion_requests (user_id);
