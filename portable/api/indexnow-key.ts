// Vercel serverless function: the IndexNow key file (SEO Phase 5).
//
// IndexNow requires the API key to be publicly verifiable at the
// keyLocation URL submitted with each notification. vercel.json
// rewrites /indexnow-key.txt → this function, which answers with the
// INDEXNOW_KEY environment variable as plain text.
//
// The key itself is an owner-provisioned secret stored only in the
// Vercel environment — it is not in this repository and not in any
// frontend bundle. While the env var is unset the function answers
// 404 and the whole IndexNow integration stays inert.

interface Req {
  method?: string;
}

interface Res {
  status(code: number): Res;
  send(body: string): void;
  setHeader(name: string, value: string): void;
}

export default function handler(req: Req, res: Res): void {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("Method not allowed");
    return;
  }
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    res.status(404).send("Not found");
    return;
  }
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "public, s-maxage=3600");
  res.status(200).send(key);
}
