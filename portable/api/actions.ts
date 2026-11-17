// Vercel serverless function: the single RPC endpoint for all app actions.
//
// The browser client POSTs `{ action, args }` JSON here; the matching
// handler from `server/src/actions.ts` runs against Postgres (DATABASE_URL)
// and the result is returned as JSON. Handler errors are returned as
// `{ error: string }` with a 4xx status, mirroring the behaviour of the
// original Muse-platform runtime.

// The server code is imported from `./_server/` — deployment copies that
// live inside `api/` so Vercel's file tracer always includes them in the
// function bundle, referenced with explicit `.js` ESM specifiers. (The
// previous cross-directory, extensionless imports of `../server/src/*`
// were not bundled, and the function crashed at import time with
// ERR_MODULE_NOT_FOUND.)
import { Actions } from "./_server/actions.js";
import { getDb } from "./_server/db.js";
import { createCtx, dispatchAction } from "./_server/runtime.js";

interface Req {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "শুধুমাত্র POST অনুরোধ গ্রহণ করা হয়।" });
    return;
  }
  let payload: { action?: unknown; args?: unknown } = {};
  try {
    payload =
      typeof req.body === "string"
        ? (JSON.parse(req.body) as typeof payload)
        : ((req.body ?? {}) as typeof payload);
  } catch {
    res.status(400).json({ error: "অনুরোধের তথ্য সঠিক নয় — আবার চেষ্টা করুন।" });
    return;
  }
  if (typeof payload.action !== "string") {
    res.status(400).json({ error: "অনুরোধের তথ্য সঠিক নয় — আবার চেষ্টা করুন।" });
    return;
  }
  try {
    const db = await getDb();
    // Client IP for login / admin-claim rate limiting (Vercel sets
    // x-forwarded-for; the first entry is the original client).
    const fwd = req.headers?.["x-forwarded-for"];
    const clientIp = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || undefined;
    const result = await dispatchAction(
      Actions,
      createCtx(db, clientIp),
      payload.action,
      payload.args ?? {},
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[ghorsheba] actions endpoint failed", err);
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে — আবার চেষ্টা করুন।" });
  }
}
