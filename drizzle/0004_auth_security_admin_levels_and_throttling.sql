ALTER TABLE `users` ADD COLUMN `admin_level` text;
--> statement-breakpoint
UPDATE `users` SET `admin_level` = 'super' WHERE `role` = 'admin' AND `admin_level` IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_attempts` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scope` text NOT NULL,
  `key` text NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `window_start` integer NOT NULL,
  `locked_until` integer,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `auth_attempts_scope_key` ON `auth_attempts` (`scope`, `key`);
