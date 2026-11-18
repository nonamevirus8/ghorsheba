-- Master Phase 7 — Booking + Quotation (portable Postgres edition).
--
-- Adds:
--   quotations — itemized price quotations (labour / materials /
--     transport / additional charges) created by an admin or the
--     assigned professional. A booking's price becomes final ONLY
--     when the customer approves a quotation; "additional" quotations
--     cover extra work and add to the finalized price on approval.
--   bookings.status_before_hold — the raw status a booking was in
--     when parked in "disputed" / "rescheduled"; restoring returns
--     it to exactly that status.
--   bookings.price_finalized_via — "quotation" (customer-approved,
--     price locked) or "admin" (legacy direct admin pricing). The
--     backfill below marks every already-priced booking "admin",
--     which is how those prices were in fact set before Phase 7.
--   bookings.reschedule_requested_date / _time — a customer's
--     pending reschedule request, confirmed or declined by an admin.
--
-- Status flow: NO existing booking row is rewritten. The legacy
-- status values "confirmed" / "completed" keep their stored values
-- and are mapped onto the master-flow stages (price_confirmed /
-- customer_confirmed) in server code (bookingStage), so every
-- existing booking's stage and its booking_events history stay
-- exactly as they were.
--
-- Fully idempotent: safe to re-apply over a populated database.
-- Backup: take a Supabase dashboard backup or `pg_dump` before
-- applying. Rollback (drops only what this migration added):
--   DROP TABLE IF EXISTS quotations;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS reschedule_requested_time;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS reschedule_requested_date;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS price_finalized_via;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS status_before_hold;
CREATE TABLE IF NOT EXISTS quotations (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id integer NOT NULL REFERENCES bookings(id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval',
  created_by_user_id integer NOT NULL REFERENCES users(id),
  created_by_role text NOT NULL,
  labour_charge integer NOT NULL DEFAULT 0,
  materials_charge integer NOT NULL DEFAULT 0,
  transport_charge integer NOT NULL DEFAULT 0,
  additional_charge integer NOT NULL DEFAULT 0,
  total_amount integer NOT NULL,
  note text,
  decided_by_user_id integer REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_before_hold text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_finalized_via text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_requested_date text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_requested_time text;
UPDATE bookings SET price_finalized_via = 'admin' WHERE final_price IS NOT NULL AND price_finalized_via IS NULL;
