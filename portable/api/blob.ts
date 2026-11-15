// Vercel serverless function: serves uploaded photos stored in the
// Postgres `blobs` table. URLs look like `/api/blob?key=profiles%2F...` and
// are produced by the server actions (profile photos, booking photos).

import { getDb } from "../server/src/db";
import { readBlob } from "../server/src/runtime";

interface Req {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  send(body: Buffer): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "শুধুমাত্র GET অনুরোধ গ্রহণ করা হয়।" });
    return;
  }
  let key = req.query?.key;
  if (Array.isArray(key)) key = key[0];
  if (!key && req.url) {
    key = new URL(req.url, "http://localhost").searchParams.get("key") ?? undefined;
  }
  if (!key) {
    res.status(400).json({ error: "ছবির ঠিকানা সঠিক নয়।" });
    return;
  }
  try {
    const db = await getDb();
    const blob = await readBlob(db, key);
    if (!blob) {
      res.status(404).json({ error: "ছবিটি পাওয়া যায়নি।" });
      return;
    }
    res.setHeader("content-type", blob.contentType);
    res.setHeader("cache-control", "private, max-age=86400");
    res.status(200).send(blob.data);
  } catch (err) {
    console.error("[ghorsheba] blob endpoint failed", err);
    res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে — আবার চেষ্টা করুন।" });
  }
}
