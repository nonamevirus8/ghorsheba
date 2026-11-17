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
import { asc, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import type { AppDb } from "./runtime";

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
  upazilas: string[];
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

// ---------------------------------------------------------------------
// Full backup (mode=full)
//
// Unlike the business export above — which is shaped for a shared
// spreadsheet and deliberately omits credentials — the full backup is
// the owner's private, restorable copy of the whole database: EVERY
// table, EVERY column, including password hashes, session tokens, NID
// numbers and identity-document data. It sits behind the same
// constant-time token gate and the same 404-on-failure behaviour, and
// it is just as read-only. Binary columns (the `blobs.data` bytea) are
// base64-encoded strings; timestamps are ISO 8601 strings; everything
// else keeps its stored value.

export interface FullBackupPayload {
  exportedAt: string; // ISO 8601
  mode: "full";
  tables: Record<string, Record<string, unknown>[]>;
}

// Ledger amounts are stored unsigned; the direction is a property of
// the entry type. "in" = money (or a claim on money) coming into
// GhorSheba's hands; "out" = money owed out of the held balance
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
  const [serviceRows, userRows, proRows, bookingRows, paymentRows, reviewRows, ledgerRows] =
    await Promise.all([
      db
        .select({ slug: schema.services.slug, nameBn: schema.services.nameBn })
        .from(schema.services),
      // Name + phone only — password hashes and every other credential
      // column stay in the database.
      db
        .select({ id: schema.users.id, name: schema.users.name, phone: schema.users.phone })
        .from(schema.users),
      // Deliberately NOT selected: nid_number, withdrawal_method,
      // withdrawal_number, email — none of them belong in an export.
      db
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
      db.select().from(schema.bookings).orderBy(asc(schema.bookings.id)),
      db
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
      db.select().from(schema.reviews).orderBy(asc(schema.reviews.id)),
      db
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
        provider: p.provider,
        trxId: p.providerTrxId,
        amount: p.amount,
        customerFee: booking?.customerFee ?? null,
        status: p.status,
        verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      };
    }),
    professionals: proRows.map((p) => {
      const user = userById.get(p.userId);
      return {
        id: p.id,
        name: user?.name ?? "",
        mobile: user?.phone ?? "",
        serviceName: serviceName.get(p.categorySlug) ?? p.categorySlug,
        upazilas: parseAreas(p.areas),
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
}

// Every table in the schema, keyed by its database table name so the
// backup file maps 1:1 onto the database it came from.
const FULL_BACKUP_TABLES: ReadonlyArray<readonly [string, PgTable]> = [
  ["users", schema.users],
  ["professionals", schema.professionals],
  ["identity_documents", schema.identityDocuments],
  ["services", schema.services],
  ["locations", schema.locations],
  ["bookings", schema.bookings],
  ["booking_events", schema.bookingEvents],
  ["reviews", schema.reviews],
  ["notifications", schema.notifications],
  ["complaints", schema.complaints],
  ["settings", schema.settings],
  ["admin_logs", schema.adminLogs],
  ["auth_attempts", schema.authAttempts],
  ["sessions", schema.sessions],
  ["payments", schema.payments],
  ["payment_ledger", schema.paymentLedger],
  ["withdrawal_requests", schema.withdrawalRequests],
  ["blobs", schema.blobs],
];

function backupValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  // bytea columns (blobs.data) arrive as Buffer/Uint8Array — encode
  // them as base64 strings so the backup is plain JSON.
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  return value;
}

export async function buildFullBackup(db: AppDb): Promise<FullBackupPayload> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [name, table] of FULL_BACKUP_TABLES) {
    // Rows come back keyed by the schema's property names; remap them
    // to the real database column names so the backup maps 1:1 onto
    // the tables it would be restored into.
    const columns = getTableColumns(table);
    const rows = (await db.select().from(table)) as Array<Record<string, unknown>>;
    tables[name] = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        out[columns[key]?.name ?? key] = backupValue(value);
      }
      return out;
    });
  }
  return { exportedAt: new Date().toISOString(), mode: "full", tables };
}
