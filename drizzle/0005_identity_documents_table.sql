CREATE TABLE IF NOT EXISTS `identity_documents` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `professional_id` integer NOT NULL REFERENCES `professionals`(`id`),
  `kind` text NOT NULL,
  `content_type` text NOT NULL,
  `data_base64` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `identity_documents_professional_idx` ON `identity_documents` (`professional_id`);
