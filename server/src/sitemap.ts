// XML sitemap building (SEO Phase 2) — artifact (SQLite) edition.
//
// Pure builder: the `getSitemapXml` action queries the live database
// (active services; verified professionals on active accounts) and
// passes the rows here. The portable production edition serves the
// same XML over HTTP at /sitemap.xml, /sitemap-pages.xml,
// /sitemap-services.xml, /sitemap-locations.xml and
// /sitemap-professionals.xml (see portable/server/src/sitemap.ts);
// this action is the artifact edition's equivalent source, since the
// platform runtime exposes actions rather than raw HTTP routes.
//
// Rules: only public, indexable, canonical URLs on
// https://mistridako.vercel.app; no private views; professionals by
// id only (no personal data); exactly one location URL — Tangail is
// the only district genuinely served; lastmod is the row's real
// updated_at; 50,000-URL cap honoured.

export const SITE_URL = "https://mistridako.vercel.app";

export type SitemapKind =
  | "index"
  | "pages"
  | "services"
  | "locations"
  | "professionals";

const MAX_URLS = 50_000;

export interface SitemapServiceRow {
  slug: string;
  updatedAt: Date;
}

export interface SitemapProRow {
  id: number;
  updatedAt: Date;
}

interface UrlEntry {
  path: string;
  lastmod?: Date | null;
  changefreq?: string;
  priority?: string;
}

const STATIC_PAGES: UrlEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/services", changefreq: "weekly", priority: "0.9" },
  { path: "/professionals", changefreq: "daily", priority: "0.8" },
  { path: "/locations/tangail", changefreq: "weekly", priority: "0.9" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
  { path: "/help", changefreq: "monthly", priority: "0.6" },
  { path: "/become-a-professional", changefreq: "monthly", priority: "0.7" },
  { path: "/download-app", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/payment-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/cancellation-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/refund-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/commission-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/dispute-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/professional-agreement", changefreq: "yearly", priority: "0.3" },
];

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlsetXml(entries: UrlEntry[]): string {
  const body = entries
    .slice(0, MAX_URLS)
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(SITE_URL + e.path)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${e.lastmod.toISOString()}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority) parts.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function sitemapIndexXml(children: { path: string; lastmod?: Date | null }[]): string {
  const body = children
    .map((c) => {
      const parts = [`    <loc>${xmlEscape(SITE_URL + c.path)}</loc>`];
      if (c.lastmod) parts.push(`    <lastmod>${c.lastmod.toISOString()}</lastmod>`);
      return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

// Seed rows carry epoch (1970) timestamps; that is not a real
// modification time, so implausibly old values are omitted.
function saneLastmod(d: Date | null | undefined): Date | null {
  if (!d) return null;
  return d.getTime() > Date.UTC(2020, 0, 1) ? d : null;
}

function maxDate(dates: (Date | null)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    const sane = saneLastmod(d);
    if (sane && (!max || sane > max)) max = sane;
  }
  return max;
}

export function buildSitemapXml(
  kind: SitemapKind,
  data: { services: SitemapServiceRow[]; professionals: SitemapProRow[] },
): string {
  switch (kind) {
    case "pages":
      return urlsetXml(STATIC_PAGES);
    case "services":
      return urlsetXml(
        data.services.map((r) => ({
          path: `/services/${r.slug}`,
          lastmod: saneLastmod(r.updatedAt),
          changefreq: "weekly",
          priority: "0.8",
        })),
      );
    case "locations":
      return urlsetXml([
        { path: "/locations/tangail", changefreq: "weekly", priority: "0.9" },
      ]);
    case "professionals":
      return urlsetXml(
        data.professionals.map((p) => ({
          path: `/professionals/${p.id}`,
          lastmod: saneLastmod(p.updatedAt),
          changefreq: "weekly",
          priority: "0.6",
        })),
      );
    case "index":
      return sitemapIndexXml([
        { path: "/sitemap-pages.xml" },
        { path: "/sitemap-services.xml", lastmod: maxDate(data.services.map((s) => s.updatedAt)) },
        { path: "/sitemap-locations.xml" },
        { path: "/sitemap-professionals.xml", lastmod: maxDate(data.professionals.map((p) => p.updatedAt)) },
      ]);
  }
}
