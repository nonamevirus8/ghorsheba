// GhorSheba data model — mirrors the prompt's logical collections
// (users, professionals, services, bookings, reviews, notifications,
// complaints, locations, platformSettings, adminLogs) plus sessions
// and booking status-history events.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const ts = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const professionals = sqliteTable("professionals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameEn: text("name_en").notNull().unique(),
  nameBn: text("name_bn").notNull(),
  district: text("district").notNull().default("টাঙ্গাইল"),
  active: integer("active").notNull().default(1),
});

export const bookings = sqliteTable("bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const bookingEvents = sqliteTable("booking_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  status: text("status").notNull(),
  note: text("note"),
  actorRole: text("actor_role").notNull(),
  createdAt: ts("created_at"),
});

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  targetRole: text("target_role"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  bookingId: integer("booking_id").references(() => bookings.id),
  isRead: integer("is_read").notNull().default(0),
  createdAt: ts("created_at"),
});

export const complaints = sqliteTable("complaints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  commissionPercent: integer("commission_percent").notNull().default(10),
  supportPhone: text("support_phone"),
  supportWhatsapp: text("support_whatsapp"),
  supportEmail: text("support_email"),
  announcement: text("announcement"),
  updatedAt: ts("updated_at"),
});

export const adminLogs = sqliteTable("admin_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id").references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: ts("created_at"),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: ts("created_at"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
