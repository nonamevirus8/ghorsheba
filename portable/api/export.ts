// Vercel serverless function: read-only data export for the owner's
// spreadsheet sync.
//
//   GET /api/export?token=<EXPORT_TOKEN>
//     → { exportedAt, bookings, payments, professionals, reviews,
//         ledger } — business records only, shaped for the shared
//         Google Sheet. Never contains password hashes, session
//         tokens, NID numbers or identity-document data. (There is
//         deliberately no full-database mode: a credential-bearing
//         dump does not belong behind a query-string token — see
//         `_server/export.ts`.)
//
// The token is compared in constant time against the EXPORT_TOKEN
// environment variable (see `_server/export.ts`). When the env var is
// unset, or the token is missing or wrong, the function answers 404 —
// it does not reveal that an export endpoint exists. The handler only
// ever reads; it never writes, updates or deletes.

// See `api/actions.ts`: server code comes from the `./_server/`
// deployment copies inside `api/`, with explicit `.js` ESM specifiers.
import { getDb } from "./_server/db.js";
import { buildExport, exportTokenAuthorized } from "./_server/export.js";

// Hard ceiling for the whole export (connect + migrations check +
// queries). The database work carries its own firm timeouts (see
// `_server/db.ts` connect_timeout and the SET LOCAL statement/lock
// timeouts in `_server/export.ts`); this deadline is the last line of
// defence so ANY stall answers a clear 500 within seconds instead of
// hanging until Vercel kills the invocation at 300s — the failure
// this endpoint shipped with.
const EXPORT_DEADLINE_MS = 25_000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Export timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

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
  if (!token && req.url) {
    token = new URL(req.url, "http://localhost").searchParams.get("token") ?? undefined;
  }
  if (!exportTokenAuthorized(token)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    // Same shared database client as /api/actions (`getDb` from
    // `_server/db.ts`) — the export deliberately has no connection
    // path of its own.
    const payload = await withDeadline(
      (async () => {
        const db = await getDb();
        return buildExport(db);
      })(),
      EXPORT_DEADLINE_MS,
    );
    res.status(200).json(payload);
  } catch (err) {
    console.error("[ghorsheba] export endpoint failed", err);
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে — আবার চেষ্টা করুন।" });
  }
}
