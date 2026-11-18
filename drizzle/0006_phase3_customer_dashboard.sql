ALTER TABLE `settings` ADD COLUMN `payment_receive_number` text;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `payment_receive_provider` text;
--> statement-breakpoint
DROP INDEX IF EXISTS `payments_provider_trx_id_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payments_provider_trx_unique` ON `payments` (`provider`, `provider_trx_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `addresses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `label` text NOT NULL,
  `upazila` text NOT NULL,
  `area` text,
  `address` text NOT NULL,
  `phone` text,
  `is_default` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `addresses_user_idx` ON `addresses` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `refund_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `booking_id` integer NOT NULL REFERENCES `bookings`(`id`),
  `customer_id` integer NOT NULL REFERENCES `users`(`id`),
  `payment_id` integer REFERENCES `payments`(`id`),
  `reason` text NOT NULL,
  `detail` text NOT NULL,
  `status` text DEFAULT 'requested' NOT NULL,
  `admin_note` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `refund_requests_customer_idx` ON `refund_requests` (`customer_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `refund_requests_booking_idx` ON `refund_requests` (`booking_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `account_deletion_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `reason` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_deletion_requests_user_idx` ON `account_deletion_requests` (`user_id`);
