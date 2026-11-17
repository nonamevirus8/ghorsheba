# Migration 0002 — Dual Payment Phase 1 (Postgres / Supabase)

Adds the Dual Payment data model to the **existing** GhorSheba Postgres
database. Nothing else changes: no table is dropped, no existing column
is altered, no existing row is rewritten, and the `bookings.status`
workflow is untouched.

## What it adds

New tables:

- `payments` — customer payment claims (Phase 1: manual TrxID route).
- `payment_ledger` — immutable, append-only financial entries. No action
  in the codebase updates or deletes these rows; corrections are new
  `adjustment` entries.
- `withdrawal_requests` — professional payout/withdrawal requests.

New columns:

- `bookings`: `payment_model`, `customer_fee_percent`,
  `pro_commission_percent`, `calc_base`, `online_amount`, `cash_amount`,
  `customer_fee`, `pro_commission`, `held_balance`,
  `extended_payment_status` (default `'unpaid'`).
- `professionals`: `withdrawal_method`, `withdrawal_number`.
- `settings`: `full_online_customer_fee_percent` (default 0),
  `full_online_pro_commission_percent` (default 10),
  `split_customer_fee_percent` (default 3),
  `split_pro_commission_percent` (default 6).

New indexes: `payments_booking_idx`, `payment_ledger_booking_idx`,
`withdrawal_requests_pro_idx`.

The migration is **idempotent** (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`): applying it
twice is safe and changes nothing the second time. The app also applies
it automatically on first request and records it in
`_ghorsheba_migrations`.

## Backup — do this BEFORE applying

Option A — Supabase dashboard (no local tools needed):

1. Supabase project → **Database → Backups** → confirm a recent backup
   exists, or use **SQL Editor** to export the tables you care about.
2. For a full logical backup use **Database → Database dumps** if your
   plan offers it.

Option B — `pg_dump` from your machine (uses the same `DATABASE_URL`
the app uses; never commit the URL or the dump's credentials anywhere):

```bash
pg_dump "$DATABASE_URL" --format=custom --file=ghorsheba-backup-before-0002.dump
# sanity check the dump is readable:
pg_restore --list ghorsheba-backup-before-0002.dump | head
```

Keep the dump file outside the repository.

## Apply

Either let the app do it (deploy, then make any request — the migration
runner applies `drizzle/0002_dual_payment.sql` on first request), or run
it manually:

```bash
psql "$DATABASE_URL" -f portable/drizzle/0002_dual_payment.sql
```

Verify afterwards:

```sql
SELECT name FROM _ghorsheba_migrations WHERE name = '0002_dual_payment.sql';
SELECT count(*) FROM services;   -- still 12
SELECT count(*) FROM locations;  -- still 12
```

## Rollback

Rollback removes **only** what this migration added. All pre-existing
tables, columns and rows (customers, professionals, bookings, reviews,
…) stay exactly as they were. Any payments / ledger / withdrawal rows
created after the migration **will be lost** — export them first if
they matter:

```bash
pg_dump "$DATABASE_URL" --data-only \
  --table=payments --table=payment_ledger --table=withdrawal_requests \
  --file=dual-payment-rows-before-rollback.sql
```

Then run:

```sql
DROP TABLE IF EXISTS withdrawal_requests;
DROP TABLE IF EXISTS payment_ledger;
DROP TABLE IF EXISTS payments;

ALTER TABLE bookings
  DROP COLUMN IF EXISTS payment_model,
  DROP COLUMN IF EXISTS customer_fee_percent,
  DROP COLUMN IF EXISTS pro_commission_percent,
  DROP COLUMN IF EXISTS calc_base,
  DROP COLUMN IF EXISTS online_amount,
  DROP COLUMN IF EXISTS cash_amount,
  DROP COLUMN IF EXISTS customer_fee,
  DROP COLUMN IF EXISTS pro_commission,
  DROP COLUMN IF EXISTS held_balance,
  DROP COLUMN IF EXISTS extended_payment_status;

ALTER TABLE professionals
  DROP COLUMN IF EXISTS withdrawal_method,
  DROP COLUMN IF EXISTS withdrawal_number;

ALTER TABLE settings
  DROP COLUMN IF EXISTS full_online_customer_fee_percent,
  DROP COLUMN IF EXISTS full_online_pro_commission_percent,
  DROP COLUMN IF EXISTS split_customer_fee_percent,
  DROP COLUMN IF EXISTS split_pro_commission_percent;

DELETE FROM _ghorsheba_migrations WHERE name = '0002_dual_payment.sql';
```

(The three indexes are dropped automatically with their tables.)

## Notes

- The Muse-platform (SQLite) edition of GhorSheba carries the same
  change as `drizzle/0003_dual_payment.sql`; its rollback is the same
  list of `DROP TABLE` / `ALTER TABLE … DROP COLUMN` statements in
  SQLite syntax, applied in reverse dependency order
  (`withdrawal_requests`, `payment_ledger`, `payments` first).
- Commission rates live in `settings`; each booking snapshots the rates
  and calculation base when its price is confirmed, so changing rates
  later never rewrites an old booking's figures.
