// GhorSheba — SSLCOMMERZ gateway layer (Master Phase 8), SANDBOX ONLY.
//
// This module is the ONLY place that talks to SSLCOMMERZ, and it knows
// ONLY the sandbox endpoints. There is deliberately no live-mode code
// path at all: the live gateway (৳25,500 one-time setup + 2.5% per
// transaction) is a separate provider arrangement the owner has not
// approved, so no code here can ever charge a real card. The layer is
// DISABLED unless the owner sets all three server-side environment
// variables in the deployment (never in code, never in the client):
//
//   SSLCOMMERZ_STORE_ID    — sandbox store id
//   SSLCOMMERZ_STORE_PASSWD — sandbox store password (server-side only)
//   SSLCOMMERZ_SANDBOX     — must be exactly "true"; anything else
//                            (including unset) keeps the layer off
//
// "Payment Successful" is never decided in this module or by a browser
// redirect: a payment is settled only in actions.ts, after the Order
// Validation API (server-to-server, authenticated with the store
// credentials) confirms the exact transaction, amount and currency.
// See processSslcommerzCallback in actions.ts.

export interface SslcommerzConfig {
  storeId: string;
  storePassword: string;
}

/** Sandbox session-initiation endpoint (SSLCOMMERZ API v4). */
export const SSLCOMMERZ_SANDBOX_INIT_URL =
  "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";

/** Sandbox Order Validation endpoint (SSLCOMMERZ API v4). */
export const SSLCOMMERZ_SANDBOX_VALIDATION_URL =
  "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

/**
 * Resolves the gateway configuration from the raw environment values.
 * Returns null — gateway disabled — unless the sandbox flag is exactly
 * "true" AND both credentials are present. There is no live fallback:
 * a non-sandbox flag never produces a configuration.
 */
export function sslcommerzConfigFromEnv(env: {
  storeId?: string | null;
  storePassword?: string | null;
  sandbox?: string | null;
}): SslcommerzConfig | null {
  if (env.sandbox !== "true") return null;
  const storeId = env.storeId?.trim();
  const storePassword = env.storePassword?.trim();
  if (!storeId || !storePassword) return null;
  return { storeId, storePassword };
}

// ------------------------------------------------------------- transport
//
// The HTTP transport is injectable so the whole gateway flow can be
// tested against a mock gateway (the owner's real sandbox credentials
// are not available to tests). The default transport is plain fetch
// with form-encoded bodies, exactly as the SSLCOMMERZ v4 API expects.

export interface SslcommerzHttpRequest {
  url: string;
  method: "GET" | "POST";
  form?: Record<string, string>;
}

export interface SslcommerzHttpResponse {
  status: number;
  json: unknown;
}

export type SslcommerzTransport = (
  req: SslcommerzHttpRequest,
) => Promise<SslcommerzHttpResponse>;

export const fetchSslcommerzTransport: SslcommerzTransport = async (req) => {
  const res = await fetch(req.url, {
    method: req.method,
    headers:
      req.method === "POST"
        ? { "content-type": "application/x-www-form-urlencoded" }
        : undefined,
    body: req.form ? new URLSearchParams(req.form).toString() : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function strField(rec: Record<string, unknown>, key: string): string | null {
  const v = rec[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ------------------------------------------------------------ initiation

export interface SslcommerzInitInput {
  /** Our unique transaction id (stored as the payment's providerTrxId). */
  tranId: string;
  /** Exact amount the customer must pay online, integer BDT. */
  totalAmount: number;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  productName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerCountry: string;
}

export interface SslcommerzInitResult {
  gatewayPageUrl: string;
  sessionKey: string | null;
}

/**
 * Opens a sandbox payment session. Throws with the gateway's own
 * failure reason when the gateway refuses the session — the caller
 * marks the payment failed and lets the customer use Manual TrxID.
 */
export async function initiateSslcommerzSession(
  transport: SslcommerzTransport,
  config: SslcommerzConfig,
  input: SslcommerzInitInput,
): Promise<SslcommerzInitResult> {
  const res = await transport({
    url: SSLCOMMERZ_SANDBOX_INIT_URL,
    method: "POST",
    form: {
      store_id: config.storeId,
      store_passwd: config.storePassword,
      total_amount: input.totalAmount.toFixed(2),
      currency: "BDT",
      tran_id: input.tranId,
      success_url: input.successUrl,
      fail_url: input.failUrl,
      cancel_url: input.cancelUrl,
      ipn_url: input.ipnUrl,
      shipping_method: "NO",
      product_name: input.productName,
      product_category: "home-service",
      product_profile: "general",
      cus_name: input.customerName,
      cus_email: input.customerEmail,
      cus_add1: input.customerAddress,
      cus_city: input.customerCity,
      cus_country: input.customerCountry,
      cus_phone: input.customerPhone,
      emi_option: "0",
    },
  });
  const rec = asRecord(res.json);
  if (!rec || res.status < 200 || res.status >= 300) {
    throw new Error("SSLCOMMERZ গেটওয়ে সাড়া দিচ্ছে না — কিছুক্ষণ পরে আবার চেষ্টা করুন।");
  }
  const gatewayPageUrl = strField(rec, "GatewayPageURL");
  if (strField(rec, "status") !== "SUCCESS" || !gatewayPageUrl) {
    const reason = strField(rec, "failedreason");
    throw new Error(
      reason
        ? `SSLCOMMERZ গেটওয়ে পেমেন্ট শুরু করতে পারেনি: ${reason}`
        : "SSLCOMMERZ গেটওয়ে পেমেন্ট শুরু করতে পারেনি।",
    );
  }
  return { gatewayPageUrl, sessionKey: strField(rec, "sessionkey") };
}

// ------------------------------------------------------------ validation

export interface SslcommerzValidation {
  /** Gateway order status: "VALID" / "VALIDATED" mean the money arrived. */
  status: string;
  tranId: string | null;
  valId: string | null;
  /** Amount as a decimal string in the transaction currency, e.g. "2000.00". */
  amount: string | null;
  currency: string | null;
  bankTranId: string | null;
  cardType: string | null;
}

/**
 * Server-side Order Validation: asks the sandbox, authenticated with
 * the store credentials, whether the order behind `valId` is real.
 * This — never the browser redirect or the IPN body alone — is the
 * authority on whether a payment succeeded.
 */
export async function validateSslcommerzOrder(
  transport: SslcommerzTransport,
  config: SslcommerzConfig,
  valId: string,
): Promise<SslcommerzValidation> {
  const qs = new URLSearchParams({
    val_id: valId,
    store_id: config.storeId,
    store_passwd: config.storePassword,
    v: "1",
    format: "json",
  });
  const res = await transport({
    url: `${SSLCOMMERZ_SANDBOX_VALIDATION_URL}?${qs.toString()}`,
    method: "GET",
  });
  const rec = asRecord(res.json);
  if (!rec || res.status < 200 || res.status >= 300) {
    throw new Error("SSLCOMMERZ যাচাই সার্ভিস সাড়া দিচ্ছে না।");
  }
  return {
    status: strField(rec, "status") ?? "",
    tranId: strField(rec, "tran_id"),
    valId: strField(rec, "val_id"),
    amount: strField(rec, "amount") ?? strField(rec, "currency_amount"),
    currency: strField(rec, "currency"),
    bankTranId: strField(rec, "bank_tran_id"),
    cardType: strField(rec, "card_type"),
  };
}

/** True only for the two gateway statuses that mean "money received". */
export function isSslcommerzSuccessStatus(status: string): boolean {
  return status === "VALID" || status === "VALIDATED";
}

/**
 * Parses a gateway decimal amount ("2000.00") into integer taka.
 * Returns null for anything that is not a whole number of taka — a
 * fractional or malformed amount never matches a booking's expected
 * amount, so settlement fails closed.
 */
export function sslcommerzAmountToTaka(amount: string | null): number | null {
  if (amount == null) return null;
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  return Math.abs(n - rounded) < 0.001 ? rounded : null;
}

// ------------------------------------------------------- IPN hash check
//
// SSLCOMMERZ signs every IPN / callback POST: `verify_key` lists the
// signed field names and `verify_sign` is md5 of the "key=value&..."
// string built from those fields (sorted by key) plus
// store_passwd = md5(store_password). We verify it before trusting
// anything in the payload — and even a valid signature is not enough
// on its own: settlement still requires a successful Order Validation
// (see actions.ts). MD5 is implemented here because WebCrypto does
// not offer it; it is used ONLY for this gateway signature check.

const MD5_S: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const rotl = (x: number, n: number): number =>
    ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let block = 0; block < paddedLen; block += 64) {
    const m: number[] = [];
    for (let i = 0; i < 16; i++) m.push(view.getUint32(block + i * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const k = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
      const sum = ((f >>> 0) + a + k + (m[g] ?? 0)) % 4294967296;
      const tmp = d;
      d = c;
      c = b;
      b = (b + rotl(sum, MD5_S[i] ?? 0)) % 4294967296;
      a = tmp;
    }
    a0 = (a0 + a) % 4294967296;
    b0 = (b0 + b) % 4294967296;
    c0 = (c0 + c) % 4294967296;
    d0 = (d0 + d) % 4294967296;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return [...new Uint8Array(out.buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verifies an IPN / callback payload's `verify_sign` against the
 * documented SSLCOMMERZ algorithm. A payload without a signature does
 * not pass: the gateway always signs its callbacks.
 */
export function verifySslcommerzCallbackSignature(
  config: SslcommerzConfig,
  payload: Record<string, string>,
): boolean {
  const sign = payload["verify_sign"];
  const keyList = payload["verify_key"];
  if (!sign || !keyList) return false;
  const fields: Record<string, string> = {};
  for (const key of keyList.split(",")) {
    const name = key.trim();
    if (!name) continue;
    const value = payload[name];
    if (value === undefined) return false;
    fields[name] = value;
  }
  fields["store_passwd"] = md5Hex(config.storePassword);
  const signString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k] ?? ""}`)
    .join("&");
  return md5Hex(signString) === sign.toLowerCase();
}
