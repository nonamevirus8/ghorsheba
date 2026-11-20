// Deployment copy of `server/src/sitemap.ts` for the Vercel functions.
// See `_server/actions.ts` for why this copy exists. Keep it in sync
// with `server/src/sitemap.ts` — identical except for import paths.
//
// XML sitemap generation (SEO Phase 2) — server-generated from the
// live database on every request, never a hand-written static file.
//
// Served by `api/sitemap.ts` at /sitemap.xml (index), /sitemap-pages.xml,
// /sitemap-services.xml, /sitemap-locations.xml and
// /sitemap-professionals.xml (see the rewrites in vercel.json).
//
// Rules enforced here:
// - Only public, indexable, canonical URLs on the production domain,
//   absolute HTTPS. Private views (login, dashboards, admin, booking
//   details, payment records) are never listed.
// - Services come from the `services` table (active only), so an admin
//   deactivating a service removes it from the sitemap automatically.
// - Professionals: only VERIFIED professionals whose account is
//   active — the same set the public list shows. Only the profile id
//   and updated_at are read: no name, phone, NID or any private field
//   is touched, and nothing personal appears in the XML.
// - Locations: exactly one page, /locations/tangail — Tangail is the
//   only district genuinely served. No other city page exists.
// - lastmod is the row's real updated_at; static pages carry no
//   lastmod rather than an invented one.
// - The 50,000-URL sitemap limit is honoured with an explicit cap.

import { asc, eq } from "drizzle-orm";
import * as schema from "../../server/src/schema.js";
import type { AppDb } from "./runtime.js";

export const SITE_URL = "https://mistridako.vercel.app";

export type SitemapKind =
  | "index"
  | "pages"
  | "services"
  | "locations"
  | "professionals";

const MAX_URLS = 50_000;

interface UrlEntry {
  path: string;
  lastmod?: Date | null;
  changefreq?: string;
  priority?: string;
}

/** Public static pages (code-defined routes — pages are code, not DB
 *  content, so this list is the source of truth for them). */
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

// The original seed wrote epoch (1970) timestamps for the catalog
// rows; an epoch lastmod is not a real modification time, so anything
// implausibly old is omitted rather than published inaccurately.
function saneLastmod(d: Date | null | undefined): Date | null {
  if (!d) return null;
  return d.getTime() > Date.UTC(2020, 0, 1) ? d : null;
}

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

async function serviceEntries(db: AppDb): Promise<UrlEntry[]> {
  const rows = await db
    .select({
      slug: schema.services.slug,
      updatedAt: schema.services.updatedAt,
    })
    .from(schema.services)
    .where(eq(schema.services.active, 1))
    .orderBy(asc(schema.services.sortOrder))
    .limit(MAX_URLS);
  return rows.map((r) => ({
    path: `/services/${r.slug}`,
    lastmod: saneLastmod(r.updatedAt),
    changefreq: "weekly",
    priority: "0.8",
  }));
}

async function professionalEntries(db: AppDb): Promise<UrlEntry[]> {
  const pros = await db
    .select({
      id: schema.professionals.id,
      userId: schema.professionals.userId,
      updatedAt: schema.professionals.updatedAt,
    })
    .from(schema.professionals)
    .where(eq(schema.professionals.status, "verified"))
    .orderBy(asc(schema.professionals.id))
    .limit(MAX_URLS);
  if (pros.length === 0) return [];
  const users = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users);
  const activeUser = new Map(users.map((u) => [u.id, u.status === "active"]));
  return pros
    .filter((p) => activeUser.get(p.userId))
    .map((p) => ({
      path: `/professionals/${p.id}`,
      lastmod: saneLastmod(p.updatedAt),
      changefreq: "weekly",
      priority: "0.6",
    }));
}

function maxDate(entries: UrlEntry[]): Date | null {
  let max: Date | null = null;
  for (const e of entries) {
    if (e.lastmod && (!max || e.lastmod > max)) max = e.lastmod;
  }
  return max;
}

export async function buildSitemap(db: AppDb, kind: SitemapKind): Promise<string> {
  switch (kind) {
    case "pages":
      return urlsetXml(STATIC_PAGES);
    case "services":
      return urlsetXml(await serviceEntries(db));
    case "locations":
      // Tangail is the only genuinely served district — one URL.
      return urlsetXml([
        { path: "/locations/tangail", changefreq: "weekly", priority: "0.9" },
      ]);
    case "professionals":
      return urlsetXml(await professionalEntries(db));
    case "index": {
      const [svcs, pros] = await Promise.all([
        serviceEntries(db),
        professionalEntries(db),
      ]);
      return sitemapIndexXml([
        { path: "/sitemap-pages.xml" },
        { path: "/sitemap-services.xml", lastmod: maxDate(svcs) },
        { path: "/sitemap-locations.xml" },
        { path: "/sitemap-professionals.xml", lastmod: maxDate(pros) },
      ]);
    }
  }
}
