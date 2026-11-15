// GhorSheba data model — Postgres edition.
//
// This is the same schema as the original Muse-platform build (which used
// SQLite): users, professionals, services, bookings, reviews,
// notifications, complaints, locations, platformSettings, adminLogs and
// sessions, plus a `blobs` table that replaces the platform's blob storage
// for uploaded photos. Column names and value domains are unchanged so the
// server actions work identically.

import { customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) =>
  timestamp(name, { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date());

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["customer", "professional", "admin"] })
    .notNull()
    .default("customer"),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  address: text("address"),
  location: text("location"), // upazila name (Bengali)
  photoKey: text("photo_key"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const professionals = pgTable("professionals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  categorySlug: text("category_slug").notNull(),
  experienceYears: integer("experience_years").notNull().default(0),
  skills: text("skills"),
  areas: text("areas").notNull().default("[]"), // JSON array of upazila names
  address: text("address"),
  email: text("email"),
  bio: text("bio"),
  // Collected for admin verification only; never returned by public actions.
  nidNumber: text("nid_number"),
  status: text("status", {
    enum: ["pending", "verified", "rejected", "suspended"],
  })
    .notNull()
    .default("pending"),
  available: integer("available").notNull().default(1),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const services = pgTable("services", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  nameBn: text("name_bn").notNull(),
  nameEn: text("name_en").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  icon: text("icon").notNull().default("tool"),
  startingPrice: integer("starting_price"),
  hourlyRate: integer("hourly_rate"),
  dailyRate: integer("daily_rate"),
  unitRate: integer("unit_rate"),
  unitLabel: text("unit_label"),
  inspectionFee: integer("inspection_fee"),
  priceNote: text("price_note"),
  active: integer("active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const locations = pgTable("locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nameEn: text("name_en").notNull().unique(),
  nameBn: text("name_bn").notNull(),
  district: text("district").notNull().default("টাঙ্গাইল"),
  active: integer("active").notNull().default(1),
});

export const bookings = pgTable("bookings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  serviceSlug: text("service_slug").notNull(),
  professionalId: integer("professional_id").references(() => professionals.id),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  district: text("district").notNull().default("টাঙ্গাইল"),
  upazila: text("upazila").notNull(),
  area: text("area"),
  address: text("address").notNull(),
  description: text("description").notNull(),
  instructions: text("instructions"),
  photoKeys: text("photo_keys").notNull().default("[]"), // JSON array of blob keys
  preferredDate: text("preferred_date").notNull(), // YYYY-MM-DD as entered
  preferredTime: text("preferred_time").notNull(),
  status: text("status", {
    enum: [
      "pending",
      "confirmed",
      "assigned",
      "in_progress",
      "completed",
      "cancelled",
    ],
  })
    .notNull()
    .default("pending"),
  proResponse: text("pro_response", { enum: ["none", "accepted", "rejected"] })
    .notNull()
    .default("none"),
  proDone: integer("pro_done").notNull().default(0),
  finalPrice: integer("final_price"),
  paymentStatus: text("payment_status", { enum: ["unpaid", "cash_paid"] })
    .notNull()
    .default("unpaid"),
  adminNote: text("admin_note"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const bookingEvents = pgTable("booking_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  status: text("status").notNull(),
  note: text("note"),
  actorRole: text("actor_role").notNull(),
  createdAt: ts("created_at"),
});

export const reviews = pgTable("reviews", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bookingId: integer("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  professionalId: integer("professional_id").references(() => professionals.id),
  serviceSlug: text("service_slug").notNull(),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: ts("created_at"),
});

export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  targetRole: text("target_role"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  bookingId: integer("booking_id").references(() => bookings.id),
  isRead: integer("is_read").notNull().default(0),
  createdAt: ts("created_at"),
});

export const complaints = pgTable("complaints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  bookingCode: text("booking_code"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status", { enum: ["open", "resolved"] })
    .notNull()
    .default("open"),
  adminNote: text("admin_note"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  commissionPercent: integer("commission_percent").notNull().default(10),
  supportPhone: text("support_phone"),
  supportWhatsapp: text("support_whatsapp"),
  supportEmail: text("support_email"),
  announcement: text("announcement"),
  updatedAt: ts("updated_at"),
});

export const adminLogs = pgTable("admin_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  adminId: integer("admin_id").references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: ts("created_at"),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: ts("created_at"),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
});

// Uploaded photos (profile pictures, booking photos). Replaces the Muse
// platform's blob storage: bytes live in Postgres, keyed by the same
// `photo_key` strings the app already stores on users/bookings, and are
// served through `/api/blob?key=...`.
export const blobs = pgTable("blobs", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: ts("created_at"),
});
