-- GhorSheba portable (Postgres) schema + seed.
--
-- Postgres version of the original SQLite migration
-- `drizzle/0002_ghorsheba_core_tables_and_catalog_seed.sql`: identical
-- tables, columns and seed data (12 services, 12 Tangail upazilas, one
-- settings row). Differences are dialect-only: identity primary keys,
-- TIMESTAMPTZ timestamps, plus a `blobs` table that replaces the Muse
-- platform's blob storage for uploaded photos.
--
-- The app applies this file automatically on first request (tracked in
-- `_ghorsheba_migrations`); it can also be run by hand in the Supabase
-- SQL editor or with `psql "$DATABASE_URL" -f <this file>`.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'active',
  address TEXT,
  location TEXT,
  photo_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS professionals (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  category_slug TEXT NOT NULL,
  experience_years INTEGER NOT NULL DEFAULT 0,
  skills TEXT,
  areas TEXT NOT NULL DEFAULT '[]',
  address TEXT,
  email TEXT,
  bio TEXT,
  nid_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  available INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'tool',
  starting_price INTEGER,
  hourly_rate INTEGER,
  daily_rate INTEGER,
  unit_rate INTEGER,
  unit_label TEXT,
  inspection_fee INTEGER,
  price_note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name_en TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  district TEXT NOT NULL DEFAULT 'টাঙ্গাইল',
  active INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  service_slug TEXT NOT NULL,
  professional_id INTEGER REFERENCES professionals(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  district TEXT NOT NULL DEFAULT 'টাঙ্গাইল',
  upazila TEXT NOT NULL,
  area TEXT,
  address TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT,
  photo_keys TEXT NOT NULL DEFAULT '[]',
  preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pro_response TEXT NOT NULL DEFAULT 'none',
  pro_done INTEGER NOT NULL DEFAULT 0,
  final_price INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  status TEXT NOT NULL,
  note TEXT,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  professional_id INTEGER REFERENCES professionals(id),
  service_slug TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id INTEGER REFERENCES users(id),
  target_role TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  booking_id INTEGER REFERENCES bookings(id),
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  booking_code TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  commission_percent INTEGER NOT NULL DEFAULT 10,
  support_phone TEXT,
  support_whatsapp TEXT,
  support_email TEXT,
  announcement TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  admin_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS blobs (
  key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO locations (name_en, name_bn, district, active) VALUES
  ('Tangail Sadar', 'টাঙ্গাইল সদর', 'টাঙ্গাইল', 1),
  ('Ghatail', 'ঘাটাইল', 'টাঙ্গাইল', 1),
  ('Kalihati', 'কালিহাতী', 'টাঙ্গাইল', 1),
  ('Mirzapur', 'মির্জাপুর', 'টাঙ্গাইল', 1),
  ('Sakhipur', 'সখীপুর', 'টাঙ্গাইল', 1),
  ('Basail', 'বাসাইল', 'টাঙ্গাইল', 1),
  ('Madhupur', 'মধুপুর', 'টাঙ্গাইল', 1),
  ('Nagarpur', 'নাগরপুর', 'টাঙ্গাইল', 1),
  ('Delduar', 'দেলদুয়ার', 'টাঙ্গাইল', 1),
  ('Bhuapur', 'ভূঞাপুর', 'টাঙ্গাইল', 1),
  ('Gopalpur', 'গোপালপুর', 'টাঙ্গাইল', 1),
  ('Dhanbari', 'ধনবাড়ী', 'টাঙ্গাইল', 1)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO services (slug, name_bn, name_en, tagline, description, icon, sort_order, created_at, updated_at) VALUES
  ('electrician', 'ইলেকট্রিশিয়ান', 'Electrician', 'ওয়ারিং, লাইট, ফ্যান ও সুইচের সব কাজ', 'বাসা-বাড়ির নতুন ওয়ারিং, লাইট-ফ্যান স্থাপন, সুইচ-সকেট মেরামত, লোড বণ্টন ও বৈদ্যুতিক ত্রুটি নির্ণয়।', 'bolt', 1, now(), now()),
  ('plumber', 'প্লাম্বার', 'Plumber', 'পানি, পাইপ ও স্যানিটারি কাজ', 'পানির লাইন, পাইপ ফিটিং, বেসিন-কমোড স্থাপন, লিকেজ মেরামত ও স্যানিটারি সংক্রান্ত সব কাজ।', 'droplet', 2, now(), now()),
  ('mason', 'রাজমিস্ত্রি', 'Mason', 'নির্মাণ, প্লাস্টার ও সংস্কার', 'ইটের গাঁথুনি, প্লাস্টার, ছাদ ঢালাইয়ের সহায়তা, সীমানা প্রাচীর ও ছোট-বড় নির্মাণ-সংস্কার কাজ।', 'brick', 3, now(), now()),
  ('painter', 'রংমিস্ত্রি', 'Painter', 'বাড়ি রং ও পেইন্টিং', 'বাসা-বাড়ি ও অফিসের ভেতর-বাইরের রং, পুট্টি, প্রাইমার ও ওয়াল ফিনিশিংয়ের কাজ।', 'roller', 4, now(), now()),
  ('carpenter', 'কাঠমিস্ত্রি', 'Carpenter', 'দরজা, জানালা ও ফার্নিচার', 'দরজা-জানালা তৈরি ও মেরামত, কাঠের ফার্নিচার, ওয়ারডরোব ও কিচেন ক্যাবিনেটের কাজ।', 'hammer', 5, now(), now()),
  ('ac-technician', 'এসি টেকনিশিয়ান', 'AC Technician', 'এসি সার্ভিসিং, গ্যাস ও মেরামত', 'এসি স্থাপন ও খোলা, সার্ভিসিং, গ্যাস রিফিল, লিক মেরামত ও সাধারণ ত্রুটি সারাই।', 'snow', 6, now(), now()),
  ('tile-worker', 'টাইলস মিস্ত্রি', 'Tile Worker', 'টাইলস বসানো ও মেরামত', 'ফ্লোর ও ওয়াল টাইলস বসানো, পুরনো টাইলস বদলি, মার্বেল ও মোজাইক কাজ।', 'grid', 7, now(), now()),
  ('welding', 'ওয়েল্ডিং', 'Welding', 'গেট, গ্রিল ও লোহার কাজ', 'লোহার গেট, জানালার গ্রিল, রেলিং তৈরি ও মেরামত এবং ওয়েল্ডিংয়ের সব ধরনের কাজ।', 'flame', 8, now(), now()),
  ('cleaning', 'ক্লিনিং', 'Cleaning', 'বাসা, অফিস ও ডিপ ক্লিনিং', 'বাসা-বাড়ি, অফিস, রান্নাঘর ও বাথরুমের নিয়মিত ও ডিপ ক্লিনিং সেবা।', 'sparkle', 9, now(), now()),
  ('glass-aluminium', 'গ্লাস ও অ্যালুমিনিয়াম', 'Glass & Aluminium', 'জানালা, দরজা ও পার্টিশন', 'অ্যালুমিনিয়াম জানালা-দরজা, গ্লাস পার্টিশন, থাই গ্লাস ও সংশ্লিষ্ট ফিটিংসের কাজ।', 'window', 10, now(), now()),
  ('renovation', 'বাড়ি সংস্কার', 'Renovation', 'সম্পূর্ণ বাড়ি সংস্কার', 'পুরনো বাড়ির সম্পূর্ণ সংস্কার — মিস্ত্রি, রং, টাইলস, প্লাম্বিং ও ইলেকট্রিক কাজের সমন্বিত সেবা।', 'home', 11, now(), now()),
  ('pest-control', 'পেস্ট কন্ট্রোল', 'Pest Control', 'পোকামাকড় দমন', 'তেলাপোকা, উইপোকা, ইঁদুর ও অন্যান্য পোকামাকড় দমনের নিরাপদ সেবা।', 'shield', 12, now(), now())
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO settings (id, commission_percent, updated_at) VALUES (1, 10, now())
ON CONFLICT DO NOTHING;
