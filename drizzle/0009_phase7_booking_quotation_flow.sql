CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_by_role TEXT NOT NULL,
  labour_charge INTEGER NOT NULL DEFAULT 0,
  materials_charge INTEGER NOT NULL DEFAULT 0,
  transport_charge INTEGER NOT NULL DEFAULT 0,
  additional_charge INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL,
  note TEXT,
  decided_by_user_id INTEGER REFERENCES users(id),
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN status_before_hold TEXT;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN price_finalized_via TEXT;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN reschedule_requested_date TEXT;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN reschedule_requested_time TEXT;
--> statement-breakpoint
UPDATE bookings SET price_finalized_via = 'admin' WHERE final_price IS NOT NULL AND price_finalized_via IS NULL;
