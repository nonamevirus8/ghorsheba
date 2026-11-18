// Vercel serverless function: SSLCOMMERZ IPN (Instant Payment
// Notification) endpoint — SANDBOX gateway only (Master Phase 8).
//
// The sandbox gateway POSTs the payment result here server-to-server.
// This function is a thin adapter: it parses the form POST and hands
// it to processSslcommerzCallback (api/_server/actions.ts), which
// verifies the callback signature AND re-checks the order through the
// SSLCOMMERZ Order Validation API before settling anything. Duplicate
// IPNs are no-ops there. The endpoint answers plain text, as gateway
// endpoints do; while the gateway credentials are unset in the
// environment it answers 503 and settles nothing.

import { processSslcommerzCallback } from "../_server/actions.js";
import { getDb } from "../_server/db.js";
import { createCtx } from "../_server/runtime.js";
import {
  readFormPayload,
  type SslReq,
  type SslRes,
} from "../_server/sslcommerz-http.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req: SslReq, res: SslRes): Promise<void> {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  try {
    const payload = await readFormPayload(req);
    const db = await getDb();
    const r = await processSslcommerzCallback(createCtx(db), payload);
    if (r.outcome === "not_configured") {
      res.status(503).send("Gateway not configured");
      return;
    }
    res.status(200).send(r.ok ? "OK" : `REJECTED:${r.outcome}`);
  } catch (err) {
    console.error("[ghorsheba] sslcommerz ipn failed", err);
    res.status(500).send("ERROR");
  }
}
