# MistriDako — SEO Implementation Report (Phases 2–12)

Implemented 2026-11-20 on the existing site — no rebuild, no database
provider change, no record deleted, no commission/payment logic touched.
Both editions updated: the portable edition (production,
https://mistridako.vercel.app) and the Muse artifact edition.
**Not pushed / not redeployed by this build** — the owner deploys with
his usual "Push dao" step. Phase 1 audit: `docs/SEO-AUDIT.md`.

## What was implemented

### Phase 2 — XML sitemaps (DB-driven)
- Vercel functions generate the sitemaps from the live database on
  every request: `/sitemap.xml` and `/sitemap-index.xml` (index),
  `/sitemap-pages.xml` (18 public pages), `/sitemap-services.xml`
  (active services only), `/sitemap-locations.xml` (exactly one URL —
  Tangail), `/sitemap-professionals.xml` (verified professionals on
  active accounts only; only the profile id + updated_at are read —
  no name, phone, NID or any private field appears).
- Absolute HTTPS URLs on the canonical domain only; `lastmod` is the
  row's real `updated_at` (epoch seed timestamps are omitted rather
  than published as 1970); 50,000-URL cap enforced; no private,
  duplicate or noindex URL is ever listed.
- Artifact edition mirror: the `getSitemapXml` server action returns
  the same XML from the SQLite database (the platform runtime exposes
  actions, not raw HTTP routes — the portable edition is the one that
  serves the public `/sitemap*.xml` URLs).

### Phase 3 — robots.txt
- `portable/public/robots.txt`: public pages allowed, `/api/`
  disallowed, sitemap pointer included. AI policy (owner default,
  changeable by editing this one file): search crawlers ALLOWED
  (OAI-SearchBot, ChatGPT-User, PerplexityBot); model-training
  crawlers DISALLOWED (GPTBot, CCBot, Google-Extended, anthropic-ai,
  ClaudeBot, cohere-ai, Bytespider). Private surfaces are hash views
  behind server-side auth — robots.txt is not relied on as security.

### Phase 4 — Google SEO
- Unique title + meta description, canonical, meta robots, Open
  Graph and Twitter cards for every public page — statically in the
  prerendered shells and at runtime via `client/src/seo.ts`.
  Homepage title is exactly "MistriDako | Trusted Home Services in
  Bangladesh" with the commissioned description.
- **Clean crawlable URLs**: a build-time prerenderer
  (`portable/scripts/prerender-seo.mjs`, wired into `bun run build`)
  writes one static shell per public URL — `/`, `/services`,
  `/services/<slug>` × 12, `/professionals`, `/locations/tangail`,
  `/how-it-works`, `/about`, `/contact`, `/help`,
  `/become-a-professional`, `/download-app` and the 8 policy pages —
  each with its own metadata, JSON-LD and real crawlable content
  (headings, text, internal links). An inline bridge script turns a
  directly opened clean URL into the matching hash route before the
  app boots, so **every existing hash link, bookmark and the PWA keep
  working unchanged**. `/professionals/<id>` serves the SPA shell and
  gets its Person metadata at runtime (profiles are dynamic data).
- Visible breadcrumb navigation (with matching BreadcrumbList
  JSON-LD) on service pages, professional profiles and the Tangail
  page; descriptive alt text was already in place and is kept.

### Phase 5 — Bing SEO + IndexNow
- Sitemaps are standard XML (Bing-compatible). Bing verification:
  set `BING_SITE_VERIFICATION` in the Vercel environment before a
  build and the `msvalidate.01` meta is injected into every public
  page (same mechanism for `GOOGLE_SITE_VERIFICATION`).
- IndexNow, server-side only: `INDEXNOW_KEY` env var → notifications
  fire automatically when an admin saves a service, verifies /
  un-verifies a professional, or changes service areas (removals are
  submitted the same way). The key file is served at
  `/indexnow-key.txt` from the env var. **While the key is unset the
  integration is inert** (skips + logs, verified). The key is never
  in frontend code or this repo (`.env.example` documents the name
  only).

### Phase 6 — AI search
- robots.txt policies above; `/llms.txt` (`portable/public/llms.txt`)
  with brand, category, all 12 services, the Tangail-only service
  area, the contact details exactly as displayed on the site, and the
  important public URLs — with an in-file note that llms.txt is not a
  sitemap replacement nor a guaranteed indexing method.

### Phase 7 — Structured data
- Organization + WebSite (static in `<head>`), WebPage +
  BreadcrumbList per page, Service per service page (an `Offer` is
  emitted only when an admin has configured a real starting price),
  Person for verified professional profiles (public facts only).
- **LocalBusiness: omitted on purpose** — there is no verified
  physical business address (the site shows only "টাঙ্গাইল,
  বাংলাদেশ"), so the business is not eligible; the Organization
  carries the Tangail service area instead. No ratings, reviews,
  prices or addresses were invented anywhere; no AggregateRating.

### Phase 8 — Local SEO
- One location page: `/locations/tangail` (in-app `#/locations/tangail`)
  with the real 12 upazilas and links to every service — Tangail is
  the only district served. **No Dhaka or other city pages exist.**
- Icons (owner-supplied 2026-11-20): the icon-only artwork is now the
  favicon, PWA icons (192/512/maskable-512) and apple-touch-icon in
  both editions; the header/hero keep the full official logo, and
  og:image is the full lockup (`/og-image.png`, generated at build).

### Phase 9 — On-page content
- Unique Bengali/English titles, descriptions and prerendered
  content for homepage, all service pages, Tangail page, About,
  Contact, How It Works, Become a Professional and Help/FAQ — all
  facts real (services, Tangail area, quotation-based pricing,
  booking flow as implemented).

### Phase 10 — Technical SEO / performance
- Prerendered shells give crawlers meaningful content without JS.
  Hero image stays eager (LCP), below-fold images already lazy-load,
  fonts use `display=swap`, dashboards stay code-split. Honest
  limits: this is still a client-rendered SPA — full SSR was out of
  scope by design (no rebuild); unknown clean paths return the SPA
  shell with HTTP 200 and the app's own "page not found" view
  (soft-404 — a hard 404 needs a hosting routing change); Core Web
  Vitals field data can only be judged after deploy via Search
  Console / PageSpeed Insights.

### Phase 11 — Indexing rules
- Login, registration, dashboards, admin, booking and payment views
  carry `noindex, nofollow` at runtime, appear in no sitemap, and
  remain behind server-side authentication (unchanged).

## Phase 12 — Verification (sandbox, real PostgreSQL 18.6)

Run against the compiled portable functions + a throwaway PostgreSQL
18.6 database, seeded through the app's own actions — **54/54 checks
passed**, plus static checks on the build output:

1. ✅ /robots.txt present in dist with correct rules + sitemap line.
2. ✅ /sitemap.xml loads (function): 200, valid sitemapindex, 4 children.
3. ✅ Sitemaps contain valid canonical public URLs (12 services, 18
   pages, 1 location; all XML validated with a real parser).
4. ✅ No private URLs in any sitemap; professionals sitemap leaks no
   phone/NID/name; a pending professional is absent, a verified one
   appears.
5. ✅ Canonical tags correct in all 30 prerendered shells.
6. ✅ Meta titles/descriptions unique across all 30 shells.
7. ✅ Structured data valid — every JSON-LD block in every shell
   parses; Service/Person/Breadcrumb shapes checked.
8. ⚠️ IndexNow code path verified (inert skip without key; key file
   404 → 200 with key; foreign URLs filtered; admin actions succeed
   with the trigger active and never throw). A live acceptance test
   against api.indexnow.org was **not possible from the sandbox**
   (outbound request timed out) — retest after deploy with the real
   key.
9. ✅ Google + Bing verification instructions prepared (below).
10. ✅ AI crawler policies as specified (search allowed, training
    disallowed).
11. ✅ No feature broken: full smoke on PG 18.6 — getCatalog (12/12),
    claimAdmin, professional registration with NID documents, admin
    verification, customer registration, login, booking creation,
    admin service save — all pass. Portable strict typecheck + full
    build pass; artifact build passes and its `getSitemapXml` action
    returns the correct XML.
12. ✅ Mobile + desktop: shells are the same responsive app; static
    content blocks are fluid-width; no horizontal-scroll changes.

## Remaining manual steps (owner)

1. **Confirm the contact details** shown on the site — phone
   +8801615799579, WhatsApp same, email manikmia2049@gmail.com,
   address "টাঙ্গাইল, বাংলাদেশ" (flagged unconfirmed since
   2026-11-18). They are used in llms.txt and the Contact page
   exactly as displayed; correct them in Admin → Platform Settings
   if any is wrong.
2. **Google Search Console**: add property `mistridako.vercel.app`,
   choose the HTML-tag method, set the code as
   `GOOGLE_SITE_VERIFICATION` in Vercel env vars, redeploy, verify,
   then submit `https://mistridako.vercel.app/sitemap.xml`.
3. **Bing Webmaster Tools**: same flow with `BING_SITE_VERIFICATION`
   (or import the property from Search Console), then submit the
   same sitemap URL.
4. **IndexNow key**: generate a key at indexnow.org / Bing
   Webmaster, set `INDEXNOW_KEY` in Vercel env vars, redeploy. Until
   then notifications stay inert by design.
5. **Google Business Profile** (guidance only — not set up): if the
   business qualifies as a service-area business, create the profile
   with the business name "MistriDako", category "Home services",
   service area Tangail District, the confirmed phone number, and
   https://mistridako.vercel.app as the website; hide the street
   address (service-area setting) unless a real customer-facing
   address exists; add the real services list; verify by postcard /
   phone as Google requires. Do not add a fake address.
6. After deploy, spot-check: open /robots.txt, /sitemap.xml,
   /services/electrician and /locations/tangail on the live domain,
   and run one URL through the Rich Results Test.

## Files created / modified

Created: `portable/docs/SEO-AUDIT.md`, `portable/docs/SEO-IMPLEMENTATION.md`,
`portable/public/robots.txt`, `portable/public/llms.txt`,
`portable/scripts/prerender-seo.mjs`, `portable/api/sitemap.ts`,
`portable/api/indexnow-key.ts`, `portable/api/_server/sitemap.ts`,
`portable/api/_server/indexnow.ts`, `portable/server/src/sitemap.ts`,
`portable/server/src/indexnow.ts`, `server/src/sitemap.ts`,
`client/src/seo.ts`, `portable/client/src/seo.ts`.

Modified: `client/src/App.tsx` + `portable/client/src/App.tsx`
(route SEO, Tangail page, breadcrumbs), `client/index.html` +
`portable/index.html` (homepage meta per spec, canonical, Twitter,
JSON-LD, clean-URL bridge, new favicon in the artifact),
`server/src/actions.ts` + both portable actions copies (IndexNow
triggers; artifact `getSitemapXml`), `server/src/privileged.ts`
(readIndexNowKey), `portable/vercel.json` (sitemap + key-file
rewrites, function config), `portable/package.json` (build runs the
prerenderer), `portable/scripts/generate-icons.mjs` (new icon
artwork source + og-image), `portable/client/src/logo.ts`
(LOGO_ICON_DATA_URI = owner icon artwork), `client/src/assets/logo-icon.png`
(new icon), `portable/.env.example` (INDEXNOW_KEY + verification
vars documented, names only). No migration was needed.
