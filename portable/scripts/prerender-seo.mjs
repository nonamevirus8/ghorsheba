// Prerender SEO shells (SEO Phases 4 + 10) — runs after `vite build`.
//
// The app is a hash-routed SPA: without this step every URL serves the
// same index.html with homepage metadata and an empty root, so search
// engines can index exactly one page. This script writes one static
// HTML shell per public clean URL into dist/ (Vercel serves real
// files before the SPA rewrite), each carrying:
//   - the route's unique title, meta description, canonical, OG and
//     Twitter tags (mirroring client/src/seo.ts — keep the two in sync);
//   - page-level JSON-LD (WebPage, BreadcrumbList, Service) built from
//     the same real seed data the database is seeded with;
//   - real crawlable static content (headings, text, internal links
//     with clean URLs) inside the app root. React replaces it when the
//     app boots; the clean-URL bridge in index.html routes the visitor
//     to the matching hash route. Existing hash links are untouched.
//
// Search-engine verification metas are injected ONLY when the owner
// provides the codes as build-time env vars (GOOGLE_SITE_VERIFICATION,
// BING_SITE_VERIFICATION) — no code is invented or hard-coded here.
//
// Professional profiles are dynamic database content, so they are not
// prerendered; /professionals/<id> falls through to the SPA shell and
// client/src/seo.ts applies the Person metadata at runtime.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://mistridako.vercel.app";

// ------------------------------------------------------------ seed data
const seedSql = readFileSync(join(root, "drizzle", "0001_ghorsheba_portable_pg.sql"), "utf8");

function parseRows(sql, table) {
  const start = sql.indexOf(`INSERT INTO ${table}`);
  if (start === -1) throw new Error(`seed INSERT for ${table} not found`);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end);
}

const servicesBlock = parseRows(seedSql, "services");
const services = [...servicesBlock.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']*)',\s*'[^']*',\s*\d+,\s*now\(\),\s*now\(\)\)/g)].map(
  (m) => ({ slug: m[1], nameBn: m[2], nameEn: m[3], tagline: m[4], description: m[5] }),
);
if (services.length === 0) throw new Error("no services parsed from seed SQL");

const locationsBlock = parseRows(seedSql, "locations");
const locations = [...locationsBlock.matchAll(/\('([^']+)',\s*'([^']+)',\s*'[^']*',\s*1\)/g)].map(
  (m) => ({ nameEn: m[1], nameBn: m[2] }),
);
if (locations.length === 0) throw new Error("no locations parsed from seed SQL");

// ------------------------------------------------------------ meta table
// Mirrors client/src/seo.ts PAGE_META (title/description per route).
const HOME = {
  title: "MistriDako | Trusted Home Services in Bangladesh",
  description:
    "Find trusted electricians, plumbers, AC technicians, painters and home repair professionals in Bangladesh with MistriDako. Book home services easily.",
};

const PAGES = [
  { path: "/", ...HOME },
  {
    path: "/services",
    title: "সব হোম সার্ভিস — ইলেকট্রিশিয়ান, প্লাম্বার, এসি, রংমিস্ত্রি | MistriDako",
    description:
      "টাঙ্গাইলে MistriDako-র সব হোম সার্ভিস দেখুন — ইলেকট্রিশিয়ান, প্লাম্বার, রাজমিস্ত্রি, রংমিস্ত্রি, কাঠমিস্ত্রি, এসি টেকনিশিয়ান, টাইলস, ওয়েল্ডিং, ক্লিনিং ও আরও অনেক কিছু।",
  },
  {
    path: "/professionals",
    title: "যাচাইকৃত মিস্ত্রি ও প্রফেশনাল | MistriDako",
    description:
      "টাঙ্গাইলের যাচাইকৃত স্থানীয় মিস্ত্রি ও হোম-সার্ভিস প্রফেশনালদের তালিকা — পরিচয় যাচাই করা, দক্ষ ও নির্ভরযোগ্য। MistriDako দিয়ে সহজে বুকিং করুন।",
  },
  {
    path: "/locations/tangail",
    title: "টাঙ্গাইলে হোম সার্ভিস — ১২টি উপজেলায় | MistriDako",
    description:
      "MistriDako টাঙ্গাইল জেলার ১২টি উপজেলায় হোম সার্ভিস দেয় — টাঙ্গাইল সদর, ঘাটাইল, কালিহাতী, মির্জাপুর, সখীপুর, বাসাইল, মধুপুর, নাগরপুর, দেলদুয়ার, ভূয়াপুর, গোপালপুর ও ধনবাড়ী।",
  },
  {
    path: "/how-it-works",
    title: "কিভাবে কাজ করে | MistriDako",
    description:
      "MistriDako কিভাবে কাজ করে — সার্ভিস বেছে বুকিং করুন, অ্যাডমিন যাচাইকৃত প্রফেশনাল অ্যাসাইন করবেন, কাজ শেষে মূল্য পরিশোধ করুন। পুরো প্রক্রিয়াটি স্বচ্ছ ও সহজ।",
  },
  {
    path: "/about",
    title: "আমাদের সম্পর্কে | MistriDako",
    description:
      "MistriDako (মিস্ত্রি ডাকো) — টাঙ্গাইলের যাচাইকৃত স্থানীয় মিস্ত্রি ও প্রফেশনালদের সাথে গ্রাহকদের সংযোগ দেওয়ার নির্ভরযোগ্য হোম-সার্ভিস প্ল্যাটফর্ম। এক ডাকেই, ঘরের সমাধান।",
  },
  {
    path: "/contact",
    title: "যোগাযোগ করুন | MistriDako",
    description:
      "বুকিং বা সার্ভিস নিয়ে যেকোনো প্রয়োজনে MistriDako-র সাথে যোগাযোগ করুন — ফোন, WhatsApp ও ইমেইলে সাপোর্ট, সেবা এলাকা টাঙ্গাইল, বাংলাদেশ।",
  },
  {
    path: "/help",
    title: "সাহায্য ও সাধারণ জিজ্ঞাসা (FAQ) | MistriDako",
    description:
      "MistriDako সম্পর্কে সবচেয়ে বেশি জিজ্ঞাসিত প্রশ্নের উত্তর — বুকিং, মূল্য নির্ধারণ, পেমেন্ট, বাতিল ও রিফান্ড নীতি নিয়ে সাহায্য।",
  },
  {
    path: "/become-a-professional",
    title: "প্রফেশনাল হিসেবে যোগ দিন | MistriDako",
    description:
      "মিস্ত্রি বা হোম-সার্ভিস প্রফেশনাল হিসেবে MistriDako-তে নিবন্ধন করুন — পরিচয় যাচাইয়ের পর টাঙ্গাইলে নিয়মিত কাজের সুযোগ পান।",
  },
  {
    path: "/download-app",
    title: "MistriDako অ্যাপ ডাউনলোড করুন | MistriDako",
    description:
      "MistriDako এখন মোবাইল অ্যাপ হিসেবেও ইনস্টল করা যায় — Android ও iPhone-এ ওয়েবসাইট থেকেই ইনস্টল করুন, কোনো অ্যাপ স্টোর লাগবে না।",
  },
  { path: "/privacy-policy", title: "গোপনীয়তা নীতি | MistriDako", description: "MistriDako কিভাবে আপনার ব্যক্তিগত তথ্য সংগ্রহ, ব্যবহার ও সুরক্ষা করে — গোপনীয়তা নীতি।" },
  { path: "/terms", title: "শর্তাবলী | MistriDako", description: "MistriDako হোম-সার্ভিস প্ল্যাটফর্ম ব্যবহারের শর্তাবলী — গ্রাহক ও প্রফেশনাল উভয়ের জন্য।" },
  { path: "/payment-policy", title: "পেমেন্ট নীতি | MistriDako", description: "MistriDako-র পেমেন্ট নীতি — সম্পূর্ণ অনলাইন ও ৫০% অনলাইন + ৫০% ক্যাশ মডেল, ম্যানুয়াল TrxID যাচাই এবং মূল্য নিশ্চিতকরণের নিয়ম।" },
  { path: "/cancellation-policy", title: "বাতিল নীতি | MistriDako", description: "MistriDako বুকিং বাতিলের নীতি — কিভাবে বাতিলের অনুরোধ করবেন এবং অ্যাডমিন কিভাবে তা যাচাই করে সিদ্ধান্ত দেন।" },
  { path: "/refund-policy", title: "রিফান্ড নীতি | MistriDako", description: "MistriDako রিফান্ড নীতি — অনলাইন পেমেন্টের রিফান্ড অনুরোধ, যাচাই ও সিদ্ধান্তের প্রক্রিয়া।" },
  { path: "/commission-policy", title: "কমিশন নীতি | MistriDako", description: "MistriDako কমিশন নীতি — পেমেন্ট মডেল অনুযায়ী প্রফেশনাল কমিশন ও গ্রাহক ফি-এর হার ও হিসাব।" },
  { path: "/dispute-policy", title: "বিরোধ নিষ্পত্তি নীতি | MistriDako", description: "MistriDako বিরোধ নিষ্পত্তি নীতি — কাজ, মূল্য বা পেমেন্ট নিয়ে মতবিরোধ হলে অভিযোগ ও সমাধানের প্রক্রিয়া।" },
  { path: "/professional-agreement", title: "প্রফেশনাল চুক্তি | MistriDako", description: "MistriDako প্রফেশনাল চুক্তি — প্ল্যাটফর্মে কাজ করা প্রফেশনালদের দায়িত্ব, আচরণবিধি ও শর্তসমূহ।" },
];

// ------------------------------------------------------------ helpers
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`meta ${key} not found in index.html`);
  return html.replace(re, `$1${esc(value)}$2`);
}

function breadcrumbLd(crumbs) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.path}`,
    })),
  };
}

function pageLd(page, crumbs) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${SITE}${page.path}#webpage`,
        url: `${SITE}${page.path}`,
        name: page.title,
        description: page.description,
        inLanguage: ["bn", "en"],
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#organization` },
      },
      breadcrumbLd(crumbs),
    ],
  };
}

const serviceLinks = services
  .map((s) => `        <li><a href="/services/${s.slug}">${esc(s.nameBn)} (${esc(s.nameEn)})</a> — ${esc(s.tagline)}</li>`)
  .join("\n");
const areaList = locations.map((l) => esc(l.nameBn)).join(", ");

function contentFor(page) {
  const wrap = (inner) => `\n      <div data-seo-static style="max-width:800px;margin:0 auto;padding:32px 20px;font-family:sans-serif;color:#172B3A;line-height:1.65;">\n${inner}\n      </div>\n    `;
  switch (page.path) {
    case "/":
      return wrap(`        <h1>MistriDako — Trusted Home Services in Tangail, Bangladesh</h1>
        <p>এক ডাকেই, ঘরের সমাধান। MistriDako connects customers in Tangail District with verified local home-service professionals. Booking is free; the price is finalized only after you approve an itemized quotation.</p>
        <h2>Our services in Tangail</h2>
        <ul>
${serviceLinks}
        </ul>
        <h2>Service area</h2>
        <p>We currently serve Tangail District only — ${areaList}. See <a href="/locations/tangail">home services in Tangail</a>.</p>
        <p><a href="/services">All services</a> · <a href="/how-it-works">How it works</a> · <a href="/professionals">Verified professionals</a> · <a href="/contact">Contact us</a></p>`);
    case "/services":
      return wrap(`        <h1>সব হোম সার্ভিস — MistriDako</h1>
        <p>টাঙ্গাইলে যাচাইকৃত প্রফেশনালদের সব হোম সার্ভিস:</p>
        <ul>
${serviceLinks}
        </ul>`);
    case "/locations/tangail":
      return wrap(`        <h1>টাঙ্গাইলে হোম সার্ভিস — যাচাইকৃত মিস্ত্রি, এক ডাকেই</h1>
        <p>MistriDako বর্তমানে শুধুমাত্র টাঙ্গাইল জেলায় সেবা দেয়। সেবা এলাকা — ১২টি উপজেলা: ${areaList}।</p>
        <h2>টাঙ্গাইলে পাওয়া যাচ্ছে যেসব সার্ভিস</h2>
        <ul>
${serviceLinks}
        </ul>`);
    default:
      return wrap(`        <h1>${esc(page.title.split("|")[0].trim())}</h1>
        <p>${esc(page.description)}</p>
        <p><a href="/">MistriDako হোম</a> · <a href="/services">সব সার্ভিস</a> · <a href="/locations/tangail">টাঙ্গাইল সেবা এলাকা</a> · <a href="/contact">যোগাযোগ</a></p>`);
  }
}

function serviceContent(s) {
  return `\n      <div data-seo-static style="max-width:800px;margin:0 auto;padding:32px 20px;font-family:sans-serif;color:#172B3A;line-height:1.65;">
        <nav aria-label="breadcrumb"><a href="/">হোম</a> / <a href="/services">সার্ভিসসমূহ</a> / ${esc(s.nameBn)}</nav>
        <h1>${esc(s.nameBn)} (${esc(s.nameEn)}) সার্ভিস — টাঙ্গাইল</h1>
        <p>${esc(s.tagline)}</p>
        <p>${esc(s.description)}</p>
        <p>সেবা এলাকা: টাঙ্গাইল জেলা — ${areaList}। মূল্য কাজের ধরন ও পরিমাণ অনুযায়ী আইটেমভিত্তিক কোটেশনে নির্ধারণ করা হয়; আপনি অনুমোদন না করলে মূল্য চূড়ান্ত হয় না।</p>
        <p><a href="/services">সব সার্ভিস দেখুন</a> · <a href="/locations/tangail">টাঙ্গাইল সেবা এলাকা</a> · <a href="/how-it-works">কিভাবে কাজ করে</a></p>
      </div>
    `;
}

// ------------------------------------------------------------ build pages
const baseHtml = readFileSync(join(root, "dist", "index.html"), "utf8");

const verificationMetas = [];
if (process.env.GOOGLE_SITE_VERIFICATION) {
  verificationMetas.push(`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}" />`);
}
if (process.env.BING_SITE_VERIFICATION) {
  verificationMetas.push(`<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}" />`);
}

function render(page, ld, content) {
  let html = baseHtml;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  html = setMeta(html, "name", "description", page.description);
  html = setMeta(html, "property", "og:title", page.title);
  html = setMeta(html, "property", "og:description", page.description);
  html = setMeta(html, "property", "og:url", `${SITE}${page.path}`);
  html = setMeta(html, "name", "twitter:title", page.title);
  html = setMeta(html, "name", "twitter:description", page.description);
  html = html.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${SITE}${page.path}$2`,
  );
  const injections = [
    ...verificationMetas,
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  ].join("\n    ");
  html = html.replace("</head>", `    ${injections}\n  </head>`);
  const rootRe = /(<div\s+data-generated-space-root=""[^>]*>)(<\/div>)/;
  if (!rootRe.test(html)) throw new Error("app root div not found in dist/index.html");
  html = html.replace(rootRe, `$1${content}$2`);
  return html;
}

let written = 0;
for (const page of PAGES) {
  const crumbs =
    page.path === "/"
      ? [{ name: "হোম", path: "/" }]
      : [
          { name: "হোম", path: "/" },
          { name: page.title.split("|")[0].trim(), path: page.path },
        ];
  const html = render(page, pageLd(page, crumbs), contentFor(page));
  const out =
    page.path === "/" ? join(root, "dist", "index.html") : join(root, "dist", page.path.slice(1), "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  written++;
}

for (const s of services) {
  const page = {
    path: `/services/${s.slug}`,
    title: `${s.nameBn} (${s.nameEn}) সার্ভিস টাঙ্গাইলে | MistriDako`,
    description: s.description,
  };
  const ld = pageLd(page, [
    { name: "হোম", path: "/" },
    { name: "সার্ভিসসমূহ", path: "/services" },
    { name: s.nameBn, path: page.path },
  ]);
  ld["@graph"].push({
    "@type": "Service",
    "@id": `${SITE}${page.path}#service`,
    name: `${s.nameBn} (${s.nameEn})`,
    serviceType: s.nameEn,
    description: s.description,
    url: `${SITE}${page.path}`,
    provider: { "@id": `${SITE}/#organization` },
    areaServed: { "@type": "AdministrativeArea", name: "Tangail District, Bangladesh" },
  });
  const html = render(page, ld, serviceContent(s));
  const out = join(root, "dist", "services", s.slug, "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  written++;
}

console.log(
  `prerender-seo: wrote ${written} SEO shells (${PAGES.length} pages + ${services.length} services)` +
    (verificationMetas.length ? `, ${verificationMetas.length} verification meta(s) injected from env` : ", no verification env vars set"),
);
