-- GhorSheba Dual Payment — Phase 1 (Postgres).
--
-- Additive only: creates the payments / payment_ledger /
-- withdrawal_requests tables, adds nullable-or-defaulted columns to
-- bookings, professionals and settings, and seeds nothing into existing
-- rows beyond column defaults. No existing table, column or row is
-- altered in a breaking way, and `bookings.status` is untouched.
--
-- Fully idempotent: every statement uses IF NOT EXISTS / ON CONFLICT DO
-- NOTHING, so the file can be applied twice (or after a partial run)
-- without error and without changing existing data. The app applies it
-- automatically on first request (tracked in `_ghorsheba_migrations`);
-- it can also be run by hand in the Supabase SQL editor or with
-- `psql "$DATABASE_URL" -f <this file>`.
--
-- BACKUP before applying and ROLLBACK instructions: see
-- `portable/MIGRATION-0002.md`.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS full_online_customer_fee_percent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN IF NOT EXISTS full_online_pro_commission_percent INTEGER NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN IF NOT EXISTS split_customer_fee_percent INTEGER NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN IF NOT EXISTS split_pro_commission_percent INTEGER NOT NULL DEFAULT 6;
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS withdrawal_method TEXT;
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS withdrawal_number TEXT;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_model TEXT;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_fee_percent INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pro_commission_percent INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calc_base INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS online_amount INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cash_amount INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_fee INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pro_commission INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS held_balance INTEGER;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extended_payment_status TEXT NOT NULL DEFAULT 'unpaid';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  payment_model TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual_trxid',
  provider TEXT NOT NULL,
  provider_trx_id TEXT NOT NULL UNIQUE,
  sender_number TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payment_ledger (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  payment_id INTEGER REFERENCES payments(id),
  entry_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  admin_id INTEGER REFERENCES users(id),
  reference TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  booking_id INTEGER REFERENCES bookings(id),
  amount INTEGER NOT NULL,
  withdrawal_method TEXT NOT NULL,
  withdrawal_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  admin_id INTEGER REFERENCES users(id),
  transaction_reference TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_ledger_booking_idx ON payment_ledger (booking_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS withdrawal_requests_pro_idx ON withdrawal_requests (professional_id);
