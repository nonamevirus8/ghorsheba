ALTER TABLE withdrawal_requests ADD COLUMN hold_reason TEXT;
--> statement-breakpoint
ALTER TABLE refund_requests ADD COLUMN refund_amount INTEGER;
--> statement-breakpoint
ALTER TABLE refund_requests ADD COLUMN refund_reference TEXT;
--> statement-breakpoint
ALTER TABLE refund_requests ADD COLUMN decided_by INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE refund_requests ADD COLUMN decided_at INTEGER;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cancel_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  admin_note TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
