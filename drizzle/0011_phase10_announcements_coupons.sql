ALTER TABLE bookings ADD COLUMN coupon_code TEXT;
--> statement-breakpoint
ALTER TABLE bookings ADD COLUMN coupon_discount INTEGER;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  audience TEXT NOT NULL,
  audience_role TEXT,
  audience_user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL,
  discount_value INTEGER NOT NULL,
  min_amount INTEGER,
  expires_on TEXT,
  usage_limit INTEGER,
  service_slug TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  discount_amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
