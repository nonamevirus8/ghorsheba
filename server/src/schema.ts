// GhorSheba data model — mirrors the prompt's logical collections
// (users, professionals, services, bookings, reviews, notifications,
// complaints, locations, platformSettings, adminLogs) plus sessions
// and booking status-history events.

import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  // Admin permission level (Master Phase 2). Null for non-admins; admins
  // created before levels existed are treated as "super" by the server
  // (see adminLevelOf in actions.ts). The first claimed admin is "super".
  adminLevel: text("admin_level", {
    enum: ["super", "operations", "finance", "support"],
  }),
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
  // Collected at registration together with the identity document
  // photos (see identity_documents), per the owner's NID policy.
  // Visible to admins only (adminListProfessionals, operations/super
  // level) — never returned by any public, customer or professional
  // action.
  nidNumber: text("nid_number"),
  status: text("status", {
    enum: ["pending", "verified", "rejected", "suspended"],
  })
    .notNull()
    .default("pending"),
  available: integer("available").notNull().default(1),
  // Dual Payment (Phase 1): the professional's chosen payout destination
  // for withdrawal requests. Set by the professional, never by an admin.
  withdrawalMethod: text("withdrawal_method", {
    enum: ["bkash", "nagad", "bank", "pathao_pay"],
  }),
  withdrawalNumber: text("withdrawal_number"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});


// Professional identity documents (owner's NID policy, decided
// 2026-11-17): the NID front photo and the NID back photo, uploaded
// at registration. The image bytes live ONLY
// in this table (base64 text) — never in the blob store — so no public
// URL can serve them; the getIdentityDocument action is the only way
// to read them (owning professional, or an operations/super admin whose
// view is written to the admin log).
// Retention: documents are kept while the professional's account
// exists; the owner has not set a time limit — that decision is
// still open.
export const identityDocuments = sqliteTable("identity_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  professionalId: integer("professional_id")
    .notNull()
    .references(() => professionals.id),
  kind: text("kind", { enum: ["nid_front", "nid_back"] }).notNull(),
  contentType: text("content_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  createdAt: ts("created_at"),
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
  // Dual Payment (Phase 1) snapshot — written by the server when the
  // price is confirmed / a payment is submitted, from the rates in
  // effect at that moment. Later rate changes never alter these values.
  // All amounts are integer BDT. `calcBase` is the eligible
  // service/labour charge the fee + commission were calculated on
  // (itemized materials / approved transport excluded unless agreed).
  paymentModel: text("payment_model", {
    enum: ["full_online", "split_50_50"],
  }),
  customerFeePercent: integer("customer_fee_percent"),
  proCommissionPercent: integer("pro_commission_percent"),
  calcBase: integer("calc_base"),
  onlineAmount: integer("online_amount"),
  cashAmount: integer("cash_amount"),
  customerFee: integer("customer_fee"),
  proCommission: integer("pro_commission"),
  heldBalance: integer("held_balance"),
  // Extended payment-workflow status (Dual Payment §6). The legacy
  // `payment_status` column above is unchanged and keeps its old domain.
  extendedPaymentStatus: text("extended_payment_status", {
    enum: [
      "unpaid",
      "payment_initiated",
      "payment_pending",
      "payment_verified",
      "held_settlement_pending",
      "payout_requested",
      "admin_verification",
      "paid",
      "failed",
      "cancelled",
      "disputed",
      "refund_pending",
      "refunded",
      "rejected",
    ],
  })
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
  // Dual Payment commission settings, one rate pair per payment model
  // (Dual Payment §7). Bookings snapshot these rates when their price is
  // confirmed, so editing them here only affects future bookings.
  fullOnlineCustomerFeePercent: integer("full_online_customer_fee_percent")
    .notNull()
    .default(0),
  fullOnlineProCommissionPercent: integer(
    "full_online_pro_commission_percent",
  )
    .notNull()
    .default(10),
  splitCustomerFeePercent: integer("split_customer_fee_percent")
    .notNull()
    .default(3),
  splitProCommissionPercent: integer("split_pro_commission_percent")
    .notNull()
    .default(6),
  supportPhone: text("support_phone"),
  supportWhatsapp: text("support_whatsapp"),
  supportEmail: text("support_email"),
  announcement: text("announcement"),
  // Manual-payment receiving number (Master Phase 3): the GhorSheba
  // MFS number customers send their online payment to before submitting
  // the TrxID at checkout. Set by a finance/super admin in Platform
  // Settings; null until the owner configures a real number — the
  // checkout then honestly says the number is not set yet instead of
  // inventing one.
  paymentReceiveNumber: text("payment_receive_number"),
  paymentReceiveProvider: text("payment_receive_provider", {
    enum: ["bkash", "nagad", "rocket"],
  }),
  updatedAt: ts("updated_at"),
});

export const adminLogs = sqliteTable("admin_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id").references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: ts("created_at"),
});

// ---------------------------------------------------------------------------
// Dual Payment (Phase 1) — payments, immutable ledger, withdrawal requests.
//
// Money rules enforced by the server actions (see `payments.ts` for the
// math): amounts are integer BDT computed server-side only; a manual
// payment is just a customer-submitted claim until an admin verifies it;
// ledger rows are append-only — no action updates or deletes them, and
// corrections are made with new `adjustment` entries.

export const payments = sqliteTable(
  "payments",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  paymentModel: text("payment_model", {
    enum: ["full_online", "split_50_50"],
  }).notNull(),
  // Phase 1 supports the manual TrxID route only. Gateway methods
  // (SSLCOMMERZ) and the Pathao Pay placeholder arrive in later phases.
  method: text("method", { enum: ["manual_trxid"] })
    .notNull()
    .default("manual_trxid"),
  provider: text("provider", {
    enum: ["bkash", "nagad", "rocket", "pathao_pay"],
  }).notNull(),
  // Audit fix D-1 (Master Phase 3): a TrxID is unique PER PROVIDER, not
  // globally — the same TrxID string on a different provider is a
  // different payment. Enforced by the composite unique index below.
  providerTrxId: text("provider_trx_id").notNull(),
  senderNumber: text("sender_number"),
  amount: integer("amount").notNull(), // BDT the customer claims to have paid online
  currency: text("currency").notNull().default("BDT"),
  status: text("status", {
    enum: ["initiated", "pending", "verified", "failed", "cancelled", "refunded"],
  })
    .notNull()
    .default("pending"),
  // Client-generated key making payment submission safe to retry; a
  // second submission with the same key returns the original payment.
  idempotencyKey: text("idempotency_key").notNull().unique(),
  submittedBy: integer("submitted_by")
    .notNull()
    .references(() => users.id),
  verifiedBy: integer("verified_by").references(() => users.id),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  rejectionReason: text("rejection_reason"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  },
  (t) => [
    // D-1: TrxID unique per provider (see providerTrxId comment above).
    uniqueIndex("payments_provider_trx_unique").on(t.provider, t.providerTrxId),
  ],
);

export const paymentLedger = sqliteTable("payment_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  paymentId: integer("payment_id").references(() => payments.id),
  entryType: text("entry_type", {
    enum: [
      "online_collection",
      "customer_fee",
      "commission_due",
      "commission_collected",
      "held_balance",
      "payout",
      "refund",
      "adjustment",
    ],
  }).notNull(),
  amount: integer("amount").notNull(), // BDT, always positive; direction is in entryType
  actorRole: text("actor_role").notNull(),
  adminId: integer("admin_id").references(() => users.id),
  reference: text("reference"),
  note: text("note"),
  createdAt: ts("created_at"),
});

export const withdrawalRequests = sqliteTable("withdrawal_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  professionalId: integer("professional_id")
    .notNull()
    .references(() => professionals.id),
  bookingId: integer("booking_id").references(() => bookings.id),
  amount: integer("amount").notNull(), // BDT
  withdrawalMethod: text("withdrawal_method", {
    enum: ["bkash", "nagad", "bank", "pathao_pay"],
  }).notNull(),
  withdrawalNumber: text("withdrawal_number").notNull(),
  status: text("status", {
    enum: ["requested", "approved", "rejected", "paid"],
  })
    .notNull()
    .default("requested"),
  adminId: integer("admin_id").references(() => users.id),
  transactionReference: text("transaction_reference"),
  rejectionReason: text("rejection_reason"),
  requestedAt: ts("requested_at"),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// Login / admin-claim throttling (Master Phase 2). One row per
// (scope, key): scope is "login_phone" | "login_ip" | "claim" |
// "claim_ip"; count is the failures/attempts inside the current window;
// lockedUntil is set once the limit is hit. Rows are deleted on a
// successful login; locks expire on their own.
export const authAttempts = sqliteTable("auth_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start"),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  updatedAt: ts("updated_at"),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: ts("created_at"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

// ---------------------------------------------------------------------------
// Master Phase 3 — customer dashboard: saved addresses, refund requests,
// account-deletion requests.

// Saved service addresses for a customer account (dashboard "প্রোফাইল"
// tab). Owned rows only: every action filters by the caller's user id.
export const addresses = sqliteTable("addresses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  label: text("label").notNull(), // e.g. "বাসা", "অফিস"
  upazila: text("upazila").notNull(),
  area: text("area"),
  address: text("address").notNull(),
  phone: text("phone"),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// Customer refund requests against a booking's online payment. A
// request is only a request: no money moves here. Admin review and any
// actual refund happen in Master Phase 9; the status the customer sees
// is whatever an admin later records (requested → approved/rejected →
// refunded). One open (requested) request per booking at a time.
export const refundRequests = sqliteTable("refund_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  paymentId: integer("payment_id").references(() => payments.id),
  reason: text("reason", {
    enum: [
      "work_not_completed",
      "poor_quality",
      "incorrect_price",
      "professional_no_show",
      "other",
    ],
  }).notNull(),
  detail: text("detail").notNull(),
  status: text("status", {
    enum: ["requested", "approved", "rejected", "refunded"],
  })
    .notNull()
    .default("requested"),
  adminNote: text("admin_note"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// Account-deletion requests (dashboard security tab). Submitting one
// only records the request and notifies admins — the account is NOT
// deleted by this action; an admin processes it later, respecting
// financial-record retention (Master Task 16/20).
export const accountDeletionRequests = sqliteTable("account_deletion_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});
