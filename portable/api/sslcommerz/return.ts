// Vercel serverless function: SSLCOMMERZ browser return endpoint —
// SANDBOX gateway only (Master Phase 8).
//
// After paying (or failing / cancelling) on the sandbox gateway page,
// the customer's browser is POSTed here. This function runs the SAME
// settlement path as the IPN (signature check + Order Validation API)
// — the redirect itself is never treated as proof of payment — and
// then 303-redirects the browser to a tiny landing page that hands the
// gateway fields to the booking page, which re-reads the payment's
// true state from the server. If anything is off (unknown transaction,
// gateway not configured), the browser simply lands on the services
// page and no state changes.

import { processSslcommerzCallback } from "../_server/actions.js";
import { getDb } from "../_server/db.js";
import { createCtx } from "../_server/runtime.js";
import {
  originOf,
  readFormPayload,
  type SslReq,
  type SslRes,
} from "../_server/sslcommerz-http.js";

export const config = { api: { bodyParser: false } };

function redirect(res: SslRes, location: string): void {
  res.setHeader("location", location);
  res.status(303).send("Redirecting…");
}

export default async function handler(req: SslReq, res: SslRes): Promise<void> {
  res.setHeader("cache-control", "no-store");
  const origin = originOf(req);
  let dest = `${origin}/#/services`;
  if (req.method === "POST") {
    try {
      const payload = await readFormPayload(req);
      const db = await getDb();
      const r = await processSslcommerzCallback(createCtx(db), payload);
      if (r.bookingCode) {
        const stash = Buffer.from(JSON.stringify(payload), "utf8").toString(
          "base64url",
        );
        dest = `${origin}/api/sslcommerz/land?code=${encodeURIComponent(r.bookingCode)}&d=${stash}`;
      }
    } catch (err) {
      console.error("[ghorsheba] sslcommerz return failed", err);
    }
  }
  redirect(res, dest);
}
