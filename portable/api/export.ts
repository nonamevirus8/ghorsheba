// Vercel serverless function: read-only data export for the owner's
// spreadsheet sync and private backups.
//
//   GET /api/export?token=<EXPORT_TOKEN>
//     → { exportedAt, bookings, payments, professionals, reviews,
//         ledger } — business records only, shaped for the shared
//         Google Sheet. Never contains password hashes, session
//         tokens, NID numbers or identity-document data.
//
//   GET /api/export?token=<EXPORT_TOKEN>&mode=full
//     → { exportedAt, mode: "full", tables: { … } } — EVERY table and
//         column, binary columns base64-encoded: a complete restorable
//         backup for the owner's private file only.
//
// The token is compared in constant time against the EXPORT_TOKEN
// environment variable (see `_server/export.ts`). When the env var is
// unset, or the token is missing or wrong, the function answers 404 —
// it does not reveal that an export endpoint exists. Both modes only
// ever read; the handler never writes, updates or deletes.

// See `api/actions.ts`: server code comes from the `./_server/`
// deployment copies inside `api/`, with explicit `.js` ESM specifiers.
import { getDb } from "./_server/db.js";
import { buildExport, buildFullBackup, exportTokenAuthorized } from "./_server/export.js";

interface Req {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let token = req.query?.token;
  if (Array.isArray(token)) token = token[0];
  let mode = req.query?.mode;
  if (Array.isArray(mode)) mode = mode[0];
  if (req.url) {
    const params = new URL(req.url, "http://localhost").searchParams;
    if (!token) token = params.get("token") ?? undefined;
    if (!mode) mode = params.get("mode") ?? undefined;
  }
  if (!exportTokenAuthorized(token)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    const db = await getDb();
    const payload = mode === "full" ? await buildFullBackup(db) : await buildExport(db);
    res.status(200).json(payload);
  } catch (err) {
    console.error("[ghorsheba] export endpoint failed", err);
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে — আবার চেষ্টা করুন।" });
  }
}
