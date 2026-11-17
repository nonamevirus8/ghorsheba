ALTER TABLE `settings` ADD COLUMN `full_online_customer_fee_percent` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `full_online_pro_commission_percent` integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `split_customer_fee_percent` integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `split_pro_commission_percent` integer DEFAULT 6 NOT NULL;
--> statement-breakpoint
ALTER TABLE `professionals` ADD COLUMN `withdrawal_method` text;
--> statement-breakpoint
ALTER TABLE `professionals` ADD COLUMN `withdrawal_number` text;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `payment_model` text;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `customer_fee_percent` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `pro_commission_percent` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `calc_base` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `online_amount` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `cash_amount` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `customer_fee` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `pro_commission` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `held_balance` integer;
--> statement-breakpoint
ALTER TABLE `bookings` ADD COLUMN `extended_payment_status` text DEFAULT 'unpaid' NOT NULL;
--> statement-breakpoint
CREATE TABLE `payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `booking_id` integer NOT NULL REFERENCES `bookings`(`id`),
  `payment_model` text NOT NULL,
  `method` text DEFAULT 'manual_trxid' NOT NULL,
  `provider` text NOT NULL,
  `provider_trx_id` text NOT NULL,
  `sender_number` text,
  `amount` integer NOT NULL,
  `currency` text DEFAULT 'BDT' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `idempotency_key` text NOT NULL,
  `submitted_by` integer NOT NULL REFERENCES `users`(`id`),
  `verified_by` integer REFERENCES `users`(`id`),
  `verified_at` integer,
  `rejection_reason` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_trx_id_unique` ON `payments` (`provider_trx_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_key_unique` ON `payments` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `payments_booking_idx` ON `payments` (`booking_id`);
--> statement-breakpoint
CREATE TABLE `payment_ledger` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `booking_id` integer NOT NULL REFERENCES `bookings`(`id`),
  `payment_id` integer REFERENCES `payments`(`id`),
  `entry_type` text NOT NULL,
  `amount` integer NOT NULL,
  `actor_role` text NOT NULL,
  `admin_id` integer REFERENCES `users`(`id`),
  `reference` text,
  `note` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_ledger_booking_idx` ON `payment_ledger` (`booking_id`);
--> statement-breakpoint
CREATE TABLE `withdrawal_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `professional_id` integer NOT NULL REFERENCES `professionals`(`id`),
  `booking_id` integer REFERENCES `bookings`(`id`),
  `amount` integer NOT NULL,
  `withdrawal_method` text NOT NULL,
  `withdrawal_number` text NOT NULL,
  `status` text DEFAULT 'requested' NOT NULL,
  `admin_id` integer REFERENCES `users`(`id`),
  `transaction_reference` text,
  `rejection_reason` text,
  `requested_at` integer NOT NULL,
  `decided_at` integer,
  `paid_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `withdrawal_requests_pro_idx` ON `withdrawal_requests` (`professional_id`);
