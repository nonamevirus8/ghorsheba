// MistriDako SEO — per-route metadata, canonical URLs and JSON-LD.
//
// The app is a hash-routed SPA, so this module keeps the browser-side
// metadata correct for every view (unique title + description,
// canonical pointing at the CLEAN production URL, Open Graph / Twitter
// cards, `noindex` on private views) and injects page-level structured
// data (WebPage, BreadcrumbList, Service, Person). The static shells
// that crawlers receive without JavaScript are prerendered at build
// time (portable/scripts/prerender-seo.mjs) from the same route table.
//
// Rules (owner's SEO brief): canonical domain is always
// https://mistridako.vercel.app; no invented prices, ratings, reviews
// or addresses; LocalBusiness is omitted — there is no verified
// physical address, only the Tangail service area.

import type { Pro, Service } from "./lib";

export const SITE_URL = "https://mistridako.vercel.app";
export const SITE_NAME = "MistriDako";
export const TAGLINE_BN = "এক ডাকেই, ঘরের সমাধান।";
// og:image / twitter:image: the FULL official logo lockup (wordmark +
// tagline), written to dist/og-image.png at build time by
// portable/scripts/generate-icons.mjs. The Organization logo below is
// the icon-only artwork (favicon / PWA icon file).
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const LOGO_IMAGE = `${SITE_URL}/icon-512.png`;

export interface PageMeta {
  /** Clean canonical path on the production domain, e.g. "/services". */
  clean: string;
  title: string;
  description: string;
  /** Private/auth views: never indexed. */
  noindex?: boolean;
}

const HOME_META: PageMeta = {
  clean: "/",
  title: "MistriDako | Trusted Home Services in Bangladesh",
  description:
    "Find trusted electricians, plumbers, AC technicians, painters and home repair professionals in Bangladesh with MistriDako. Book home services easily.",
};

/** Static (non-parameterised) public + private views, keyed by the
 *  first hash-route segment ("" = home). */
export const PAGE_META: Record<string, PageMeta> = {
  "": HOME_META,
  services: {
    clean: "/services",
    title: "সব হোম সার্ভিস — ইলেকট্রিশিয়ান, প্লাম্বার, এসি, রংমিস্ত্রি | MistriDako",
    description:
      "টাঙ্গাইলে MistriDako-র সব হোম সার্ভিস দেখুন — ইলেকট্রিশিয়ান, প্লাম্বার, রাজমিস্ত্রি, রংমিস্ত্রি, কাঠমিস্ত্রি, এসি টেকনিশিয়ান, টাইলস, ওয়েল্ডিং, ক্লিনিং ও আরও অনেক কিছু।",
  },
  professionals: {
    clean: "/professionals",
    title: "যাচাইকৃত মিস্ত্রি ও প্রফেশনাল | MistriDako",
    description:
      "টাঙ্গাইলের যাচাইকৃত স্থানীয় মিস্ত্রি ও হোম-সার্ভিস প্রফেশনালদের তালিকা — পরিচয় যাচাই করা, দক্ষ ও নির্ভরযোগ্য। MistriDako দিয়ে সহজে বুকিং করুন।",
  },
  locations: {
    clean: "/locations/tangail",
    title: "টাঙ্গাইলে হোম সার্ভিস — ১২টি উপজেলায় | MistriDako",
    description:
      "MistriDako টাঙ্গাইল জেলার ১২টি উপজেলায় হোম সার্ভিস দেয় — টাঙ্গাইল সদর, ঘাটাইল, কালিহাতী, মির্জাপুর, সখীপুর, বাসাইল, মধুপুর, নাগরপুর, দেলদুয়ার, ভূয়াপুর, গোপালপুর ও ধনবাড়ী।",
  },
  how: {
    clean: "/how-it-works",
    title: "কিভাবে কাজ করে | MistriDako",
    description:
      "MistriDako কিভাবে কাজ করে — সার্ভিস বেছে বুকিং করুন, অ্যাডমিন যাচাইকৃত প্রফেশনাল অ্যাসাইন করবেন, কাজ শেষে মূল্য পরিশোধ করুন। পুরো প্রক্রিয়াটি স্বচ্ছ ও সহজ।",
  },
  about: {
    clean: "/about",
    title: "আমাদের সম্পর্কে | MistriDako",
    description:
      "MistriDako (মিস্ত্রি ডাকো) — টাঙ্গাইলের যাচাইকৃত স্থানীয় মিস্ত্রি ও প্রফেশনালদের সাথে গ্রাহকদের সংযোগ দেওয়ার নির্ভরযোগ্য হোম-সার্ভিস প্ল্যাটফর্ম। এক ডাকেই, ঘরের সমাধান।",
  },
  contact: {
    clean: "/contact",
    title: "যোগাযোগ করুন | MistriDako",
    description:
      "বুকিং বা সার্ভিস নিয়ে যেকোনো প্রয়োজনে MistriDako-র সাথে যোগাযোগ করুন — ফোন, WhatsApp ও ইমেইলে সাপোর্ট, সেবা এলাকা টাঙ্গাইল, বাংলাদেশ।",
  },
  help: {
    clean: "/help",
    title: "সাহায্য ও সাধারণ জিজ্ঞাসা (FAQ) | MistriDako",
    description:
      "MistriDako সম্পর্কে সবচেয়ে বেশি জিজ্ঞাসিত প্রশ্নের উত্তর — বুকিং, মূল্য নির্ধারণ, পেমেন্ট, বাতিল ও রিফান্ড নীতি নিয়ে সাহায্য।",
  },
  join: {
    clean: "/become-a-professional",
    title: "প্রফেশনাল হিসেবে যোগ দিন | MistriDako",
    description:
      "মিস্ত্রি বা হোম-সার্ভিস প্রফেশনাল হিসেবে MistriDako-তে নিবন্ধন করুন — পরিচয় যাচাইয়ের পর টাঙ্গাইলে নিয়মিত কাজের সুযোগ পান।",
  },
  "download-app": {
    clean: "/download-app",
    title: "MistriDako অ্যাপ ডাউনলোড করুন | MistriDako",
    description:
      "MistriDako এখন মোবাইল অ্যাপ হিসেবেও ইনস্টল করা যায় — Android ও iPhone-এ ওয়েবসাইট থেকেই ইনস্টল করুন, কোনো অ্যাপ স্টোর লাগবে না।",
  },
  privacy: {
    clean: "/privacy-policy",
    title: "গোপনীয়তা নীতি | MistriDako",
    description: "MistriDako কিভাবে আপনার ব্যক্তিগত তথ্য সংগ্রহ, ব্যবহার ও সুরক্ষা করে — গোপনীয়তা নীতি।",
  },
  terms: {
    clean: "/terms",
    title: "শর্তাবলী | MistriDako",
    description: "MistriDako হোম-সার্ভিস প্ল্যাটফর্ম ব্যবহারের শর্তাবলী — গ্রাহক ও প্রফেশনাল উভয়ের জন্য।",
  },
  "payment-policy": {
    clean: "/payment-policy",
    title: "পেমেন্ট নীতি | MistriDako",
    description:
      "MistriDako-র পেমেন্ট নীতি — সম্পূর্ণ অনলাইন ও ৫০% অনলাইন + ৫০% ক্যাশ মডেল, ম্যানুয়াল TrxID যাচাই এবং মূল্য নিশ্চিতকরণের নিয়ম।",
  },
  "cancellation-policy": {
    clean: "/cancellation-policy",
    title: "বাতিল নীতি | MistriDako",
    description: "MistriDako বুকিং বাতিলের নীতি — কিভাবে বাতিলের অনুরোধ করবেন এবং অ্যাডমিন কিভাবে তা যাচাই করে সিদ্ধান্ত দেন।",
  },
  "refund-policy": {
    clean: "/refund-policy",
    title: "রিফান্ড নীতি | MistriDako",
    description: "MistriDako রিফান্ড নীতি — অনলাইন পেমেন্টের রিফান্ড অনুরোধ, যাচাই ও সিদ্ধান্তের প্রক্রিয়া।",
  },
  "commission-policy": {
    clean: "/commission-policy",
    title: "কমিশন নীতি | MistriDako",
    description: "MistriDako কমিশন নীতি — পেমেন্ট মডেল অনুযায়ী প্রফেশনাল কমিশন ও গ্রাহক ফি-এর হার ও হিসাব।",
  },
  "dispute-policy": {
    clean: "/dispute-policy",
    title: "বিরোধ নিষ্পত্তি নীতি | MistriDako",
    description: "MistriDako বিরোধ নিষ্পত্তি নীতি — কাজ, মূল্য বা পেমেন্ট নিয়ে মতবিরোধ হলে অভিযোগ ও সমাধানের প্রক্রিয়া।",
  },
  "pro-agreement": {
    clean: "/professional-agreement",
    title: "প্রফেশনাল চুক্তি | MistriDako",
    description: "MistriDako প্রফেশনাল চুক্তি — প্ল্যাটফর্মে কাজ করা প্রফেশনালদের দায়িত্ব, আচরণবিধি ও শর্তসমূহ।",
  },
  // ---- private views: real titles for the user, noindex for crawlers
  login: { clean: "/login", title: "লগইন | MistriDako", description: "আপনার MistriDako অ্যাকাউন্টে লগইন করুন।", noindex: true },
  register: { clean: "/register", title: "অ্যাকাউন্ট খুলুন | MistriDako", description: "MistriDako-তে গ্রাহক অ্যাকাউন্ট খুলুন।", noindex: true },
  book: { clean: "/book", title: "সার্ভিস বুকিং করুন | MistriDako", description: "MistriDako-তে হোম সার্ভিস বুকিং করুন।", noindex: true },
  booking: { clean: "/booking", title: "বুকিং বিবরণ | MistriDako", description: "আপনার MistriDako বুকিংয়ের বিবরণ।", noindex: true },
  dashboard: { clean: "/dashboard", title: "আমার ড্যাশবোর্ড | MistriDako", description: "আপনার MistriDako গ্রাহক ড্যাশবোর্ড।", noindex: true },
  "pro-dashboard": { clean: "/pro-dashboard", title: "প্রফেশনাল ড্যাশবোর্ড | MistriDako", description: "আপনার MistriDako প্রফেশনাল ড্যাশবোর্ড।", noindex: true },
  admin: { clean: "/admin", title: "অ্যাডমিন প্যানেল | MistriDako", description: "MistriDako অ্যাডমিন প্যানেল।", noindex: true },
  "admin-setup": { clean: "/admin-setup", title: "অ্যাডমিন সেটআপ | MistriDako", description: "MistriDako প্রথম অ্যাডমিন সেটআপ।", noindex: true },
};

export function serviceMeta(service: Service): PageMeta {
  return {
    clean: `/services/${service.slug}`,
    title: `${service.nameBn} (${service.nameEn}) সার্ভিস টাঙ্গাইলে | MistriDako`,
    description:
      service.description ??
      `টাঙ্গাইলে যাচাইকৃত ${service.nameBn} সার্ভিস — ${service.tagline ?? ""}। MistriDako দিয়ে সহজে বুকিং করুন।`,
  };
}

export function proMeta(pro: Pro): PageMeta {
  return {
    clean: `/professionals/${pro.id}`,
    title: `${pro.name} — ${pro.categoryName} | MistriDako`,
    description:
      pro.bio ??
      `${pro.name} — টাঙ্গাইলে যাচাইকৃত ${pro.categoryName}${pro.skills ? `। দক্ষতা: ${pro.skills}` : ""}। MistriDako দিয়ে বুকিং করুন।`,
  };
}

/** Map the current hash route to its meta. `segs` is the parsed route. */
export function metaForRoute(
  page: string,
  segs: string[],
  data?: { service?: Service | null; pro?: Pro | null },
): PageMeta {
  if (page === "service" && data?.service) return serviceMeta(data.service);
  if (page === "service") {
    return {
      clean: `/services/${segs[1] ?? ""}`,
      title: "সার্ভিস বিবরণ | MistriDako",
      description: "MistriDako হোম সার্ভিসের বিবরণ ও বুকিং।",
    };
  }
  if (page === "pro" && data?.pro) return proMeta(data.pro);
  if (page === "pro") {
    return {
      clean: `/professionals/${segs[1] ?? ""}`,
      title: "প্রফেশনাল প্রোফাইল | MistriDako",
      description: "MistriDako যাচাইকৃত প্রফেশনালের প্রোফাইল।",
    };
  }
  return PAGE_META[page] ?? { clean: "/", title: "MistriDako", description: HOME_META.description, noindex: true };
}

// ------------------------------------------------------------- JSON-LD

export const ORGANIZATION_LD = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "MistriDako",
  alternateName: "মিস্ত্রি ডাকো",
  url: `${SITE_URL}/`,
  logo: LOGO_IMAGE,
  slogan: TAGLINE_BN,
  description: HOME_META.description,
  areaServed: { "@type": "AdministrativeArea", name: "Tangail District, Bangladesh" },
};

export const WEBSITE_LD = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "MistriDako",
  url: `${SITE_URL}/`,
  inLanguage: ["bn", "en"],
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export interface Crumb {
  name: string;
  /** Clean path, e.g. "/services". */
  path: string;
}

export function breadcrumbLd(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}

export function serviceLd(service: Service) {
  const ld: Record<string, unknown> = {
    "@type": "Service",
    "@id": `${SITE_URL}/services/${service.slug}#service`,
    name: `${service.nameBn} (${service.nameEn})`,
    serviceType: service.nameEn,
    description: service.description ?? service.tagline ?? undefined,
    url: `${SITE_URL}/services/${service.slug}`,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: { "@type": "AdministrativeArea", name: "Tangail District, Bangladesh" },
  };
  // Only an admin-configured starting price is real data; when the
  // service carries none, no Offer is emitted (prices are otherwise
  // quotation-based — never invented here).
  if (service.startingPrice != null) {
    ld.offers = {
      "@type": "Offer",
      priceCurrency: "BDT",
      price: service.startingPrice,
      availability: "https://schema.org/InStock",
      areaServed: "Tangail District, Bangladesh",
    };
  }
  return ld;
}

export function personLd(pro: Pro) {
  // Public profile facts only — never phone, address, NID or documents.
  return {
    "@type": "Person",
    "@id": `${SITE_URL}/professionals/${pro.id}#person`,
    name: pro.name,
    jobTitle: pro.categoryName,
    url: `${SITE_URL}/professionals/${pro.id}`,
    worksFor: { "@id": `${SITE_URL}/#organization` },
    ...(pro.bio ? { description: pro.bio } : {}),
  };
}

// ---------------------------------------------------------- DOM writer

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

const LD_SCRIPT_ID = "md-page-jsonld";

/** Apply a page's metadata + structured data to the live document.
 *  Called on every route change (App) and again by the service /
 *  professional pages once their real data has loaded. */
export function applySeo(meta: PageMeta, extraLd: Record<string, unknown>[] = []) {
  if (typeof document === "undefined") return;
  const url = `${SITE_URL}${meta.clean}`;
  document.title = meta.title;
  upsertMeta("name", "description", meta.description);
  upsertMeta(
    "name",
    "robots",
    meta.noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1",
  );
  upsertCanonical(url);
  upsertMeta("property", "og:title", meta.title);
  upsertMeta("property", "og:description", meta.description);
  upsertMeta("property", "og:type", "website");
  upsertMeta("property", "og:url", url);
  upsertMeta("property", "og:image", OG_IMAGE);
  upsertMeta("property", "og:site_name", SITE_NAME);
  upsertMeta("name", "twitter:card", "summary");
  upsertMeta("name", "twitter:title", meta.title);
  upsertMeta("name", "twitter:description", meta.description);
  upsertMeta("name", "twitter:image", OG_IMAGE);

  const graph: Record<string, unknown>[] = [
    ORGANIZATION_LD,
    WEBSITE_LD,
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: meta.title,
      description: meta.description,
      inLanguage: ["bn", "en"],
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
    },
    ...extraLd,
  ];
  let script = document.getElementById(LD_SCRIPT_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = LD_SCRIPT_ID;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

/** Breadcrumb trail for a page, always starting at the homepage. */
export function crumbsFor(meta: PageMeta, leaf?: string): Crumb[] {
  const home: Crumb = { name: "হোম", path: "/" };
  if (meta.clean === "/") return [home];
  return [home, { name: leaf ?? meta.title.split("|")[0]?.trim() ?? SITE_NAME, path: meta.clean }];
}
