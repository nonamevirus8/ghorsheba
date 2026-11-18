// Deployment copy of `server/src/actions.ts` for the Vercel functions.
//
// Vercel's Node file tracer did not include `server/src/*` in the function
// bundle when `api/actions.ts` imported it across directories with an
// extensionless specifier, so the deployed function crashed at import time
// with ERR_MODULE_NOT_FOUND. This copy lives inside `api/` (always traced)
// and uses explicit `.js` ESM specifiers. Keep it in sync with
// `server/src/actions.ts` — identical except for the import paths below.
//

import { defineAction, z, type ActionsModule, type Ctx } from "./runtime.js";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "../../server/src/schema.js";
import {
  computeBreakdown,
  DEFAULT_DUAL_RATES,
  type DualPaymentRates,
  type PaymentBreakdown,
} from "./payments.js";
import {
  buildFullBackup,
  fullBackupResponse,
  type FullBackupDownload,
} from "./backup.js";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------- helpers

function dbOf(ctx: Ctx) {
  return ctx.db<typeof schema>();
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Password hashing (Master Phase 2): bcrypt via the pure-JS bcryptjs
// package — a slow hash with no native bindings, so it runs unchanged
// in the Vercel serverless runtime and in this artifact's runtime.
// Accounts created under the previous scheme hold `salt$sha256hex`;
// those hashes still verify below and are transparently re-hashed to
// bcrypt on the owner's next successful login (see `login`).
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function isLegacyPasswordHash(stored: string): boolean {
  return !stored.startsWith("$2");
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isLegacyPasswordHash(stored)) {
    try {
      return await bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }
  const [salt = "", hash = ""] = stored.split("$");
  return (await sha256Hex(`${salt}:${password}`)) === hash;
}

const PHONE_RE = /^01[3-9]\d{8}$/;

async function createSession(ctx: Ctx, userId: number): Promise<string> {
  const db = dbOf(ctx);
  const token = `${randomHex(16)}.${randomHex(16)}`;
  await db.insert(schema.sessions).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  return token;
}

type UserRow = typeof schema.users.$inferSelect;

async function requireUser(ctx: Ctx, token: string): Promise<UserRow> {
  const db = dbOf(ctx);
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token))
    .limit(1);
  const session = rows[0];
  if (!session || session.expiresAt.getTime() < Date.now()) {
    throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন।");
  }
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  const user = users[0];
  if (!user) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি।");
  if (user.status === "suspended") {
    throw new Error("এই অ্যাকাউন্টটি সাময়িকভাবে স্থগিত আছে।");
  }
  return user;
}

async function requireAdmin(ctx: Ctx, token: string): Promise<UserRow> {
  const user = await requireUser(ctx, token);
  if (user.role !== "admin") throw new Error("শুধুমাত্র অ্যাডমিনের জন্য অনুমোদিত।");
  return user;
}

// ----------------------------------------------------- admin levels
//
// Admin permission levels (Master Phase 2). The level is read from the
// signed-in admin's own database row on every call — never from
// anything the client sends. "super" passes every check; the other
// levels must be listed explicitly per action:
//   super      — everything, including admin staff & levels
//   operations — bookings, services, locations, professionals, verification
//   finance    — payment verification, payment lists, rate settings
//   support    — complaints / support, review moderation
// Admins created before levels existed have admin_level NULL and are
// treated as super (the owner's first claimed account is set to super
// explicitly at claim time).

type AdminLevel = "super" | "operations" | "finance" | "support";

function adminLevelOf(user: UserRow): AdminLevel {
  return user.adminLevel ?? "super";
}

async function requireAdminLevel(
  ctx: Ctx,
  token: string,
  levels: readonly AdminLevel[],
): Promise<UserRow> {
  const user = await requireAdmin(ctx, token);
  const level = adminLevelOf(user);
  if (level !== "super" && !levels.includes(level)) {
    throw new Error("আপনার অ্যাডমিন স্তরে এই কাজটি করার অনুমতি নেই।");
  }
  return user;
}

// ------------------------------------------- login / claim throttling
//
// Failed logins and admin-claim attempts are counted in `auth_attempts`
// inside a rolling window; reaching the limit locks the key until the
// lock expires. Logins are keyed by phone number and — where the
// runtime exposes it (the Vercel edition passes the client IP through
// ctx) — by IP as well. Claim attempts are keyed globally and by IP.

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const CLAIM_MAX_ATTEMPTS = 5;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;
const CLAIM_LOCK_MS = 60 * 60 * 1000;

type AttemptRow = typeof schema.authAttempts.$inferSelect;

function clientIpOf(ctx: Ctx): string | null {
  const ip = (ctx as unknown as { clientIp?: unknown }).clientIp;
  return typeof ip === "string" && ip.length > 0 ? ip : null;
}

async function attemptRow(ctx: Ctx, scope: string, key: string): Promise<AttemptRow | null> {
  const db = dbOf(ctx);
  const rows = await db
    .select()
    .from(schema.authAttempts)
    .where(and(eq(schema.authAttempts.scope, scope), eq(schema.authAttempts.key, key)))
    .limit(1);
  return rows[0] ?? null;
}

function lockActive(row: AttemptRow | null): boolean {
  return !!row?.lockedUntil && row.lockedUntil.getTime() > Date.now();
}

async function bumpAttempt(
  ctx: Ctx,
  scope: string,
  key: string,
  windowMs: number,
  maxCount: number,
  lockMs: number,
): Promise<void> {
  const db = dbOf(ctx);
  const now = new Date();
  const row = await attemptRow(ctx, scope, key);
  if (!row) {
    await db.insert(schema.authAttempts).values({ scope, key, count: 1, windowStart: now, updatedAt: now });
    return;
  }
  const inWindow = now.getTime() - row.windowStart.getTime() < windowMs;
  const count = inWindow ? row.count + 1 : 1;
  await db
    .update(schema.authAttempts)
    .set({
      count,
      windowStart: inWindow ? row.windowStart : now,
      lockedUntil: count >= maxCount ? new Date(now.getTime() + lockMs) : row.lockedUntil,
      updatedAt: now,
    })
    .where(eq(schema.authAttempts.id, row.id));
}

async function assertLoginAllowed(ctx: Ctx, phone: string, ip: string | null): Promise<void> {
  if (lockActive(await attemptRow(ctx, "login_phone", phone))) {
    throw new Error("অনেকবার ভুল পাসওয়ার্ড দেওয়া হয়েছে — এই নম্বর দিয়ে লগইন সাময়িকভাবে বন্ধ আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
  }
  if (ip && lockActive(await attemptRow(ctx, "login_ip", ip))) {
    throw new Error("এই ডিভাইস থেকে অনেকবার ভুল লগইন চেষ্টা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।");
  }
}

async function recordLoginFailure(ctx: Ctx, phone: string, ip: string | null): Promise<void> {
  await bumpAttempt(ctx, "login_phone", phone, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES, LOGIN_LOCK_MS);
  if (ip) await bumpAttempt(ctx, "login_ip", ip, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES, LOGIN_LOCK_MS);
}

async function clearLoginAttempts(ctx: Ctx, phone: string, ip: string | null): Promise<void> {
  const db = dbOf(ctx);
  await db
    .delete(schema.authAttempts)
    .where(and(eq(schema.authAttempts.scope, "login_phone"), eq(schema.authAttempts.key, phone)));
  if (ip) {
    await db
      .delete(schema.authAttempts)
      .where(and(eq(schema.authAttempts.scope, "login_ip"), eq(schema.authAttempts.key, ip)));
  }
}

async function assertClaimAllowed(ctx: Ctx, ip: string | null): Promise<void> {
  if (lockActive(await attemptRow(ctx, "claim", "global"))) {
    throw new Error("অ্যাডমিন সেটআপের অনেক চেষ্টা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।");
  }
  if (ip && lockActive(await attemptRow(ctx, "claim_ip", ip))) {
    throw new Error("এই ডিভাইস থেকে অ্যাডমিন সেটআপের অনেক চেষ্টা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন।");
  }
}

async function recordClaimAttempt(ctx: Ctx, ip: string | null): Promise<void> {
  await bumpAttempt(ctx, "claim", "global", CLAIM_WINDOW_MS, CLAIM_MAX_ATTEMPTS, CLAIM_LOCK_MS);
  if (ip) await bumpAttempt(ctx, "claim_ip", ip, CLAIM_WINDOW_MS, CLAIM_MAX_ATTEMPTS, CLAIM_LOCK_MS);
}

async function myProfessional(ctx: Ctx, userId: number) {
  const db = dbOf(ctx);
  const rows = await db
    .select()
    .from(schema.professionals)
    .where(eq(schema.professionals.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function photoUrl(ctx: Ctx, key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await ctx.blobs.getUrl(key);
  } catch {
    return null;
  }
}

async function storeImage(
  ctx: Ctx,
  prefix: string,
  img: { dataBase64: string; mimeType: string } | undefined,
): Promise<string | null> {
  if (!img) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(img.mimeType)) {
    throw new Error("শুধুমাত্র JPG, PNG বা WebP ছবি দেওয়া যাবে।");
  }
  if (img.dataBase64.length > 4_500_000) {
    throw new Error("ছবিটি খুব বড় — ৩ MB-এর নিচের ছবি দিন।");
  }
  const bytes = Uint8Array.from(atob(img.dataBase64), (c) => c.charCodeAt(0));
  const key = `${prefix}/${Date.now()}-${randomHex(4)}`;
  await ctx.blobs.put(key, bytes, { contentType: img.mimeType });
  return key;
}

// Identity document images (NID front and back photos) are
// validated like other uploads but stored in the identity_documents
// table — never in the blob store — so no public URL can ever serve
// them (see getIdentityDocument for the access rules).
function validateIdentityImage(
  img: { dataBase64: string; mimeType: string } | undefined,
  label: string,
): { dataBase64: string; mimeType: string } {
  if (!img) throw new Error(`${label} দিন।`);
  if (!["image/jpeg", "image/png", "image/webp"].includes(img.mimeType)) {
    throw new Error("শুধুমাত্র JPG, PNG বা WebP ছবি দেওয়া যাবে।");
  }
  if (img.dataBase64.length > 4_500_000) {
    throw new Error("ছবিটি খুব বড় — ৩ MB-এর নিচের ছবি দিন।");
  }
  return img;
}

async function notify(
  ctx: Ctx,
  args: {
    userId?: number | null;
    targetRole?: string | null;
    type: string;
    title: string;
    body?: string | null;
    bookingId?: number | null;
  },
) {
  const db = dbOf(ctx);
  await db.insert(schema.notifications).values({
    userId: args.userId ?? null,
    targetRole: args.targetRole ?? null,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    bookingId: args.bookingId ?? null,
  });
}

async function logAdmin(ctx: Ctx, adminId: number, action: string, detail: string) {
  const db = dbOf(ctx);
  await db.insert(schema.adminLogs).values({ adminId, action, detail });
}

async function addEvent(
  ctx: Ctx,
  bookingId: number,
  status: string,
  actorRole: string,
  note?: string | null,
) {
  const db = dbOf(ctx);
  await db.insert(schema.bookingEvents).values({
    bookingId,
    status,
    actorRole,
    note: note ?? null,
  });
}

// --------------------------------------------------------- dual payments

type SettingsRow = typeof schema.settings.$inferSelect;
type BookingRowFull = typeof schema.bookings.$inferSelect;

/** Commission rates per payment model, from the settings row. */
function dualRatesFromSettings(s: SettingsRow | undefined): DualPaymentRates {
  return {
    fullOnline: {
      customerFeePercent:
        s?.fullOnlineCustomerFeePercent ??
        DEFAULT_DUAL_RATES.fullOnline.customerFeePercent,
      proCommissionPercent:
        s?.fullOnlineProCommissionPercent ??
        DEFAULT_DUAL_RATES.fullOnline.proCommissionPercent,
    },
    split5050: {
      customerFeePercent:
        s?.splitCustomerFeePercent ??
        DEFAULT_DUAL_RATES.split5050.customerFeePercent,
      proCommissionPercent:
        s?.splitProCommissionPercent ??
        DEFAULT_DUAL_RATES.split5050.proCommissionPercent,
    },
  };
}

/**
 * Recomputes a booking's breakdown from its own snapshotted rates, so a
 * later settings change can never alter the figures. Returns null when
 * the booking has no price/model snapshot yet.
 */
function breakdownFromBooking(b: BookingRowFull): PaymentBreakdown | null {
  if (
    b.finalPrice == null ||
    b.finalPrice <= 0 ||
    !b.paymentModel ||
    b.customerFeePercent == null ||
    b.proCommissionPercent == null
  ) {
    return null;
  }
  const own: DualPaymentRates = {
    fullOnline: {
      customerFeePercent: b.customerFeePercent,
      proCommissionPercent: b.proCommissionPercent,
    },
    split5050: {
      customerFeePercent: b.customerFeePercent,
      proCommissionPercent: b.proCommissionPercent,
    },
  };
  return computeBreakdown({
    bill: b.finalPrice,
    paymentModel: b.paymentModel,
    calcBase: b.calcBase ?? b.finalPrice,
    rates: own,
  });
}


// ------------------------------------------------- cancellation cleanup
//
// P-1 (Master Phase 5): when a booking that still has a pending /
// initiated online payment is cancelled — by the customer or by an
// admin — the pending payment must not stay verifiable forever. It is
// marked failed here, with an append-only `adjustment` ledger entry
// recording why (ledger rows are never deleted), the booking's extended
// payment status moves to "cancelled", and the customer is notified.
// A VERIFIED payment is never touched by cancellation: money already
// collected is a refund question (Master Phase 9), not a silent fail.

async function failPendingPaymentsForCancelledBooking(
  ctx: Ctx,
  booking: BookingRowFull,
  actor: { role: "customer" | "admin"; adminId: number | null },
): Promise<void> {
  const db = dbOf(ctx);
  const pending = await db
    .select()
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.bookingId, booking.id),
        inArray(schema.payments.status, ["pending", "initiated"]),
      ),
    );
  if (pending.length === 0) return;
  const now = new Date();
  for (const p of pending) {
    await db
      .update(schema.payments)
      .set({
        status: "failed",
        verifiedBy: actor.adminId,
        verifiedAt: now,
        rejectionReason: "বুকিং বাতিল করা হয়েছে",
        updatedAt: now,
      })
      .where(eq(schema.payments.id, p.id));
    await db.insert(schema.paymentLedger).values({
      bookingId: booking.id,
      paymentId: p.id,
      entryType: "adjustment",
      amount: p.amount,
      actorRole: actor.role,
      adminId: actor.adminId,
      reference: `${p.provider}:${p.providerTrxId}`,
      note: "বুকিং বাতিল হওয়ায় অপেক্ষমাণ অনলাইন পেমেন্ট বাতিল করা হলো",
    });
  }
  await db
    .update(schema.bookings)
    .set({ extendedPaymentStatus: "cancelled", updatedAt: now })
    .where(eq(schema.bookings.id, booking.id));
  await notify(ctx, {
    userId: booking.customerId,
    type: "payment_cancelled",
    title: "বুকিং বাতিল হওয়ায় পেমেন্ট বাতিল হয়েছে",
    body: `কোড: ${booking.code} — বুকিং বাতিল হওয়ায় অপেক্ষমাণ অনলাইন পেমেন্টটি বাতিল করা হয়েছে।`,
    bookingId: booking.id,
  });
  if (actor.adminId != null) {
    await logAdmin(
      ctx,
      actor.adminId,
      "payment_auto_failed_on_cancel",
      `${booking.code}: ${pending.length}টি অপেক্ষমাণ পেমেন্ট বাতিলে ব্যর্থ করা হয়েছে`,
    );
  }
}

/** True when an error is a database unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "23505") return true; // Postgres unique_violation
  return typeof e.message === "string" && /unique/i.test(e.message);
}

// ------------------------------------------- professional money (Phase 4)
//
// Earnings, held balance and withdrawal availability are computed
// HERE, on the server, from the immutable `payment_ledger` rows plus
// the booking's own Dual Payment snapshot (bill / cash part). The
// client only displays these figures; it never computes money.
//
// Per booking with a verified online payment:
//   held           = Σ held_balance ledger entries
//   commission     = Σ commission_due ledger entries
//   paidOut        = Σ payout ledger entries
//   payoutFromHeld = held − commission
//   proTotal       = payoutFromHeld + cash part of the bill (snapshot)
//   remainingHeld  = held − commission − paidOut
// Available (withdrawable) balance = Σ remainingHeld over the pro's
// bookings − Σ amounts of withdrawal requests still open (requested /
// approved). Paid withdrawal requests are settled through `payout`
// ledger entries (Master Phase 9), which already reduce remainingHeld,
// so they are not subtracted twice.

interface ProEarningRow {
  bookingId: number;
  code: string;
  serviceName: string;
  bookingStatus: string;
  paymentModel: string | null;
  serviceCharge: number | null;
  calcBase: number | null;
  commission: number;
  held: number;
  cashReceived: number;
  payoutFromHeld: number;
  paidOut: number;
  remainingHeld: number;
  proTotal: number;
}

interface ProMoney {
  rows: ProEarningRow[];
  totals: {
    earned: number;
    held: number;
    paidOut: number;
    commission: number;
    availableBalance: number;
  };
  openWithdrawalTotal: number;
}

async function computeProMoney(ctx: Ctx, proId: number): Promise<ProMoney> {
  const db = dbOf(ctx);
  const names = await serviceNameMap(ctx);
  const myBookings = await db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.professionalId, proId))
    .orderBy(desc(schema.bookings.id));
  const ids = myBookings.map((b) => b.id);
  const ledger = ids.length
    ? await db
        .select()
        .from(schema.paymentLedger)
        .where(inArray(schema.paymentLedger.bookingId, ids))
    : [];
  const sums = new Map<number, { held: number; commission: number; paidOut: number }>();
  for (const e of ledger) {
    const s = sums.get(e.bookingId) ?? { held: 0, commission: 0, paidOut: 0 };
    if (e.entryType === "held_balance") s.held += e.amount;
    else if (e.entryType === "commission_due") s.commission += e.amount;
    else if (e.entryType === "payout") s.paidOut += e.amount;
    sums.set(e.bookingId, s);
  }
  const rows: ProEarningRow[] = [];
  for (const b of myBookings) {
    const s = sums.get(b.id);
    if (!s || (s.held === 0 && s.commission === 0 && s.paidOut === 0)) continue;
    const payoutFromHeld = s.held - s.commission;
    const cashReceived = b.cashAmount ?? 0;
    rows.push({
      bookingId: b.id,
      code: b.code,
      serviceName: names.get(b.serviceSlug) ?? b.serviceSlug,
      bookingStatus: b.status,
      paymentModel: b.paymentModel,
      serviceCharge: b.finalPrice,
      calcBase: b.calcBase,
      commission: s.commission,
      held: s.held,
      cashReceived,
      payoutFromHeld,
      paidOut: s.paidOut,
      remainingHeld: s.held - s.commission - s.paidOut,
      proTotal: payoutFromHeld + cashReceived,
    });
  }
  const requests = await db
    .select()
    .from(schema.withdrawalRequests)
    .where(eq(schema.withdrawalRequests.professionalId, proId));
  const openWithdrawalTotal = requests
    .filter((r) => r.status === "requested" || r.status === "approved")
    .reduce((a, r) => a + r.amount, 0);
  const heldNet = rows.reduce((a, r) => a + r.remainingHeld, 0);
  return {
    rows,
    totals: {
      earned: rows.reduce((a, r) => a + r.proTotal, 0),
      held: heldNet,
      paidOut: rows.reduce((a, r) => a + r.paidOut, 0),
      commission: rows.reduce((a, r) => a + r.commission, 0),
      availableBalance: heldNet - openWithdrawalTotal,
    },
    openWithdrawalTotal,
  };
}

/** Resolves the session to the caller's own professional profile. */
async function requirePro(ctx: Ctx, token: string) {
  const user = await requireUser(ctx, token);
  const pro = await myProfessional(ctx, user.id);
  if (!pro) throw new Error("প্রফেশনাল প্রোফাইল পাওয়া যায়নি।");
  return { user, pro };
}

// ------------------------------------------------------------- serializers

const userOut = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  role: z.string(),
  adminLevel: z.string().nullable(),
  status: z.string(),
  address: z.string().nullable(),
  location: z.string().nullable(),
  photoUrl: z.string().nullable(),
  createdAt: z.string(),
});

type UserOut = z.infer<typeof userOut>;

async function toUserOut(ctx: Ctx, u: UserRow): Promise<UserOut> {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    adminLevel: u.role === "admin" ? adminLevelOf(u) : null,
    status: u.status,
    address: u.address,
    location: u.location,
    photoUrl: await photoUrl(ctx, u.photoKey),
    createdAt: u.createdAt.toISOString(),
  };
}

const serviceOut = z.object({
  id: z.number(),
  slug: z.string(),
  nameBn: z.string(),
  nameEn: z.string(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  icon: z.string(),
  startingPrice: z.number().nullable(),
  hourlyRate: z.number().nullable(),
  dailyRate: z.number().nullable(),
  unitRate: z.number().nullable(),
  unitLabel: z.string().nullable(),
  inspectionFee: z.number().nullable(),
  priceNote: z.string().nullable(),
  active: z.boolean(),
});

function toServiceOut(s: typeof schema.services.$inferSelect): z.infer<typeof serviceOut> {
  return {
    id: s.id,
    slug: s.slug,
    nameBn: s.nameBn,
    nameEn: s.nameEn,
    tagline: s.tagline,
    description: s.description,
    icon: s.icon,
    startingPrice: s.startingPrice,
    hourlyRate: s.hourlyRate,
    dailyRate: s.dailyRate,
    unitRate: s.unitRate,
    unitLabel: s.unitLabel,
    inspectionFee: s.inspectionFee,
    priceNote: s.priceNote,
    active: s.active === 1,
  };
}

const locationOut = z.object({
  id: z.number(),
  nameEn: z.string(),
  nameBn: z.string(),
  district: z.string(),
  active: z.boolean(),
});

const proOut = z.object({
  id: z.number(),
  userId: z.number(),
  name: z.string(),
  phone: z.string(),
  categorySlug: z.string(),
  categoryName: z.string(),
  experienceYears: z.number(),
  skills: z.string().nullable(),
  areas: z.array(z.string()),
  address: z.string().nullable(),
  bio: z.string().nullable(),
  status: z.string(),
  available: z.boolean(),
  availableDays: z.array(z.number()),
  photoUrl: z.string().nullable(),
  avgRating: z.number().nullable(),
  reviewCount: z.number(),
  completedJobs: z.number(),
});

type ProRow = typeof schema.professionals.$inferSelect;

async function toProOut(
  ctx: Ctx,
  pro: ProRow,
  user: UserRow,
  serviceName: string,
): Promise<z.infer<typeof proOut>> {
  const db = dbOf(ctx);
  const approved = await db
    .select()
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.professionalId, pro.id),
        eq(schema.reviews.status, "approved"),
      ),
    );
  const done = await db
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.professionalId, pro.id),
        eq(schema.bookings.status, "completed"),
      ),
    );
  const avg =
    approved.length > 0
      ? Math.round(
          (approved.reduce((a, r) => a + r.rating, 0) / approved.length) * 10,
        ) / 10
      : null;
  let areas: string[] = [];
  try {
    const parsed: unknown = JSON.parse(pro.areas);
    if (Array.isArray(parsed)) areas = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    areas = [];
  }
  // Per-day availability (Master Phase 4): null column = works every
  // day. Stored values are weekday numbers 0 (Sunday) … 6 (Saturday).
  let availableDays: number[] = [0, 1, 2, 3, 4, 5, 6];
  if (pro.availableDays) {
    try {
      const parsed: unknown = JSON.parse(pro.availableDays);
      if (Array.isArray(parsed)) {
        const days = parsed.filter(
          (x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6,
        );
        if (days.length) availableDays = [...new Set(days)].sort((a, b) => a - b);
      }
    } catch {
      availableDays = [0, 1, 2, 3, 4, 5, 6];
    }
  }
  return {
    id: pro.id,
    userId: pro.userId,
    name: user.name,
    phone: user.phone,
    categorySlug: pro.categorySlug,
    categoryName: serviceName,
    experienceYears: pro.experienceYears,
    skills: pro.skills,
    areas,
    address: pro.address,
    bio: pro.bio,
    status: pro.status,
    available: pro.available === 1,
    availableDays,
    photoUrl: await photoUrl(ctx, user.photoKey),
    avgRating: avg,
    reviewCount: approved.length,
    completedJobs: done.length,
  };
}

async function serviceNameMap(ctx: Ctx): Promise<Map<string, string>> {
  const db = dbOf(ctx);
  const rows = await db.select().from(schema.services);
  return new Map(rows.map((s) => [s.slug, s.nameBn]));
}

const bookingOut = z.object({
  id: z.number(),
  code: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  phone: z.string(),
  serviceSlug: z.string(),
  serviceName: z.string(),
  professionalId: z.number().nullable(),
  professionalName: z.string().nullable(),
  district: z.string(),
  upazila: z.string(),
  area: z.string().nullable(),
  address: z.string(),
  description: z.string(),
  instructions: z.string().nullable(),
  photoUrls: z.array(z.string()),
  preferredDate: z.string(),
  preferredTime: z.string(),
  status: z.string(),
  proResponse: z.string(),
  proDone: z.boolean(),
  finalPrice: z.number().nullable(),
  paymentStatus: z.string(),
  // Dual Payment snapshot (null until a price/model is confirmed).
  paymentModel: z.string().nullable(),
  extendedPaymentStatus: z.string(),
  calcBase: z.number().nullable(),
  onlineAmount: z.number().nullable(),
  cashAmount: z.number().nullable(),
  customerFee: z.number().nullable(),
  proCommission: z.number().nullable(),
  heldBalance: z.number().nullable(),
  createdAt: z.string(),
  events: z.array(
    z.object({ status: z.string(), note: z.string().nullable(), createdAt: z.string() }),
  ),
});

type BookingRow = typeof schema.bookings.$inferSelect;

async function toBookingOut(
  ctx: Ctx,
  b: BookingRow,
  names: Map<string, string>,
  proNames: Map<number, string>,
): Promise<z.infer<typeof bookingOut>> {
  const db = dbOf(ctx);
  let keys: string[] = [];
  try {
    const parsed: unknown = JSON.parse(b.photoKeys);
    if (Array.isArray(parsed)) keys = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    keys = [];
  }
  const urls: string[] = [];
  for (const k of keys) {
    const u = await photoUrl(ctx, k);
    if (u) urls.push(u);
  }
  const events = await db
    .select()
    .from(schema.bookingEvents)
    .where(eq(schema.bookingEvents.bookingId, b.id))
    .orderBy(asc(schema.bookingEvents.id));
  return {
    id: b.id,
    code: b.code,
    customerId: b.customerId,
    customerName: b.customerName,
    phone: b.phone,
    serviceSlug: b.serviceSlug,
    serviceName: names.get(b.serviceSlug) ?? b.serviceSlug,
    professionalId: b.professionalId,
    professionalName: b.professionalId ? (proNames.get(b.professionalId) ?? null) : null,
    district: b.district,
    upazila: b.upazila,
    area: b.area,
    address: b.address,
    description: b.description,
    instructions: b.instructions,
    photoUrls: urls,
    preferredDate: b.preferredDate,
    preferredTime: b.preferredTime,
    status: b.status,
    proResponse: b.proResponse,
    proDone: b.proDone === 1,
    finalPrice: b.finalPrice,
    paymentStatus: b.paymentStatus,
    paymentModel: b.paymentModel,
    extendedPaymentStatus: b.extendedPaymentStatus,
    calcBase: b.calcBase,
    onlineAmount: b.onlineAmount,
    cashAmount: b.cashAmount,
    customerFee: b.customerFee,
    proCommission: b.proCommission,
    heldBalance: b.heldBalance,
    createdAt: b.createdAt.toISOString(),
    events: events.map((e) => ({
      status: e.status,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

async function proNameMap(ctx: Ctx): Promise<Map<number, string>> {
  const db = dbOf(ctx);
  const pros = await db.select().from(schema.professionals);
  const users = await db.select().from(schema.users);
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return new Map(pros.map((p) => [p.id, byId.get(p.userId) ?? ""]));
}

const paymentOut = z.object({
  id: z.number(),
  bookingId: z.number(),
  bookingCode: z.string(),
  paymentModel: z.string(),
  method: z.string(),
  provider: z.string(),
  providerTrxId: z.string(),
  senderNumber: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  idempotencyKey: z.string(),
  submittedBy: z.number(),
  verifiedBy: z.number().nullable(),
  verifiedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
});

type PaymentRow = typeof schema.payments.$inferSelect;

function toPaymentOut(
  p: PaymentRow,
  bookingCode: string,
): z.infer<typeof paymentOut> {
  return {
    id: p.id,
    bookingId: p.bookingId,
    bookingCode,
    paymentModel: p.paymentModel,
    method: p.method,
    provider: p.provider,
    providerTrxId: p.providerTrxId,
    senderNumber: p.senderNumber,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    idempotencyKey: p.idempotencyKey,
    submittedBy: p.submittedBy,
    verifiedBy: p.verifiedBy,
    verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt.toISOString(),
  };
}

const breakdownOut = z.object({
  bill: z.number(),
  calcBase: z.number(),
  paymentModel: z.string(),
  customerFeePercent: z.number(),
  proCommissionPercent: z.number(),
  onlineBase: z.number(),
  customerFee: z.number(),
  customerPaysOnline: z.number(),
  cashAmount: z.number(),
  proCommission: z.number(),
  heldAmount: z.number(),
  proPayoutFromHeld: z.number(),
  proCashReceived: z.number(),
  proTotal: z.number(),
  ghorshebaRevenue: z.number(),
});

// ------------------------------------------------- Phase 3 output shapes

const ledgerEntryOut = z.object({
  id: z.number(),
  entryType: z.string(),
  amount: z.number(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

const addressOut = z.object({
  id: z.number(),
  label: z.string(),
  upazila: z.string(),
  area: z.string().nullable(),
  address: z.string(),
  phone: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

type AddressRow = typeof schema.addresses.$inferSelect;

function toAddressOut(a: AddressRow): z.infer<typeof addressOut> {
  return {
    id: a.id,
    label: a.label,
    upazila: a.upazila,
    area: a.area,
    address: a.address,
    phone: a.phone,
    isDefault: a.isDefault === 1,
    createdAt: a.createdAt.toISOString(),
  };
}

const refundRequestOut = z.object({
  id: z.number(),
  bookingId: z.number(),
  bookingCode: z.string(),
  paymentId: z.number().nullable(),
  reason: z.string(),
  detail: z.string(),
  status: z.string(),
  adminNote: z.string().nullable(),
  createdAt: z.string(),
});

type RefundRow = typeof schema.refundRequests.$inferSelect;

function toRefundOut(
  r: RefundRow,
  bookingCode: string,
): z.infer<typeof refundRequestOut> {
  return {
    id: r.id,
    bookingId: r.bookingId,
    bookingCode,
    paymentId: r.paymentId,
    reason: r.reason,
    detail: r.detail,
    status: r.status,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
  };
}

const sessionInfoOut = z.object({
  // Opaque reference derived from the session token (a truncated hash)
  // so the client can name a session to revoke without ever seeing or
  // sending another session's raw token.
  ref: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
});

const deletionRequestOut = z.object({
  id: z.number(),
  reason: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
});

const reviewOut = z.object({
  id: z.number(),
  bookingId: z.number(),
  customerName: z.string(),
  professionalId: z.number().nullable(),
  professionalName: z.string().nullable(),
  serviceSlug: z.string(),
  serviceName: z.string(),
  rating: z.number(),
  text: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

const imageInput = z
  .object({ dataBase64: z.string(), mimeType: z.string() })
  .optional();

const sessionOut = z.object({ token: z.string(), user: userOut });
const okOut = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------- actions

export const Actions = {
  // ---------------------------------------------------------- public reads
  getPublicMeta: defineAction({
    description: "Returns whether an admin account exists yet (for first-run admin setup).",
    request: z.object({}),
    response: z.object({ adminExists: z.boolean() }),
    async handler(ctx) {
      const db = dbOf(ctx);
      const admins = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, "admin"))
        .limit(1);
      return { adminExists: admins.length > 0 };
    },
  }),

  getCatalog: defineAction({
    description: "Returns active services, active locations and public platform settings.",
    request: z.object({}),
    response: z.object({
      services: z.array(serviceOut),
      locations: z.array(locationOut),
      supportPhone: z.string().nullable(),
      supportWhatsapp: z.string().nullable(),
      supportEmail: z.string().nullable(),
      announcement: z.string().nullable(),
      paymentReceiveNumber: z.string().nullable(),
      paymentReceiveProvider: z.string().nullable(),
    }),
    async handler(ctx) {
      const db = dbOf(ctx);
      const svcs = await db
        .select()
        .from(schema.services)
        .where(eq(schema.services.active, 1))
        .orderBy(asc(schema.services.sortOrder));
      const locs = await db
        .select()
        .from(schema.locations)
        .where(eq(schema.locations.active, 1))
        .orderBy(asc(schema.locations.id));
      const st = await db.select().from(schema.settings).limit(1);
      const s = st[0];
      return {
        services: svcs.map(toServiceOut),
        locations: locs.map((l) => ({
          id: l.id,
          nameEn: l.nameEn,
          nameBn: l.nameBn,
          district: l.district,
          active: l.active === 1,
        })),
        supportPhone: s?.supportPhone ?? null,
        supportWhatsapp: s?.supportWhatsapp ?? null,
        supportEmail: s?.supportEmail ?? null,
        announcement: s?.announcement ?? null,
        paymentReceiveNumber: s?.paymentReceiveNumber ?? null,
        paymentReceiveProvider: s?.paymentReceiveProvider ?? null,
      };
    },
  }),

  listProfessionals: defineAction({
    description: "Lists verified professionals, optionally filtered by category, upazila or search text.",
    request: z.object({
      category: z.string().optional(),
      location: z.string().optional(),
      q: z.string().optional(),
    }),
    response: z.object({ professionals: z.array(proOut) }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const pros = await db
        .select()
        .from(schema.professionals)
        .where(eq(schema.professionals.status, "verified"))
        .orderBy(desc(schema.professionals.id));
      const users = await db.select().from(schema.users);
      const byId = new Map(users.map((u) => [u.id, u]));
      const out: z.infer<typeof proOut>[] = [];
      for (const p of pros) {
        const u = byId.get(p.userId);
        if (!u || u.status !== "active") continue;
        const card = await toProOut(ctx, p, u, names.get(p.categorySlug) ?? p.categorySlug);
        if (args.category && p.categorySlug !== args.category) continue;
        if (args.location && !card.areas.includes(args.location)) continue;
        if (args.q) {
          const q = args.q.trim().toLowerCase();
          const hay = `${card.name} ${card.categoryName} ${card.skills ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        out.push(card);
      }
      out.sort(
        (a, b) =>
          b.completedJobs - a.completedJobs ||
          (b.avgRating ?? 0) - (a.avgRating ?? 0),
      );
      return { professionals: out };
    },
  }),

  getProfessional: defineAction({
    description: "Returns one verified professional's public profile and approved reviews.",
    request: z.object({ id: z.number().int() }),
    response: z.object({
      professional: proOut.nullable(),
      reviews: z.array(reviewOut),
    }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const rows = await db
        .select()
        .from(schema.professionals)
        .where(eq(schema.professionals.id, args.id))
        .limit(1);
      const pro = rows[0];
      if (!pro || pro.status !== "verified") return { professional: null, reviews: [] };
      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, pro.userId))
        .limit(1);
      const user = users[0];
      if (!user) return { professional: null, reviews: [] };
      const card = await toProOut(ctx, pro, user, names.get(pro.categorySlug) ?? pro.categorySlug);
      const revs = await db
        .select()
        .from(schema.reviews)
        .where(
          and(
            eq(schema.reviews.professionalId, pro.id),
            eq(schema.reviews.status, "approved"),
          ),
        )
        .orderBy(desc(schema.reviews.id));
      const custIds = [...new Set(revs.map((r) => r.customerId))];
      const custs = custIds.length
        ? await db.select().from(schema.users).where(inArray(schema.users.id, custIds))
        : [];
      const custMap = new Map(custs.map((c) => [c.id, c.name]));
      return {
        professional: card,
        reviews: revs.map((r) => ({
          id: r.id,
          bookingId: r.bookingId,
          customerName: custMap.get(r.customerId) ?? "গ্রাহক",
          professionalId: r.professionalId,
          professionalName: card.name,
          serviceSlug: r.serviceSlug,
          serviceName: names.get(r.serviceSlug) ?? r.serviceSlug,
          rating: r.rating,
          text: r.text,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  getHomeReviews: defineAction({
    description: "Returns the latest approved customer reviews for the homepage.",
    request: z.object({ limit: z.number().int().min(1).max(12).default(6) }),
    response: z.object({ reviews: z.array(reviewOut) }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const revs = await db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.status, "approved"))
        .orderBy(desc(schema.reviews.id))
        .limit(args.limit);
      const custIds = [...new Set(revs.map((r) => r.customerId))];
      const custs = custIds.length
        ? await db.select().from(schema.users).where(inArray(schema.users.id, custIds))
        : [];
      const custMap = new Map(custs.map((c) => [c.id, c.name]));
      return {
        reviews: revs.map((r) => ({
          id: r.id,
          bookingId: r.bookingId,
          customerName: custMap.get(r.customerId) ?? "গ্রাহক",
          professionalId: r.professionalId,
          professionalName: r.professionalId ? (proNames.get(r.professionalId) ?? null) : null,
          serviceSlug: r.serviceSlug,
          serviceName: names.get(r.serviceSlug) ?? r.serviceSlug,
          rating: r.rating,
          text: r.text,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  // ------------------------------------------------------------------ auth
  registerCustomer: defineAction({
    description: "Registers a customer account and returns a session token.",
    request: z.object({
      name: z.string().min(2).max(80),
      phone: z.string(),
      password: z.string().min(12).max(64),
      address: z.string().max(300).optional(),
      location: z.string().max(80).optional(),
      photo: imageInput,
    }),
    response: sessionOut,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      if (!PHONE_RE.test(args.phone)) {
        throw new Error("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (01XXXXXXXXX)।");
      }
      const existing = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phone, args.phone))
        .limit(1);
      if (existing.length) {
        throw new Error("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে — লগইন করুন।");
      }
      const photoKey = await storeImage(ctx, "profiles", args.photo);
      const inserted = await db
        .insert(schema.users)
        .values({
          name: args.name.trim(),
          phone: args.phone,
          passwordHash: await hashPassword(args.password),
          role: "customer",
          address: args.address ?? null,
          location: args.location ?? null,
          photoKey,
        })
        .returning();
      const user = inserted[0];
      if (!user) throw new Error("অ্যাকাউন্ট তৈরি করা যায়নি।");
      const token = await createSession(ctx, user.id);
      ctx.invalidateQueries();
      return { token, user: await toUserOut(ctx, user) };
    },
  }),

  registerProfessional: defineAction({
    description: "Registers a professional (mistri) account in Pending Verification status. The NID number and the NID front/back photos are required and stored for admin-only verification.",
    request: z.object({
      name: z.string().min(2).max(80),
      phone: z.string(),
      password: z.string().min(12).max(64),
      email: z.string().max(120).optional(),
      categorySlug: z.string(),
      experienceYears: z.number().int().min(0).max(60),
      skills: z.string().max(300).optional(),
      areas: z.array(z.string()).min(1),
      address: z.string().max(300).optional(),
      bio: z.string().max(600).optional(),
      nidNumber: z.string().min(5).max(20),
      nidFrontPhoto: imageInput,
      nidBackPhoto: imageInput,
      photo: imageInput,
    }),
    response: sessionOut,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      if (!PHONE_RE.test(args.phone)) {
        throw new Error("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (01XXXXXXXXX)।");
      }
      const svc = await db
        .select()
        .from(schema.services)
        .where(eq(schema.services.slug, args.categorySlug))
        .limit(1);
      if (!svc.length) throw new Error("সার্ভিস ক্যাটাগরি সঠিক নয়।");
      // Identity documents are required at registration (owner's NID
      // policy): the NID front photo and the NID back photo.
      const nidFront = validateIdentityImage(args.nidFrontPhoto, "NID কার্ডের সামনের ছবি");
      const nidBack = validateIdentityImage(args.nidBackPhoto, "NID কার্ডের পেছনের ছবি");
      const existing = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phone, args.phone))
        .limit(1);
      if (existing.length) {
        throw new Error("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে — লগইন করুন।");
      }
      const photoKey = await storeImage(ctx, "profiles", args.photo);
      const inserted = await db
        .insert(schema.users)
        .values({
          name: args.name.trim(),
          phone: args.phone,
          passwordHash: await hashPassword(args.password),
          role: "professional",
          address: args.address ?? null,
          photoKey,
        })
        .returning();
      const user = inserted[0];
      if (!user) throw new Error("অ্যাকাউন্ট তৈরি করা যায়নি।");
      const proInserted = await db
        .insert(schema.professionals)
        .values({
          userId: user.id,
          categorySlug: args.categorySlug,
          experienceYears: args.experienceYears,
          skills: args.skills ?? null,
          areas: JSON.stringify(args.areas),
          address: args.address ?? null,
          email: args.email ?? null,
          bio: args.bio ?? null,
          // NID number: visible to admins only — no public, customer
          // or professional action ever returns it.
          nidNumber: args.nidNumber,
          status: "pending",
        })
        .returning();
      const proRow = proInserted[0];
      if (!proRow) throw new Error("অ্যাকাউন্ট তৈরি করা যায়নি।");
      // Document bytes live only in identity_documents (never the blob
      // store), so no public URL can serve them; see
      // getIdentityDocument for the access rules.
      await db.insert(schema.identityDocuments).values([
        { professionalId: proRow.id, kind: "nid_front", contentType: nidFront.mimeType, dataBase64: nidFront.dataBase64 },
        { professionalId: proRow.id, kind: "nid_back", contentType: nidBack.mimeType, dataBase64: nidBack.dataBase64 },
      ]);
      await notify(ctx, {
        targetRole: "admin",
        type: "pro_application",
        title: "নতুন প্রফেশনাল আবেদন",
        body: `${user.name} (${svc[0]?.nameBn ?? args.categorySlug}) যাচাইয়ের অপেক্ষায় আছেন।`,
      });
      const token = await createSession(ctx, user.id);
      ctx.invalidateQueries();
      return { token, user: await toUserOut(ctx, user) };
    },
  }),

  claimAdmin: defineAction({
    description: "First-run setup: creates the platform's Super Admin account. Server-side gated — rejected once any admin exists; attempts are rate-limited and every attempt is written to the admin log.",
    request: z.object({
      name: z.string().min(2).max(80),
      phone: z.string(),
      password: z.string().min(12).max(64),
    }),
    response: sessionOut,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const ip = clientIpOf(ctx);
      // Every claim attempt — successful or not — is written to the
      // admin log; counted attempts feed the rate limit above.
      const logAttempt = async (result: string, adminId: number | null = null) => {
        await db.insert(schema.adminLogs).values({
          adminId,
          action: "admin_claim_attempt",
          detail: `phone=${args.phone} result=${result}`,
        });
      };
      try {
        await assertClaimAllowed(ctx, ip);
      } catch (e) {
        await logAttempt("rate_limited");
        throw e;
      }
      await recordClaimAttempt(ctx, ip);
      const admins = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, "admin"))
        .limit(1);
      if (admins.length) {
        await logAttempt("rejected_admin_exists");
        throw new Error("অ্যাডমিন অ্যাকাউন্ট ইতিমধ্যে তৈরি হয়ে গেছে।");
      }
      if (!PHONE_RE.test(args.phone)) {
        await logAttempt("rejected_bad_phone");
        throw new Error("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (01XXXXXXXXX)।");
      }
      const existing = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phone, args.phone))
        .limit(1);
      if (existing.length) {
        await logAttempt("rejected_phone_in_use");
        throw new Error("এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে।");
      }
      const inserted = await db
        .insert(schema.users)
        .values({
          name: args.name.trim(),
          phone: args.phone,
          passwordHash: await hashPassword(args.password),
          role: "admin",
          adminLevel: "super",
        })
        .returning();
      const user = inserted[0];
      if (!user) throw new Error("অ্যাডমিন অ্যাকাউন্ট তৈরি করা যায়নি।");
      await logAttempt("success", user.id);
      await logAdmin(ctx, user.id, "admin_setup", "প্রথম অ্যাডমিন (সুপার অ্যাডমিন) অ্যাকাউন্ট তৈরি হয়েছে");
      const token = await createSession(ctx, user.id);
      ctx.invalidateQueries();
      return { token, user: await toUserOut(ctx, user) };
    },
  }),

  login: defineAction({
    description: "Logs in with mobile number and password. Failed attempts are rate-limited with a temporary lockout; a successful login rotates the session token and transparently upgrades legacy password hashes to bcrypt.",
    request: z.object({ phone: z.string(), password: z.string().min(1) }),
    response: sessionOut,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const phone = args.phone.trim();
      const ip = clientIpOf(ctx);
      await assertLoginAllowed(ctx, phone, ip);
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phone, phone))
        .limit(1);
      const user = rows[0];
      if (!user || !(await verifyPassword(args.password, user.passwordHash))) {
        await recordLoginFailure(ctx, phone, ip);
        throw new Error("মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়।");
      }
      if (user.status === "suspended") {
        throw new Error("এই অ্যাকাউন্টটি স্থগিত আছে — সাপোর্টে যোগাযোগ করুন।");
      }
      await clearLoginAttempts(ctx, phone, ip);
      // Transparent hash upgrade: accounts created under the old
      // salted SHA-256 scheme are re-hashed to bcrypt on this login.
      if (isLegacyPasswordHash(user.passwordHash)) {
        await db
          .update(schema.users)
          .set({ passwordHash: await hashPassword(args.password), updatedAt: new Date() })
          .where(eq(schema.users.id, user.id));
      }
      // Session rotation: a fresh login invalidates every older
      // session for this account before issuing the new token.
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
      const token = await createSession(ctx, user.id);
      return { token, user: await toUserOut(ctx, user) };
    },
  }),

  logout: defineAction({
    description: "Ends the current session.",
    request: z.object({ token: z.string() }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const db = dbOf(ctx);
      await db.delete(schema.sessions).where(eq(schema.sessions.token, args.token));
      return { ok: true };
    },
  }),

  getMe: defineAction({
    description: "Returns the signed-in user's profile and professional profile if any.",
    request: z.object({ token: z.string() }),
    response: z.object({
      user: userOut,
      professional: proOut.nullable(),
      unreadNotifications: z.number(),
    }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const pro = await myProfessional(ctx, user.id);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.isRead, 0));
      const unread = notifs.filter(
        (n) => n.userId === user.id || (n.userId === null && n.targetRole === user.role),
      ).length;
      return {
        user: await toUserOut(ctx, user),
        professional: pro
          ? await toProOut(ctx, pro, user, names.get(pro.categorySlug) ?? pro.categorySlug)
          : null,
        unreadNotifications: unread,
      };
    },
  }),

  updateMyProfile: defineAction({
    description: "Updates the signed-in customer's profile details and photo.",
    request: z.object({
      token: z.string(),
      name: z.string().min(2).max(80),
      address: z.string().max(300).optional(),
      location: z.string().max(80).optional(),
      photo: imageInput,
    }),
    response: z.object({ user: userOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const photoKey = await storeImage(ctx, "profiles", args.photo);
      await db
        .update(schema.users)
        .set({
          name: args.name.trim(),
          address: args.address ?? user.address,
          location: args.location ?? user.location,
          photoKey: photoKey ?? user.photoKey,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
      const updated = rows[0];
      if (!updated) throw new Error("প্রোফাইল আপডেট করা যায়নি।");
      ctx.invalidateQueries();
      return { user: await toUserOut(ctx, updated) };
    },
  }),

  updateProProfile: defineAction({
    description: "Updates the signed-in professional's public profile and availability.",
    request: z.object({
      token: z.string(),
      name: z.string().min(2).max(80),
      experienceYears: z.number().int().min(0).max(60),
      skills: z.string().max(300).optional(),
      areas: z.array(z.string()).min(1),
      address: z.string().max(300).optional(),
      bio: z.string().max(600).optional(),
      available: z.boolean(),
      // Per-day availability (Master Phase 4): weekday numbers
      // 0 (Sunday) … 6 (Saturday). Omit to keep the stored value.
      availableDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      photo: imageInput,
    }),
    response: z.object({ professional: proOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const pro = await myProfessional(ctx, user.id);
      if (!pro) throw new Error("প্রফেশনাল প্রোফাইল পাওয়া যায়নি।");
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const photoKey = await storeImage(ctx, "profiles", args.photo);
      await db
        .update(schema.users)
        .set({ name: args.name.trim(), photoKey: photoKey ?? user.photoKey, updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));
      await db
        .update(schema.professionals)
        .set({
          experienceYears: args.experienceYears,
          skills: args.skills ?? pro.skills,
          areas: JSON.stringify(args.areas),
          address: args.address ?? pro.address,
          bio: args.bio ?? pro.bio,
          available: args.available ? 1 : 0,
          availableDays:
            args.availableDays !== undefined
              ? JSON.stringify([...new Set(args.availableDays)].sort((a, b) => a - b))
              : pro.availableDays,
          updatedAt: new Date(),
        })
        .where(eq(schema.professionals.id, pro.id));
      const rows = await db
        .select()
        .from(schema.professionals)
        .where(eq(schema.professionals.id, pro.id))
        .limit(1);
      const urows = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
      const updatedPro = rows[0];
      const updatedUser = urows[0];
      if (!updatedPro || !updatedUser) throw new Error("প্রোফাইল আপডেট করা যায়নি।");
      ctx.invalidateQueries();
      return {
        professional: await toProOut(
          ctx,
          updatedPro,
          updatedUser,
          names.get(updatedPro.categorySlug) ?? updatedPro.categorySlug,
        ),
      };
    },
  }),
  // -------------------------------------------------------------- bookings
  createBooking: defineAction({
    description: "Creates a booking request in Pending status and notifies the admin.",
    request: z.object({
      token: z.string(),
      serviceSlug: z.string(),
      professionalId: z.number().int().optional(),
      customerName: z.string().min(2).max(80),
      phone: z.string(),
      upazila: z.string().min(2).max(80),
      area: z.string().max(120).optional(),
      address: z.string().min(5).max(400),
      description: z.string().min(5).max(1500),
      instructions: z.string().max(600).optional(),
      preferredDate: z.string().min(4).max(20),
      preferredTime: z.string().min(2).max(40),
      photos: z.array(z.object({ dataBase64: z.string(), mimeType: z.string() })).max(3).optional(),
    }),
    response: z.object({ code: z.string(), booking: bookingOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer" && user.role !== "admin") {
        throw new Error("শুধুমাত্র গ্রাহকরা বুকিং করতে পারবেন।");
      }
      if (!PHONE_RE.test(args.phone)) {
        throw new Error("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (01XXXXXXXXX)।");
      }
      const db = dbOf(ctx);
      const svc = await db
        .select()
        .from(schema.services)
        .where(eq(schema.services.slug, args.serviceSlug))
        .limit(1);
      if (!svc.length || svc[0]?.active !== 1) throw new Error("সার্ভিসটি পাওয়া যায়নি।");
      let proId: number | null = null;
      if (args.professionalId) {
        const pros = await db
          .select()
          .from(schema.professionals)
          .where(eq(schema.professionals.id, args.professionalId))
          .limit(1);
        const p = pros[0];
        if (p && p.status === "verified" && p.categorySlug === args.serviceSlug) {
          proId = p.id;
        }
      }
      const photoKeys: string[] = [];
      for (const ph of args.photos ?? []) {
        const key = await storeImage(ctx, "bookings", ph);
        if (key) photoKeys.push(key);
      }
      const code = `GS-${Date.now().toString(36).toUpperCase()}-${randomHex(2).toUpperCase()}`;
      const inserted = await db
        .insert(schema.bookings)
        .values({
          code,
          customerId: user.id,
          serviceSlug: args.serviceSlug,
          professionalId: proId,
          customerName: args.customerName.trim(),
          phone: args.phone,
          upazila: args.upazila,
          area: args.area ?? null,
          address: args.address.trim(),
          description: args.description.trim(),
          instructions: args.instructions ?? null,
          photoKeys: JSON.stringify(photoKeys),
          preferredDate: args.preferredDate,
          preferredTime: args.preferredTime,
          status: "pending",
        })
        .returning();
      const booking = inserted[0];
      if (!booking) throw new Error("বুকিং তৈরি করা যায়নি।");
      await addEvent(ctx, booking.id, "pending", user.role, "বুকিং রিকোয়েস্ট পাঠানো হয়েছে");
      await notify(ctx, {
        targetRole: "admin",
        type: "new_booking",
        title: "নতুন বুকিং রিকোয়েস্ট",
        body: `${svc[0]?.nameBn ?? args.serviceSlug} — ${args.upazila} (কোড: ${code})`,
        bookingId: booking.id,
      });
      if (proId) {
        const pros = await db
          .select()
          .from(schema.professionals)
          .where(eq(schema.professionals.id, proId))
          .limit(1);
        if (pros[0]) {
          await notify(ctx, {
            userId: pros[0].userId,
            type: "booking_requested_pro",
            title: "আপনাকে বেছে নিয়ে বুকিং এসেছে",
            body: `কোড: ${code} — অ্যাডমিন নিশ্চিত করলে কাজটি আপনার কাছে যাবে।`,
            bookingId: booking.id,
          });
        }
      }
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      ctx.invalidateQueries();
      return { code, booking: await toBookingOut(ctx, booking, names, proNames) };
    },
  }),

  getBooking: defineAction({
    description: "Returns one booking with status history; only its customer, assigned professional or an admin may view it.",
    request: z.object({ token: z.string(), code: z.string() }),
    response: z.object({ booking: bookingOut.nullable(), myReview: reviewOut.nullable() }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.code, args.code))
        .limit(1);
      const b = rows[0];
      if (!b) return { booking: null, myReview: null };
      const pro = await myProfessional(ctx, user.id);
      const allowed =
        user.role === "admin" ||
        b.customerId === user.id ||
        (pro !== null && b.professionalId === pro.id);
      if (!allowed) throw new Error("এই বুকিং দেখার অনুমতি নেই।");
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const revs = await db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.bookingId, b.id))
        .limit(1);
      const r = revs[0];
      return {
        booking: await toBookingOut(ctx, b, names, proNames),
        myReview: r
          ? {
              id: r.id,
              bookingId: r.bookingId,
              customerName: b.customerName,
              professionalId: r.professionalId,
              professionalName: r.professionalId ? (proNames.get(r.professionalId) ?? null) : null,
              serviceSlug: r.serviceSlug,
              serviceName: names.get(r.serviceSlug) ?? r.serviceSlug,
              rating: r.rating,
              text: r.text,
              status: r.status,
              createdAt: r.createdAt.toISOString(),
            }
          : null,
      };
    },
  }),

  getMyBookings: defineAction({
    description: "Returns the signed-in customer's bookings, newest first.",
    request: z.object({ token: z.string() }),
    response: z.object({ bookings: z.array(bookingOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.customerId, user.id))
        .orderBy(desc(schema.bookings.id));
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const out: z.infer<typeof bookingOut>[] = [];
      for (const b of rows) out.push(await toBookingOut(ctx, b, names, proNames));
      return { bookings: out };
    },
  }),

  cancelBooking: defineAction({
    description: "Cancels the customer's own booking while it is still pending, confirmed or assigned.",
    request: z.object({ token: z.string(), bookingId: z.number().int() }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b || b.customerId !== user.id) throw new Error("বুকিং পাওয়া যায়নি।");
      if (!["pending", "confirmed", "assigned"].includes(b.status)) {
        throw new Error("এই অবস্থায় বুকিং বাতিল করা যাবে না।");
      }
      await db
        .update(schema.bookings)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(schema.bookings.id, b.id));
      await addEvent(ctx, b.id, "cancelled", "customer", "গ্রাহক বুকিং বাতিল করেছেন");
      // P-1: a still-pending online payment on a cancelled booking
      // is failed automatically, so it can never be verified later.
      await failPendingPaymentsForCancelledBooking(ctx, b, {
        role: "customer",
        adminId: null,
      });
      await notify(ctx, {
        targetRole: "admin",
        type: "booking_cancelled",
        title: "বুকিং বাতিল হয়েছে",
        body: `কোড: ${b.code}`,
        bookingId: b.id,
      });
      if (b.professionalId) {
        const pros = await db
          .select()
          .from(schema.professionals)
          .where(eq(schema.professionals.id, b.professionalId))
          .limit(1);
        if (pros[0]) {
          await notify(ctx, {
            userId: pros[0].userId,
            type: "booking_cancelled",
            title: "একটি কাজ বাতিল হয়েছে",
            body: `কোড: ${b.code}`,
            bookingId: b.id,
          });
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  confirmCompletion: defineAction({
    description: "Customer confirms the work is complete after the professional marked it done.",
    request: z.object({ token: z.string(), bookingId: z.number().int() }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b || b.customerId !== user.id) throw new Error("বুকিং পাওয়া যায়নি।");
      if (b.status !== "in_progress" || b.proDone !== 1) {
        throw new Error("প্রফেশনাল কাজ শেষ বলে জানালে তবেই সম্পন্ন নিশ্চিত করা যাবে।");
      }
      await db
        .update(schema.bookings)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(schema.bookings.id, b.id));
      await addEvent(ctx, b.id, "completed", "customer", "গ্রাহক কাজ সম্পন্ন নিশ্চিত করেছেন");
      await notify(ctx, {
        targetRole: "admin",
        type: "job_completed",
        title: "কাজ সম্পন্ন হয়েছে",
        body: `কোড: ${b.code}`,
        bookingId: b.id,
      });
      if (b.professionalId) {
        const pros = await db
          .select()
          .from(schema.professionals)
          .where(eq(schema.professionals.id, b.professionalId))
          .limit(1);
        if (pros[0]) {
          await notify(ctx, {
            userId: pros[0].userId,
            type: "job_completed",
            title: "কাজ সম্পন্ন নিশ্চিত হয়েছে",
            body: `কোড: ${b.code}`,
            bookingId: b.id,
          });
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  submitReview: defineAction({
    description: "Submits a rating and review for a completed booking; it appears publicly after admin moderation.",
    request: z.object({
      token: z.string(),
      bookingId: z.number().int(),
      rating: z.number().int().min(1).max(5),
      text: z.string().min(3).max(1000),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b || b.customerId !== user.id) throw new Error("বুকিং পাওয়া যায়নি।");
      if (b.status !== "completed") throw new Error("কাজ সম্পন্ন হলেই রিভিউ দেওয়া যাবে।");
      const existing = await db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.bookingId, b.id))
        .limit(1);
      if (existing.length) throw new Error("এই বুকিংয়ের রিভিউ ইতিমধ্যে দেওয়া হয়েছে।");
      await db.insert(schema.reviews).values({
        bookingId: b.id,
        customerId: user.id,
        professionalId: b.professionalId,
        serviceSlug: b.serviceSlug,
        rating: args.rating,
        text: args.text.trim(),
        status: "pending",
      });
      await notify(ctx, {
        targetRole: "admin",
        type: "new_review",
        title: "নতুন রিভিউ মডারেশনের অপেক্ষায়",
        body: `কোড: ${b.code} — ${args.rating} স্টার`,
        bookingId: b.id,
      });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  submitComplaint: defineAction({
    description: "Submits a support complaint from a signed-in customer.",
    request: z.object({
      token: z.string(),
      subject: z.string().min(3).max(150),
      message: z.string().min(5).max(1500),
      bookingCode: z.string().max(40).optional(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      await db.insert(schema.complaints).values({
        customerId: user.id,
        bookingCode: args.bookingCode ?? null,
        subject: args.subject.trim(),
        message: args.message.trim(),
        status: "open",
      });
      await notify(ctx, {
        targetRole: "admin",
        type: "complaint",
        title: "নতুন অভিযোগ এসেছে",
        body: args.subject.trim(),
      });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getMyComplaints: defineAction({
    description: "Returns the signed-in customer's complaints and their resolution status.",
    request: z.object({ token: z.string() }),
    response: z.object({
      complaints: z.array(
        z.object({
          id: z.number(),
          subject: z.string(),
          message: z.string(),
          bookingCode: z.string().nullable(),
          status: z.string(),
          adminNote: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.complaints)
        .where(eq(schema.complaints.customerId, user.id))
        .orderBy(desc(schema.complaints.id));
      return {
        complaints: rows.map((c) => ({
          id: c.id,
          subject: c.subject,
          message: c.message,
          bookingCode: c.bookingCode,
          status: c.status,
          adminNote: c.adminNote,
          createdAt: c.createdAt.toISOString(),
        })),
      };
    },
  }),

  getNotifications: defineAction({
    description: "Returns notifications for the signed-in user (own plus role-wide).",
    request: z.object({ token: z.string() }),
    response: z.object({
      notifications: z.array(
        z.object({
          id: z.number(),
          type: z.string(),
          title: z.string(),
          body: z.string().nullable(),
          isRead: z.boolean(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.notifications)
        .orderBy(desc(schema.notifications.id))
        .limit(100);
      const mine = rows.filter(
        (n) => n.userId === user.id || (n.userId === null && n.targetRole === user.role),
      );
      return {
        notifications: mine.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          isRead: n.isRead === 1,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    },
  }),

  markNotificationsRead: defineAction({
    description: "Marks all of the signed-in user's notifications as read.",
    request: z.object({ token: z.string() }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db.select().from(schema.notifications);
      for (const n of rows) {
        if (n.userId === user.id || (n.userId === null && n.targetRole === user.role)) {
          await db
            .update(schema.notifications)
            .set({ isRead: 1 })
            .where(eq(schema.notifications.id, n.id));
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ------------------------------------------------------ professional side
  getProJobs: defineAction({
    description: "Returns bookings assigned to the signed-in professional, newest first.",
    request: z.object({ token: z.string() }),
    response: z.object({ bookings: z.array(bookingOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const pro = await myProfessional(ctx, user.id);
      if (!pro) throw new Error("প্রফেশনাল প্রোফাইল পাওয়া যায়নি।");
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.professionalId, pro.id))
        .orderBy(desc(schema.bookings.id));
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const out: z.infer<typeof bookingOut>[] = [];
      for (const b of rows) out.push(await toBookingOut(ctx, b, names, proNames));
      return { bookings: out };
    },
  }),

  proRespond: defineAction({
    description: "Professional accepts or rejects a job the admin assigned to them.",
    request: z.object({
      token: z.string(),
      bookingId: z.number().int(),
      accept: z.boolean(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const pro = await myProfessional(ctx, user.id);
      if (!pro) throw new Error("প্রফেশনাল প্রোফাইল পাওয়া যায়নি।");
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b || b.professionalId !== pro.id) throw new Error("এই কাজটি আপনার জন্য নয়।");
      if (b.status !== "assigned" || b.proResponse !== "none") {
        throw new Error("এই কাজে এখন সাড়া দেওয়া যাবে না।");
      }
      if (args.accept) {
        // Verification gate (Master Phase 4): only a verified
        // professional may accept work. Enforced here on the server —
        // hiding the button in the UI is not the gate. (Admins can
        // only assign verified professionals, so an unverified pro
        // should never reach this branch; this is defence in depth for
        // pros whose status changed after assignment.)
        if (pro.status !== "verified") {
          throw new Error("আপনার প্রোফাইল এখনো যাচাই সম্পন্ন হয়নি — যাচাই না হলে কাজ গ্রহণ করা যাবে না।");
        }
        await db
          .update(schema.bookings)
          .set({ proResponse: "accepted", updatedAt: new Date() })
          .where(eq(schema.bookings.id, b.id));
        await addEvent(ctx, b.id, "assigned", "professional", "প্রফেশনাল কাজটি গ্রহণ করেছেন");
        await notify(ctx, {
          userId: b.customerId,
          type: "pro_accepted",
          title: "প্রফেশনাল কাজটি গ্রহণ করেছেন",
          body: `কোড: ${b.code}`,
          bookingId: b.id,
        });
      } else {
        await db
          .update(schema.bookings)
          .set({ professionalId: null, proResponse: "none", status: "confirmed", updatedAt: new Date() })
          .where(eq(schema.bookings.id, b.id));
        await addEvent(ctx, b.id, "confirmed", "professional", "প্রফেশনাল কাজটি নিতে পারেননি — নতুন করে অ্যাসাইন করতে হবে");
        await notify(ctx, {
          targetRole: "admin",
          type: "pro_rejected",
          title: "প্রফেশনাল কাজটি নেননি",
          body: `কোড: ${b.code} — অন্য প্রফেশনাল অ্যাসাইন করুন।`,
          bookingId: b.id,
        });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  proAdvance: defineAction({
    description: "Professional starts an accepted job or marks the work done.",
    request: z.object({
      token: z.string(),
      bookingId: z.number().int(),
      action: z.enum(["start", "done"]),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const pro = await myProfessional(ctx, user.id);
      if (!pro) throw new Error("প্রফেশনাল প্রোফাইল পাওয়া যায়নি।");
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b || b.professionalId !== pro.id) throw new Error("এই কাজটি আপনার জন্য নয়।");
      if (args.action === "start") {
        if (b.status !== "assigned" || b.proResponse !== "accepted") {
          throw new Error("আগে কাজটি গ্রহণ করুন।");
        }
        await db
          .update(schema.bookings)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(eq(schema.bookings.id, b.id));
        await addEvent(ctx, b.id, "in_progress", "professional", "কাজ শুরু হয়েছে");
        await notify(ctx, {
          userId: b.customerId,
          type: "job_started",
          title: "আপনার কাজ শুরু হয়েছে",
          body: `কোড: ${b.code}`,
          bookingId: b.id,
        });
      } else {
        if (b.status !== "in_progress") throw new Error("কাজ চলমান থাকলেই শেষ করা যাবে।");
        await db
          .update(schema.bookings)
          .set({ proDone: 1, updatedAt: new Date() })
          .where(eq(schema.bookings.id, b.id));
        await addEvent(ctx, b.id, "in_progress", "professional", "প্রফেশনাল কাজ শেষ বলে জানিয়েছেন — গ্রাহকের নিশ্চিতকরণ বাকি");
        await notify(ctx, {
          userId: b.customerId,
          type: "job_done_pending",
          title: "কাজ শেষ — নিশ্চিত করুন",
          body: `কোড: ${b.code} — কাজ ঠিকমতো হলে 'সম্পন্ন নিশ্চিত করুন' চাপুন।`,
          bookingId: b.id,
        });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
  // --------------------------------------- professional dashboard (Phase 4)

  getProEarnings: defineAction({
    description:
      "Returns the signed-in professional's earnings: a per-booking breakdown and totals computed on the server from the immutable payment ledger and each booking's payment snapshot. The client never computes money figures.",
    request: z.object({ token: z.string() }),
    response: z.object({
      rows: z.array(
        z.object({
          bookingId: z.number(),
          code: z.string(),
          serviceName: z.string(),
          bookingStatus: z.string(),
          paymentModel: z.string().nullable(),
          serviceCharge: z.number().nullable(),
          calcBase: z.number().nullable(),
          commission: z.number(),
          held: z.number(),
          cashReceived: z.number(),
          payoutFromHeld: z.number(),
          paidOut: z.number(),
          remainingHeld: z.number(),
          proTotal: z.number(),
        }),
      ),
      totals: z.object({
        earned: z.number(),
        held: z.number(),
        paidOut: z.number(),
        commission: z.number(),
        availableBalance: z.number(),
      }),
    }),
    async handler(ctx, args) {
      const { pro } = await requirePro(ctx, args.token);
      const money = await computeProMoney(ctx, pro.id);
      return { rows: money.rows, totals: money.totals };
    },
  }),

  getProWallet: defineAction({
    description:
      "Returns the signed-in professional's own withdrawal destination (method + number), server-computed withdrawable balance, and their withdrawal request history. Another professional's number is never returned.",
    request: z.object({ token: z.string() }),
    response: z.object({
      withdrawalMethod: z.string().nullable(),
      withdrawalNumber: z.string().nullable(),
      held: z.number(),
      openWithdrawalTotal: z.number(),
      availableBalance: z.number(),
      requests: z.array(
        z.object({
          id: z.number(),
          amount: z.number(),
          method: z.string(),
          number: z.string(),
          status: z.string(),
          transactionReference: z.string().nullable(),
          rejectionReason: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const { pro } = await requirePro(ctx, args.token);
      const db = dbOf(ctx);
      const money = await computeProMoney(ctx, pro.id);
      const reqs = await db
        .select()
        .from(schema.withdrawalRequests)
        .where(eq(schema.withdrawalRequests.professionalId, pro.id))
        .orderBy(desc(schema.withdrawalRequests.id));
      return {
        withdrawalMethod: pro.withdrawalMethod,
        withdrawalNumber: pro.withdrawalNumber,
        held: money.totals.held,
        openWithdrawalTotal: money.openWithdrawalTotal,
        availableBalance: money.totals.availableBalance,
        requests: reqs.map((r) => ({
          id: r.id,
          amount: r.amount,
          method: r.withdrawalMethod,
          number: r.withdrawalNumber,
          status: r.status,
          transactionReference: r.transactionReference,
          rejectionReason: r.rejectionReason,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  updateWithdrawalInfo: defineAction({
    description:
      "Sets the signed-in professional's own withdrawal destination (method + account/mobile number) used by future withdrawal requests.",
    request: z.object({
      token: z.string(),
      method: z.enum(["bkash", "nagad", "bank", "pathao_pay"]),
      number: z.string().min(5).max(40),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const { pro } = await requirePro(ctx, args.token);
      const number = args.number.trim();
      if (args.method === "bank") {
        if (!/^[0-9][0-9\s-]{5,39}$/.test(number)) {
          throw new Error("সঠিক ব্যাংক অ্যাকাউন্ট নম্বর দিন।");
        }
      } else if (!PHONE_RE.test(number)) {
        throw new Error("সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (01XXXXXXXXX)।");
      }
      const db = dbOf(ctx);
      await db
        .update(schema.professionals)
        .set({ withdrawalMethod: args.method, withdrawalNumber: number, updatedAt: new Date() })
        .where(eq(schema.professionals.id, pro.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  requestWithdrawal: defineAction({
    description:
      "Professional requests a withdrawal against their server-computed available (held) balance. The amount is validated server-side against the ledger-derived balance minus still-open requests; the request stays pending until an admin decides and pays it (Master Phase 9).",
    request: z.object({
      token: z.string(),
      amount: z.number().int().positive(),
    }),
    response: z.object({
      request: z.object({
        id: z.number(),
        amount: z.number(),
        method: z.string(),
        number: z.string(),
        status: z.string(),
        createdAt: z.string(),
      }),
      availableBalance: z.number(),
    }),
    async handler(ctx, args) {
      const { pro } = await requirePro(ctx, args.token);
      if (!pro.withdrawalMethod || !pro.withdrawalNumber) {
        throw new Error("আগে উইথড্রয়ালের মাধ্যম ও নম্বর সেট করুন।");
      }
      const money = await computeProMoney(ctx, pro.id);
      if (args.amount > money.totals.availableBalance) {
        throw new Error(
          `উত্তোলনযোগ্য ব্যালেন্সের (৳${money.totals.availableBalance}) বেশি টাকা তোলা যাবে না।`,
        );
      }
      const db = dbOf(ctx);
      const inserted = await db
        .insert(schema.withdrawalRequests)
        .values({
          professionalId: pro.id,
          bookingId: null,
          amount: args.amount,
          withdrawalMethod: pro.withdrawalMethod,
          withdrawalNumber: pro.withdrawalNumber,
          status: "requested",
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("অনুরোধটি তৈরি করা যায়নি।");
      await notify(ctx, {
        targetRole: "admin",
        type: "withdrawal_requested",
        title: "নতুন উইথড্রয়াল অনুরোধ",
        body: `৳${args.amount} — ${pro.withdrawalMethod} ${pro.withdrawalNumber}`,
      });
      ctx.invalidateQueries();
      return {
        request: {
          id: row.id,
          amount: row.amount,
          method: row.withdrawalMethod,
          number: row.withdrawalNumber,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        },
        availableBalance: money.totals.availableBalance - args.amount,
      };
    },
  }),

  getProVerification: defineAction({
    description:
      "Returns the signed-in professional's verification status, the admin's note on the latest decision, and which verification items (NID number, NID front photo, NID back photo) are present or still missing. Document bytes and the NID number itself are never returned here.",
    request: z.object({ token: z.string() }),
    response: z.object({
      status: z.string(),
      verificationNote: z.string().nullable(),
      hasNidNumber: z.boolean(),
      documents: z.object({ nidFront: z.boolean(), nidBack: z.boolean() }),
      missing: z.array(z.string()),
    }),
    async handler(ctx, args) {
      const { pro } = await requirePro(ctx, args.token);
      const db = dbOf(ctx);
      const docs = await db
        .select({ kind: schema.identityDocuments.kind })
        .from(schema.identityDocuments)
        .where(eq(schema.identityDocuments.professionalId, pro.id));
      const kinds = new Set(docs.map((d) => d.kind));
      const hasNidNumber = !!pro.nidNumber && pro.nidNumber.trim().length > 0;
      const missing: string[] = [];
      if (!hasNidNumber) missing.push("nid_number");
      if (!kinds.has("nid_front")) missing.push("nid_front");
      if (!kinds.has("nid_back")) missing.push("nid_back");
      return {
        status: pro.status,
        verificationNote: pro.verificationNote,
        hasNidNumber,
        documents: { nidFront: kinds.has("nid_front"), nidBack: kinds.has("nid_back") },
        missing,
      };
    },
  }),

  resubmitIdentityDocuments: defineAction({
    description:
      "A professional whose application was rejected re-submits their NID number (optional) and fresh NID front/back photos; the stored documents are replaced, the application returns to Pending, and admins are notified. Only available while the application status is Rejected.",
    request: z.object({
      token: z.string(),
      nidNumber: z.string().min(5).max(20).optional(),
      nidFrontPhoto: imageInput,
      nidBackPhoto: imageInput,
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const { user, pro } = await requirePro(ctx, args.token);
      if (pro.status !== "rejected") {
        throw new Error("শুধুমাত্র বাতিল হওয়া আবেদনই আবার জমা দেওয়া যাবে।");
      }
      const nidFront = validateIdentityImage(args.nidFrontPhoto, "NID কার্ডের সামনের ছবি");
      const nidBack = validateIdentityImage(args.nidBackPhoto, "NID কার্ডের পেছনের ছবি");
      const db = dbOf(ctx);
      await db
        .delete(schema.identityDocuments)
        .where(eq(schema.identityDocuments.professionalId, pro.id));
      await db.insert(schema.identityDocuments).values([
        { professionalId: pro.id, kind: "nid_front", contentType: nidFront.mimeType, dataBase64: nidFront.dataBase64 },
        { professionalId: pro.id, kind: "nid_back", contentType: nidBack.mimeType, dataBase64: nidBack.dataBase64 },
      ]);
      await db
        .update(schema.professionals)
        .set({
          nidNumber: args.nidNumber?.trim() ? args.nidNumber.trim() : pro.nidNumber,
          status: "pending",
          verificationNote: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.professionals.id, pro.id));
      await notify(ctx, {
        targetRole: "admin",
        type: "pro_application",
        title: "প্রফেশনাল আবার ডকুমেন্ট জমা দিয়েছেন",
        body: `${user.name} — আগের আবেদন বাতিল হয়েছিল, নতুন ডকুমেন্ট যাচাইয়ের অপেক্ষায়।`,
      });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getProReviews: defineAction({
    description:
      "Returns the signed-in professional's own received reviews that admins have approved (the same reviews customers see publicly).",
    request: z.object({ token: z.string() }),
    response: z.object({ reviews: z.array(reviewOut) }),
    async handler(ctx, args) {
      const { user, pro } = await requirePro(ctx, args.token);
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const revs = await db
        .select()
        .from(schema.reviews)
        .where(
          and(
            eq(schema.reviews.professionalId, pro.id),
            eq(schema.reviews.status, "approved"),
          ),
        )
        .orderBy(desc(schema.reviews.id));
      const custIds = [...new Set(revs.map((r) => r.customerId))];
      const custs = custIds.length
        ? await db.select().from(schema.users).where(inArray(schema.users.id, custIds))
        : [];
      const custMap = new Map(custs.map((c) => [c.id, c.name]));
      return {
        reviews: revs.map((r) => ({
          id: r.id,
          bookingId: r.bookingId,
          customerName: custMap.get(r.customerId) ?? "গ্রাহক",
          professionalId: r.professionalId,
          professionalName: user.name,
          serviceSlug: r.serviceSlug,
          serviceName: names.get(r.serviceSlug) ?? r.serviceSlug,
          rating: r.rating,
          text: r.text,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  // -------------------------------------------------------------- admin side
  getAdminOverview: defineAction({
    description:
      "Admin dashboard totals computed from real records. Money figures come from the payments table and the immutable payment ledger (verified online collections, held balances, payouts, commission earned vs collected) plus booking snapshots — never from client math or the legacy single commission rate.",
    request: z.object({ token: z.string() }),
    response: z.object({
      totalCustomers: z.number(),
      totalProfessionals: z.number(),
      pendingVerifications: z.number(),
      totalBookings: z.number(),
      pendingBookings: z.number(),
      completedBookings: z.number(),
      cancelledBookings: z.number(),
      openComplaints: z.number(),
      pendingReviews: z.number(),
      // Payment Management figures (Master Phase 5, audit fix P-2).
      onlineCollected: z.number(),
      customerFeesCollected: z.number(),
      commissionEarned: z.number(),
      commissionCollected: z.number(),
      heldBalanceTotal: z.number(),
      paidOutTotal: z.number(),
      refundedTotal: z.number(),
      cashCollected: z.number(),
      pendingPayments: z.number(),
      pendingPaymentAmount: z.number(),
      failedPayments: z.number(),
      disputedPayments: z.number(),
      pendingPayoutCount: z.number(),
      pendingPayoutAmount: z.number(),
      // Current per-model rates from settings, shown next to the money
      // figures; confirmed bookings keep their own snapshotted rates.
      fullOnlineCustomerFeePercent: z.number(),
      fullOnlineProCommissionPercent: z.number(),
      splitCustomerFeePercent: z.number(),
      splitProCommissionPercent: z.number(),
    }),
    async handler(ctx, args) {
      await requireAdmin(ctx, args.token);
      const db = dbOf(ctx);
      const customers = await db.select().from(schema.users).where(eq(schema.users.role, "customer"));
      const pros = await db.select().from(schema.professionals);
      const bookings = await db.select().from(schema.bookings);
      const complaints = await db.select().from(schema.complaints).where(eq(schema.complaints.status, "open"));
      const pendingRevs = await db.select().from(schema.reviews).where(eq(schema.reviews.status, "pending"));
      const st = await db.select().from(schema.settings).limit(1);
      const rates = dualRatesFromSettings(st[0]);

      // ---- money: ledger + payments + booking snapshots only ----
      const ledger = await db.select().from(schema.paymentLedger);
      const sumType = (t: string) =>
        ledger.filter((e) => e.entryType === t).reduce((a, e) => a + e.amount, 0);
      const onlineCollected = sumType("online_collection");
      const customerFeesCollected = sumType("customer_fee");
      const commissionEarned = sumType("commission_due");
      const commissionCollected = sumType("commission_collected");
      const paidOutTotal = sumType("payout");
      const refundedTotal = sumType("refund");
      // Money still held for settlement: everything that entered the
      // held balance minus what has since been paid out or refunded.
      const heldBalanceTotal = sumType("held_balance") - paidOutTotal - refundedTotal;

      const paymentRows = await db.select().from(schema.payments);
      const pendingPays = paymentRows.filter((p) => p.status === "pending" || p.status === "initiated");
      const verifiedBookingIds = new Set(
        paymentRows.filter((p) => p.status === "verified").map((p) => p.bookingId),
      );
      // Cash collected: the cash part of dual-payment bookings (booking
      // snapshot, counted once the online part is verified) plus legacy
      // cash-paid completed bookings that have no verified online
      // payment — each booking counted exactly once.
      let cashCollected = 0;
      for (const b of bookings) {
        if (verifiedBookingIds.has(b.id)) {
          cashCollected += b.cashAmount ?? 0;
        } else if (b.status === "completed" && b.paymentStatus === "cash_paid" && b.finalPrice != null) {
          cashCollected += b.finalPrice;
        }
      }
      const withdrawals = await db.select().from(schema.withdrawalRequests);
      const openWithdrawals = withdrawals.filter(
        (w) => w.status === "requested" || w.status === "approved",
      );
      return {
        totalCustomers: customers.length,
        totalProfessionals: pros.length,
        pendingVerifications: pros.filter((p) => p.status === "pending").length,
        totalBookings: bookings.length,
        pendingBookings: bookings.filter((b) => b.status === "pending").length,
        completedBookings: bookings.filter((b) => b.status === "completed").length,
        cancelledBookings: bookings.filter((b) => b.status === "cancelled").length,
        openComplaints: complaints.length,
        pendingReviews: pendingRevs.length,
        onlineCollected,
        customerFeesCollected,
        commissionEarned,
        commissionCollected,
        heldBalanceTotal,
        paidOutTotal,
        refundedTotal,
        cashCollected,
        pendingPayments: pendingPays.length,
        pendingPaymentAmount: pendingPays.reduce((a, p) => a + p.amount, 0),
        failedPayments: paymentRows.filter((p) => p.status === "failed").length,
        disputedPayments: bookings.filter((b) => b.extendedPaymentStatus === "disputed").length,
        pendingPayoutCount: openWithdrawals.length,
        pendingPayoutAmount: openWithdrawals.reduce((a, w) => a + w.amount, 0),
        fullOnlineCustomerFeePercent: rates.fullOnline.customerFeePercent,
        fullOnlineProCommissionPercent: rates.fullOnline.proCommissionPercent,
        splitCustomerFeePercent: rates.split5050.customerFeePercent,
        splitProCommissionPercent: rates.split5050.proCommissionPercent,
      };
    },
  }),

  adminListBookings: defineAction({
    description: "Admin: lists all bookings, optionally filtered by status.",
    request: z.object({ token: z.string(), status: z.string().optional() }),
    response: z.object({ bookings: z.array(bookingOut) }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db.select().from(schema.bookings).orderBy(desc(schema.bookings.id));
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const out: z.infer<typeof bookingOut>[] = [];
      for (const b of rows) {
        if (args.status && b.status !== args.status) continue;
        out.push(await toBookingOut(ctx, b, names, proNames));
      }
      return { bookings: out };
    },
  }),

  adminUpdateBooking: defineAction({
    description: "Admin: updates booking status, assignment, final price, payment status or note.",
    request: z.object({
      token: z.string(),
      bookingId: z.number().int(),
      status: z
        .enum(["pending", "confirmed", "assigned", "in_progress", "completed", "cancelled"])
        .optional(),
      professionalId: z.number().int().nullable().optional(),
      finalPrice: z.number().int().min(0).nullable().optional(),
      paymentStatus: z.enum(["unpaid", "cash_paid"]).optional(),
      // Dual Payment: payment model + eligible commission base. Setting
      // any of these (or the final price) snapshots the current rates
      // and the server-computed breakdown onto the booking.
      paymentModel: z.enum(["full_online", "split_50_50"]).nullable().optional(),
      calcBase: z.number().int().min(0).nullable().optional(),
      adminNote: z.string().max(600).optional(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b) throw new Error("বুকিং পাওয়া যায়নি।");
      // Price re-snapshot freeze (Master Phase 5): once any online
      // payment for this booking is verified, the confirmed price
      // and the payment snapshot are immutable — the verified money
      // was collected against exactly these figures, so neither the
      // price, the model nor the commission base may change after.
      const priceChangeRequested =
        (args.finalPrice !== undefined && args.finalPrice !== b.finalPrice) ||
        (args.paymentModel !== undefined && args.paymentModel !== b.paymentModel) ||
        (args.calcBase !== undefined && args.calcBase !== b.calcBase);
      if (priceChangeRequested) {
        const verifiedPays = await db
          .select()
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.bookingId, b.id),
              eq(schema.payments.status, "verified"),
            ),
          )
          .limit(1);
        if (verifiedPays.length > 0) {
          throw new Error(
            "এই বুকিংয়ের অনলাইন পেমেন্ট ইতিমধ্যে যাচাই হয়েছে — যাচাইকৃত পেমেন্টের মূল্য ও পেমেন্ট স্ন্যাপশট আর বদলানো যাবে না।",
          );
        }
      }
      const patch: Partial<BookingRow> = { updatedAt: new Date() };
      let assignedProUserId: number | null = null;
      if (args.professionalId !== undefined) {
        patch.professionalId = args.professionalId;
        patch.proResponse = "none";
        patch.proDone = 0;
        if (args.professionalId) {
          const pros = await db
            .select()
            .from(schema.professionals)
            .where(eq(schema.professionals.id, args.professionalId))
            .limit(1);
          const p = pros[0];
          if (!p) throw new Error("প্রফেশনাল পাওয়া যায়নি।");
          if (p.status !== "verified") throw new Error("শুধুমাত্র যাচাইকৃত প্রফেশনালকে কাজ দেওয়া যাবে।");
          if (p.categorySlug !== b.serviceSlug) {
            throw new Error("এই প্রফেশনালের ক্যাটাগরি বুকিংয়ের সার্ভিসের সাথে মেলে না।");
          }
          assignedProUserId = p.userId;
        }
      }
      if (args.status) patch.status = args.status;
      // Assigning a professional puts the booking at the "assigned" stage.
      // Never leave a booking sitting at pending/confirmed with a pro
      // attached: the pro could not respond to it and it would be hidden
      // from their dashboard filters, dead-ending the whole journey. The
      // admin form's status dropdown defaults to the current status, so
      // this promotion must happen even when a status was sent. An
      // explicit later-stage status (in_progress / completed / cancelled)
      // chosen by the admin is respected.
      if (
        assignedProUserId &&
        b.status !== "in_progress" &&
        b.status !== "completed" &&
        b.status !== "cancelled" &&
        (!patch.status || patch.status === "pending" || patch.status === "confirmed")
      ) {
        patch.status = "assigned";
      }
      if (args.finalPrice !== undefined) patch.finalPrice = args.finalPrice;
      // Dual Payment snapshot: when the price is confirmed (or the
      // model / commission base changes), freeze the rates in effect
      // right now and the server-computed breakdown onto the booking.
      // Future rate changes never alter this snapshot. The held balance
      // is NOT set here — it only moves when a payment is verified.
      const wantsSnapshot =
        args.paymentModel !== undefined ||
        args.calcBase !== undefined ||
        (args.finalPrice !== undefined && args.finalPrice !== null);
      if (wantsSnapshot) {
        const effectivePrice =
          args.finalPrice !== undefined ? args.finalPrice : b.finalPrice;
        const effectiveModel =
          args.paymentModel !== undefined ? args.paymentModel : b.paymentModel;
        if (effectivePrice != null && effectivePrice > 0 && effectiveModel) {
          const stRows = await db.select().from(schema.settings).limit(1);
          const bd = computeBreakdown({
            bill: effectivePrice,
            paymentModel: effectiveModel,
            calcBase: args.calcBase ?? b.calcBase ?? effectivePrice,
            rates: dualRatesFromSettings(stRows[0]),
          });
          patch.paymentModel = bd.paymentModel;
          patch.customerFeePercent = bd.customerFeePercent;
          patch.proCommissionPercent = bd.proCommissionPercent;
          patch.calcBase = bd.calcBase;
          patch.onlineAmount = bd.customerPaysOnline;
          patch.cashAmount = bd.cashAmount;
          patch.customerFee = bd.customerFee;
          patch.proCommission = bd.proCommission;
        } else if (args.paymentModel !== undefined) {
          patch.paymentModel = args.paymentModel;
        } else if (args.calcBase !== undefined) {
          patch.calcBase = args.calcBase;
        }
      }
      if (args.paymentStatus) patch.paymentStatus = args.paymentStatus;
      if (args.adminNote !== undefined) patch.adminNote = args.adminNote;
      await db.update(schema.bookings).set(patch).where(eq(schema.bookings.id, b.id));
      const newStatus = patch.status ?? b.status;
      // P-1: cancelling a booking auto-fails any still-pending
      // online payment on it (adjustment ledger entry, no delete).
      if (newStatus === "cancelled" && b.status !== "cancelled") {
        await failPendingPaymentsForCancelledBooking(ctx, b, {
          role: "admin",
          adminId: admin.id,
        });
      }
      if (patch.status && patch.status !== b.status) {
        await addEvent(ctx, b.id, patch.status, "admin", args.adminNote ?? null);
      } else if (assignedProUserId) {
        await addEvent(ctx, b.id, newStatus, "admin", "প্রফেশনাল অ্যাসাইন করা হয়েছে");
      }
      if (newStatus !== b.status || assignedProUserId) {
        await notify(ctx, {
          userId: b.customerId,
          type: "booking_update",
          title: "বুকিং আপডেট হয়েছে",
          body: `কোড: ${b.code} — নতুন অবস্থা: ${newStatus}`,
          bookingId: b.id,
        });
      }
      if (assignedProUserId) {
        await notify(ctx, {
          userId: assignedProUserId,
          type: "job_assigned",
          title: "নতুন কাজ অ্যাসাইন হয়েছে",
          body: `কোড: ${b.code} — ${b.upazila}, ${b.preferredDate}`,
          bookingId: b.id,
        });
      }
      await logAdmin(
        ctx,
        admin.id,
        "booking_update",
        `${b.code}: status=${newStatus}${args.professionalId !== undefined ? `, pro=${args.professionalId}` : ""}${args.finalPrice != null ? `, price=${args.finalPrice}` : ""}`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListProfessionals: defineAction({
    description: "Admin: lists all professional applications with verification status, NID number and identity-document presence for verification. This is the only action that returns NID numbers.",
    request: z.object({ token: z.string() }),
    response: z.object({
      professionals: z.array(
        proOut.extend({
          email: z.string().nullable(),
          nidNumber: z.string().nullable(),
          verificationNote: z.string().nullable(),
          documents: z.object({
            nidFront: z.boolean(),
            nidBack: z.boolean(),
          }),
          userStatus: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const pros = await db.select().from(schema.professionals).orderBy(desc(schema.professionals.id));
      const users = await db.select().from(schema.users);
      const byId = new Map(users.map((u) => [u.id, u]));
      // Document presence only (kinds, never the bytes or URLs) so the
      // verification view can offer a view button per document.
      const docRows = await db
        .select({ professionalId: schema.identityDocuments.professionalId, kind: schema.identityDocuments.kind })
        .from(schema.identityDocuments);
      const docMap = new Map<number, Set<string>>();
      for (const d of docRows) {
        const set = docMap.get(d.professionalId) ?? new Set<string>();
        set.add(d.kind);
        docMap.set(d.professionalId, set);
      }
      const out: z.infer<typeof proOut>[] = [];
      const full: (z.infer<typeof proOut> & {
        email: string | null;
        nidNumber: string | null;
        verificationNote: string | null;
        documents: { nidFront: boolean; nidBack: boolean };
        userStatus: string;
      })[] = [];
      for (const p of pros) {
        const u = byId.get(p.userId);
        if (!u) continue;
        const card = await toProOut(ctx, p, u, names.get(p.categorySlug) ?? p.categorySlug);
        out.push(card);
        const docs = docMap.get(p.id) ?? new Set<string>();
        full.push({
          ...card,
          email: p.email,
          nidNumber: p.nidNumber,
          verificationNote: p.verificationNote,
          documents: {
            nidFront: docs.has("nid_front"),
            nidBack: docs.has("nid_back"),
          },
          userStatus: u.status,
        });
      }
      return { professionals: full };
    },
  }),

  adminSetProStatus: defineAction({
    description: "Admin: approves, rejects or suspends a professional application/account. An optional note (e.g. the rejection reason) is stored on the application and shown to the professional.",
    request: z.object({
      token: z.string(),
      professionalId: z.number().int(),
      status: z.enum(["verified", "rejected", "suspended", "pending"]),
      note: z.string().max(600).optional(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.professionals)
        .where(eq(schema.professionals.id, args.professionalId))
        .limit(1);
      const pro = rows[0];
      if (!pro) throw new Error("প্রফেশনাল পাওয়া যায়নি।");
      const note = args.note?.trim() ? args.note.trim() : null;
      await db
        .update(schema.professionals)
        .set({
          status: args.status,
          // The note is the professional-facing reason for the latest
          // decision: stored on rejection/suspension when given, and
          // cleared once the application is verified or sent back to
          // pending without a new note.
          verificationNote:
            args.status === "verified" || args.status === "pending"
              ? note
              : (note ?? pro.verificationNote),
          updatedAt: new Date(),
        })
        .where(eq(schema.professionals.id, pro.id));
      const titles: Record<string, string> = {
        verified: "আপনার প্রোফাইল যাচাই সম্পন্ন হয়েছে",
        rejected: "আপনার আবেদন গৃহীত হয়নি",
        suspended: "আপনার প্রোফাইল সাময়িকভাবে স্থগিত করা হয়েছে",
        pending: "আপনার আবেদন আবার যাচাইয়ের অপেক্ষায় রাখা হয়েছে",
      };
      await notify(ctx, {
        userId: pro.userId,
        type: "pro_status",
        title: titles[args.status] ?? "প্রোফাইল আপডেট",
        body: note ?? undefined,
      });
      await logAdmin(ctx, admin.id, "pro_status", `professional #${pro.id} -> ${args.status}${note ? ` — ${note}` : ""}`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getIdentityDocument: defineAction({
    description: "Returns one professional identity document image (NID front or NID back photo) as base64. Only the owning professional or an operations/super admin may view it; every admin view is written to the admin log. Documents are never exposed through any public URL or blob endpoint.",
    request: z.object({
      token: z.string(),
      professionalId: z.number().int(),
      kind: z.enum(["nid_front", "nid_back"]),
    }),
    response: z.object({ dataBase64: z.string(), mimeType: z.string() }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.professionals)
        .where(eq(schema.professionals.id, args.professionalId))
        .limit(1);
      const pro = rows[0];
      if (!pro) throw new Error("প্রফেশনাল পাওয়া যায়নি।");
      if (user.role === "admin") {
        const lvl = adminLevelOf(user);
        if (lvl !== "super" && lvl !== "operations") {
          throw new Error("আপনার অ্যাডমিন স্তরে পরিচয় ডকুমেন্ট দেখার অনুমতি নেই।");
        }
        await logAdmin(ctx, user.id, "identity_document_view", `professional #${pro.id} document=${args.kind}`);
      } else if (user.role === "professional") {
        if (pro.userId !== user.id) throw new Error("অন্যের ডকুমেন্ট দেখার অনুমতি নেই।");
      } else {
        throw new Error("এই ডকুমেন্ট দেখার অনুমতি নেই।");
      }
      const docs = await db
        .select()
        .from(schema.identityDocuments)
        .where(
          and(
            eq(schema.identityDocuments.professionalId, pro.id),
            eq(schema.identityDocuments.kind, args.kind),
          ),
        )
        .limit(1);
      const doc = docs[0];
      if (!doc) throw new Error("এই ডকুমেন্টটি জমা দেওয়া হয়নি।");
      return { dataBase64: doc.dataBase64, mimeType: doc.contentType };
    },
  }),

  adminListCustomers: defineAction({
    description: "Admin: lists all customer accounts with booking counts.",
    request: z.object({ token: z.string() }),
    response: z.object({
      customers: z.array(
        userOut.extend({ bookingCount: z.number(), complaintCount: z.number() }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, "customer"))
        .orderBy(desc(schema.users.id));
      const bookings = await db.select().from(schema.bookings);
      const complaints = await db.select().from(schema.complaints);
      const out: (UserOut & { bookingCount: number; complaintCount: number })[] = [];
      for (const u of rows) {
        out.push({
          ...(await toUserOut(ctx, u)),
          bookingCount: bookings.filter((b) => b.customerId === u.id).length,
          complaintCount: complaints.filter((c) => c.customerId === u.id).length,
        });
      }
      return { customers: out };
    },
  }),

  adminSetUserStatus: defineAction({
    description: "Admin: activates or suspends a customer or professional user account.",
    request: z.object({
      token: z.string(),
      userId: z.number().int(),
      status: z.enum(["active", "suspended"]),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, args.userId)).limit(1);
      const u = rows[0];
      if (!u || u.role === "admin") throw new Error("ব্যবহারকারী পাওয়া যায়নি।");
      await db
        .update(schema.users)
        .set({ status: args.status, updatedAt: new Date() })
        .where(eq(schema.users.id, u.id));
      await logAdmin(ctx, admin.id, "user_status", `user #${u.id} (${u.phone}) -> ${args.status}`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminSaveService: defineAction({
    description: "Admin: creates or updates a service category, including admin-configured pricing.",
    request: z.object({
      token: z.string(),
      id: z.number().int().optional(),
      slug: z.string().min(2).max(60).optional(),
      nameBn: z.string().min(2).max(80),
      nameEn: z.string().min(2).max(80),
      tagline: z.string().max(200).optional(),
      description: z.string().max(1500).optional(),
      startingPrice: z.number().int().min(0).nullable().optional(),
      hourlyRate: z.number().int().min(0).nullable().optional(),
      dailyRate: z.number().int().min(0).nullable().optional(),
      unitRate: z.number().int().min(0).nullable().optional(),
      unitLabel: z.string().max(60).nullable().optional(),
      inspectionFee: z.number().int().min(0).nullable().optional(),
      priceNote: z.string().max(300).nullable().optional(),
      active: z.boolean(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      if (args.id) {
        await db
          .update(schema.services)
          .set({
            nameBn: args.nameBn,
            nameEn: args.nameEn,
            tagline: args.tagline ?? null,
            description: args.description ?? null,
            startingPrice: args.startingPrice ?? null,
            hourlyRate: args.hourlyRate ?? null,
            dailyRate: args.dailyRate ?? null,
            unitRate: args.unitRate ?? null,
            unitLabel: args.unitLabel ?? null,
            inspectionFee: args.inspectionFee ?? null,
            priceNote: args.priceNote ?? null,
            active: args.active ? 1 : 0,
            updatedAt: new Date(),
          })
          .where(eq(schema.services.id, args.id));
        await logAdmin(ctx, admin.id, "service_update", `#${args.id} ${args.nameBn}`);
      } else {
        if (!args.slug) throw new Error("নতুন সার্ভিসের জন্য slug দরকার।");
        const maxSort = await db.select().from(schema.services);
        await db.insert(schema.services).values({
          slug: args.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          nameBn: args.nameBn,
          nameEn: args.nameEn,
          tagline: args.tagline ?? null,
          description: args.description ?? null,
          icon: "tool",
          startingPrice: args.startingPrice ?? null,
          hourlyRate: args.hourlyRate ?? null,
          dailyRate: args.dailyRate ?? null,
          unitRate: args.unitRate ?? null,
          unitLabel: args.unitLabel ?? null,
          inspectionFee: args.inspectionFee ?? null,
          priceNote: args.priceNote ?? null,
          active: args.active ? 1 : 0,
          sortOrder: maxSort.length + 1,
        });
        await logAdmin(ctx, admin.id, "service_create", args.nameBn);
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListServicesAll: defineAction({
    description: "Admin: lists all services including inactive ones.",
    request: z.object({ token: z.string() }),
    response: z.object({ services: z.array(serviceOut) }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db.select().from(schema.services).orderBy(asc(schema.services.sortOrder));
      return { services: rows.map(toServiceOut) };
    },
  }),

  adminListLocationsAll: defineAction({
    description: "Admin: lists all service areas including disabled ones.",
    request: z.object({ token: z.string() }),
    response: z.object({ locations: z.array(locationOut) }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const rows = await db.select().from(schema.locations).orderBy(asc(schema.locations.id));
      return {
        locations: rows.map((l) => ({
          id: l.id,
          nameEn: l.nameEn,
          nameBn: l.nameBn,
          district: l.district,
          active: l.active === 1,
        })),
      };
    },
  }),

  adminSaveLocation: defineAction({
    description: "Admin: adds a service area or enables/disables an existing one.",
    request: z.object({
      token: z.string(),
      id: z.number().int().optional(),
      nameEn: z.string().min(2).max(80).optional(),
      nameBn: z.string().min(2).max(80).optional(),
      district: z.string().max(80).optional(),
      active: z.boolean(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      if (args.id) {
        await db
          .update(schema.locations)
          .set({ active: args.active ? 1 : 0 })
          .where(eq(schema.locations.id, args.id));
        await logAdmin(ctx, admin.id, "location_toggle", `#${args.id} active=${args.active}`);
      } else {
        if (!args.nameEn || !args.nameBn) throw new Error("এলাকার ইংরেজি ও বাংলা নাম দিন।");
        await db.insert(schema.locations).values({
          nameEn: args.nameEn,
          nameBn: args.nameBn,
          district: args.district ?? "টাঙ্গাইল",
          active: args.active ? 1 : 0,
        });
        await logAdmin(ctx, admin.id, "location_create", args.nameBn);
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListReviews: defineAction({
    description: "Admin: lists all reviews for moderation.",
    request: z.object({ token: z.string() }),
    response: z.object({ reviews: z.array(reviewOut) }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations", "support"]);
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const revs = await db.select().from(schema.reviews).orderBy(desc(schema.reviews.id));
      const custIds = [...new Set(revs.map((r) => r.customerId))];
      const custs = custIds.length
        ? await db.select().from(schema.users).where(inArray(schema.users.id, custIds))
        : [];
      const custMap = new Map(custs.map((c) => [c.id, c.name]));
      return {
        reviews: revs.map((r) => ({
          id: r.id,
          bookingId: r.bookingId,
          customerName: custMap.get(r.customerId) ?? "গ্রাহক",
          professionalId: r.professionalId,
          professionalName: r.professionalId ? (proNames.get(r.professionalId) ?? null) : null,
          serviceSlug: r.serviceSlug,
          serviceName: names.get(r.serviceSlug) ?? r.serviceSlug,
          rating: r.rating,
          text: r.text,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  adminSetReviewStatus: defineAction({
    description: "Admin: approves or rejects a customer review.",
    request: z.object({
      token: z.string(),
      reviewId: z.number().int(),
      status: z.enum(["approved", "rejected", "pending"]),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["operations", "support"]);
      const db = dbOf(ctx);
      await db
        .update(schema.reviews)
        .set({ status: args.status })
        .where(eq(schema.reviews.id, args.reviewId));
      await logAdmin(ctx, admin.id, "review_moderation", `review #${args.reviewId} -> ${args.status}`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListComplaints: defineAction({
    description: "Admin: lists all customer complaints.",
    request: z.object({ token: z.string() }),
    response: z.object({
      complaints: z.array(
        z.object({
          id: z.number(),
          customerName: z.string(),
          customerPhone: z.string(),
          bookingCode: z.string().nullable(),
          subject: z.string(),
          message: z.string(),
          status: z.string(),
          adminNote: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["support"]);
      const db = dbOf(ctx);
      const rows = await db.select().from(schema.complaints).orderBy(desc(schema.complaints.id));
      const users = await db.select().from(schema.users);
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        complaints: rows.map((c) => ({
          id: c.id,
          customerName: byId.get(c.customerId)?.name ?? "গ্রাহক",
          customerPhone: byId.get(c.customerId)?.phone ?? "",
          bookingCode: c.bookingCode,
          subject: c.subject,
          message: c.message,
          status: c.status,
          adminNote: c.adminNote,
          createdAt: c.createdAt.toISOString(),
        })),
      };
    },
  }),

  adminResolveComplaint: defineAction({
    description: "Admin: marks a complaint resolved with a note and notifies the customer.",
    request: z.object({
      token: z.string(),
      complaintId: z.number().int(),
      note: z.string().max(600).optional(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["support"]);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.complaints)
        .where(eq(schema.complaints.id, args.complaintId))
        .limit(1);
      const c = rows[0];
      if (!c) throw new Error("অভিযোগ পাওয়া যায়নি।");
      await db
        .update(schema.complaints)
        .set({ status: "resolved", adminNote: args.note ?? null, updatedAt: new Date() })
        .where(eq(schema.complaints.id, c.id));
      await notify(ctx, {
        userId: c.customerId,
        type: "complaint_resolved",
        title: "আপনার অভিযোগের সমাধান হয়েছে",
        body: args.note ?? c.subject,
      });
      await logAdmin(ctx, admin.id, "complaint_resolve", `#${c.id} ${c.subject}`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminGetSettings: defineAction({
    description: "Admin: returns platform settings including commission and support contacts.",
    request: z.object({ token: z.string() }),
    response: z.object({
      commissionPercent: z.number(),
      fullOnlineCustomerFeePercent: z.number(),
      fullOnlineProCommissionPercent: z.number(),
      splitCustomerFeePercent: z.number(),
      splitProCommissionPercent: z.number(),
      supportPhone: z.string().nullable(),
      supportWhatsapp: z.string().nullable(),
      supportEmail: z.string().nullable(),
      announcement: z.string().nullable(),
      paymentReceiveNumber: z.string().nullable(),
      paymentReceiveProvider: z.string().nullable(),
    }),
    async handler(ctx, args) {
      await requireAdmin(ctx, args.token);
      const db = dbOf(ctx);
      const st = await db.select().from(schema.settings).limit(1);
      const s = st[0];
      const rates = dualRatesFromSettings(s);
      return {
        commissionPercent: s?.commissionPercent ?? 10,
        fullOnlineCustomerFeePercent: rates.fullOnline.customerFeePercent,
        fullOnlineProCommissionPercent: rates.fullOnline.proCommissionPercent,
        splitCustomerFeePercent: rates.split5050.customerFeePercent,
        splitProCommissionPercent: rates.split5050.proCommissionPercent,
        supportPhone: s?.supportPhone ?? null,
        supportWhatsapp: s?.supportWhatsapp ?? null,
        supportEmail: s?.supportEmail ?? null,
        announcement: s?.announcement ?? null,
        paymentReceiveNumber: s?.paymentReceiveNumber ?? null,
        paymentReceiveProvider: s?.paymentReceiveProvider ?? null,
      };
    },
  }),

  adminSaveSettings: defineAction({
    description: "Admin: saves platform settings — per-model Dual Payment rates, the manual-payment receiving number, support contacts and announcement. Rate changes apply to future bookings only; confirmed bookings keep their snapshotted rates.",
    request: z.object({
      token: z.string(),
      // Legacy single commission rate: kept only so older clients
      // do not break. It is NOT a live rate — the per-model rates
      // below are what new bookings snapshot — and the admin UI no
      // longer sends it. Omitted = keep the stored value.
      commissionPercent: z.number().int().min(0).max(100).optional(),
      // Dual Payment per-model rates; omitted fields keep their
      // current values. Changes apply to future bookings only —
      // confirmed bookings keep their snapshotted rates.
      fullOnlineCustomerFeePercent: z.number().int().min(0).max(100).optional(),
      fullOnlineProCommissionPercent: z.number().int().min(0).max(100).optional(),
      splitCustomerFeePercent: z.number().int().min(0).max(100).optional(),
      splitProCommissionPercent: z.number().int().min(0).max(100).optional(),
      supportPhone: z.string().max(30).nullable().optional(),
      supportWhatsapp: z.string().max(30).nullable().optional(),
      supportEmail: z.string().max(120).nullable().optional(),
      announcement: z.string().max(300).nullable().optional(),
      // Manual-payment receiving MFS number (Master Phase 3). Omitted
      // fields keep their current values; pass null to clear.
      paymentReceiveNumber: z.string().max(20).nullable().optional(),
      paymentReceiveProvider: z
        .enum(["bkash", "nagad", "rocket"])
        .nullable()
        .optional(),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, ["finance"]);
      const db = dbOf(ctx);
      const st = await db.select().from(schema.settings).limit(1);
      const cur = st[0];
      const rates = dualRatesFromSettings(cur);
      await db
        .update(schema.settings)
        .set({
          commissionPercent: args.commissionPercent ?? cur?.commissionPercent ?? 10,
          fullOnlineCustomerFeePercent:
            args.fullOnlineCustomerFeePercent ?? rates.fullOnline.customerFeePercent,
          fullOnlineProCommissionPercent:
            args.fullOnlineProCommissionPercent ?? rates.fullOnline.proCommissionPercent,
          splitCustomerFeePercent:
            args.splitCustomerFeePercent ?? rates.split5050.customerFeePercent,
          splitProCommissionPercent:
            args.splitProCommissionPercent ?? rates.split5050.proCommissionPercent,
          // Omitted contact/announcement fields keep their stored
          // values (explicit null clears them) — the commission-rates
          // form saves rates without resending the contact fields.
          supportPhone:
            args.supportPhone !== undefined ? args.supportPhone : (cur?.supportPhone ?? null),
          supportWhatsapp:
            args.supportWhatsapp !== undefined ? args.supportWhatsapp : (cur?.supportWhatsapp ?? null),
          supportEmail:
            args.supportEmail !== undefined ? args.supportEmail : (cur?.supportEmail ?? null),
          announcement:
            args.announcement !== undefined ? args.announcement : (cur?.announcement ?? null),
          paymentReceiveNumber:
            args.paymentReceiveNumber !== undefined
              ? args.paymentReceiveNumber
              : (cur?.paymentReceiveNumber ?? null),
          paymentReceiveProvider:
            args.paymentReceiveProvider !== undefined
              ? args.paymentReceiveProvider
              : (cur?.paymentReceiveProvider ?? null),
          updatedAt: new Date(),
        })
        .where(eq(schema.settings.id, 1));
      await logAdmin(
        ctx,
        admin.id,
        "settings_update",
        `rates: full fee=${args.fullOnlineCustomerFeePercent ?? rates.fullOnline.customerFeePercent}%/comm=${args.fullOnlineProCommissionPercent ?? rates.fullOnline.proCommissionPercent}%, split fee=${args.splitCustomerFeePercent ?? rates.split5050.customerFeePercent}%/comm=${args.splitProCommissionPercent ?? rates.split5050.proCommissionPercent}%`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListLogs: defineAction({
    description:
      "Super Admin only: returns the admin activity log, newest first, with optional filters by action type, acting admin and date range. Other admin levels cannot read the log at all.",
    request: z.object({
      token: z.string(),
      limit: z.number().int().min(1).max(200).default(50),
      action: z.string().max(60).optional(),
      adminId: z.number().int().optional(),
      from: z.string().max(30).optional(),
      to: z.string().max(30).optional(),
    }),
    response: z.object({
      logs: z.array(
        z.object({
          id: z.number(),
          adminId: z.number().nullable(),
          adminName: z.string().nullable(),
          action: z.string(),
          detail: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, []);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.adminLogs)
        .orderBy(desc(schema.adminLogs.id))
        .limit(500);
      const admins = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, "admin"));
      const nameById = new Map(admins.map((u) => [u.id, u.name]));
      const fromMs = args.from ? new Date(args.from).getTime() : null;
      const toMs = args.to ? new Date(args.to).getTime() : null;
      const filtered = rows.filter((l) => {
        if (args.action && l.action !== args.action) return false;
        if (args.adminId != null && l.adminId !== args.adminId) return false;
        const t = l.createdAt.getTime();
        if (fromMs != null && !Number.isNaN(fromMs) && t < fromMs) return false;
        if (toMs != null && !Number.isNaN(toMs) && t > toMs) return false;
        return true;
      });
      return {
        logs: filtered.slice(0, args.limit).map((l) => ({
          id: l.id,
          adminId: l.adminId,
          adminName: l.adminId != null ? (nameById.get(l.adminId) ?? null) : null,
          action: l.action,
          detail: l.detail,
          createdAt: l.createdAt.toISOString(),
        })),
      };
    },
  }),

  adminListStaff: defineAction({
    description: "Super Admin only: lists all admin staff accounts with their permission levels.",
    request: z.object({ token: z.string() }),
    response: z.object({
      staff: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          phone: z.string(),
          adminLevel: z.string(),
          status: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, []);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, "admin"))
        .orderBy(asc(schema.users.id));
      return {
        staff: rows.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          adminLevel: adminLevelOf(u),
          status: u.status,
          createdAt: u.createdAt.toISOString(),
        })),
      };
    },
  }),

  adminSetAdminLevel: defineAction({
    description: "Super Admin only: sets an admin's permission level (super / operations / finance / support), or promotes an existing user to admin with that level. The last remaining Super Admin cannot be demoted.",
    request: z.object({
      token: z.string(),
      userId: z.number().int(),
      level: z.enum(["super", "operations", "finance", "support"]),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const admin = await requireAdminLevel(ctx, args.token, []);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, args.userId))
        .limit(1);
      const target = rows[0];
      if (!target) throw new Error("ব্যবহারকারী পাওয়া যায়নি।");
      if (target.role === "admin" && adminLevelOf(target) === "super" && args.level !== "super") {
        const admins = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.role, "admin"));
        if (admins.filter((u) => adminLevelOf(u) === "super").length <= 1) {
          throw new Error("শেষ সুপার অ্যাডমিনের স্তর বদলানো যাবে না — আগে আরেকজনকে সুপার অ্যাডমিন করুন।");
        }
      }
      await db
        .update(schema.users)
        .set({ role: "admin", adminLevel: args.level, updatedAt: new Date() })
        .where(eq(schema.users.id, target.id));
      await logAdmin(ctx, admin.id, "admin_level_set", `user #${target.id} (${target.phone}) -> admin/${args.level}`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListVerifiedPros: defineAction({
    description: "Admin: lists verified professionals of one category for booking assignment.",
    request: z.object({ token: z.string(), category: z.string() }),
    response: z.object({
      professionals: z.array(
        z.object({ id: z.number(), name: z.string(), areas: z.array(z.string()), completedJobs: z.number() }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations"]);
      const db = dbOf(ctx);
      const pros = await db
        .select()
        .from(schema.professionals)
        .where(
          and(
            eq(schema.professionals.status, "verified"),
            eq(schema.professionals.categorySlug, args.category),
          ),
        );
      const users = await db.select().from(schema.users);
      const byId = new Map(users.map((u) => [u.id, u.name]));
      const bookings = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.status, "completed"));
      return {
        professionals: pros.map((p) => {
          let areas: string[] = [];
          try {
            const parsed: unknown = JSON.parse(p.areas);
            if (Array.isArray(parsed)) areas = parsed.filter((x): x is string => typeof x === "string");
          } catch {
            areas = [];
          }
          return {
            id: p.id,
            name: byId.get(p.userId) ?? "",
            areas,
            completedJobs: bookings.filter((b) => b.professionalId === p.id).length,
          };
        }),
      };
    },
  }),
  // -------------------------------------------------------- dual payments
  submitManualPayment: defineAction({
    description:
      "Customer submits a manual (TrxID) payment claim for their own booking; the server checks ownership, confirmed price, currency and the exact expected online amount, and rejects duplicate TrxIDs.",
    request: z.object({
      token: z.string(),
      bookingCode: z.string().min(4).max(40),
      paymentModel: z.enum(["full_online", "split_50_50"]),
      provider: z.enum(["bkash", "nagad", "rocket", "pathao_pay"]),
      providerTrxId: z.string().min(6).max(40),
      senderNumber: z.string().max(20).optional(),
      amount: z.number().int().min(1),
      currency: z.enum(["BDT"]).default("BDT"),
      idempotencyKey: z.string().min(8).max(120),
    }),
    response: z.object({ payment: paymentOut, breakdown: breakdownOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer") {
        throw new Error("শুধুমাত্র গ্রাহকই পেমেন্ট জমা দিতে পারবেন।");
      }
      const db = dbOf(ctx);
      const trxId = args.providerTrxId.trim().toUpperCase();

      // Idempotent retry: the same key resubmitting the identical claim
      // returns the original payment instead of creating a duplicate.
      const byKey = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.idempotencyKey, args.idempotencyKey))
        .limit(1);
      const replay = byKey[0];
      if (replay) {
        if (
          replay.submittedBy === user.id &&
          replay.providerTrxId === trxId &&
          replay.amount === args.amount
        ) {
          const brows = await db
            .select()
            .from(schema.bookings)
            .where(eq(schema.bookings.id, replay.bookingId))
            .limit(1);
          const bb = brows[0];
          const bd = bb ? breakdownFromBooking(bb) : null;
          if (!bb || !bd) throw new Error("বুকিং পাওয়া যায়নি।");
          return { payment: toPaymentOut(replay, bb.code), breakdown: bd };
        }
        throw new Error("এই পেমেন্ট অনুরোধটি আগেই জমা হয়েছে।");
      }

      const brows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.code, args.bookingCode.trim()))
        .limit(1);
      const b = brows[0];
      if (!b || b.customerId !== user.id) {
        throw new Error("বুকিং পাওয়া যায়নি।");
      }
      if (b.status === "cancelled") {
        throw new Error("বাতিল করা বুকিংয়ে পেমেন্ট দেওয়া যাবে না।");
      }
      if (b.finalPrice == null || b.finalPrice <= 0) {
        throw new Error(
          "এই বুকিংয়ের মূল্য এখনো নিশ্চিত হয়নি — অ্যাডমিন মূল্য নিশ্চিত করলেই পেমেন্ট করা যাবে।",
        );
      }
      if (b.paymentModel && b.paymentModel !== args.paymentModel) {
        throw new Error(
          "এই বুকিংয়ের জন্য ইতিমধ্যে অন্য পেমেন্ট পদ্ধতি নির্ধারিত আছে।",
        );
      }
      // D-1 (Master Phase 3): a TrxID is unique per provider — the
      // duplicate check (and the DB unique index) is scoped to
      // (provider, provider_trx_id), so the same TrxID string on a
      // different provider is a different, valid payment.
      const byTrx = await db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.provider, args.provider),
            eq(schema.payments.providerTrxId, trxId),
          ),
        )
        .limit(1);
      if (byTrx.length) {
        throw new Error("এই TrxID দিয়ে এই মাধ্যমে আগেই একটি পেমেন্ট জমা হয়েছে।");
      }
      const live = await db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.bookingId, b.id),
            inArray(schema.payments.status, ["initiated", "pending", "verified"]),
          ),
        );
      if (live.length) {
        throw new Error(
          "এই বুকিংয়ের জন্য ইতিমধ্যে একটি পেমেন্ট প্রক্রিয়াধীন বা যাচাইকৃত আছে।",
        );
      }

      // Server-side math only: snapshotted rates when the booking
      // already has them for this model, otherwise the current settings.
      let bd: PaymentBreakdown;
      const snap =
        b.paymentModel === args.paymentModel ? breakdownFromBooking(b) : null;
      if (snap) {
        bd = snap;
      } else {
        const stRows = await db.select().from(schema.settings).limit(1);
        bd = computeBreakdown({
          bill: b.finalPrice,
          paymentModel: args.paymentModel,
          calcBase: b.calcBase ?? b.finalPrice,
          rates: dualRatesFromSettings(stRows[0]),
        });
      }
      if (args.amount !== bd.customerPaysOnline) {
        throw new Error(
          `পেমেন্টের পরিমাণ সঠিক নয় — এই বুকিংয়ের জন্য অনলাইনে ঠিক ৳${bd.customerPaysOnline} পাঠাতে হবে।`,
        );
      }

      const now = new Date();
      let payment: PaymentRow;
      try {
        payment = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(schema.payments)
            .values({
              bookingId: b.id,
              paymentModel: args.paymentModel,
              method: "manual_trxid",
              provider: args.provider,
              providerTrxId: trxId,
              senderNumber: args.senderNumber ?? null,
              amount: args.amount,
              currency: "BDT",
              status: "pending",
              idempotencyKey: args.idempotencyKey,
              submittedBy: user.id,
            })
            .returning();
          const p = inserted[0];
          if (!p) throw new Error("পেমেন্ট জমা দেওয়া যায়নি।");
          await tx
            .update(schema.bookings)
            .set({
              paymentModel: bd.paymentModel,
              customerFeePercent: bd.customerFeePercent,
              proCommissionPercent: bd.proCommissionPercent,
              calcBase: bd.calcBase,
              onlineAmount: bd.customerPaysOnline,
              cashAmount: bd.cashAmount,
              customerFee: bd.customerFee,
              proCommission: bd.proCommission,
              extendedPaymentStatus: "payment_pending",
              updatedAt: now,
            })
            .where(eq(schema.bookings.id, b.id));
          await tx.insert(schema.notifications).values({
            userId: null,
            targetRole: "admin",
            type: "manual_payment_submitted",
            title: "নতুন ম্যানুয়াল পেমেন্ট যাচাইয়ের অপেক্ষায়",
            body: `কোড: ${b.code} — ৳${args.amount} (${args.provider} TrxID: ${trxId})`,
            bookingId: b.id,
          });
          return p;
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new Error("এই TrxID বা পেমেন্ট অনুরোধ আগেই জমা হয়েছে।");
        }
        throw err;
      }
      ctx.invalidateQueries();
      return { payment: toPaymentOut(payment, b.code), breakdown: bd };
    },
  }),

  adminVerifyPayment: defineAction({
    description:
      "Admin verifies or rejects a submitted manual payment; verification writes the immutable ledger entries and the booking's held balance in one transaction, rejection records the reason, and both sides are notified.",
    request: z.object({
      token: z.string(),
      paymentId: z.number().int(),
      decision: z.enum(["verify", "reject"]),
      reason: z.string().max(600).optional(),
    }),
    response: z.object({ payment: paymentOut }),
    async handler(ctx, args) {
      const admin = await requireAdminLevel(ctx, args.token, ["finance"]);
      const db = dbOf(ctx);
      const reason = args.reason?.trim() ?? "";
      if (args.decision === "reject" && !reason) {
        throw new Error("পেমেন্ট বাতিলের কারণ লিখুন।");
      }
      const prows = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, args.paymentId))
        .limit(1);
      const p = prows[0];
      if (!p) throw new Error("পেমেন্ট পাওয়া যায়নি।");
      if (p.status !== "pending" && p.status !== "initiated") {
        throw new Error("এই পেমেন্টটি ইতিমধ্যে নিষ্পত্তি হয়ে গেছে।");
      }
      const brows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, p.bookingId))
        .limit(1);
      const b = brows[0];
      if (!b) throw new Error("বুকিং পাওয়া যায়নি।");
      const now = new Date();

      if (args.decision === "reject") {
        const updated = await db.transaction(async (tx) => {
          const upd = await tx
            .update(schema.payments)
            .set({
              status: "failed",
              verifiedBy: admin.id,
              verifiedAt: now,
              rejectionReason: reason,
              updatedAt: now,
            })
            .where(eq(schema.payments.id, p.id))
            .returning();
          await tx
            .update(schema.bookings)
            .set({ extendedPaymentStatus: "rejected", updatedAt: now })
            .where(eq(schema.bookings.id, b.id));
          await tx.insert(schema.notifications).values({
            userId: b.customerId,
            targetRole: null,
            type: "payment_rejected",
            title: "আপনার পেমেন্ট যাচাই হয়নি",
            body: `কোড: ${b.code} — কারণ: ${reason}`,
            bookingId: b.id,
          });
          await tx.insert(schema.adminLogs).values({
            adminId: admin.id,
            action: "payment_rejected",
            detail: `${b.code}: payment #${p.id} (${p.provider} ${p.providerTrxId}) ৳${p.amount} — ${reason}`,
          });
          return upd[0];
        });
        if (!updated) throw new Error("পেমেন্ট আপডেট করা যায়নি।");
        ctx.invalidateQueries();
        return { payment: toPaymentOut(updated, b.code) };
      }

      // P-1 guard (Master Phase 5): a cancelled booking's payment
      // can never be verified — cancellation already auto-fails any
      // still-pending payment, and verifying money for a cancelled
      // booking would strand a held balance nobody can settle.
      if (b.status === "cancelled") {
        throw new Error("বাতিল করা বুকিংয়ের পেমেন্ট যাচাই করা যাবে না।");
      }

      // Verify: figures come from the booking's own snapshot, never
      // from current settings or from the client's claim.
      const bd = breakdownFromBooking(b);
      if (!bd) {
        throw new Error("বুকিংয়ের পেমেন্ট হিসাব (স্ন্যাপশট) পাওয়া যায়নি।");
      }
      if (p.amount !== bd.customerPaysOnline) {
        throw new Error(
          "পেমেন্টের পরিমাণ বুকিংয়ের হিসাবের সাথে মেলে না — যাচাই করা যাবে না।",
        );
      }
      const ref = `${p.provider}:${p.providerTrxId}`;
      let proUserId: number | null = null;
      if (b.professionalId) {
        const pros = await db
          .select()
          .from(schema.professionals)
          .where(eq(schema.professionals.id, b.professionalId))
          .limit(1);
        proUserId = pros[0]?.userId ?? null;
      }
      const updated = await db.transaction(async (tx) => {
        const upd = await tx
          .update(schema.payments)
          .set({
            status: "verified",
            verifiedBy: admin.id,
            verifiedAt: now,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(eq(schema.payments.id, p.id))
          .returning();
        const entries: (typeof schema.paymentLedger.$inferInsert)[] = [];
        entries.push({
          bookingId: b.id,
          paymentId: p.id,
          entryType: "online_collection",
          amount: p.amount,
          actorRole: "admin",
          adminId: admin.id,
          reference: ref,
          note: "ম্যানুয়াল পেমেন্ট যাচাইয়ে অনলাইন সংগ্রহ",
        });
        if (bd.customerFee > 0) {
          entries.push({
            bookingId: b.id,
            paymentId: p.id,
            entryType: "customer_fee",
            amount: bd.customerFee,
            actorRole: "admin",
            adminId: admin.id,
            reference: ref,
            note: "গ্রাহক প্ল্যাটফর্ম ফি",
          });
        }
        entries.push({
          bookingId: b.id,
          paymentId: p.id,
          entryType: "held_balance",
          amount: bd.heldAmount,
          actorRole: "admin",
          adminId: admin.id,
          reference: ref,
          note: "সেটলমেন্টের জন্য হেল্ড ব্যালেন্স",
        });
        if (bd.proCommission > 0) {
          entries.push({
            bookingId: b.id,
            paymentId: p.id,
            entryType: "commission_due",
            amount: bd.proCommission,
            actorRole: "admin",
            adminId: admin.id,
            reference: ref,
            note: "প্রফেশনালের কমিশন পাওনা",
          });
        }
        await tx.insert(schema.paymentLedger).values(entries);
        await tx
          .update(schema.bookings)
          .set({
            heldBalance: bd.heldAmount,
            extendedPaymentStatus: "held_settlement_pending",
            updatedAt: now,
          })
          .where(eq(schema.bookings.id, b.id));
        await tx.insert(schema.notifications).values({
          userId: b.customerId,
          targetRole: null,
          type: "payment_verified",
          title: "আপনার পেমেন্ট যাচাই সম্পন্ন হয়েছে",
          body: `কোড: ${b.code} — ৳${p.amount} অনলাইন পেমেন্ট যাচাই হয়েছে।`,
          bookingId: b.id,
        });
        if (proUserId) {
          await tx.insert(schema.notifications).values({
            userId: proUserId,
            targetRole: null,
            type: "payment_verified",
            title: "বুকিংয়ের পেমেন্ট যাচাই হয়েছে",
            body: `কোড: ${b.code} — সেটলমেন্টে হেল্ড থেকে ৳${bd.proPayoutFromHeld} পাবেন।`,
            bookingId: b.id,
          });
        }
        await tx.insert(schema.adminLogs).values({
          adminId: admin.id,
          action: "payment_verified",
          detail: `${b.code}: payment #${p.id} (${ref}) ৳${p.amount}, held=৳${bd.heldAmount}, commission=৳${bd.proCommission}`,
        });
        return upd[0];
      });
      if (!updated) throw new Error("পেমেন্ট আপডেট করা যায়নি।");
      ctx.invalidateQueries();
      return { payment: toPaymentOut(updated, b.code) };
    },
  }),

  adminListPayments: defineAction({
    description: "Admin: lists payment submissions, newest first, optionally filtered by status.",
    request: z.object({ token: z.string(), status: z.string().optional() }),
    response: z.object({ payments: z.array(paymentOut) }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["finance"]);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.payments)
        .orderBy(desc(schema.payments.id))
        .limit(200);
      const bookings = await db.select().from(schema.bookings);
      const codeMap = new Map(bookings.map((x) => [x.id, x.code]));
      return {
        payments: rows
          .filter((p) => !args.status || p.status === args.status)
          .map((p) => toPaymentOut(p, codeMap.get(p.bookingId) ?? "")),
      };
    },
  }),

  adminGetBookingPaymentDetail: defineAction({
    description:
      "Admin (operations/finance): full payment detail for one booking — the frozen price snapshot and its server-computed breakdown, every TrxID submission with verification status, and the booking's immutable ledger entries.",
    request: z.object({ token: z.string(), bookingId: z.number().int() }),
    response: z.object({
      booking: bookingOut,
      snapshot: z.object({
        paymentModel: z.string().nullable(),
        customerFeePercent: z.number().nullable(),
        proCommissionPercent: z.number().nullable(),
        calcBase: z.number().nullable(),
        finalPrice: z.number().nullable(),
        onlineAmount: z.number().nullable(),
        cashAmount: z.number().nullable(),
        customerFee: z.number().nullable(),
        proCommission: z.number().nullable(),
        heldBalance: z.number().nullable(),
        extendedPaymentStatus: z.string(),
      }),
      breakdown: breakdownOut.nullable(),
      payments: z.array(paymentOut),
      ledger: z.array(
        z.object({
          id: z.number(),
          entryType: z.string(),
          amount: z.number(),
          actorRole: z.string(),
          reference: z.string().nullable(),
          note: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["operations", "finance"]);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, args.bookingId))
        .limit(1);
      const b = rows[0];
      if (!b) throw new Error("বুকিং পাওয়া যায়নি।");
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const booking = await toBookingOut(ctx, b, names, proNames);
      const bd = breakdownFromBooking(b);
      const pays = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.bookingId, b.id))
        .orderBy(desc(schema.payments.id));
      const ledgerRows = await db
        .select()
        .from(schema.paymentLedger)
        .where(eq(schema.paymentLedger.bookingId, b.id))
        .orderBy(asc(schema.paymentLedger.id));
      return {
        booking,
        snapshot: {
          paymentModel: b.paymentModel,
          customerFeePercent: b.customerFeePercent,
          proCommissionPercent: b.proCommissionPercent,
          calcBase: b.calcBase,
          finalPrice: b.finalPrice,
          onlineAmount: b.onlineAmount,
          cashAmount: b.cashAmount,
          customerFee: b.customerFee,
          proCommission: b.proCommission,
          heldBalance: b.heldBalance,
          extendedPaymentStatus: b.extendedPaymentStatus,
        },
        breakdown: bd,
        payments: pays.map((p) => toPaymentOut(p, b.code)),
        ledger: ledgerRows.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          amount: e.amount,
          actorRole: e.actorRole,
          reference: e.reference,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    },
  }),

  adminListSettlementQueue: defineAction({
    description:
      "Admin (finance): read-only settlement queue — bookings whose held balance is still awaiting release, and professionals' open withdrawal requests. Deciding or paying a settlement is a later phase; this action changes nothing.",
    request: z.object({ token: z.string() }),
    response: z.object({
      heldBookings: z.array(
        z.object({
          bookingId: z.number(),
          code: z.string(),
          serviceName: z.string(),
          professionalName: z.string().nullable(),
          heldTotal: z.number(),
          commissionDue: z.number(),
          paidOut: z.number(),
          remainingHeld: z.number(),
          extendedPaymentStatus: z.string(),
        }),
      ),
      withdrawalRequests: z.array(
        z.object({
          id: z.number(),
          professionalId: z.number(),
          professionalName: z.string(),
          bookingCode: z.string().nullable(),
          amount: z.number(),
          method: z.string(),
          number: z.string(),
          status: z.string(),
          requestedAt: z.string(),
        }),
      ),
      totals: z.object({
        heldAwaitingRelease: z.number(),
        openWithdrawalCount: z.number(),
        openWithdrawalAmount: z.number(),
      }),
    }),
    async handler(ctx, args) {
      await requireAdminLevel(ctx, args.token, ["finance"]);
      const db = dbOf(ctx);
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      const ledger = await db.select().from(schema.paymentLedger);
      const byBooking = new Map<number, { held: number; commission: number; paidOut: number }>();
      for (const e of ledger) {
        const s = byBooking.get(e.bookingId) ?? { held: 0, commission: 0, paidOut: 0 };
        if (e.entryType === "held_balance") s.held += e.amount;
        else if (e.entryType === "commission_due") s.commission += e.amount;
        else if (e.entryType === "payout") s.paidOut += e.amount;
        byBooking.set(e.bookingId, s);
      }
      const bookingRows = await db.select().from(schema.bookings);
      const bookingById = new Map(bookingRows.map((b) => [b.id, b]));
      const heldBookings: {
        bookingId: number;
        code: string;
        serviceName: string;
        professionalName: string | null;
        heldTotal: number;
        commissionDue: number;
        paidOut: number;
        remainingHeld: number;
        extendedPaymentStatus: string;
      }[] = [];
      for (const [bookingId, s] of byBooking) {
        const remainingHeld = s.held - s.commission - s.paidOut;
        if (s.held <= 0 || remainingHeld <= 0) continue;
        const b = bookingById.get(bookingId);
        if (!b) continue;
        heldBookings.push({
          bookingId,
          code: b.code,
          serviceName: names.get(b.serviceSlug) ?? b.serviceSlug,
          professionalName:
            b.professionalId != null ? (proNames.get(b.professionalId) ?? null) : null,
          heldTotal: s.held,
          commissionDue: s.commission,
          paidOut: s.paidOut,
          remainingHeld,
          extendedPaymentStatus: b.extendedPaymentStatus,
        });
      }
      heldBookings.sort((x, y) => y.bookingId - x.bookingId);
      const wr = await db
        .select()
        .from(schema.withdrawalRequests)
        .where(inArray(schema.withdrawalRequests.status, ["requested", "approved"]))
        .orderBy(desc(schema.withdrawalRequests.id));
      const withdrawalRequests = wr.map((w) => ({
        id: w.id,
        professionalId: w.professionalId,
        professionalName: proNames.get(w.professionalId) ?? "",
        bookingCode: w.bookingId != null ? (bookingById.get(w.bookingId)?.code ?? null) : null,
        amount: w.amount,
        method: w.withdrawalMethod,
        number: w.withdrawalNumber,
        status: w.status,
        requestedAt: w.requestedAt.toISOString(),
      }));
      return {
        heldBookings,
        withdrawalRequests,
        totals: {
          heldAwaitingRelease: heldBookings.reduce((a, h) => a + h.remainingHeld, 0),
          openWithdrawalCount: withdrawalRequests.length,
          openWithdrawalAmount: withdrawalRequests.reduce((a, w) => a + w.amount, 0),
        },
      };
    },
  }),

  getMyPayments: defineAction({
    description: "Returns the signed-in customer's own payment submissions, newest first.",
    request: z.object({ token: z.string() }),
    response: z.object({ payments: z.array(paymentOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.submittedBy, user.id))
        .orderBy(desc(schema.payments.id));
      const bookings = await db.select().from(schema.bookings);
      const codeMap = new Map(bookings.map((x) => [x.id, x.code]));
      return {
        payments: rows.map((p) => toPaymentOut(p, codeMap.get(p.bookingId) ?? "")),
      };
    },
  }),

  // --------------------------------------- Phase 3: checkout + dashboard
  getPaymentQuote: defineAction({
    description:
      "Customer checkout quote for their own price-confirmed booking: server-computed breakdowns for BOTH payment models (snapshotted rates when the booking already has them, current settings otherwise), the admin-configured MFS number to send money to, and the booking's existing payments. The client never computes money figures itself.",
    request: z.object({ token: z.string(), bookingCode: z.string().min(4).max(40) }),
    response: z.object({
      bookingCode: z.string(),
      bill: z.number(),
      chosenModel: z.string().nullable(),
      extendedPaymentStatus: z.string(),
      options: z.array(breakdownOut),
      payments: z.array(paymentOut),
      paymentReceiveNumber: z.string().nullable(),
      paymentReceiveProvider: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer") {
        throw new Error("শুধুমাত্র গ্রাহকই চেকআউট দেখতে পারবেন।");
      }
      const db = dbOf(ctx);
      const brows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.code, args.bookingCode.trim()))
        .limit(1);
      const b = brows[0];
      if (!b || b.customerId !== user.id) {
        throw new Error("বুকিং পাওয়া যায়নি।");
      }
      if (b.status === "cancelled") {
        throw new Error("বাতিল করা বুকিংয়ে পেমেন্ট করা যাবে না।");
      }
      if (b.finalPrice == null || b.finalPrice <= 0) {
        throw new Error(
          "এই বুকিংয়ের মূল্য এখনো নিশ্চিত হয়নি — অ্যাডমিন মূল্য নিশ্চিত করলেই পেমেন্ট করা যাবে।",
        );
      }
      const stRows = await db.select().from(schema.settings).limit(1);
      const st = stRows[0];
      const rates = dualRatesFromSettings(st);
      const bill = b.finalPrice;
      const calcBase = b.calcBase ?? bill;
      const options = (["full_online", "split_50_50"] as const).map((model) => {
        if (b.paymentModel === model) {
          const snap = breakdownFromBooking(b);
          if (snap) return snap;
        }
        return computeBreakdown({
          bill,
          paymentModel: model,
          calcBase,
          rates,
        });
      });
      const pays = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.bookingId, b.id))
        .orderBy(desc(schema.payments.id));
      return {
        bookingCode: b.code,
        bill,
        chosenModel: b.paymentModel,
        extendedPaymentStatus: b.extendedPaymentStatus,
        options,
        payments: pays.map((p) => toPaymentOut(p, b.code)),
        paymentReceiveNumber: st?.paymentReceiveNumber ?? null,
        paymentReceiveProvider: st?.paymentReceiveProvider ?? null,
      };
    },
  }),

  getMyReceipt: defineAction({
    description:
      "Customer receipt for one of their own bookings: the booking's snapshotted server-computed breakdown, its payments, and the immutable ledger entries recorded for it. Another customer's booking is indistinguishable from a missing one.",
    request: z.object({ token: z.string(), bookingCode: z.string().min(4).max(40) }),
    response: z.object({
      bookingCode: z.string(),
      serviceName: z.string(),
      bill: z.number().nullable(),
      extendedPaymentStatus: z.string(),
      breakdown: breakdownOut.nullable(),
      payments: z.array(paymentOut),
      ledger: z.array(ledgerEntryOut),
    }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer") {
        throw new Error("শুধুমাত্র গ্রাহকই নিজের রসিদ দেখতে পারবেন।");
      }
      const db = dbOf(ctx);
      const brows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.code, args.bookingCode.trim()))
        .limit(1);
      const b = brows[0];
      if (!b || b.customerId !== user.id) {
        throw new Error("বুকিং পাওয়া যায়নি।");
      }
      const names = await serviceNameMap(ctx);
      const pays = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.bookingId, b.id))
        .orderBy(asc(schema.payments.id));
      const entries = await db
        .select()
        .from(schema.paymentLedger)
        .where(eq(schema.paymentLedger.bookingId, b.id))
        .orderBy(asc(schema.paymentLedger.id));
      return {
        bookingCode: b.code,
        serviceName: names.get(b.serviceSlug) ?? b.serviceSlug,
        bill: b.finalPrice,
        extendedPaymentStatus: b.extendedPaymentStatus,
        breakdown: breakdownFromBooking(b),
        payments: pays.map((p) => toPaymentOut(p, b.code)),
        ledger: entries.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          amount: e.amount,
          reference: e.reference,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    },
  }),

  getMyReviews: defineAction({
    description: "Returns the signed-in customer's own reviews with their moderation status, newest first.",
    request: z.object({ token: z.string() }),
    response: z.object({ reviews: z.array(reviewOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer") {
        throw new Error("শুধুমাত্র গ্রাহকই নিজের রিভিউ দেখতে পারবেন।");
      }
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.customerId, user.id))
        .orderBy(desc(schema.reviews.id));
      const names = await serviceNameMap(ctx);
      const proNames = await proNameMap(ctx);
      return {
        reviews: rows.map((r) => ({
          id: r.id,
          bookingId: r.bookingId,
          customerName: user.name,
          professionalId: r.professionalId,
          professionalName: r.professionalId
            ? (proNames.get(r.professionalId) ?? null)
            : null,
          serviceSlug: r.serviceSlug,
          serviceName: names.get(r.serviceSlug) ?? r.serviceSlug,
          rating: r.rating,
          text: r.text,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  submitRefundRequest: defineAction({
    description:
      "Customer submits a refund request for an online payment on their own booking. This only records the request and notifies admins — no money moves and no refund is promised; admin review and any actual refund are a later phase. One open request per booking.",
    request: z.object({
      token: z.string(),
      bookingCode: z.string().min(4).max(40),
      reason: z.enum([
        "work_not_completed",
        "poor_quality",
        "incorrect_price",
        "professional_no_show",
        "other",
      ]),
      detail: z.string().min(5).max(1000),
    }),
    response: z.object({ request: refundRequestOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer") {
        throw new Error("শুধুমাত্র গ্রাহকই রিফান্ডের অনুরোধ করতে পারবেন।");
      }
      const db = dbOf(ctx);
      const brows = await db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.code, args.bookingCode.trim()))
        .limit(1);
      const b = brows[0];
      if (!b || b.customerId !== user.id) {
        throw new Error("বুকিং পাওয়া যায়নি।");
      }
      const pays = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.bookingId, b.id))
        .orderBy(desc(schema.payments.id));
      const target =
        pays.find((p) => p.status === "verified") ??
        pays.find((p) => p.status === "pending" || p.status === "initiated");
      if (!target) {
        throw new Error(
          "এই বুকিংয়ে রিফান্ডের মতো কোনো অনলাইন পেমেন্ট নেই। ক্যাশ পেমেন্ট নিয়ে সমস্যা থাকলে অভিযোগ পাঠান।",
        );
      }
      const open = await db
        .select()
        .from(schema.refundRequests)
        .where(
          and(
            eq(schema.refundRequests.bookingId, b.id),
            eq(schema.refundRequests.status, "requested"),
          ),
        )
        .limit(1);
      if (open.length) {
        throw new Error("এই বুকিংয়ের জন্য ইতিমধ্যে একটি রিফান্ড অনুরোধ বিচারাধীন আছে।");
      }
      const inserted = await db
        .insert(schema.refundRequests)
        .values({
          bookingId: b.id,
          customerId: user.id,
          paymentId: target.id,
          reason: args.reason,
          detail: args.detail.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("অনুরোধ পাঠানো যায়নি।");
      await notify(ctx, {
        targetRole: "admin",
        type: "refund_requested",
        title: "নতুন রিফান্ড অনুরোধ",
        body: `কোড: ${b.code} — ৳${target.amount} (${target.provider} TrxID: ${target.providerTrxId})`,
        bookingId: b.id,
      });
      ctx.invalidateQueries();
      return { request: toRefundOut(row, b.code) };
    },
  }),

  getMyRefundRequests: defineAction({
    description: "Returns the signed-in customer's own refund requests with their status, newest first.",
    request: z.object({ token: z.string() }),
    response: z.object({ requests: z.array(refundRequestOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      if (user.role !== "customer") {
        throw new Error("শুধুমাত্র গ্রাহকই নিজের রিফান্ড অনুরোধ দেখতে পারবেন।");
      }
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.customerId, user.id))
        .orderBy(desc(schema.refundRequests.id));
      const bookings = await db.select().from(schema.bookings);
      const codeMap = new Map(bookings.map((x) => [x.id, x.code]));
      return {
        requests: rows.map((r) => toRefundOut(r, codeMap.get(r.bookingId) ?? "")),
      };
    },
  }),

  getMyAddresses: defineAction({
    description: "Returns the signed-in customer's saved addresses.",
    request: z.object({ token: z.string() }),
    response: z.object({ addresses: z.array(addressOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.addresses)
        .where(eq(schema.addresses.userId, user.id))
        .orderBy(desc(schema.addresses.isDefault), asc(schema.addresses.id));
      return { addresses: rows.map(toAddressOut) };
    },
  }),

  saveMyAddress: defineAction({
    description:
      "Creates or updates one of the signed-in customer's saved addresses. Updating an id that belongs to someone else fails as not-found. Marking an address default clears the default flag on the customer's other addresses in the same transaction.",
    request: z.object({
      token: z.string(),
      id: z.number().int().optional(),
      label: z.string().min(1).max(40),
      upazila: z.string().min(2).max(80),
      area: z.string().max(120).optional(),
      address: z.string().min(5).max(400),
      phone: z.string().max(20).optional(),
      isDefault: z.boolean().default(false),
    }),
    response: z.object({ address: addressOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const now = new Date();
      const values = {
        label: args.label.trim(),
        upazila: args.upazila.trim(),
        area: args.area?.trim() ? args.area.trim() : null,
        address: args.address.trim(),
        phone: args.phone?.trim() ? args.phone.trim() : null,
        isDefault: args.isDefault ? 1 : 0,
      };
      let row: AddressRow | undefined;
      if (args.id != null) {
        const addressId = args.id;
        const existing = await db
          .select()
          .from(schema.addresses)
          .where(eq(schema.addresses.id, addressId))
          .limit(1);
        if (!existing[0] || existing[0].userId !== user.id) {
          throw new Error("ঠিকানা পাওয়া যায়নি।");
        }
        // Postgres edition: the clear-default + update pair runs in a
        // real transaction (the SQLite edition uses an atomic batch).
        await db.transaction(async (tx) => {
          if (args.isDefault) {
            await tx
              .update(schema.addresses)
              .set({ isDefault: 0, updatedAt: now })
              .where(eq(schema.addresses.userId, user.id));
          }
          await tx
            .update(schema.addresses)
            .set({ ...values, updatedAt: now })
            .where(eq(schema.addresses.id, addressId));
        });
        const rows = await db
          .select()
          .from(schema.addresses)
          .where(eq(schema.addresses.id, addressId))
          .limit(1);
        row = rows[0];
      } else {
        const count = await db
          .select()
          .from(schema.addresses)
          .where(eq(schema.addresses.userId, user.id));
        if (count.length >= 10) {
          throw new Error("সর্বোচ্চ ১০টি ঠিকানা সংরক্ষণ করা যাবে।");
        }
        // The first saved address becomes the default automatically.
        const makeDefault = args.isDefault || count.length === 0;
        await db.transaction(async (tx) => {
          if (makeDefault && count.length > 0) {
            await tx
              .update(schema.addresses)
              .set({ isDefault: 0, updatedAt: now })
              .where(eq(schema.addresses.userId, user.id));
          }
          await tx.insert(schema.addresses).values({
            userId: user.id,
            ...values,
            isDefault: makeDefault ? 1 : 0,
          });
        });
        const rows = await db
          .select()
          .from(schema.addresses)
          .where(eq(schema.addresses.userId, user.id))
          .orderBy(desc(schema.addresses.id))
          .limit(1);
        row = rows[0];
      }
      if (!row) throw new Error("ঠিকানা সংরক্ষণ করা যায়নি।");
      ctx.invalidateQueries();
      return { address: toAddressOut(row) };
    },
  }),

  deleteMyAddress: defineAction({
    description: "Deletes one of the signed-in customer's saved addresses (own rows only).",
    request: z.object({ token: z.string(), id: z.number().int() }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.addresses)
        .where(eq(schema.addresses.id, args.id))
        .limit(1);
      if (!rows[0] || rows[0].userId !== user.id) {
        throw new Error("ঠিকানা পাওয়া যায়নি।");
      }
      await db.delete(schema.addresses).where(eq(schema.addresses.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  changeMyPassword: defineAction({
    description:
      "Changes the signed-in user's password after verifying the current one. The new password is bcrypt-hashed (minimum 12 characters) and every OTHER session of the account is revoked; the current session stays signed in.",
    request: z.object({
      token: z.string(),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(12).max(200),
    }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      if (!(await verifyPassword(args.currentPassword, user.passwordHash))) {
        throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়।");
      }
      if (args.newPassword === args.currentPassword) {
        throw new Error("নতুন পাসওয়ার্ড বর্তমান পাসওয়ার্ডের চেয়ে আলাদা হতে হবে।");
      }
      const db = dbOf(ctx);
      await db
        .update(schema.users)
        .set({ passwordHash: await hashPassword(args.newPassword), updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));
      const mine = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      for (const s of mine) {
        if (s.token !== args.token) {
          await db.delete(schema.sessions).where(eq(schema.sessions.token, s.token));
        }
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getMySessions: defineAction({
    description:
      "Lists the signed-in user's active (unexpired) sessions for the security tab. Raw tokens are never returned — each session is identified by a truncated hash reference used only for revocation.",
    request: z.object({ token: z.string() }),
    response: z.object({ sessions: z.array(sessionInfoOut) }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id))
        .orderBy(desc(schema.sessions.createdAt));
      const now = Date.now();
      const out: z.infer<typeof sessionInfoOut>[] = [];
      for (const s of rows) {
        if (s.expiresAt.getTime() < now) continue;
        out.push({
          ref: (await sha256Hex(s.token)).slice(0, 24),
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          current: s.token === args.token,
        });
      }
      return { sessions: out };
    },
  }),

  revokeMySession: defineAction({
    description:
      "Revokes one of the signed-in user's other sessions by its hash reference (from getMySessions). The current session cannot be revoked here — logging out ends it.",
    request: z.object({ token: z.string(), ref: z.string().min(8).max(64) }),
    response: okOut,
    async handler(ctx, args): Promise<z.infer<typeof okOut>> {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      for (const s of rows) {
        if ((await sha256Hex(s.token)).slice(0, 24) === args.ref) {
          if (s.token === args.token) {
            throw new Error("বর্তমান সেশন এখান থেকে বাতিল করা যাবে না — লগআউট করুন।");
          }
          await db.delete(schema.sessions).where(eq(schema.sessions.token, s.token));
          ctx.invalidateQueries();
          return { ok: true };
        }
      }
      throw new Error("সেশন পাওয়া যায়নি।");
    },
  }),

  requestAccountDeletion: defineAction({
    description:
      "Records the signed-in user's account-deletion request and notifies admins. The account is NOT deleted by this action — an admin processes requests later, respecting financial-record retention. Only one pending request per account.",
    request: z.object({ token: z.string(), reason: z.string().max(500).optional() }),
    response: z.object({ request: deletionRequestOut }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const pending = await db
        .select()
        .from(schema.accountDeletionRequests)
        .where(
          and(
            eq(schema.accountDeletionRequests.userId, user.id),
            eq(schema.accountDeletionRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (pending.length) {
        throw new Error("আপনার একটি মুছে-ফেলার অনুরোধ ইতিমধ্যে বিচারাধীন আছে।");
      }
      const inserted = await db
        .insert(schema.accountDeletionRequests)
        .values({ userId: user.id, reason: args.reason?.trim() || null })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("অনুরোধ পাঠানো যায়নি।");
      await notify(ctx, {
        targetRole: "admin",
        type: "account_deletion_requested",
        title: "অ্যাকাউন্ট মুছে ফেলার অনুরোধ",
        body: `${user.name} (${user.phone}) অ্যাকাউন্ট মুছে ফেলার অনুরোধ করেছেন।`,
      });
      ctx.invalidateQueries();
      return {
        request: {
          id: row.id,
          reason: row.reason,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        },
      };
    },
  }),

  getMyDeletionRequest: defineAction({
    description: "Returns the signed-in user's latest account-deletion request, or null when none exists.",
    request: z.object({ token: z.string() }),
    response: z.object({ request: deletionRequestOut.nullable() }),
    async handler(ctx, args) {
      const user = await requireUser(ctx, args.token);
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.accountDeletionRequests)
        .where(eq(schema.accountDeletionRequests.userId, user.id))
        .orderBy(desc(schema.accountDeletionRequests.id))
        .limit(1);
      const row = rows[0];
      return {
        request: row
          ? {
              id: row.id,
              reason: row.reason,
              status: row.status,
              createdAt: row.createdAt.toISOString(),
            }
          : null,
      };
    },
  }),

  downloadFullBackup: defineAction({
    description:
      "Super Admin only: builds a complete restorable backup of every database table except sessions (live session tokens are never exported) and returns it as base64-encoded gzipped JSON for the admin panel's download button. Gated by the caller's own logged-in session — no token in any URL. Read-only: it never writes, updates or deletes anything.",
    request: z.object({
      token: z.string(),
    }),
    response: fullBackupResponse,
    async handler(ctx, args): Promise<FullBackupDownload> {
      // Empty level list = Super Admin only (see requireAdminLevel).
      await requireAdminLevel(ctx, args.token, []);
      return buildFullBackup(dbOf(ctx));
    },
  }),
} satisfies ActionsModule;
