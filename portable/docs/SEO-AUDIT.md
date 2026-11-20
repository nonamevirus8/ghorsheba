# MistriDako — SEO Audit (Phase 1)

Audit date: 2026-11-20. Scope: the complete existing project, both editions —
the Muse web artifact (SQLite, `client/` + `server/`) and the portable
production edition (`portable/`, Vercel + Supabase PostgreSQL), which is what
serves **https://mistridako.vercel.app**. No changes were made before this
audit was written.

## 1. Framework and rendering architecture

- React 19 + TypeScript + Vite + Tailwind CSS 4, in both editions.
- **Single-page application, client-side rendering only.** There is no SSR,
  no SSG/prerendering, and no per-route HTML: Vercel serves one
  `index.html` shell for every URL (`portable/vercel.json` rewrites
  `/((?!api/).*)` → `/index.html`), and the artifact runtime likewise
  serves a single built `index.html`.
- Data loads after first paint through a JSON RPC endpoint
  (`POST /api/actions` on Vercel; typed server actions in the artifact).
  A crawler that does not execute JavaScript sees an empty root div plus
  the static `<head>` metadata of the homepage — for **every** page.
- Backend: Vercel serverless functions (`portable/api/`) over Drizzle +
  Supabase PostgreSQL (Mumbai pooler). The artifact edition mirrors the
  same code over SQLite. Business logic, auth and payments are entirely
  server-side; nothing in this SEO work changes them.

## 2. Current URL structure

- **Hash routing only**: `#/`, `#/services`, `#/service/<slug>`,
  `#/professionals`, `#/pro/<id>`, `#/how`, `#/about`, `#/contact`,
  `#/help`, `#/join`, `#/download-app`, `#/privacy`, `#/terms`,
  `#/payment-policy`, `#/cancellation-policy`, `#/refund-policy`,
  `#/commission-policy`, `#/dispute-policy`, `#/pro-agreement`, plus
  private views (`#/login`, `#/register`, `#/book`, `#/booking/<code>`,
  `#/dashboard`, `#/pro-dashboard`, `#/admin`, `#/admin-setup`).
- **This is the central SEO problem.** URL fragments are never sent to a
  server and are not indexed as separate pages: to Google and Bing the
  whole site is effectively one URL (`/`) with one title and one
  description. No service page, policy page or profile can rank on its
  own, and no clean URL (`/services/electrician`) exists — opening one
  returns the SPA shell via the catch-all rewrite, with homepage
  metadata and no route applied (the router reads only the hash).

## 3. Existing SEO metadata

- One static set in `index.html` (both editions): a generic English
  meta description, `og:title`/`og:description`/`og:type`/`og:url`,
  and (portable only) a canonical to `/` and basic Twitter card tags.
- The `<title>` is "মিস্ত্রি ডাকুন সহজেই | MistriDako" — it does not
  match the commissioned homepage title ("MistriDako | Trusted Home
  Services in Bangladesh").
- No per-page titles or descriptions anywhere: every view shares the
  homepage's. No `meta robots` directives (private views such as the
  dashboards carry no `noindex`). No `google-site-verification` /
  `msvalidate.01` slots. The artifact edition's `index.html` has no
  canonical and no Twitter tags at all.
- Heading hierarchy inside the SPA is mostly sound (one `h1` per view,
  section `h2`s), and content images carry Bengali alt text — but none
  of it is reachable by a non-rendering crawler today.

## 4. robots.txt and sitemaps

- **Neither file exists** in either edition (no `robots.txt`,
  `sitemap*.xml` or `llms.txt` anywhere in the repo; nothing in
  `portable/public/` except the PWA manifest and service worker).
- No crawler directives of any kind: search engines and AI crawlers
  are governed only by the absence of files. `/api/` is not disallowed.

## 5. Canonical URLs

- Portable `index.html` declares one canonical — `https://mistridako.vercel.app/` —
  which is correct for the homepage but is served unchanged for every
  route, so it actively tells crawlers that every page is the homepage.
- The artifact edition declares no canonical. The two alternate domains
  (ghorsheba-bd.vercel.app, ghorsheba-ashen.vercel.app) serve the same
  content with no canonical discipline of their own; the canonical
  domain for all SEO output is **https://mistridako.vercel.app**.

## 6. Structured data

- **None.** No JSON-LD or microdata anywhere: no Organization, WebSite,
  WebPage, BreadcrumbList, Service, Person or LocalBusiness markup.

## 7. Public vs private routes

Public (indexable in principle): home, services list, 12 service detail
pages, professionals list, verified professional profiles, how-it-works,
about, contact, help/FAQ, become-a-professional, download-app, and the
eight policy pages (privacy, terms, payment, cancellation, refund,
commission, dispute, professional agreement).

Private (must never be indexed): login, registration, admin setup,
booking form, booking details, customer dashboard, professional
dashboard, admin panel, all `/api/*` endpoints, payment records and
identity documents. These are protected by server-side session auth —
correctly, since robots.txt is not a security mechanism — but they
share the one crawlable URL `/`, so exclusion has to happen through
sitemap discipline, `noindex` on those views, and `/api/` disallow.

## 8. Duplicate and thin-content risks

- The three domains serve identical content; only the portable
  homepage canonical mitigates this today.
- All hash views are duplicates of `/` from a crawler's perspective.
- Service detail pages have real, unique content (name, tagline,
  description, FAQs, verified professionals) — good raw material, once
  each has its own URL. The professionals list can be thin when few
  verified professionals exist; it stays indexable but is not padded
  with invented profiles or ratings.
- No fake pages exist and none will be created: service area is
  **Tangail only** (12 upazilas) — there is no Dhaka or other-city
  content, and none will be generated.

## 9. Mobile performance / Core Web Vitals

- Mobile-first layout, tap targets and safe-area handling are in place;
  the PWA service worker caches the app shell (API never cached).
- Risks found: (a) the first-load bundle historically included all
  dashboards — mitigated in Master Phase 12 by lazy-loading booking and
  panels; (b) the hero photo is a large WebP and is the likely LCP
  element — it must stay eager while below-fold images lazy-load
  (service images already use `loading="lazy"`); (c) fonts load via a
  CSS `@import` from Google Fonts (render-blocking chain; `display=swap`
  is set); (d) because content renders only after JS + an API round
  trip, LCP/INP as experienced by crawlers is poor and page content is
  invisible without rendering — the fix within this architecture is
  build-time prerendered shells with real static content per public
  route (Phase 10), not a framework change.
- HTTPS is enforced by Vercel. Unknown paths return the SPA shell with
  HTTP 200 (soft-404 — the app shows a Bengali "page not found" view);
  true 404 status for unknown clean paths is not achievable in this
  hosting setup without a routing change, and is recorded as a known
  limitation rather than silently accepted.

## 10. Content and contact facts (ground truth for Phases 7–9)

- 12 real services (seed + admin-editable): electrician, plumber,
  mason, painter, carpenter, ac-technician, tile-worker, welding,
  cleaning, glass-aluminium, renovation, pest-control.
- Service area: Tangail district only — Tangail Sadar, Ghatail,
  Kalihati, Mirzapur, Sakhipur, Basail, Madhupur, Nagarpur, Delduar,
  Bhuapur, Gopalpur, Dhanbari.
- Contact details currently displayed on the site (footer + contact
  page, from platform settings): phone +8801615799579, WhatsApp same
  number, email manikmia2049@gmail.com, address "টাঙ্গাইল, বাংলাদেশ".
  **The owner has NOT confirmed these are genuinely his** (flagged
  2026-11-18) — SEO output uses only what the site already displays,
  adds nothing new, and the final report flags this for confirmation.
- No verified physical business address exists (only "টাঙ্গাইল,
  বাংলাদেশ"), so **LocalBusiness structured data is not eligible**
  and will be omitted; Organization markup will carry the service
  area instead. Prices are admin-configured / quotation-based — no
  prices, ratings or review counts will be invented in any SEO output.

## 11. Plan that follows from this audit (Phases 2–11)

1. DB-driven XML sitemaps as Vercel functions (`/sitemap.xml` index +
   pages/services/locations/professionals), mirrored by a sitemap
   action in the artifact edition.
2. `robots.txt` with public allow, `/api/` disallow, sitemap pointer,
   and separate AI-crawler rules (search crawlers allowed, training
   crawlers disallowed — owner default, changeable).
3. Clean crawlable URLs (`/services/<slug>`, `/locations/tangail`,
   policy pages, …) via build-time prerendered shells with real
   per-page metadata, structured data and static content, plus a
   path→hash bridge so every existing hash link, bookmark and the PWA
   keep working untouched.
4. Per-route client SEO (unique title/description/canonical/OG/Twitter,
   `noindex` on private views) and JSON-LD: Organization, WebSite,
   WebPage, BreadcrumbList, Service, Person (verified profiles only).
5. IndexNow, server-side only, key from `INDEXNOW_KEY` env var, inert
   when unset; verification meta slots for Google/Bing from env vars
   at build time; `/llms.txt` with real services/areas/contact.
6. One location page (`/locations/tangail`) — the only genuinely
   served area. No other city pages.

## 12. Implementation record

What was actually implemented against this audit — per-phase detail,
files created and modified, verification results and the remaining
owner steps — is recorded in the companion report
`docs/SEO-IMPLEMENTATION.md` (Phases 2–12). This audit remains the
pre-implementation baseline; it is not updated to describe the
post-implementation state.
