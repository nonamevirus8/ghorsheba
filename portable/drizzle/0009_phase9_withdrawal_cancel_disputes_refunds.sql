-- Master Phase 9 — Withdrawal / Refund / Disputes (portable Postgres edition).
--
-- Adds:
--   withdrawal_requests.hold_reason — why a finance admin froze a
--     withdrawal request (new status value "held"; the status column
--     is plain text in both databases, so no enum change is needed).
--     "paid" is reached only when the admin records the real transfer
--     reference in adminDecideWithdrawal.
--   refund_requests.refund_amount / refund_reference / decided_by /
--     decided_at — the finance admin's recorded refund decision: a
--     request reaches "refunded" only with a real transfer recorded.
--   cancel_requests — customer cancellation REQUESTS (owner's Phase 9
--     flow): requested → under_review (Waiting) → approved (Complete:
--     booking cancelled) / rejected (booking continues). The booking
--     itself is untouched until an admin approves.
--
-- No existing row is rewritten; all changes are additive.
-- Fully idempotent: safe to re-apply over a populated database.
-- Backup: take a Supabase dashboard backup or `pg_dump` before
-- applying. Rollback (drops only what this migration added):
--   DROP TABLE IF EXISTS cancel_requests;
--   ALTER TABLE refund_requests DROP COLUMN IF EXISTS decided_at;
--   ALTER TABLE refund_requests DROP COLUMN IF EXISTS decided_by;
--   ALTER TABLE refund_requests DROP COLUMN IF EXISTS refund_reference;
--   ALTER TABLE refund_requests DROP COLUMN IF EXISTS refund_amount;
--   ALTER TABLE withdrawal_requests DROP COLUMN IF EXISTS hold_reason;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS hold_reason text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS refund_amount integer;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS refund_reference text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS decided_by integer REFERENCES users(id);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS decided_at timestamptz;
CREATE TABLE IF NOT EXISTS cancel_requests (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id integer NOT NULL REFERENCES bookings(id),
  customer_id integer NOT NULL REFERENCES users(id),
  reason text,
  status text NOT NULL DEFAULT 'requested',
  admin_note text,
  decided_by integer REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
