// Shared request/response plumbing for the SSLCOMMERZ HTTP endpoints
// (api/sslcommerz/ipn.ts and api/sslcommerz/return.ts).
//
// SSLCOMMERZ talks to these endpoints the way gateways do: plain
// application/x-www-form-urlencoded POSTs, no JSON, no session. Vercel
// may hand the handler an already-parsed body (object), a raw string,
// or — with body parsing bypassed — a readable stream; all three are
// normalised here into the flat string record the settlement code in
// actions.ts consumes.

export interface SslReq {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface SslRes {
  status(code: number): SslRes;
  send(body: string): void;
  setHeader(name: string, value: string): void;
}

export function headerOf(req: SslReq, name: string): string | undefined {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

/** The deployment's public origin, from the proxy headers Vercel sets. */
export function originOf(req: SslReq): string {
  const proto = (headerOf(req, "x-forwarded-proto") ?? "https")
    .split(",")[0]
    ?.trim();
  const host = (headerOf(req, "x-forwarded-host") ?? headerOf(req, "host") ?? "")
    .split(",")[0]
    ?.trim();
  return `${proto || "https"}://${host}`;
}

function recordFromParams(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function recordFromObject(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

/** Reads a gateway form POST into a flat string record. */
export async function readFormPayload(
  req: SslReq,
): Promise<Record<string, string>> {
  const body = req.body;
  if (typeof body === "string") {
    return recordFromParams(new URLSearchParams(body));
  }
  if (typeof body === "object" && body !== null) {
    return recordFromObject(body as Record<string, unknown>);
  }
  // No parsed body: read the raw request stream.
  const chunks: Buffer[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return recordFromParams(
    new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
  );
}
