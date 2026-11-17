// Deployment copy of `server/src/backup.ts` for the Vercel functions.
// See `_server/actions.ts` for why this copy exists. Keep it in sync
// with `server/src/backup.ts` — identical except for the import paths
// below.
//
// Full database backup for the owner — the secure replacement for the
// removed token-URL full-backup mode of the spreadsheet export.
//
// The `downloadFullBackup` action in `actions.ts` is the only caller.
// It first resolves the caller's OWN logged-in session and requires
// the Super Admin level (server-side, from the caller's database row —
// never from anything the client claims). The session token travels in
// the action request body like every other admin action; there is no
// token in any URL and no query-string secret of any kind.
//
// The backup contains EVERY table with every column, rows keyed by
// real database column names, timestamps as ISO strings and binary
// columns base64-encoded, so the file is a complete restorable backup
// (password hashes, NID numbers and identity documents included — the
// owner needs them to restore, and the file goes only to the owner's
// own device through his own admin session).
//
// The ONE exclusion is the `sessions` table: live session tokens must
// never leave the server in a backup file. Nothing else is excluded.
//
// This module only ever SELECTs — the download is read-only and never
// writes, updates or deletes anything (not even an admin-log row).

import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import * as schema from "../../server/src/schema.js";
import { z, type AppDb } from "./runtime.js";

export const fullBackupResponse = z.object({
  filename: z.string(), // ghorsheba-backup-YYYY-MM-DD.json.gz
  exportedAt: z.string(), // ISO 8601
  gzipBase64: z.string(), // base64 of the gzipped backup JSON
  tableCounts: z.record(z.string(), z.number()),
});

export type FullBackupDownload = z.infer<typeof fullBackupResponse>;

// ------------------------------------------------------------ encoding

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function serializeValue(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  // Binary columns (e.g. uploaded photo bytes in `blobs.data`) travel
  // as base64 text.
  if (value instanceof Uint8Array) return bytesToBase64(value);
  if (typeof value === "bigint") return value.toString();
  return value;
}

// Gzip via the standard CompressionStream (available in the Node /
// Bun / browser runtimes this code ships to) — no platform-specific
// compression dependency is needed.
type GzipStreamCtor = new (
  format: "gzip",
) => TransformStream<Uint8Array, Uint8Array>;

async function gzipToBase64(text: string): Promise<string> {
  const Ctor = (
    globalThis as { CompressionStream?: GzipStreamCtor }
  ).CompressionStream;
  if (!Ctor) throw new Error("সার্ভারে কমপ্রেশন পাওয়া যাচ্ছে না।");
  const stream = new Blob([text]).stream().pipeThrough(new Ctor("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytesToBase64(buf);
}

// -------------------------------------------------------------- backup

// The generic dump goes through a deliberately loose structural view
// of the database handle: enumerating "whatever tables exist" cannot
// be expressed with Drizzle's per-table generics. The runtime calls
// are the ordinary `db.select().from(table)` reads.
type LooseDb = {
  select(): {
    from(table: unknown): Promise<Record<string, unknown>[]>;
  };
};

export async function buildFullBackup(
  db: AppDb,
): Promise<FullBackupDownload> {
  const exportedAt = new Date().toISOString();
  const tables: Record<string, Record<string, unknown>[]> = {};
  const tableCounts: Record<string, number> = {};

  const looseDb = db as unknown as LooseDb;
  for (const value of Object.values(schema)) {
    if (!isTable(value)) continue;
    const tableName = getTableName(value);
    // Live session tokens are never exported — see the header note.
    if (tableName === "sessions") continue;
    const columns = getTableColumns(value);
    const dbNameByJsKey = new Map(
      Object.entries(columns).map(([jsKey, col]) => [jsKey, col.name]),
    );
    const rows = await looseDb.select().from(value);
    tables[tableName] = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [jsKey, v] of Object.entries(row)) {
        out[dbNameByJsKey.get(jsKey) ?? jsKey] = serializeValue(v);
      }
      return out;
    });
    tableCounts[tableName] = rows.length;
  }

  const payload = { exportedAt, mode: "full-backup", tableCounts, tables };
  const gzipBase64 = await gzipToBase64(JSON.stringify(payload));
  return {
    filename: `ghorsheba-backup-${exportedAt.slice(0, 10)}.json.gz`,
    exportedAt,
    gzipBase64,
    tableCounts,
  };
}
