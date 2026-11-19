// Read-only business-data export for the owner's spreadsheet sync
// (Google Sheets pulls GET /api/export — see `api/export.ts`).
//
// `buildExport` reads the five business collections (bookings, payments,
// professionals, reviews, financial ledger) and shapes them into plain
// JSON rows. It only ever SELECTs — nothing here writes, updates or
// deletes. It NEVER reads or returns password hashes, session tokens,
// NID numbers, identity-document bytes/URLs, withdrawal account numbers
// or any other credential: the queries pick only the columns each row
// needs, and the user lookups read name + phone only.
//
// `exportTokenAuthorized` is the endpoint's only gate: the provided
// token is compared against the EXPORT_TOKEN environment variable in
// constant time. Both sides are SHA-256 hashed first, so the comparison
// runs over fixed-length digests and leaks neither the expected token
// nor its length. When EXPORT_TOKEN is unset or empty, nothing is
// authorized.

import { createHash, timingSafeEqual } from "node:crypto";
import { asc, sql } from "drizzle-orm";
import * as schema from "./schema";
import type { AppDb } from "./runtime";
// Exact English brand spellings for payment providers (Master
// Phase 11): the Sheets export must never write the raw lowercase
// enum ("bkash") — the owner's spreadsheet shows "bKash" / "Nagad".
const PROVIDER_EN: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  pathao_pay: "Pathao Pay",
  sslcommerz: "SSLCOMMERZ",
};


export interface ExportBookingRow {
  id: number;
  code: string;
  createdAt: string; // ISO 8601
  customerName: string;
  customerMobile: string;
  serviceName: string;
  upazila: string;
  status: string;
  paymentModel: string | null;
  finalPrice: number | null; // BDT
  paymentStatus: string; // legacy cash status: unpaid | cash_paid
  onlinePaymentStatus: string; // extended Dual Payment status
  professionalName: string | null;
}

export interface ExportPaymentRow {
  id: number;
  createdAt: string; // ISO 8601
  bookingId: number;
  bookingCode: string;
  customerName: string;
  provider: string;
  trxId: string;
  amount: number; // BDT paid online, as verified/submitted
  customerFee: number | null; // BDT, snapshotted on the booking
  status: string;
  verifiedAt: string | null; // ISO 8601
}

export interface ExportProfessionalRow {
  id: number;
  name: string;
  mobile: string;
  serviceName: string;
  upazila: string | null; // primary (first) service area
  upazilas: string[]; // all service areas
  status: string;
  joinedAt: string; // ISO 8601
  completedJobs: number;
}

export interface ExportReviewRow {
  id: number;
  createdAt: string; // ISO 8601
  bookingId: number;
  bookingCode: string;
  customerName: string;
  professionalName: string | null;
  rating: number;
  comment: string;
  status: string;
}

export interface ExportLedgerRow {
  id: number;
  createdAt: string; // ISO 8601
  bookingId: number;
  bookingCode: string;
  type: string;
  amount: number; // BDT, always positive; direction carries the sign
  direction: "in" | "out";
  note: string | null;
}

export interface ExportPayload {
  exportedAt: string; // ISO 8601
  bookings: ExportBookingRow[];
  payments: ExportPaymentRow[];
  professionals: ExportProfessionalRow[];
  reviews: ExportReviewRow[];
  ledger: ExportLedgerRow[];
}

// NOTE: there is deliberately no full-database mode here. An earlier
// revision offered `mode=full` (every table and column, including
// password hashes, live session tokens and identity documents) behind
// the same query-string token; the security review rejected it — one
// leaked token would have yielded full account-takeover material plus
// every professional's identity documents. This export stays limited
// to the field-filtered business payload above; restorable backups
// belong in a separate owner-only channel (e.g. a database dump),
// never in this endpoint.

// Ledger amounts are stored unsigned; the direction is a property of
// the entry type. "in" = money (or a claim on money) coming into
// MistriDako's hands; "out" = money owed out of the held balance
// (commission due to be netted, payouts, refunds, adjustments).
const LEDGER_DIRECTION: Record<string, "in" | "out"> = {
  online_collection: "in",
  customer_fee: "in",
  commission_collected: "in",
  held_balance: "in",
  commission_due: "out",
  payout: "out",
  refund: "out",
  adjustment: "out",
};

export function exportTokenAuthorized(provided: string | undefined | null): boolean {
  const expected = process.env.EXPORT_TOKEN;
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function parseAreas(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export async function buildExport(db: AppDb): Promise<ExportPayload> {
  // All reads run inside one transaction with firm server-side
  // timeouts. `SET LOCAL` scopes both settings to this transaction
  // only, so they hold even behind Supabase's transaction pooler
  // (where a session-level SET would land on an arbitrary backend)
  // and can never leak onto a pooled connection later reused by the
  // actions endpoint. A statement that stalls — e.g. waiting on a
  // lock — is cancelled by Postgres itself after 10s and surfaces
  // here as an error (the endpoint then answers 500) instead of
  // hanging until the platform kills the invocation, which is what
  // the live /api/export 300s timeouts were. The transaction also
  // gives the export one consistent snapshot across all five
  // collections.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '10000'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '10000'`);
    const [serviceRows, userRows, proRows, bookingRows, paymentRows, reviewRows, ledgerRows] =
      await Promise.all([
        tx
          .select({ slug: schema.services.slug, nameBn: schema.services.nameBn })
          .from(schema.services),
        // Name + phone only — password hashes and every other credential
        // column stay in the database.
        tx
          .select({ id: schema.users.id, name: schema.users.name, phone: schema.users.phone })
          .from(schema.users),
        // Deliberately NOT selected: nid_number, withdrawal_method,
        // withdrawal_number, email — none of them belong in an export.
        tx
          .select({
            id: schema.professionals.id,
            userId: schema.professionals.userId,
            categorySlug: schema.professionals.categorySlug,
            areas: schema.professionals.areas,
            status: schema.professionals.status,
            createdAt: schema.professionals.createdAt,
          })
          .from(schema.professionals)
          .orderBy(asc(schema.professionals.id)),
        tx.select().from(schema.bookings).orderBy(asc(schema.bookings.id)),
        tx
          .select({
            id: schema.payments.id,
            bookingId: schema.payments.bookingId,
            provider: schema.payments.provider,
            providerTrxId: schema.payments.providerTrxId,
            amount: schema.payments.amount,
            status: schema.payments.status,
            verifiedAt: schema.payments.verifiedAt,
            createdAt: schema.payments.createdAt,
          })
          .from(schema.payments)
          .orderBy(asc(schema.payments.id)),
        tx.select().from(schema.reviews).orderBy(asc(schema.reviews.id)),
        tx
          .select({
            id: schema.paymentLedger.id,
            bookingId: schema.paymentLedger.bookingId,
            entryType: schema.paymentLedger.entryType,
            amount: schema.paymentLedger.amount,
            note: schema.paymentLedger.note,
            createdAt: schema.paymentLedger.createdAt,
          })
          .from(schema.paymentLedger)
          .orderBy(asc(schema.paymentLedger.id)),
      ]);

    const serviceName = new Map(serviceRows.map((s) => [s.slug, s.nameBn]));
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const proById = new Map(proRows.map((p) => [p.id, p]));
    const bookingById = new Map(bookingRows.map((b) => [b.id, b]));

    const proName = (professionalId: number | null): string | null => {
      if (professionalId == null) return null;
      const pro = proById.get(professionalId);
      if (!pro) return null;
      return userById.get(pro.userId)?.name ?? null;
    };

    const completedByPro = new Map<number, number>();
    for (const b of bookingRows) {
      if (b.status === "completed" && b.professionalId != null) {
        completedByPro.set(b.professionalId, (completedByPro.get(b.professionalId) ?? 0) + 1);
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      bookings: bookingRows.map((b) => ({
        id: b.id,
        code: b.code,
        createdAt: b.createdAt.toISOString(),
        customerName: b.customerName,
        customerMobile: b.phone,
        serviceName: serviceName.get(b.serviceSlug) ?? b.serviceSlug,
        upazila: b.upazila,
        status: b.status,
        paymentModel: b.paymentModel,
        finalPrice: b.finalPrice,
        paymentStatus: b.paymentStatus,
        onlinePaymentStatus: b.extendedPaymentStatus,
        professionalName: proName(b.professionalId),
      })),
      payments: paymentRows.map((p) => {
        const booking = bookingById.get(p.bookingId);
        return {
          id: p.id,
          createdAt: p.createdAt.toISOString(),
          bookingId: p.bookingId,
          bookingCode: booking?.code ?? "",
          customerName: booking?.customerName ?? "",
          provider: PROVIDER_EN[p.provider] ?? p.provider,
          trxId: p.providerTrxId,
          amount: p.amount,
          customerFee: booking?.customerFee ?? null,
          status: p.status,
          verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
        };
      }),
      professionals: proRows.map((p) => {
        const user = userById.get(p.userId);
        const areas = parseAreas(p.areas);
        return {
          id: p.id,
          name: user?.name ?? "",
          mobile: user?.phone ?? "",
          serviceName: serviceName.get(p.categorySlug) ?? p.categorySlug,
          upazila: areas[0] ?? null,
          upazilas: areas,
          status: p.status,
          joinedAt: p.createdAt.toISOString(),
          completedJobs: completedByPro.get(p.id) ?? 0,
        };
      }),
      reviews: reviewRows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        bookingId: r.bookingId,
        bookingCode: bookingById.get(r.bookingId)?.code ?? "",
        customerName: userById.get(r.customerId)?.name ?? "",
        professionalName: proName(r.professionalId),
        rating: r.rating,
        comment: r.text,
        status: r.status,
      })),
      ledger: ledgerRows.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        bookingId: l.bookingId,
        bookingCode: bookingById.get(l.bookingId)?.code ?? "",
        type: l.entryType,
        amount: l.amount,
        direction: LEDGER_DIRECTION[l.entryType] ?? "out",
        note: l.note,
      })),
    };
  });
}
