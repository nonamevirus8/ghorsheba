// Vercel serverless function: XML sitemaps (SEO Phase 2).
//
// Reached through the rewrites in vercel.json:
//   /sitemap.xml               → /api/sitemap?kind=index
//   /sitemap-index.xml         → /api/sitemap?kind=index
//   /sitemap-pages.xml         → /api/sitemap?kind=pages
//   /sitemap-services.xml      → /api/sitemap?kind=services
//   /sitemap-locations.xml     → /api/sitemap?kind=locations
//   /sitemap-professionals.xml → /api/sitemap?kind=professionals
//
// The XML is generated from the live database on every request (see
// `_server/sitemap.ts`), so it is always current: only public,
// indexable, canonical URLs; verified professionals only; no private
// data of any kind.

import { getDb } from "./_server/db.js";
import { buildSitemap, type SitemapKind } from "./_server/sitemap.js";

interface Req {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}

interface Res {
  status(code: number): Res;
  send(body: string): void;
  setHeader(name: string, value: string): void;
}

const KINDS: ReadonlySet<string> = new Set([
  "index",
  "pages",
  "services",
  "locations",
  "professionals",
]);

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).send("Method not allowed");
    return;
  }
  const raw = req.query?.kind;
  const kind = (Array.isArray(raw) ? raw[0] : raw) ?? "index";
  if (!KINDS.has(kind)) {
    res.status(404).send("Unknown sitemap");
    return;
  }
  try {
    const db = await getDb();
    const xml = await buildSitemap(db, kind as SitemapKind);
    res.setHeader("content-type", "application/xml; charset=utf-8");
    // Let the CDN hold a copy for an hour; the origin copy is always
    // generated fresh from the database when the cache expires.
    res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).send(xml);
  } catch (err) {
    console.error("[ghorsheba] sitemap failed", err);
    res.status(500).send("Sitemap unavailable");
  }
}
