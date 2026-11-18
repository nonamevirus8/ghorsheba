ALTER TABLE `settings` ADD COLUMN `business_address` text;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `office_hours` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `social_links` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `platform` text NOT NULL,
  `label` text,
  `url` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `subject` text NOT NULL,
  `category` text DEFAULT 'general' NOT NULL,
  `booking_code` text,
  `status` text DEFAULT 'open' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `support_tickets_code_unique` ON `support_tickets` (`code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_ticket_messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `ticket_id` integer NOT NULL REFERENCES `support_tickets`(`id`),
  `author_id` integer NOT NULL REFERENCES `users`(`id`),
  `author_role` text NOT NULL,
  `body` text NOT NULL,
  `created_at` integer NOT NULL
);
