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
  // Per-day availability (Master Phase 4): JSON array of weekday
  // numbers (0 = Sunday … 6 = Saturday) the professional works.
  // Null means no per-day restriction (works every day).
  availableDays: text("available_days"),
  // Admin's note on the latest verification decision (Master Phase 4):
  // shown to the professional on their verification tab — e.g. why an
  // application was rejected and what to fix before re-submitting.
  // Written only by adminSetProStatus.
  verificationNote: text("verification_note"),
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
  // Booking status (Master Phase 7 extends the legacy flow). The
  // master flow is: pending → price_confirmed → assigned → accepted →
  // in_progress → pro_completed → customer_confirmed → admin_reviewed,
  // plus cancelled / rejected / disputed / rescheduled. The legacy
  // values "confirmed" and "completed" are kept for rows written
  // before Phase 7 — they mean exactly price_confirmed and
  // customer_confirmed (see bookingStage in actions.ts); no existing
  // row's status value is rewritten by the Phase 7 migration.
  status: text("status", {
    enum: [
      "pending",
      "confirmed",
      "price_confirmed",
      "assigned",
      "accepted",
      "in_progress",
      "pro_completed",
      "completed",
      "customer_confirmed",
      "admin_reviewed",
      "cancelled",
      "rejected",
      "disputed",
      "rescheduled",
    ],
  })
    .notNull()
    .default("pending"),
  // Master Phase 7: the raw status the booking was in when it was
  // parked in "disputed" or "rescheduled"; leaving the parked state
  // returns it to exactly this status. Null otherwise.
  statusBeforeHold: text("status_before_hold", {
    enum: [
      "pending",
      "confirmed",
      "price_confirmed",
      "assigned",
      "accepted",
      "in_progress",
      "pro_completed",
      "completed",
      "customer_confirmed",
      "admin_reviewed",
      "cancelled",
      "rejected",
      "disputed",
      "rescheduled",
    ],
  }),
  // How the current final price was finalized: "quotation" (the
  // customer approved an itemized quotation — the price is then
  // locked; only a new approved additional quotation can change it)
  // or "admin" (legacy direct admin pricing from before Phase 7 —
  // the Phase 7 migration backfills existing priced bookings).
  priceFinalizedVia: text("price_finalized_via", {
    enum: ["quotation", "admin"],
  }),
  // A customer's pending reschedule request (Master Phase 7): the new
  // date/time they asked for. An admin confirms it with
  // adminRescheduleBooking (which parks the booking in "rescheduled"
  // at the new time) or declines it; either way these are cleared.
  rescheduleRequestedDate: text("reschedule_requested_date"),
  rescheduleRequestedTime: text("reschedule_requested_time"),
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
  // Master Phase 10: a coupon the customer applied at price
  // confirmation (initial quotation approval). `couponDiscount` is the
  // taka amount taken off the eligible charge (labour + additional);
  // the booking's finalPrice and calcBase already include the discount
  // — these two columns are the record of what was applied. The full
  // redemption (with the coupon row it came from) lives in
  // coupon_redemptions. Null when no coupon was used.
  couponCode: text("coupon_code"),
  couponDiscount: integer("coupon_discount"),
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
  // Public contact details (Master Phase 6): the business address and
  // office hours shown on the Contact page and in the footer. Null
  // until the owner fills them in — the UI never invents an address
  // or hours, it simply omits the lines while these are empty.
  businessAddress: text("business_address"),
  officeHours: text("office_hours"),
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
  // Phase 1 supported the manual TrxID route only. Master Phase 8 adds
  // the SSLCOMMERZ sandbox gateway ("sslcommerz" as both method and
  // provider; for those rows providerTrxId is the gateway tran_id).
  // These enums are type-level only — neither database has a CHECK
  // constraint on these columns — so widening them needs no migration.
  // Pathao Pay stays a placeholder value (no public merchant API).
  method: text("method", { enum: ["manual_trxid", "sslcommerz"] })
    .notNull()
    .default("manual_trxid"),
  provider: text("provider", {
    enum: ["bkash", "nagad", "rocket", "pathao_pay", "sslcommerz"],
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
  // Master Phase 9 adds "held": a finance admin can freeze a request
  // (e.g. while a dispute is open) with a recorded reason; held money
  // stays reserved (it still counts against the withdrawable balance)
  // and can never be paid out until the hold is released or the
  // request is decided. "paid" is reached ONLY by recording the real
  // transfer reference (adminDecideWithdrawal) — never by a screenshot.
  status: text("status", {
    enum: ["requested", "approved", "rejected", "paid", "held"],
  })
    .notNull()
    .default("requested"),
  adminId: integer("admin_id").references(() => users.id),
  transactionReference: text("transaction_reference"),
  rejectionReason: text("rejection_reason"),
  holdReason: text("hold_reason"),
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
  // Master Phase 9: the admin's recorded refund decision. The request
  // reaches "refunded" only when a finance admin records the REAL
  // refund transfer (amount + reference) via adminDecideRefundRequest;
  // the amount is decided per case under the published cancellation
  // policy — no percentage is hard-coded anywhere.
  refundAmount: integer("refund_amount"),
  refundReference: text("refund_reference"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
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

// ---------------------------------------------------------------------------
// Master Phase 6 — social links, support tickets.
//
// Social links are OWNER-supplied only (audit Decision 4): this table
// starts EMPTY and no code anywhere seeds or invents a URL. The public
// site renders only rows with enabled = 1; while the table is empty the
// footer / contact page / mobile menu show no social icons at all.
// URLs are validated server-side against the platform's domain.
export const socialLinks = sqliteTable("social_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform", {
    enum: ["facebook", "instagram", "youtube", "tiktok", "whatsapp", "other"],
  }).notNull(),
  // Optional display label; mainly for platform = "other".
  label: text("label"),
  url: text("url").notNull(),
  enabled: integer("enabled").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// Support tickets (Master Phase 6). A ticket belongs to exactly one
// user (customer or professional); only that user — or a support/super
// admin — can read its thread or post to it. The conversation lives in
// support_ticket_messages; the ticket row carries the workflow status:
// open → in_progress → waiting_customer → resolved → closed.
// The older `complaints` flow is unchanged and keeps working alongside.
export const supportTickets = sqliteTable("support_tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  subject: text("subject").notNull(),
  category: text("category", {
    enum: ["general", "booking", "payment", "account", "verification", "other"],
  })
    .notNull()
    .default("general"),
  bookingCode: text("booking_code"),
  status: text("status", {
    enum: ["open", "in_progress", "waiting_customer", "resolved", "closed"],
  })
    .notNull()
    .default("open"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const supportTicketMessages = sqliteTable("support_ticket_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => supportTickets.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  authorRole: text("author_role", {
    enum: ["customer", "professional", "admin"],
  }).notNull(),
  body: text("body").notNull(),
  createdAt: ts("created_at"),
});

// ---------------------------------------------------------------------------
// Master Phase 7 — itemized quotations.
//
// A quotation is the ONLY way a booking's price becomes final: an
// admin (operations) or the assigned professional itemizes the work
// (labour / materials / transport / additional charges), and the
// customer must approve it before any price is finalized, any payment
// quote is issued or any TrxID can be submitted. `kind = "initial"`
// prices the booking for the first time; `kind = "additional"` covers
// extra work discovered later and, once approved, ADDS its total to
// the finalized price — extra charges can never be folded into an
// approved price silently. `totalAmount` is always computed
// server-side as the sum of the four charge columns; the commission
// base an approval contributes is labour + additional (itemized
// materials / transport are excluded, per the Dual Payment rules in
// payments.ts). Creating a new quotation supersedes any still-pending
// one for the same booking, so at most one quotation per booking is
// ever awaiting the customer's decision.
export const quotations = sqliteTable("quotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  kind: text("kind", { enum: ["initial", "additional"] }).notNull(),
  status: text("status", {
    enum: ["pending_approval", "approved", "rejected", "superseded"],
  })
    .notNull()
    .default("pending_approval"),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdByRole: text("created_by_role", {
    enum: ["admin", "professional"],
  }).notNull(),
  labourCharge: integer("labour_charge").notNull().default(0),
  materialsCharge: integer("materials_charge").notNull().default(0),
  transportCharge: integer("transport_charge").notNull().default(0),
  additionalCharge: integer("additional_charge").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  note: text("note"),
  decidedByUserId: integer("decided_by_user_id").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// ---------------------------------------------------------------------------
// Master Phase 9 — customer cancellation requests.
//
// A customer cancel is a REQUEST, not an instant cancel (owner's
// Phase 9 instruction): the booking keeps running until an admin
// (operations) checks the request and decides — "under_review"
// (Waiting: the admin is checking), "approved" (Complete: the booking
// is cancelled, pending payments auto-fail per Phase 5 P-1, no
// commission is earned on the cancelled job, and any verified online
// payment becomes a per-case refund decision) or "rejected" (the
// booking continues exactly as before). At most one open request
// (requested / under_review) exists per booking at a time — enforced
// by requestBookingCancel.
export const cancelRequests = sqliteTable("cancel_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason"),
  status: text("status", {
    enum: ["requested", "under_review", "approved", "rejected"],
  })
    .notNull()
    .default("requested"),
  adminNote: text("admin_note"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// ---------------------------------------------------------------------------
// Master Phase 10 — manual announcements, coupons.
//
// Announcements are the MANUAL half of the notification system (every
// other notification is auto-created by a real event): an admin
// composes a title + body and sends it to all users, to one role, or
// to one specific user. Each send is recorded here (sender, audience,
// text, time, recipient count) and delivered as one `notifications`
// row per recipient (type "announcement"), so every recipient has
// their own read/unread state in the notification center. An
// announcement with no recipients is rejected server-side — this
// table never holds a send that reached nobody.
export const announcements = sqliteTable("announcements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id")
    .notNull()
    .references(() => users.id),
  audience: text("audience", { enum: ["all", "role", "user"] }).notNull(),
  audienceRole: text("audience_role", {
    enum: ["customer", "professional", "admin"],
  }),
  audienceUserId: integer("audience_user_id").references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  recipientCount: integer("recipient_count").notNull(),
  createdAt: ts("created_at"),
});

// Coupons (Master Phase 10). A coupon exists ONLY because an admin
// configured it here — the site never promises a discount that is not
// a row in this table. `discountValue` is taka for "fixed" and a
// percent (1–100) for "percent"; the discount is always computed on
// the booking's eligible charge (labour + additional, the commission
// base) at price confirmation. `serviceSlug` null = every service.
// `expiresOn` is a YYYY-MM-DD date (Asia/Dhaka) or null = no expiry.
// `usageLimit` null = unlimited. Codes are stored uppercase and
// matched case-insensitively.
export const coupons = sqliteTable("coupons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  discountType: text("discount_type", { enum: ["fixed", "percent"] }).notNull(),
  discountValue: integer("discount_value").notNull(),
  minAmount: integer("min_amount"),
  expiresOn: text("expires_on"),
  usageLimit: integer("usage_limit"),
  serviceSlug: text("service_slug"),
  active: integer("active").notNull().default(1),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

// One row per actual coupon use, written in the same transaction as
// the price confirmation that applied it. Usage counts and remaining
// uses are always counted from these rows — never a stored counter
// that could drift. One redemption per booking (unique booking_id):
// a booking's price is confirmed once, so its coupon is used once.
export const couponRedemptions = sqliteTable("coupon_redemptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  couponId: integer("coupon_id")
    .notNull()
    .references(() => coupons.id),
  bookingId: integer("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  discountAmount: integer("discount_amount").notNull(),
  createdAt: ts("created_at"),
});
