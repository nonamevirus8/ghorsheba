-- Master Phase 10 — Notifications / Reviews / Marketing (portable Postgres edition).
--
-- Adds:
--   announcements — the record of every MANUAL announcement an admin
--     sends (sender, audience: all / one role / one user, text, time,
--     recipient count). Delivery itself is one notifications row per
--     recipient (type "announcement"), so read/unread stays per-user.
--   coupons — admin-configured discount codes ONLY (fixed taka or
--     percent off the eligible charge, optional expiry date, usage
--     limit, minimum bill amount and service restriction). No coupon
--     exists unless an admin created it here.
--   coupon_redemptions — one row per actual use, written with the
--     price confirmation that applied it; usage stats are counted
--     from these rows. Unique booking_id: one coupon use per booking.
--   bookings.coupon_code / coupon_discount — the discount recorded on
--     the booking at price confirmation (quotation approval); the
--     booking's final_price and calc_base already include it, and the
--     Dual Payment commission base is the DISCOUNTED eligible charge.
--
-- No existing row is rewritten; all changes are additive.
-- Fully idempotent: safe to re-apply over a populated database.
-- Backup: take a Supabase dashboard backup or `pg_dump` before
-- applying. Rollback (drops only what this migration added):
--   ALTER TABLE bookings DROP COLUMN IF EXISTS coupon_discount;
--   ALTER TABLE bookings DROP COLUMN IF EXISTS coupon_code;
--   DROP TABLE IF EXISTS coupon_redemptions;
--   DROP TABLE IF EXISTS coupons;
--   DROP TABLE IF EXISTS announcements;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_discount integer;
CREATE TABLE IF NOT EXISTS announcements (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  admin_id integer NOT NULL REFERENCES users(id),
  audience text NOT NULL,
  audience_role text,
  audience_user_id integer REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  recipient_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coupons (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL,
  discount_value integer NOT NULL,
  min_amount integer,
  expires_on text,
  usage_limit integer,
  service_slug text,
  active integer NOT NULL DEFAULT 1,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  coupon_id integer NOT NULL REFERENCES coupons(id),
  booking_id integer NOT NULL UNIQUE REFERENCES bookings(id),
  customer_id integer NOT NULL REFERENCES users(id),
  discount_amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
