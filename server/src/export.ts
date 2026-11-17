// Read-only business-data export for the owner's spreadsheet sync —
// the SQLite/artifact mirror of the portable edition's
// GET /api/export endpoint (same payload, same rules).
//
// The artifact runtime exposes server actions rather than raw HTTP
// routes, so here the export is the `exportData` action in
// `actions.ts`: it takes the export token (and an optional mode) and
// returns exactly the payload the portable endpoint returns. A missing
// or wrong token — or the EXPORT_TOKEN environment variable being
// unset — fails with a plain "Not found" error, so the export's
// existence is not revealed, mirroring the endpoint's 404.
//
// `buildExport` only ever SELECTs — nothing here writes, updates or
// deletes. It NEVER reads or returns password hashes, session tokens,
// NID numbers, identity-document bytes/URLs, withdrawal account
// numbers or any other credential: the queries pick only the columns
// each row needs, and the user lookups read name + phone only.
//
// `exportTokenAuthorized` compares the provided token against the
// expected one in constant time. Both sides are SHA-256 hashed first,
// so the comparison runs over fixed-length digests and leaks neither
// the expected token nor its length. The expected token comes from the
// EXPORT_TOKEN environment variable, which sandboxed action code may
// not read directly — the `exportData` action fetches it through the
// `readExportToken` privileged host function (see `privileged.ts`) and
// passes it in. When EXPORT_TOKEN is unset or empty, nothing is
// authorized.

import { z, type SpaceDb } from "@hatch/space-sdk";
import { asc, getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

type ExportDb = SpaceDb<typeof schema>;

export const exportBookingRow = z.object({
  id: z.number(),
  code: z.string(),
  createdAt: z.string(), // ISO 8601
  customerName: z.string(),
  customerMobile: z.string(),
  serviceName: z.string(),
  upazila: z.string(),
  status: z.string(),
  paymentModel: z.string().nullable(),
  finalPrice: z.number().nullable(), // BDT
  paymentStatus: z.string(), // legacy cash status: unpaid | cash_paid
  onlinePaymentStatus: z.string(), // extended Dual Payment status
  professionalName: z.string().nullable(),
});

export const exportPaymentRow = z.object({
  id: z.number(),
  createdAt: z.string(), // ISO 8601
  bookingId: z.number(),
  bookingCode: z.string(),
  customerName: z.string(),
  provider: z.string(),
  trxId: z.string(),
  amount: z.number(), // BDT paid online, as verified/submitted
  customerFee: z.number().nullable(), // BDT, snapshotted on the booking
  status: z.string(),
  verifiedAt: z.string().nullable(), // ISO 8601
});

export const exportProfessionalRow = z.object({
  id: z.number(),
  name: z.string(),
  mobile: z.string(),
  serviceName: z.string(),
  upazilas: z.array(z.string()),
  status: z.string(),
  joinedAt: z.string(), // ISO 8601
  completedJobs: z.number(),
});

export const exportReviewRow = z.object({
  id: z.number(),
  createdAt: z.string(), // ISO 8601
  bookingId: z.number(),
  bookingCode: z.string(),
  customerName: z.string(),
  professionalName: z.string().nullable(),
  rating: z.number(),
  comment: z.string(),
  status: z.string(),
});

export const exportLedgerRow = z.object({
  id: z.number(),
  createdAt: z.string(), // ISO 8601
  bookingId: z.number(),
  bookingCode: z.string(),
  type: z.string(),
  amount: z.number(), // BDT, always positive; direction carries the sign
  direction: z.enum(["in", "out"]),
  note: z.string().nullable(),
});

export const exportPayloadSchema = z.object({
  exportedAt: z.string(), // ISO 8601
  bookings: z.array(exportBookingRow),
  payments: z.array(exportPaymentRow),
  professionals: z.array(exportProfessionalRow),
  reviews: z.array(exportReviewRow),
  ledger: z.array(exportLedgerRow),
});

export type ExportPayload = z.infer<typeof exportPayloadSchema>;

// ---------------------------------------------------------------------
// Full backup (mode=full)
//
// Unlike the business export above — which is shaped for a shared
// spreadsheet and deliberately omits credentials — the full backup is
// the owner's private, restorable copy of the whole database: EVERY
// table, EVERY column, including password hashes, session tokens, NID
// numbers and identity-document data. It sits behind the same
// constant-time token gate and the same not-found behaviour, and it is
// just as read-only. Timestamps are ISO 8601 strings; any binary value
// would be base64-encoded (this SQLite schema stores document photos
// as base64 text already, and uploaded photos live in the platform
// blob store, not in a table).

export const fullBackupSchema = z.object({
  exportedAt: z.string(), // ISO 8601
  mode: z.literal("full"),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type FullBackupPayload = z.infer<typeof fullBackupSchema>;

export const exportResponseSchema = z.union([
  exportPayloadSchema,
  fullBackupSchema,
]);

export type ExportResponse = z.infer<typeof exportResponseSchema>;

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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function exportTokenAuthorized(
  provided: string | undefined | null,
  expected: string | undefined | null,
): Promise<boolean> {
  if (!expected || !provided) return false;
  const a = await sha256Hex(provided);
  const b = await sha256Hex(expected);
  // Both digests are 64 hex chars; compare every character without an
  // early exit so the timing does not reveal where they diverge.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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

export async function buildExport(db: ExportDb): Promise<ExportPayload> {
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
const FULL_BACKUP_TABLES: ReadonlyArray<readonly [string, SQLiteTable]> = [
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
];

function backupValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return value;
}

export async function buildFullBackup(db: ExportDb): Promise<FullBackupPayload> {
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
