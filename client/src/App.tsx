// MistriDako — app shell, routing, homepage and public pages.
// Dashboards live in ./panels; booking flow in ./booking.

import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  applySeo,
  breadcrumbLd,
  crumbsFor,
  metaForRoute,
  personLd,
  proMeta,
  serviceLd,
  serviceMeta,
} from "./seo";
import { FIELDS } from "./fields";
import {
Avatar,
EmptyState,
ErrorBox,
Icon,
Logo,
PriceBlock,
SectionTitle,
ServiceIcon,
Spinner,
Stars,
STATUS_BN,
SocialLinksRow,
socialIcon,
socialLabel,
useSocialLinks,
errMsg,
fmtDate,
getToken,
go,
setToken,
statusColor,
useCatalog,
useHashRoute,
useLogout,
useMe,
type Pro,
type Review,
type Service,
} from "./lib";
import logoIcon from "./assets/logo-icon.png";
import heroImg from "./assets/hero-team.webp";
import mistriImg from "./assets/mistri-portrait.webp";
import svcElectrician from "./assets/svc-electrician.webp";
import svcPlumber from "./assets/svc-plumber.jpg";
import svcMason from "./assets/svc-mason.webp";
import svcPainter from "./assets/svc-painter.webp";
// Master Phase 12 (loading speed): the booking flow and the three
// dashboards are code-split out of the first-load bundle, so the
// homepage and public pages no longer pay their parse/execute cost
// (panels.tsx alone is ~6k lines including the analytics charts). Each
// loads on first navigation to its route, behind the app's standard
// loading spinner (see the <Suspense> around {content} in App below).
const BookingPage = lazy(() =>
  import("./booking").then((m) => ({ default: m.BookingPage })),
);
const BookingDetailPage = lazy(() =>
  import("./booking").then((m) => ({ default: m.BookingDetailPage })),
);
const CustomerDashboard = lazy(() =>
  import("./panels").then((m) => ({ default: m.CustomerDashboard })),
);
const ProDashboard = lazy(() =>
  import("./panels").then((m) => ({ default: m.ProDashboard })),
);
const AdminPanel = lazy(() =>
  import("./panels").then((m) => ({ default: m.AdminPanel })),
);

export const SERVICE_IMG: Record<string, string> = {
  electrician: svcElectrician,
  plumber: svcPlumber,
  mason: svcMason,
  painter: svcPainter,
};

// ------------------------------------------------------------ route parse

function parseRoute(hash: string) {
  const raw = hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = raw.split("?");
  const segs = (pathPart ?? "/").split("/").filter(Boolean).map(decodeURIComponent);
  return { segs, params: new URLSearchParams(queryPart ?? "") };
}

const LOC_KEY = "ghorsheba_loc";
export function getSavedLocation(): string {
  try {
    return localStorage.getItem(LOC_KEY) ?? "টাঙ্গাইল সদর";
  } catch {
    return "টাঙ্গাইল সদর";
  }
}
function saveLocation(v: string) {
  try {
    localStorage.setItem(LOC_KEY, v);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------- PWA install state

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
function emitInstallChange() {
  installListeners.forEach((f) => f());
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the event so the download page's Install button can fire it.
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    emitInstallChange();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    emitInstallChange();
  });
}

function isStandaloneApp(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function useInstallState() {
  const [, setTick] = useState(0);
  const [installed, setInstalled] = useState(isStandaloneApp());
  useEffect(() => {
    const onChange = () => {
      setTick((t) => t + 1);
      setInstalled(isStandaloneApp());
    };
    installListeners.add(onChange);
    return () => {
      installListeners.delete(onChange);
    };
  }, []);
  return { canPrompt: deferredInstallPrompt !== null, installed };
}

async function promptInstall(): Promise<boolean> {
  const ev = deferredInstallPrompt;
  if (!ev) return false;
  await ev.prompt();
  const choice = await ev.userChoice;
  if (choice.outcome === "accepted") {
    deferredInstallPrompt = null;
    emitInstallChange();
    return true;
  }
  return false;
}

// ------------------------------------------------------------------- App

export function App() {
  const hash = useHashRoute();
  const { segs, params } = useMemo(() => parseRoute(hash), [hash]);
  const page = segs[0] ?? "";
  // Per-route SEO metadata + JSON-LD (see ./seo.ts). The service and
  // professional pages re-apply with their real data once it loads.
  useEffect(() => {
    const meta = metaForRoute(page, segs);
    applySeo(meta, meta.noindex ? [] : [breadcrumbLd(crumbsFor(meta))]);
  }, [page, segs]);
  const catalog = useCatalog();
  const me = useMe();

  let content: ReactNode;
  switch (page) {
    case "":
      content = <HomePage />;
      break;
    case "services":
      // Keyed by the query string so arriving with new search params (e.g.
      // from the hero search) remounts the page with fresh filter state.
      content = <ServicesPage key={params.toString()} params={params} />;
      break;
    case "service":
      content = <ServiceDetailPage slug={segs[1] ?? ""} />;
      break;
    case "professionals":
      content = <ProfessionalsPage key={params.toString()} params={params} />;
      break;
    case "pro":
      content = <ProProfilePage id={Number(segs[1] ?? 0)} />;
      break;
    case "book":
      content = <BookingPage params={params} />;
      break;
    case "booking":
      content = <BookingDetailPage code={segs[1] ?? ""} />;
      break;
    case "login":
      content = <LoginPage params={params} />;
      break;
    case "register":
      content = <RegisterPage params={params} />;
      break;
    case "join":
      content = <JoinProPage params={params} />;
      break;
    case "admin-setup":
      content = <AdminSetupPage />;
      break;
    case "dashboard":
      content = <CustomerDashboard params={params} />;
      break;
    case "pro-dashboard":
      content = <ProDashboard params={params} />;
      break;
    case "admin":
      content = <AdminPanel params={params} />;
      break;
    case "download-app":
      content = <DownloadAppPage />;
      break;
    case "locations":
      content = <TangailPage />;
      break;
    case "how":
      content = <HowPage />;
      break;
    case "about":
      content = <AboutPage />;
      break;
    case "contact":
      content = <ContactPage />;
      break;
    case "help":
      content = <HelpPage />;
      break;
    case "privacy":
      content = <PrivacyPage />;
      break;
    case "terms":
      content = <TermsPage />;
      break;
    case "payment-policy":
      content = <PaymentPolicyPage />;
      break;
    case "pro-agreement":
      content = <ProAgreementPage />;
      break;
    case "cancellation-policy":
      content = <CancellationPolicyPage />;
      break;
    case "refund-policy":
      content = <RefundPolicyPage />;
      break;
    case "commission-policy":
      content = <CommissionPolicyPage />;
      break;
    case "dispute-policy":
      content = <DisputePolicyPage />;
      break;
    default:
      content = (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-[#054A2B]">পেজটি পাওয়া যায়নি</h1>
          <p className="mt-2 text-[#5C6B76]">আপনি যে পেজটি খুঁজছেন তা নেই বা সরানো হয়েছে।</p>
          <a href="#/" className="inline-block mt-5 bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">
            হোমে ফিরুন
          </a>
        </div>
      );
  }

  const role = me.data?.user.role;
  const bookingsHref = !getToken()
    ? "#/login"
    : role === "admin"
      ? "#/admin"
      : role === "professional"
        ? "#/pro-dashboard"
        : "#/dashboard";
  const profileHref = !getToken()
    ? "#/login"
    : role === "admin"
      ? "#/admin"
      : role === "professional"
        ? "#/pro-dashboard"
        : "#/dashboard?tab=profile";

  return (
    <div className="min-h-screen bg-white text-[#172B3A] flex flex-col">
      <Header catalog={catalog.data} />
      {catalog.data?.announcement && (
        <div className="bg-[#FF8500] text-white text-center text-sm font-medium px-4 py-2">
          {catalog.data.announcement}
        </div>
      )}
      {page === "" && !isStandaloneApp() && (
        <div className="bg-[#054A2B] text-white">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm">
            <span className="text-[#FF8500]">{Icon.smartphone("w-5 h-5")}</span>
            <p className="font-medium">MistriDako এখন মোবাইল অ্যাপ হিসেবেও ইনস্টল করা যায়</p>
            <a
              href="#/download-app"
              className="shrink-0 bg-[#FF8500] hover:bg-[#E67600] text-white font-semibold px-3.5 py-1.5 rounded-lg"
            >
              অ্যাপ ডাউনলোড করুন
            </a>
          </div>
        </div>
      )}
      <main className={`flex-1 ${page === "admin" ? "" : "pb-20 lg:pb-0"}`}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-24 text-[#5C6B76]">
              <Spinner />
              <span>লোড হচ্ছে…</span>
            </div>
          }
        >
          {content}
        </Suspense>
      </main>
      {page !== "admin" && <Footer catalog={catalog.data} />}
      {/* Mobile bottom navigation (hidden on admin pages — the admin
          panel renders its own bottom navigation) */}
      {page !== "admin" && (
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E1E9E4] pb-safe shadow-[0_-2px_12px_rgba(5,74,43,0.06)]"
        aria-label="মোবাইল নেভিগেশন"
      >
        <div className="grid grid-cols-4">
          <BottomNavItem href="#/" active={page === ""} icon={Icon.home("w-5 h-5")} label="হোম" />
          <BottomNavItem href="#/services" active={page === "services" || page === "service"} icon={Icon.grid("w-5 h-5")} label="সার্ভিস" />
          <BottomNavItem href={bookingsHref} active={page === "dashboard" || page === "booking"} icon={Icon.calendar("w-5 h-5")} label="আমার বুকিং" />
          <BottomNavItem href={profileHref} active={false} icon={Icon.user("w-5 h-5")} label="প্রোফাইল" />
        </div>
      </nav>
      )}
    </div>
  );
}

function BottomNavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
        active ? "text-[#075B35]" : "text-[#5C6B76]"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      {label}
    </a>
  );
}

// ---------------------------------------------------------------- Header

function Header({ catalog }: { catalog: ReturnType<typeof useCatalog>["data"] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loc, setLoc] = useState(getSavedLocation());
  const me = useMe();
  const logout = useLogout();
  const user = me.data?.user;
  const locations = catalog?.locations ?? [];

  const dashHref =
    user?.role === "admin" ? "#/admin" : user?.role === "professional" ? "#/pro-dashboard" : "#/dashboard";

  const navLink = "px-3 py-2 rounded-lg text-[15px] font-medium text-[#172B3A] hover:text-[#075B35] hover:bg-[#F3F8F4]";
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[#E1E9E4] pt-safe">
      <div className="max-w-7xl mx-auto px-4 h-[68px] flex items-center gap-3">
        <Logo />
        <div className="hidden md:flex items-center ml-2">
          <label className="sr-only" htmlFor="hdr-loc">এলাকা নির্বাচন</label>
          <span className="relative inline-flex items-center">
            <span className="absolute left-2.5 text-[#075B35] pointer-events-none">{Icon.pin("w-4 h-4")}</span>
            <select
              id="hdr-loc"
              aria-label="এলাকা নির্বাচন"
              className="appearance-none bg-[#F3F8F4] border border-[#C9DFD2] rounded-full pl-8 pr-7 py-1.5 text-sm font-medium text-[#054A2B] cursor-pointer"
              value={loc}
              onChange={(e) => {
                setLoc(e.target.value);
                saveLocation(e.target.value);
              }}
            >
              {locations.length === 0 && <option>টাঙ্গাইল সদর</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.nameBn}>
                  {l.nameBn}
                </option>
              ))}
            </select>
            <span className="absolute right-2 text-[#075B35] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
          </span>
        </div>
        <nav className="hidden lg:flex items-center ml-auto" aria-label="প্রধান নেভিগেশন">
          <a className={navLink} href="#/">হোম</a>
          <a className={navLink} href="#/services">সার্ভিসসমূহ</a>
          <a className={navLink} href="#/how">কিভাবে কাজ করে</a>
          <a className={navLink} href="#/about">আমাদের সম্পর্কে</a>
          <a className={navLink} href="#/help">সহায়তা</a>
        </nav>
        <div className="flex items-center gap-2 ml-auto lg:ml-3">
          {user ? (
            <>
              <a
                href={user.role === "admin" ? "#/admin" : `${dashHref}?tab=notifications`}
                className="relative grid place-items-center w-10 h-10 rounded-full hover:bg-[#F3F8F4] text-[#054A2B]"
                aria-label="নোটিফিকেশন"
              >
                {Icon.bell("w-5 h-5")}
                {(me.data?.unreadNotifications ?? 0) > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-0.5 rounded-full bg-[#FF8500] text-white text-[10px] font-bold grid place-items-center">
                    {me.data?.unreadNotifications}
                  </span>
                )}
              </a>
              <a href={dashHref} className="hidden sm:flex items-center gap-2 bg-[#F3F8F4] hover:bg-[#E4F1E8] rounded-full pl-1.5 pr-3.5 py-1.5">
                <Avatar name={user.name} photoUrl={user.photoUrl} size="w-7 h-7" textSize="text-xs" />
                <span className="text-sm font-semibold text-[#054A2B] max-w-[110px] truncate">{user.name}</span>
              </a>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  go("/");
                }}
                className="hidden sm:grid place-items-center w-10 h-10 rounded-full hover:bg-red-50 text-[#5C6B76] hover:text-red-600"
                aria-label="লগআউট"
              >
                {Icon.logout("w-5 h-5")}
              </button>
            </>
          ) : (
            <>
              <a
                href="#/login"
                className="hidden sm:inline-flex items-center border-[1.5px] border-[#075B35] text-[#075B35] font-semibold text-[15px] px-4 py-1.5 rounded-[10px] hover:bg-[#F3F8F4]"
              >
                লগইন
              </a>
              <a
                href="#/register"
                className="hidden sm:inline-flex items-center bg-[#075B35] hover:bg-[#054A2B] text-white font-semibold text-[15px] px-4 py-2 rounded-[10px]"
              >
                নিবন্ধন
              </a>
            </>
          )}
          <button
            type="button"
            className="lg:hidden grid place-items-center w-10 h-10 rounded-lg hover:bg-[#F3F8F4] text-[#054A2B]"
            aria-label={menuOpen ? "মেনু বন্ধ করুন" : "মেনু খুলুন"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? Icon.x("w-6 h-6") : Icon.menu("w-6 h-6")}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="lg:hidden border-t border-[#E1E9E4] bg-white px-4 py-3 gs-fade-up">
          <div className="md:hidden mb-3">
            <label className="text-xs text-[#5C6B76]" htmlFor="m-loc">আপনার এলাকা</label>
            <select
              id="m-loc"
              aria-label="আপনার এলাকা"
              className="mt-1 w-full border border-[#E1E9E4] rounded-xl px-3 py-2.5 bg-white"
              value={loc}
              onChange={(e) => {
                setLoc(e.target.value);
                saveLocation(e.target.value);
              }}
            >
              {locations.length === 0 && <option>টাঙ্গাইল সদর</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
              ))}
            </select>
          </div>
          <nav className="grid gap-1" aria-label="মোবাইল মেনু" onClick={() => setMenuOpen(false)}>
            {[
              ["#/", "হোম"],
              ["#/services", "সার্ভিসসমূহ"],
              ["#/professionals", "প্রফেশনালগণ"],
              ["#/how", "কিভাবে কাজ করে"],
              ["#/download-app", "অ্যাপ ডাউনলোড করুন"],
              ["#/about", "আমাদের সম্পর্কে"],
              ["#/contact", "যোগাযোগ"],
              ["#/help", "সহায়তা"],
              ["#/join", "মিস্ত্রি হিসেবে যোগ দিন"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="px-3 py-2.5 rounded-lg font-medium hover:bg-[#F3F8F4] hover:text-[#075B35]">
                {label}
              </a>
            ))}
            {/* Owner-added social links only; renders nothing while none exist. */}
            <div className="px-3 pt-1.5">
              <SocialLinksRow />
            </div>
            {user ? (
              <>
                <a href={dashHref} className="px-3 py-2.5 rounded-lg font-medium bg-[#F3F8F4] text-[#075B35]">
                  আমার ড্যাশবোর্ড
                </a>
                <button
                  type="button"
                  className="text-left px-3 py-2.5 rounded-lg font-medium text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    await logout();
                    go("/");
                  }}
                >
                  লগআউট
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-2">
                <a href="#/login" className="flex-1 text-center border-[1.5px] border-[#075B35] text-[#075B35] font-semibold px-4 py-2.5 rounded-xl">
                  লগইন
                </a>
                <a href="#/register" className="flex-1 text-center bg-[#075B35] text-white font-semibold px-4 py-2.5 rounded-xl">
                  নিবন্ধন
                </a>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- Footer

function Footer({ catalog }: { catalog: ReturnType<typeof useCatalog>["data"] }) {
  const hasContact =
    catalog?.supportPhone ||
    catalog?.supportEmail ||
    catalog?.supportWhatsapp ||
    catalog?.businessAddress ||
    catalog?.officeHours;
  return (
    <footer className="bg-[#054A2B] text-white mt-0">
      <div className="max-w-7xl mx-auto px-4 pt-12 pb-6 grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <Logo light />
          <p className="mt-4 text-white/75 text-[15px] leading-relaxed max-w-xs">
            টাঙ্গাইলের যাচাইকৃত স্থানীয় মিস্ত্রি ও প্রফেশনালদের সাথে গ্রাহকদের সংযোগ দেওয়ার নির্ভরযোগ্য প্ল্যাটফর্ম।
          </p>
          <div className="mt-4">
            <SocialLinksRow dark />
          </div>
        </div>
        <nav aria-label="দ্রুত লিংক">
          <h3 className="font-bold text-[17px] mb-3.5">দ্রুত লিংক</h3>
          <ul className="space-y-2.5 text-white/80 text-[15px]">
            <li><a className="hover:text-white" href="#/">হোম</a></li>
            <li><a className="hover:text-white" href="#/services">সার্ভিসসমূহ</a></li>
            <li><a className="hover:text-white" href="#/locations/tangail">সেবা এলাকা: টাঙ্গাইল</a></li>
            <li><a className="hover:text-white" href="#/how">কিভাবে কাজ করে</a></li>
            <li><a className="hover:text-white" href="#/join">প্রফেশনাল নিবন্ধন</a></li>
            <li><a className="hover:text-white" href="#/download-app">অ্যাপ ডাউনলোড করুন</a></li>
            <li><a className="hover:text-white" href="#/contact">যোগাযোগ</a></li>
          </ul>
        </nav>
        <nav aria-label="আমাদের সম্পর্কে">
          <h3 className="font-bold text-[17px] mb-3.5">আমাদের সম্পর্কে</h3>
          <ul className="space-y-2.5 text-white/80 text-[15px]">
            <li><a className="hover:text-white" href="#/about">আমাদের লক্ষ্য</a></li>
            <li><a className="hover:text-white" href="#/about">বিশ্বাস ও নিরাপত্তা</a></li>
            <li><a className="hover:text-white" href="#/terms">শর্তাবলী</a></li>
            <li><a className="hover:text-white" href="#/privacy">গোপনীয়তা নীতি</a></li>
            <li><a className="hover:text-white" href="#/payment-policy">পেমেন্ট নীতি</a></li>
            <li><a className="hover:text-white" href="#/cancellation-policy">বাতিল নীতি</a></li>
            <li><a className="hover:text-white" href="#/refund-policy">রিফান্ড নীতি</a></li>
            <li><a className="hover:text-white" href="#/commission-policy">কমিশন নীতি</a></li>
            <li><a className="hover:text-white" href="#/dispute-policy">বিরোধ নিষ্পত্তি নীতি</a></li>
            <li><a className="hover:text-white" href="#/pro-agreement">প্রফেশনাল চুক্তি</a></li>
            <li><a className="hover:text-white" href="#/help">সাহায্য ও FAQ</a></li>
          </ul>
        </nav>
        <div>
          <h3 className="font-bold text-[17px] mb-3.5">যোগাযোগ করুন</h3>
          {hasContact ? (
            <ul className="space-y-2.5 text-white/80 text-[15px]">
              {catalog?.supportPhone && (
                <li className="flex items-center gap-2">
                  {Icon.phone("w-4 h-4")} <a href={`tel:${catalog.supportPhone}`} className="hover:text-white font-en">{catalog.supportPhone}</a>
                </li>
              )}
              {catalog?.supportWhatsapp && (
                <li className="flex items-center gap-2">
                  {Icon.whatsapp("w-4 h-4")}{" "}
                  <a href={`https://wa.me/${catalog.supportWhatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="hover:text-white font-en">
                    {catalog.supportWhatsapp}
                  </a>
                </li>
              )}
              {catalog?.supportEmail && (
                <li className="flex items-center gap-2">
                  {Icon.message("w-4 h-4")} <a href={`mailto:${catalog.supportEmail}`} className="hover:text-white font-en">{catalog.supportEmail}</a>
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{Icon.pin("w-4 h-4")}</span>
                <span>{catalog?.businessAddress ?? "টাঙ্গাইল, বাংলাদেশ"}</span>
              </li>
              {catalog?.officeHours && (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{Icon.clock("w-4 h-4")}</span>
                  <span>{catalog.officeHours}</span>
                </li>
              )}
            </ul>
          ) : (
            <ul className="space-y-2.5 text-white/80 text-[15px]">
              <li className="flex items-center gap-2">{Icon.pin("w-4 h-4")} টাঙ্গাইল, বাংলাদেশ</li>
              <li className="text-white/60">যোগাযোগের নম্বর ও ইমেইল শীঘ্রই এখানে যুক্ত হবে। আপাতত বুকিং ফর্ম বা অভিযোগ ফর্মের মাধ্যমে যোগাযোগ করুন।</li>
            </ul>
          )}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4" aria-hidden="true">
        <svg viewBox="0 0 1200 60" className="w-full h-[46px] text-white/15" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M0 58h1200M20 58V34h26v24M60 58V22h34v36M108 58V40h22v18M150 58V28c10-8 24-8 34 0v30M200 58V18h28v40M244 58V36h24v22M286 58V26h30v32M332 58V44h20v14M368 58V14l14-8 14 8v44M412 58V32h26v26M452 58V24h32v34M500 58V38h22v20M538 58V20h30v38M584 58V34h24v24M624 58v-28a20 12 0 0 1 40 0v28M680 58V26h28v32M724 58V40h22v18M762 58V16h30v42M808 58V30h24v28M848 58V22h28v36M892 58V38h22v20M930 58V26c8-6 20-6 28 0v32M974 58V18h28v40M1018 58V36h24v22M1058 58V28h30v30M1104 58V42h22v16M1142 58V24h30v34" />
        </svg>
      </div>
      <div className="border-t border-white/15">
        <p className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-white/70">
          <span className="font-en">© 2026 MistriDako. All rights reserved.</span>
          <span className="mx-2 text-white/30">|</span> আপনার ঘরের সেবায়, সবসময় পাশে।
        </p>
      </div>
    </footer>
  );
}

// ------------------------------------------------------- Download app page

function DownloadAppPage() {
  const { canPrompt, installed } = useInstallState();
  const [justInstalled, setJustInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  async function onInstallClick() {
    if (!canPrompt) {
      // No native prompt in this browser (iOS, or Chrome has not offered
      // it yet): show the manual steps instead of a dead button.
      setShowSteps(true);
      document
        .getElementById(isIOS ? "ios-steps" : "android-steps")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    try {
      const ok = await promptInstall();
      if (ok) setJustInstalled(true);
      else setShowSteps(true);
    } finally {
      setBusy(false);
    }
  }

  const benefits: { icon: ReactNode; title: string; body: string }[] = [
    {
      icon: Icon.bolt("w-6 h-6"),
      title: "ঝটপট খোলে",
      body: "হোম স্ক্রিন থেকে এক ট্যাপেই অ্যাপ খুলে যায় — প্রতিবার ব্রাউজারে ঠিকানা লিখতে হয় না।",
    },
    {
      icon: Icon.smartphone("w-6 h-6"),
      title: "আসল অ্যাপের মতো অভিজ্ঞতা",
      body: "পুরো স্ক্রিন জুড়ে চলে, ব্রাউজারের ঠিকানার বার থাকে না — দেখতে ও ব্যবহারে ঠিক একটি অ্যাপের মতো।",
    },
    {
      icon: Icon.checkCircle("w-6 h-6"),
      title: "দুর্বল ইন্টারনেটেও চলে",
      body: "একবার খুললে অ্যাপের মূল অংশ ফোনেই সংরক্ষিত থাকে, তাই ধীর বা অস্থির সংযোগেও দ্রুত খোলে।",
    },
    {
      icon: Icon.shield("w-6 h-6"),
      title: "হালকা ও নিরাপদ",
      body: "ফোনের জায়গা প্রায় নেয় না বললেই চলে, আর আলাদা কোনো ফাইল ডাউনলোড করতে হয় না — সরাসরি এই ওয়েবসাইট থেকেই ইনস্টল হয়।",
    },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="bg-[#F3F8F4]">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <div className="flex justify-center">
            <span className="grid place-items-center w-24 h-24 rounded-[26px] bg-white shadow-lg shadow-[#075B35]/25 overflow-hidden">
              <img src={logoIcon} alt="MistriDako অ্যাপ আইকন" className="w-full h-full object-cover" width={512} height={512} />
            </span>
          </div>
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-[#054A2B] leading-snug">
            MistriDako অ্যাপ ইনস্টল করুন
          </h1>
          <p className="mt-3 text-[#5C6B76] text-[16px] leading-relaxed max-w-xl mx-auto">
            অ্যাপটি সরাসরি এই ওয়েবসাইট থেকেই ইনস্টল হয় —{" "}
            <strong className="text-[#054A2B]">Play Store বা App Store-এ যাওয়ার দরকার নেই</strong>,
            কোনো টাকাও লাগে না। ইনস্টল করতে মাত্র কয়েক সেকেন্ড সময় লাগবে।
          </p>
          {installed || justInstalled ? (
            <p className="mt-7 inline-flex items-center gap-2 bg-[#075B35] text-white font-semibold px-6 py-3.5 rounded-2xl">
              {Icon.checkCircle("w-6 h-6")}
              অ্যাপটি আপনার ফোনে ইনস্টল করা আছে — হোম স্ক্রিন থেকে খুলুন
            </p>
          ) : (
            <button
              type="button"
              onClick={onInstallClick}
              disabled={busy}
              className="mt-7 inline-flex items-center gap-2.5 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white text-lg font-bold px-8 py-4 rounded-2xl shadow-lg shadow-[#075B35]/25"
            >
              {Icon.download("w-6 h-6")}
              {busy ? "ইনস্টল হচ্ছে..." : "অ্যাপ ইনস্টল করুন"}
            </button>
          )}
          {!canPrompt && !installed && !justInstalled && (
            <p className="mt-3 text-sm text-[#5C6B76]">
              আপনার ব্রাউজারে সরাসরি ইনস্টল বাটন না এলে নিচের ধাপগুলো অনুসরণ করুন।
            </p>
          )}
        </div>
      </section>

      {/* Why install */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <SectionTitle sub="একই MistriDako, তবে আরও দ্রুত আর সহজে">কেন অ্যাপটি ইনস্টল করবেন?</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => (
            <div key={b.title} className="flex gap-4 bg-white border border-[#E1E9E4] rounded-2xl p-5">
              <span className="shrink-0 grid place-items-center w-12 h-12 rounded-xl bg-[#F3F8F4] text-[#075B35]">
                {b.icon}
              </span>
              <span>
                <span className="block font-bold text-[#054A2B] text-[17px]">{b.title}</span>
                <span className="block mt-1 text-[15px] text-[#5C6B76] leading-relaxed">{b.body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Android steps */}
      <section id="android-steps" className="bg-[#F3F8F4]">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#075B35] text-white">
              {Icon.smartphone("w-6 h-6")}
            </span>
            <h2 className="text-2xl font-bold text-[#054A2B]">Android ফোনে ইনস্টল করুন</h2>
          </div>
          <p className="text-[#5C6B76] text-[15px] mb-6">
            Samsung, Xiaomi, Vivo, Oppo, Realme — সব Android ফোনেই একই পদ্ধতি।
            {isAndroid && " আপনি Android ফোন থেকে দেখছেন — উপরের বাটনেই ইনস্টল করা যাবে।"}
          </p>
          {!installed && !justInstalled && (
            <button
              type="button"
              onClick={onInstallClick}
              disabled={busy}
              className="mb-7 inline-flex items-center gap-2.5 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-7 py-3.5 rounded-2xl"
            >
              {Icon.download("w-5 h-5")}
              {busy ? "ইনস্টল হচ্ছে..." : "এখনই ইনস্টল করুন"}
            </button>
          )}
          <div className={showSteps ? "rounded-2xl ring-2 ring-[#FF8500] ring-offset-4 ring-offset-[#F3F8F4]" : ""}>
            <h3 className="font-bold text-[#054A2B] mb-3">বাটন কাজ না করলে হাতে করে ইনস্টল করুন:</h3>
            <ol className="space-y-3">
              {[
                "Chrome ব্রাউজারে এই ওয়েবসাইটটি (mistridako.vercel.app) খুলুন।",
                "ব্রাউজারের উপরের ডানদিকের ⋮ (তিন ডট) মেনুতে চাপুন।",
                "“অ্যাপ ইনস্টল করুন” (Install app) অথবা “হোম স্ক্রিনে যোগ করুন” (Add to Home screen) অপশনটি বেছে নিন।",
                "“ইনস্টল” বাটনে চাপুন — MistriDako আইকনটি আপনার হোম স্ক্রিনে চলে আসবে।",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 bg-white border border-[#E1E9E4] rounded-xl px-4 py-3">
                  <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[#075B35] text-white text-sm font-bold">
                    {i + 1}
                  </span>
                  <span className="text-[15px] leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* iOS steps */}
      <section id="ios-steps">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#054A2B] text-white">
              {Icon.share("w-6 h-6")}
            </span>
            <h2 className="text-2xl font-bold text-[#054A2B]">iPhone / iPad-এ ইনস্টল করুন</h2>
          </div>
          <p className="text-[#5C6B76] text-[15px] mb-6">
            iPhone-এ ইনস্টল করতে Safari ব্রাউজার লাগবে (Chrome থেকে হয় না)।
            {isIOS && " আপনি iPhone/iPad থেকে দেখছেন — নিচের ধাপগুলোই আপনার জন্য।"}
          </p>
          <ol className="space-y-3">
            {[
              "Safari ব্রাউজারে এই ওয়েবসাইটটি (mistridako.vercel.app) খুলুন।",
              "নিচের Share বাটনে (বাক্স থেকে তীর ওঠা আইকন) চাপুন।",
              "তালিকা থেকে “Add to Home Screen” / “হোম স্ক্রিনে যোগ করুন” বেছে নিন।",
              "ডানদিকের উপরে “Add” চাপুন — MistriDako আইকন হোম স্ক্রিনে যোগ হয়ে যাবে।",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 bg-white border border-[#E1E9E4] rounded-xl px-4 py-3">
                <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[#054A2B] text-white text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 bg-[#F3F8F4] border border-[#C9DFD2] rounded-2xl px-5 py-4 text-[15px] leading-relaxed text-[#054A2B]">
            মনে রাখুন: এটি কোনো আলাদা ডাউনলোড নয় — অ্যাপটি এই ওয়েবসাইটেরই ইনস্টল-করা সংস্করণ।
            সব সার্ভিস, বুকিং আর আপনার অ্যাকাউন্ট ঠিক ওয়েবসাইটের মতোই কাজ করবে, আর নতুন আপডেট
            এলে তা নিজে নিজেই পৌঁছে যাবে।
          </div>
        </div>
      </section>
    </div>
  );
}


// ------------------------------------------------------------------ Home

function HomePage() {
  const catalog = useCatalog();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState(getSavedLocation());
  const pros = useQuery({
    queryKey: ["home-pros"],
    queryFn: () => api.listProfessionals({}),
  });
  const reviews = useQuery({
    queryKey: ["home-reviews"],
    queryFn: () => api.getHomeReviews({ limit: 6 }),
  });
  const services = catalog.data?.services ?? [];
  const locations = catalog.data?.locations ?? [];
  const realPros = (pros.data?.professionals ?? []).slice(0, 3);

  const search = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (loc) p.set("loc", loc);
    go(`/services?${p.toString()}`);
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#F3F8F4]">
        <div className="max-w-7xl mx-auto px-4 pt-10 pb-12 lg:pt-16 lg:pb-20 grid lg:grid-cols-2 gap-10 items-center relative">
          <div className="gs-fade-up relative z-10">
            <h1 className="text-[34px] leading-[1.2] sm:text-[44px] lg:text-[48px] font-bold text-[#054A2B]">
              আপনার ঘরের সব কাজ,
              <br />
              এখন এক জায়গায়
            </h1>
            <p className="mt-4 text-[17px] sm:text-lg text-[#3d4a3d] max-w-md leading-relaxed">
              টাঙ্গাইলে যাচাই করা দক্ষ মিস্ত্রি খুঁজুন সহজে, দ্রুত এবং নিরাপদে।
            </p>
            <form
              className="mt-6 bg-white rounded-2xl shadow-[0_10px_36px_rgba(5,74,43,0.13)] border border-[#E1E9E4] p-2 flex flex-col sm:flex-row gap-2 max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <label className="flex items-center gap-2 flex-1 px-3 min-h-[48px]">
                <span className="text-[#075B35]">{Icon.search("w-5 h-5")}</span>
                <span className="sr-only">সার্ভিস খুঁজুন</span>
                <input
                  aria-label="সার্ভিস খুঁজুন"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="কী সার্ভিস প্রয়োজন? যেমন: ইলেকট্রিশিয়ান, প্লাম্বার..."
                  className="w-full outline-none text-[15px] placeholder:text-[#9aa79a] bg-transparent"
                />
              </label>
              <label className="relative flex items-center sm:border-l border-[#E1E9E4] sm:pl-3">
                <span className="text-[#075B35] pointer-events-none absolute left-3 sm:left-5">{Icon.pin("w-4 h-4")}</span>
                <span className="sr-only">এলাকা</span>
                <select
                  aria-label="এলাকা"
                  value={loc}
                  onChange={(e) => {
                    setLoc(e.target.value);
                    saveLocation(e.target.value);
                  }}
                  className="appearance-none w-full sm:w-[150px] bg-transparent pl-9 pr-7 py-3 text-[15px] font-medium cursor-pointer outline-none"
                >
                  {locations.length === 0 && <option>টাঙ্গাইল সদর</option>}
                  {locations.map((l) => (
                    <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
                  ))}
                </select>
                <span className="absolute right-2 text-[#5C6B76] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
              </label>
              <button
                type="submit"
                className="bg-[#FF8500] hover:bg-[#E67600] text-white font-bold text-[16px] px-7 py-3 rounded-xl transition-colors"
              >
                খুঁজুন
              </button>
            </form>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14.5px] font-medium text-[#054A2B]">
              {["যাচাইকৃত মিস্ত্রি", "নিরাপদ বুকিং", "নির্ভরযোগ্য সাপোর্ট"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="text-[#075B35]">{Icon.checkCircle("w-[18px] h-[18px]")}</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-[520px]">
            <img
              src={heroImg}
              alt="নির্মাণাধীন বাড়ির সামনে হাসিমুখে দাঁড়িয়ে চারজন মিস্ত্রি"
              className="w-full aspect-[4/3] lg:aspect-[5/4] object-cover rounded-[26px] shadow-[0_18px_44px_rgba(5,74,43,0.22)]"
            />
            <div className="absolute -top-1 right-4 sm:right-6 bg-[#054A2B] text-white text-center px-4 pt-2.5 pb-4 rounded-b-2xl shadow-lg">
              <p className="font-bold leading-tight text-[15px]">
                টাঙ্গাইল
                <br />
                <span className="text-[#FFC46B]">এখন আরও কাছাকাছি</span>
              </p>
              <span className="absolute left-1/2 -translate-x-1/2 -bottom-[9px] w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#054A2B]" />
            </div>
          </div>
        </div>
      </section>

      {/* Popular services */}
      <section className="max-w-7xl mx-auto px-4 py-12 lg:py-16">
        <SectionTitle>জনপ্রিয় সার্ভিসসমূহ</SectionTitle>
        {catalog.isPending ? (
          <Spinner />
        ) : catalog.isError ? (
          <ErrorBox message={errMsg(catalog.error)} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3.5">
            {services.slice(0, 7).map((s) => (
              <ServiceCard key={s.slug} service={s} />
            ))}
            <a
              href="#/services"
              className="group rounded-2xl border-2 border-[#075B35] bg-[#F3F8F4] hover:bg-[#E4F1E8] px-3 py-5 flex flex-col items-center justify-center text-center gap-2 transition-colors min-h-[132px]"
              aria-label="সব সার্ভিস দেখুন"
            >
              <span className="grid grid-cols-3 gap-1" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="w-[7px] h-[7px] rounded-full bg-[#075B35]" />
                ))}
              </span>
              <span className="font-bold text-[#075B35]">আরও দেখুন</span>
              <span className="text-[#075B35] group-hover:translate-x-0.5 transition-transform">{Icon.arrowRight("w-5 h-5")}</span>
            </a>
          </div>
        )}
      </section>

      {/* Professionals + How it works */}
      <section className="max-w-7xl mx-auto px-4 pb-12 lg:pb-16 grid lg:grid-cols-[1.65fr_1fr] gap-8 items-start">
        <div>
          <div className="flex items-end justify-between gap-3 mb-5">
            <h2 className="text-[22px] sm:text-[26px] font-bold text-[#054A2B]">যাচাইকৃত প্রফেশনালদের সাথে পরিচিত হোন</h2>
            <a href="#/professionals" className="shrink-0 text-[#075B35] font-semibold text-[15px] hover:underline inline-flex items-center gap-1">
              সব মিস্ত্রি দেখুন {Icon.arrowRight("w-4 h-4")}
            </a>
          </div>
          {pros.isPending ? (
            <Spinner />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {realPros.map((p) => (
                <ProCard key={p.id} pro={p} />
              ))}
              {Array.from({ length: Math.max(0, 3 - realPros.length) }).map((_, i) => (
                <DemoProCard key={i} index={i} />
              ))}
            </div>
          )}
          {realPros.length === 0 && !pros.isPending && (
            <p className="mt-4 text-sm text-[#5C6B76]">
              এখনো কোনো যাচাইকৃত প্রফেশনাল যুক্ত হননি — নিচের কার্ডগুলো শুধু নমুনা। প্রফেশনালরা নিবন্ধন করলে ও অ্যাডমিন যাচাই করলে এখানে আসল প্রোফাইল দেখা যাবে।
            </p>
          )}
        </div>
        <div className="bg-[#F3F8F4] rounded-3xl p-6 sm:p-7">
          <h2 className="text-[22px] sm:text-[24px] font-bold text-[#054A2B] mb-6">কিভাবে কাজ করে?</h2>
          <HowSteps />
          <a href="#/services" className="mt-6 inline-flex items-center gap-2 bg-[#075B35] hover:bg-[#054A2B] text-white font-semibold px-5 py-2.5 rounded-xl">
            সার্ভিস খুঁজুন {Icon.arrowRight("w-4 h-4")}
          </a>
        </div>
      </section>

      {/* Why choose */}
      <section className="bg-[#FAFCFB] border-y border-[#E1E9E4]">
        <div className="max-w-7xl mx-auto px-4 py-12 lg:py-16">
          <SectionTitle sub="আস্থা আর সহজ অভিজ্ঞতাই আমাদের অঙ্গীকার">কেন MistriDako বেছে নেবেন?</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Icon.badgeCheck("w-7 h-7"), title: "যাচাইকৃত প্রফেশনাল", body: "প্রতিটি প্রফেশনালের পরিচয় ও দক্ষতা অ্যাডমিন যাচাই করার পরই প্রোফাইল প্রকাশিত হয়।" },
              { icon: Icon.calendar("w-7 h-7"), title: "সহজ বুকিং", body: "কয়েকটি সহজ ধাপে বুকিং রিকোয়েস্ট পাঠান — কোনো জটিলতা ছাড়াই।" },
              { icon: Icon.pin("w-7 h-7"), title: "স্থানীয় সার্ভিস নেটওয়ার্ক", body: "টাঙ্গাইলের ১২টি উপজেলার স্থানীয় মিস্ত্রি — দ্রুত সেবা, কম অপেক্ষা।" },
              { icon: Icon.wallet("w-7 h-7"), title: "স্বচ্ছ মূল্য", body: "কাজ শুরুর আগে কোটেশন জেনে নিন; সম্মতি ছাড়া কোনো চূড়ান্ত মূল্য নয়।" },
              { icon: Icon.message("w-7 h-7"), title: "গ্রাহক সাপোর্ট", body: "বুকিং নিয়ে যেকোনো সমস্যায় অভিযোগ জানান — আমরা সমাধান করে জানিয়ে দেবো।" },
              { icon: Icon.star(true, "w-7 h-7"), title: "আসল গ্রাহক রিভিউ", body: "শুধুমাত্র সম্পন্ন কাজের গ্রাহকদের যাচাইকৃত রিভিউ প্রকাশিত হয়।" },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-[#E1E9E4] bg-white p-5 hover:shadow-[0_10px_28px_rgba(5,74,43,0.08)] transition-shadow">
                <span className="inline-grid place-items-center w-12 h-12 rounded-xl bg-[#F3F8F4] text-[#075B35] mb-3">{c.icon}</span>
                <h3 className="font-bold text-[#054A2B]">{c.title}</h3>
                <p className="mt-1.5 text-sm text-[#5C6B76] leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews + join banner */}
      <section className="max-w-7xl mx-auto px-4 py-12 lg:py-16 grid lg:grid-cols-[1.65fr_1fr] gap-8 items-start">
        <div>
          <div className="flex items-end justify-between gap-3 mb-5">
            <h2 className="text-[22px] sm:text-[26px] font-bold text-[#054A2B]">আমাদের গ্রাহকদের মতামত</h2>
          </div>
          {reviews.isPending ? (
            <Spinner />
          ) : (reviews.data?.reviews.length ?? 0) === 0 ? (
            <EmptyState
              title="এখনো কোনো রিভিউ নেই"
              body="প্রথম গ্রাহকদের কাজ সম্পন্ন হলে তাদের আসল মতামত এখানে দেখা যাবে। আমরা কোনো নমুনা বা বানানো প্রশংসা দেখাই না।"
              action={
                <a href="#/services" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">
                  প্রথম বুকিংটি করুন
                </a>
              }
            />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {reviews.data?.reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}
        </div>
        <div className="relative overflow-hidden rounded-3xl bg-[#075B35] text-white">
          <img src={mistriImg} alt="হাসিমুখে টুলবক্স হাতে একজন মিস্ত্রি" className="absolute inset-0 w-full h-full object-cover opacity-25" loading="lazy" />
          <div className="relative p-7 sm:p-8">
            <h2 className="text-[24px] sm:text-[28px] font-bold leading-snug">আপনি কি একজন দক্ষ মিস্ত্রি?</h2>
            <p className="mt-2 text-white/85 text-[15.5px]">MistriDako-তে যুক্ত হয়ে আপনার কাজের সুযোগ বাড়ান।</p>
            <a
              href="#/join"
              className="mt-5 inline-flex items-center gap-2 bg-[#FF8500] hover:bg-[#E67600] text-white font-bold px-5 py-3 rounded-xl"
            >
              এখনই রেজিস্ট্রেশন করুন {Icon.arrowRight("w-4 h-4")}
            </a>
            <p className="mt-3 text-white/70 text-[13px]">নিবন্ধনের পর অ্যাডমিন যাচাই সম্পন্ন হলেই প্রোফাইল প্রকাশিত হবে।</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function HowSteps() {
  const steps = [
    { icon: Icon.search("w-8 h-8"), title: "সার্ভিস খুঁজুন", body: "আপনার এলাকার প্রয়োজনীয় মিস্ত্রি খুঁজুন।" },
    { icon: Icon.calendar("w-8 h-8"), title: "বুক করুন", body: "কাজের বিবরণ ও সময় দিয়ে বুকিং পাঠান।" },
    { icon: Icon.home("w-8 h-8"), title: "কাজ সম্পন্ন করুন", body: "কোটেশন অনুমোদন করলেই মূল্য চূড়ান্ত হয় — তারপর প্রফেশনাল এসে কাজ সম্পন্ন করবেন।" },
  ];
  return (
    <ol className="grid sm:grid-cols-3 gap-3">
      {steps.map((s, i) => (
        <li key={s.title} className="relative bg-white rounded-2xl border border-[#E1E9E4] p-4 text-center">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#075B35] text-white text-[13px] font-bold grid place-items-center font-en">
            {i + 1}
          </span>
          <span className="inline-grid place-items-center w-[52px] h-[52px] rounded-full bg-[#F3F8F4] text-[#075B35] mt-2">{s.icon}</span>
          <h3 className="mt-2.5 font-bold text-[#054A2B]">{s.title}</h3>
          <p className="mt-1 text-[13.5px] text-[#5C6B76] leading-relaxed">{s.body}</p>
          {i < 2 && (
            <span className="hidden sm:block absolute top-1/2 -right-[13px] z-10 text-[#075B35]">{Icon.arrowRight("w-4 h-4")}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ServiceCard({ service }: { service: Service }) {
  return (
    <a
      href={`#/service/${service.slug}`}
      className="group rounded-2xl border border-[#E1E9E4] bg-white px-3 py-5 flex flex-col items-center text-center gap-2 hover:border-[#075B35] hover:shadow-[0_10px_28px_rgba(5,74,43,0.10)] transition-all min-h-[132px]"
      aria-label={`${service.nameBn} সার্ভিস দেখুন`}
    >
      <span className="grid place-items-center w-12 h-12 rounded-full bg-[#F3F8F4] text-[#075B35] group-hover:bg-[#075B35] group-hover:text-white transition-colors">
        <ServiceIcon icon={service.icon} className="w-6 h-6" />
      </span>
      <span className="font-bold text-[#172B3A] leading-tight">{service.nameBn}</span>
      {service.tagline && <span className="text-[12.5px] text-[#5C6B76] leading-tight line-clamp-2">{service.tagline}</span>}
    </a>
  );
}

export function ProCard({ pro }: { pro: Pro }) {
  return (
    <article className="rounded-2xl border border-[#E1E9E4] bg-white p-4 flex flex-col hover:shadow-[0_10px_28px_rgba(5,74,43,0.09)] transition-shadow">
      <div className="flex items-start gap-3">
        <Avatar name={pro.name} photoUrl={pro.photoUrl} size="w-14 h-14" />
        <div className="min-w-0">
          <p className="font-bold text-[#172B3A] leading-tight truncate">{pro.name}</p>
          <p className="text-[13.5px] text-[#5C6B76]">{pro.categoryName}</p>
          <span className="inline-flex items-center gap-1 mt-1 bg-[#075B35] text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
            {Icon.badgeCheck("w-3.5 h-3.5")} যাচাইকৃত
          </span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13.5px] text-[#43534B]">
        {pro.avgRating != null ? (
          <p className="flex items-center gap-1.5">
            <Stars value={pro.avgRating} /> <span className="font-semibold">{pro.avgRating}</span>
            <span className="text-[#5C6B76]">({pro.completedJobs}টি কাজ সম্পন্ন)</span>
          </p>
        ) : (
          <p className="text-[#5C6B76]">এখনো কোনো রিভিউ পাননি • {pro.completedJobs}টি কাজ সম্পন্ন</p>
        )}
        <p className="flex items-center gap-1.5">
          {Icon.briefcase("w-4 h-4")} অভিজ্ঞতা: {pro.experienceYears} বছর
        </p>
        <p className="flex items-center gap-1.5">
          <span className="text-[#075B35]">{Icon.pin("w-4 h-4")}</span>
          {pro.areas.slice(0, 2).join(", ") || "টাঙ্গাইল"}
        </p>
      </div>
      <div className="mt-4 flex gap-2 mt-auto pt-1">
        <a
          href={`tel:${pro.phone}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 border-[1.5px] border-[#075B35] text-[#075B35] font-semibold text-sm px-3 py-2 rounded-xl hover:bg-[#F3F8F4]"
          aria-label={`${pro.name}-কে কল করুন`}
        >
          {Icon.phone("w-4 h-4")} কল করুন
        </a>
        <a
          href={`#/pro/${pro.id}`}
          className="flex-1 inline-flex items-center justify-center bg-[#075B35] hover:bg-[#054A2B] text-white font-semibold text-sm px-3 py-2 rounded-xl"
        >
          প্রোফাইল
        </a>
      </div>
    </article>
  );
}

const DEMO_PROS = [
  { name: "মো. রফিকুল ইসলাম", cat: "ইলেকট্রিশিয়ান", loc: "টাঙ্গাইল সদর" },
  { name: "মো. সোহেল রানা", cat: "প্লাম্বার", loc: "ঘাটাইল" },
  { name: "মো. আব্দুল করিম", cat: "রাজমিস্ত্রি", loc: "টাঙ্গাইল সদর" },
];

function DemoProCard({ index }: { index: number }) {
  const d = DEMO_PROS[index % DEMO_PROS.length] ?? DEMO_PROS[0]!;
  return (
    <article className="relative rounded-2xl border border-dashed border-[#C9DFD2] bg-[#FAFCFB] p-4 flex flex-col" aria-label="নমুনা প্রোফাইল">
      <span className="absolute top-3 right-3 bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
        নমুনা প্রোফাইল
      </span>
      <div className="flex items-start gap-3">
        <Avatar name={d.name} photoUrl={null} size="w-14 h-14" />
        <div>
          <p className="font-bold text-[#172B3A] leading-tight">{d.name}</p>
          <p className="text-[13.5px] text-[#5C6B76]">{d.cat}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-[#5C6B76]">
        <span className="text-[#075B35]">{Icon.pin("w-4 h-4")}</span> {d.loc}
      </p>
      <p className="mt-2 text-[13px] text-[#5C6B76] leading-relaxed">
        এটি একটি নমুনা কার্ড — আসল প্রফেশনাল যাচাই সম্পন্ন করে যুক্ত হলেই এখানে তার আসল তথ্য, রেটিং ও কাজের সংখ্যা দেখা যাবে।
      </p>
      <a href="#/join" className="mt-3 inline-flex items-center justify-center border-[1.5px] border-[#075B35] text-[#075B35] font-semibold text-sm px-3 py-2 rounded-xl hover:bg-[#F3F8F4]">
        মিস্ত্রি হিসেবে যোগ দিন
      </a>
    </article>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
      <Stars value={review.rating} />
      <p className="mt-2.5 text-[15px] leading-relaxed text-[#172B3A]">“{review.text}”</p>
      <footer className="mt-3.5 flex items-center gap-2.5">
        <Avatar name={review.customerName} photoUrl={null} size="w-9 h-9" textSize="text-[13px]" />
        <div className="leading-tight">
          <p className="font-semibold text-sm">{review.customerName}</p>
          <p className="text-[12.5px] text-[#5C6B76]">
            {review.serviceName} • {fmtDate(review.createdAt)}
          </p>
        </div>
      </footer>
    </article>
  );
}

// -------------------------------------------------------------- Services

function ServicesPage({ params }: { params: URLSearchParams }) {
  const catalog = useCatalog();
  const q = params.get("q") ?? "";
  const loc = params.get("loc") ?? "";
  const [query, setQuery] = useState(q);
  const [location, setLocation] = useState(loc || getSavedLocation());
  const services = catalog.data?.services ?? [];
  const locations = catalog.data?.locations ?? [];
  const filtered = services.filter((s) => {
    if (!query.trim()) return true;
    const t = query.trim().toLowerCase();
    return (
      s.nameBn.includes(query.trim()) ||
      s.nameEn.toLowerCase().includes(t) ||
      (s.tagline ?? "").includes(query.trim())
    );
  });
  const pros = useQuery({
    queryKey: ["services-pros", location, query],
    queryFn: () => api.listProfessionals({ location, q: query || undefined }),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <SectionTitle sub="টাঙ্গাইলের সব উপজেলায় উপলব্ধ সার্ভিসসমূহ">সব সার্ভিস</SectionTitle>
      <div className="flex flex-col sm:flex-row gap-2.5 max-w-2xl mx-auto mb-8">
        <label className="flex items-center gap-2 flex-1 border border-[#E1E9E4] rounded-xl px-3.5 bg-white focus-within:border-[#075B35]">
          <span className="text-[#075B35]">{Icon.search("w-5 h-5")}</span>
          <span className="sr-only">সার্ভিস খুঁজুন</span>
          <input
            aria-label="সার্ভিস খুঁজুন"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="সার্ভিসের নাম লিখুন…"
            className="w-full py-3 outline-none text-[15px] bg-transparent"
          />
        </label>
        <label className="relative flex items-center">
          <span className="sr-only">এলাকা</span>
          <select
            aria-label="এলাকা অনুযায়ী ফিল্টার"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              saveLocation(e.target.value);
            }}
            className="w-full sm:w-[190px] appearance-none border border-[#E1E9E4] rounded-xl pl-4 pr-9 py-3 bg-white font-medium cursor-pointer"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
            ))}
          </select>
          <span className="absolute right-3 text-[#5C6B76] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
        </label>
      </div>

      {catalog.isPending ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState title="কোনো সার্ভিস মেলেনি" body="অন্য নামে খুঁজে দেখুন — যেমন 'ইলেকট্রিশিয়ান' বা 'প্লাম্বার'।" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {filtered.map((s) => (
            <ServiceCard key={s.slug} service={s} />
          ))}
        </div>
      )}

      <h2 className="text-[22px] font-bold text-[#054A2B] mt-12 mb-1.5">
        {location} এলাকার যাচাইকৃত প্রফেশনাল
      </h2>
      <p className="text-sm text-[#5C6B76] mb-5">শুধুমাত্র আপনার বেছে নেওয়া এলাকায় সেবা দেন এমন প্রফেশনালদের দেখানো হচ্ছে।</p>
      {pros.isPending ? (
        <Spinner />
      ) : (pros.data?.professionals.length ?? 0) === 0 ? (
        <EmptyState
          title="এই এলাকায় এখনো যাচাইকৃত প্রফেশনাল নেই"
          body="তবু বুকিং করতে পারবেন — অ্যাডমিন আপনার এলাকার উপযুক্ত প্রফেশনাল খুঁজে অ্যাসাইন করে দেবেন।"
          action={
            <a href="#/services" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">
              সার্ভিস বেছে বুকিং করুন
            </a>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pros.data?.professionals.map((p) => <ProCard key={p.id} pro={p} />)}
        </div>
      )}
    </div>
  );
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "বুকিং করার পর কী হবে?",
    a: "আপনার বুকিং রিকোয়েস্ট প্রথমে অ্যাডমিনের কাছে যাবে। অ্যাডমিন কাজের বিবরণ দেখে উপযুক্ত যাচাইকৃত প্রফেশনাল অ্যাসাইন করবেন এবং বুকিং নিশ্চিত করলে আপনি নোটিফিকেশন পাবেন।",
  },
  {
    q: "মূল্য কীভাবে নির্ধারণ হয়?",
    a: "কাজের ধরন ও পরিমাণ অনুযায়ী মূল্য নির্ধারণ করা হবে। বুকিংয়ের পর অ্যাডমিন বা প্রফেশনাল কাজ দেখে কোটেশন জানাবেন — আপনার সম্মতি ছাড়া কাজ শুরু হবে না।",
  },
  {
    q: "পেমেন্ট কীভাবে করবো?",
    a: "আপাতত কাজ শেষে নগদ (ক্যাশ) পেমেন্ট প্রযোজ্য। অনলাইন পেমেন্ট সুবিধা এলে এখানে জানিয়ে দেওয়া হবে।",
  },
  {
    q: "বুকিং বাতিল করা যাবে কি?",
    a: "কাজ শুরু হওয়ার আগে 'আমার বুকিং' থেকে বুকিং বাতিল করা যাবে। কাজ চলমান থাকলে সাপোর্টে অভিযোগ/অনুরোধ পাঠান।",
  },
];

function ServiceDetailPage({ slug }: { slug: string }) {
  const catalog = useCatalog();
  const service = catalog.data?.services.find((s) => s.slug === slug);
  const pros = useQuery({
    queryKey: ["svc-pros", slug],
    queryFn: () => api.listProfessionals({ category: slug }),
    enabled: !!slug,
  });
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (!service) return;
    const meta = serviceMeta(service);
    applySeo(meta, [
      breadcrumbLd([
        { name: "হোম", path: "/" },
        { name: "সার্ভিসসমূহ", path: "/services" },
        { name: service.nameBn, path: meta.clean },
      ]),
      serviceLd(service),
    ]);
  }, [service]);

  if (catalog.isPending) return <Spinner />;
  if (!service) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14">
        <EmptyState
          title="সার্ভিসটি পাওয়া যায়নি"
          body="সার্ভিসটি হয়তো সরানো হয়েছে বা এখন সক্রিয় নেই।"
          action={<a href="#/services" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">সব সার্ভিস দেখুন</a>}
        />
      </div>
    );
  }
  const img = SERVICE_IMG[service.slug];
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
      <nav aria-label="ব্রেডক্রাম্ব" className="text-[14px] text-[#5C6B76]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><a href="#/" className="hover:text-[#075B35] hover:underline">হোম</a></li>
          <li aria-hidden="true">/</li>
          <li><a href="#/services" className="hover:text-[#075B35] hover:underline">সার্ভিসসমূহ</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-[#172B3A]">{service.nameBn}</li>
        </ol>
      </nav>
      <div className="mt-4 grid lg:grid-cols-[1.5fr_1fr] gap-8 items-start">
        <div>
          <div className="flex items-center gap-4">
            <span className="grid place-items-center w-16 h-16 rounded-2xl bg-[#F3F8F4] text-[#075B35]">
              <ServiceIcon icon={service.icon} className="w-9 h-9" />
            </span>
            <div>
              <h1 className="text-[28px] sm:text-[34px] font-bold text-[#054A2B] leading-tight">{service.nameBn}</h1>
              <p className="text-[#5C6B76] font-en">{service.nameEn}</p>
            </div>
          </div>
          {img && (
            <img
              src={img}
              alt={`${service.nameBn} কাজ করছেন`}
              className="mt-6 w-full aspect-[16/8] object-cover rounded-3xl"
              loading="lazy"
            />
          )}
          {service.tagline && <p className="mt-6 text-lg font-medium text-[#172B3A]">{service.tagline}</p>}
          {service.description && <p className="mt-2 text-[16px] leading-relaxed text-[#43534B]">{service.description}</p>}

          <h2 className="text-[21px] font-bold text-[#054A2B] mt-10 mb-4">এই সার্ভিসের যাচাইকৃত প্রফেশনাল</h2>
          {pros.isPending ? (
            <Spinner />
          ) : (pros.data?.professionals.length ?? 0) === 0 ? (
            <EmptyState
              title="এখনো কোনো যাচাইকৃত প্রফেশনাল যুক্ত হননি"
              body="তবু বুকিং করতে পারবেন — অ্যাডমিন উপযুক্ত প্রফেশনাল খুঁজে অ্যাসাইন করে দেবেন।"
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {pros.data?.professionals.map((p) => <ProCard key={p.id} pro={p} />)}
            </div>
          )}

          <h2 className="text-[21px] font-bold text-[#054A2B] mt-10 mb-4">সাধারণ জিজ্ঞাসা</h2>
          <div className="divide-y divide-[#E1E9E4] border border-[#E1E9E4] rounded-2xl bg-white overflow-hidden">
            {FAQS.map((f, i) => (
              <div key={f.q}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-semibold text-[#172B3A]"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                >
                  {f.q}
                  <span className={`text-[#075B35] transition-transform ${openFaq === i ? "rotate-180" : ""}`}>{Icon.chevronDown("w-5 h-5")}</span>
                </button>
                {openFaq === i && <p className="px-5 pb-4 text-[15px] text-[#43534B] leading-relaxed">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="lg:sticky lg:top-24 space-y-4">
          <PriceBlock service={service} />
          <a
            href={`#/book?service=${service.slug}`}
            className="flex items-center justify-center gap-2 w-full bg-[#FF8500] hover:bg-[#E67600] text-white font-bold text-[17px] px-5 py-3.5 rounded-2xl"
          >
            এখনই বুকিং করুন {Icon.arrowRight("w-5 h-5")}
          </a>
          <p className="text-center text-[13.5px] text-[#5C6B76]">বুকিং সম্পূর্ণ ফ্রি — মূল্য দিতে হবে কাজ শেষে।</p>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- Professionals

function ProfessionalsPage({ params }: { params: URLSearchParams }) {
  const catalog = useCatalog();
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [location, setLocation] = useState(params.get("loc") ?? "");
  const [query, setQuery] = useState("");
  const pros = useQuery({
    queryKey: ["pros", category, location, query],
    queryFn: () =>
      api.listProfessionals({
        category: category || undefined,
        location: location || undefined,
        q: query || undefined,
      }),
  });
  const services = catalog.data?.services ?? [];
  const locations = catalog.data?.locations ?? [];
  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <SectionTitle sub="শুধুমাত্র অ্যাডমিন-যাচাইকৃত প্রফেশনালদের তালিকা">যাচাইকৃত প্রফেশনালগণ</SectionTitle>
      <div className="flex flex-col md:flex-row gap-2.5 max-w-3xl mx-auto mb-8">
        <label className="flex items-center gap-2 flex-1 border border-[#E1E9E4] rounded-xl px-3.5 bg-white focus-within:border-[#075B35]">
          <span className="text-[#075B35]">{Icon.search("w-5 h-5")}</span>
          <span className="sr-only">নাম বা দক্ষতা খুঁজুন</span>
          <input
            aria-label="নাম বা দক্ষতা খুঁজুন"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="নাম বা দক্ষতা খুঁজুন…"
            className="w-full py-3 outline-none text-[15px] bg-transparent"
          />
        </label>
        <label className="relative">
          <span className="sr-only">ক্যাটাগরি</span>
          <select
            aria-label="ক্যাটাগরি অনুযায়ী ফিল্টার"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full md:w-[200px] appearance-none border border-[#E1E9E4] rounded-xl pl-4 pr-9 py-3 bg-white font-medium cursor-pointer"
          >
            <option value="">সব ক্যাটাগরি</option>
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>{s.nameBn}</option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C6B76] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
        </label>
        <label className="relative">
          <span className="sr-only">এলাকা</span>
          <select
            aria-label="এলাকা অনুযায়ী ফিল্টার"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full md:w-[190px] appearance-none border border-[#E1E9E4] rounded-xl pl-4 pr-9 py-3 bg-white font-medium cursor-pointer"
          >
            <option value="">সব এলাকা</option>
            {locations.map((l) => (
              <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C6B76] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
        </label>
      </div>
      {pros.isPending ? (
        <Spinner />
      ) : pros.isError ? (
        <ErrorBox message={errMsg(pros.error)} />
      ) : (pros.data?.professionals.length ?? 0) === 0 ? (
        <EmptyState
          title="কোনো প্রফেশনাল পাওয়া যায়নি"
          body="এই ফিল্টারে এখনো কোনো যাচাইকৃত প্রফেশনাল নেই। ফিল্টার বদলে দেখুন, অথবা সরাসরি সার্ভিস বুক করুন — অ্যাডমিন প্রফেশনাল খুঁজে দেবেন।"
          action={
            <a href="#/services" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">
              সার্ভিস দেখুন
            </a>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pros.data?.professionals.map((p) => <ProCard key={p.id} pro={p} />)}
        </div>
      )}
    </div>
  );
}

function ProProfilePage({ id }: { id: number }) {
  const data = useQuery({
    queryKey: ["pro-profile", id],
    queryFn: () => api.getProfessional({ id }),
    enabled: id > 0,
  });
  const pro = data.data?.professional;
  useEffect(() => {
    if (!pro) return;
    const meta = proMeta(pro);
    applySeo(meta, [
      breadcrumbLd([
        { name: "হোম", path: "/" },
        { name: "প্রফেশনাল", path: "/professionals" },
        { name: pro.name, path: meta.clean },
      ]),
      personLd(pro),
    ]);
  }, [pro]);
  if (data.isPending) return <Spinner />;
  if (!pro) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14">
        <EmptyState
          title="প্রোফাইলটি পাওয়া যায়নি"
          body="এই প্রফেশনালের প্রোফাইল এখন প্রকাশিত নয়।"
          action={<a href="#/professionals" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">সব প্রফেশনাল দেখুন</a>}
        />
      </div>
    );
  }
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 lg:py-12">
      <nav aria-label="ব্রেডক্রাম্ব" className="text-[14px] text-[#5C6B76]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><a href="#/" className="hover:text-[#075B35] hover:underline">হোম</a></li>
          <li aria-hidden="true">/</li>
          <li><a href="#/professionals" className="hover:text-[#075B35] hover:underline">প্রফেশনাল</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-[#172B3A]">{pro.name}</li>
        </ol>
      </nav>
      <div className="mt-4 rounded-3xl border border-[#E1E9E4] bg-white p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-5">
          <Avatar name={pro.name} photoUrl={pro.photoUrl} size="w-24 h-24" textSize="text-3xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold text-[#054A2B]">{pro.name}</h1>
              <span className="inline-flex items-center gap-1 bg-[#075B35] text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                {Icon.badgeCheck("w-4 h-4")} যাচাইকৃত
              </span>
              <span
                className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${pro.available ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
              >
                {pro.available ? "এখন কাজ নিতে পারবেন" : "এখন ব্যস্ত আছেন"}
              </span>
            </div>
            <p className="mt-1 text-[#5C6B76]">
              {pro.categoryName} • {pro.experienceYears} বছরের অভিজ্ঞতা
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
              {pro.avgRating != null ? (
                <span className="flex items-center gap-1.5">
                  <Stars value={pro.avgRating} /> <b>{pro.avgRating}</b>
                  <span className="text-[#5C6B76]">({pro.reviewCount}টি রিভিউ)</span>
                </span>
              ) : (
                <span className="text-[#5C6B76]">এখনো কোনো রিভিউ নেই</span>
              )}
              <span className="text-[#43534B]">{pro.completedJobs}টি কাজ সম্পন্ন</span>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[15px] text-[#43534B]">
              <span className="text-[#075B35] mt-0.5">{Icon.pin("w-4 h-4")}</span>
              সেবার এলাকা: {pro.areas.join(", ") || "টাঙ্গাইল"}
            </p>
          </div>
        </div>
        {pro.bio && (
          <div className="mt-6">
            <h2 className="font-bold text-[#054A2B] mb-1.5">পরিচিতি</h2>
            <p className="text-[15.5px] leading-relaxed text-[#43534B]">{pro.bio}</p>
          </div>
        )}
        {pro.skills && (
          <div className="mt-5">
            <h2 className="font-bold text-[#054A2B] mb-1.5">দক্ষতা ও বিশেষত্ব</h2>
            <p className="text-[15.5px] text-[#43534B]">{pro.skills}</p>
          </div>
        )}
        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <a
            href={`tel:${pro.phone}`}
            className="flex-1 inline-flex items-center justify-center gap-2 border-[1.5px] border-[#075B35] text-[#075B35] font-bold px-5 py-3 rounded-xl hover:bg-[#F3F8F4]"
            aria-label={`${pro.name}-কে কল করুন`}
          >
            {Icon.phone("w-5 h-5")} কল করুন
          </a>
          <a
            href={`#/book?service=${pro.categorySlug}&pro=${pro.id}`}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FF8500] hover:bg-[#E67600] text-white font-bold px-5 py-3 rounded-xl"
          >
            এই প্রফেশনালকে বুক করুন {Icon.arrowRight("w-4 h-4")}
          </a>
        </div>
      </div>

      <h2 className="text-[21px] font-bold text-[#054A2B] mt-10 mb-4">গ্রাহকদের রিভিউ</h2>
      {(data.data?.reviews.length ?? 0) === 0 ? (
        <EmptyState title="এখনো কোনো রিভিউ নেই" body="এই প্রফেশনালের সম্পন্ন কাজের রিভিউ এখানে দেখা যাবে।" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {data.data?.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Auth

export const inputCls =
  "w-full border border-[#E1E9E4] rounded-xl px-3.5 py-2.5 text-[15px] bg-white outline-none focus:border-[#075B35] focus:ring-2 focus:ring-[#075B35]/15";
export const labelCls = "block text-sm font-semibold text-[#172B3A] mb-1.5";

export function PhotoField({
  label,
  onPick,
  fileName,
}: {
  label: string;
  onPick: (img: { dataBase64: string; mimeType: string } | undefined) => void;
  fileName: string;
}) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <label className="flex items-center gap-3 border border-dashed border-[#C9DFD2] rounded-xl px-3.5 py-3 cursor-pointer hover:bg-[#F3F8F4]">
        <span className="text-[#075B35]">{Icon.camera("w-5 h-5")}</span>
        <span className="text-sm text-[#43534B] truncate">{fileName || "ছবি বেছে নিন (ঐচ্ছিক)"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={label}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const { fileToImage } = await import("./lib");
            onPick(await fileToImage(f));
          }}
        />
      </label>
    </div>
  );
}

function useSessionRedirect() {
  const qc = useQueryClient();
  return (token: string, role: string, next: string | null) => {
    setToken(token);
    qc.invalidateQueries({ queryKey: ["me"] });
    if (next) go(next);
    else if (role === "admin") go("/admin");
    else if (role === "professional") go("/pro-dashboard");
    else go("/dashboard");
  };
}

function AuthShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="bg-[#F3F8F4] min-h-[70vh]">
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl border border-[#E1E9E4] shadow-[0_14px_40px_rgba(5,74,43,0.08)] p-6 sm:p-8 gs-fade-up">
          <h1 className="text-[24px] font-bold text-[#054A2B]">{title}</h1>
          <p className="mt-1 text-[15px] text-[#5C6B76]">{sub}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ params }: { params: URLSearchParams }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const redirect = useSessionRedirect();
  const meta = useQuery({ queryKey: ["public-meta"], queryFn: () => api.getPublicMeta({}) });
  const login = useMutation({
    mutationFn: () => api.login({ phone: phone.trim(), password }),
    onSuccess: (r) => redirect(r.token, r.user.role, params.get("next")),
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <AuthShell title="লগইন করুন" sub="আপনার মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে লগইন করুন।">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          login.mutate();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="login-phone">মোবাইল নম্বর</label>
          <input
            id="login-phone"
            className={inputCls}
            inputMode="numeric"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="login-pass">পাসওয়ার্ড</label>
          <input
            id="login-pass"
            type="password"
            className={inputCls}
            {...FIELDS.login.password}
            autoComplete="current-password"
            placeholder="আপনার পাসওয়ার্ড"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <ErrorBox message={error} />}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold py-3 rounded-xl"
        >
          {login.isPending ? "লগইন হচ্ছে…" : "লগইন"}
        </button>
      </form>
      <div className="mt-5 text-[15px] text-[#43534B] space-y-2">
        <p>
          অ্যাকাউন্ট নেই?{" "}
          <a className="text-[#075B35] font-semibold hover:underline" href="#/register">গ্রাহক হিসেবে নিবন্ধন করুন</a>
        </p>
        <p>
          মিস্ত্রি হিসেবে কাজ করতে চান?{" "}
          <a className="text-[#075B35] font-semibold hover:underline" href="#/join">প্রফেশনাল নিবন্ধন</a>
        </p>
        {meta.data && !meta.data.adminExists && (
          <p className="pt-2 border-t border-[#EEF3F0]">
            প্ল্যাটফর্ম মালিক?{" "}
            <a className="text-[#FF8500] font-semibold hover:underline" href="#/admin-setup">প্রথম অ্যাডমিন অ্যাকাউন্ট সেটআপ করুন</a>
          </p>
        )}
      </div>
    </AuthShell>
  );
}

function RegisterPage({ params }: { params: URLSearchParams }) {
  const catalog = useCatalog();
  const redirect = useSessionRedirect();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState(getSavedLocation());
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [photoName, setPhotoName] = useState("");
  const [error, setError] = useState("");
  const reg = useMutation({
    mutationFn: () =>
      api.registerCustomer({
        name,
        phone: phone.trim(),
        password,
        location,
        address: address || undefined,
        photo,
      }),
    onSuccess: (r) => redirect(r.token, r.user.role, params.get("next")),
    onError: (e) => setError(errMsg(e)),
  });
  const locations = catalog.data?.locations ?? [];
  return (
    <AuthShell title="গ্রাহক নিবন্ধন" sub="বুকিং করতে একটি ফ্রি অ্যাকাউন্ট খুলুন।">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          reg.mutate();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="reg-name">আপনার নাম *</label>
          <input id="reg-name" className={inputCls} {...FIELDS.registerCustomer.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="পুরো নাম লিখুন" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-phone">মোবাইল নম্বর *</label>
          <input id="reg-phone" className={inputCls} inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-pass">পাসওয়ার্ড *</label>
          <input id="reg-pass" type="password" className={inputCls} {...FIELDS.registerCustomer.password} autoComplete="new-password" placeholder="কমপক্ষে ১২ অক্ষর" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-loc">আপনার উপজেলা</label>
          <select id="reg-loc" className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-addr">ঠিকানা</label>
          <input id="reg-addr" className={inputCls} {...FIELDS.registerCustomer.address} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="গ্রাম / এলাকা, বাসার বিবরণ" />
        </div>
        <PhotoField
          label="প্রোফাইল ছবি"
          fileName={photoName}
          onPick={(img) => {
            setPhoto(img);
            setPhotoName(img ? "ছবি যুক্ত হয়েছে" : "");
          }}
        />
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={reg.isPending} className="w-full bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold py-3 rounded-xl">
          {reg.isPending ? "অ্যাকাউন্ট তৈরি হচ্ছে…" : "নিবন্ধন করুন"}
        </button>
      </form>
      <p className="mt-5 text-[15px] text-[#43534B]">
        ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
        <a className="text-[#075B35] font-semibold hover:underline" href="#/login">লগইন করুন</a>
      </p>
    </AuthShell>
  );
}

function JoinProPage({ params }: { params: URLSearchParams }) {
  const catalog = useCatalog();
  const redirect = useSessionRedirect();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [experience, setExperience] = useState("1");
  const [skills, setSkills] = useState("");
  const [areas, setAreas] = useState<string[]>([getSavedLocation()]);
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [nid, setNid] = useState("");
  const [nidFront, setNidFront] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [nidFrontName, setNidFrontName] = useState("");
  const [nidBack, setNidBack] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [nidBackName, setNidBackName] = useState("");
  const [photo, setPhoto] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [photoName, setPhotoName] = useState("");
  const [error, setError] = useState("");
  const services = catalog.data?.services ?? [];
  const locations = catalog.data?.locations ?? [];
  const reg = useMutation({
    mutationFn: () =>
      api.registerProfessional({
        name,
        phone: phone.trim(),
        password,
        email: email || undefined,
        categorySlug: category,
        experienceYears: Number(experience) || 0,
        skills: skills || undefined,
        areas,
        address: address || undefined,
        bio: bio || undefined,
        nidNumber: nid.trim(),
        nidFrontPhoto: nidFront,
        nidBackPhoto: nidBack,
        photo,
      }),
    onSuccess: (r) => redirect(r.token, r.user.role, params.get("next")),
    onError: (e) => setError(errMsg(e)),
  });
  const toggleArea = (a: string) =>
    setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  return (
    <div className="bg-[#F3F8F4] min-h-[70vh]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl border border-[#E1E9E4] shadow-[0_14px_40px_rgba(5,74,43,0.08)] p-6 sm:p-8 gs-fade-up">
          <h1 className="text-[24px] font-bold text-[#054A2B]">প্রফেশনাল হিসেবে যোগ দিন</h1>
          <p className="mt-1 text-[15px] text-[#5C6B76]">
            তথ্য জমা দিন — অ্যাডমিন যাচাই সম্পন্ন হলে আপনার প্রোফাইল গ্রাহকদের কাছে প্রকাশিত হবে এবং কাজ পেতে শুরু করবেন।
          </p>
          <form
            className="mt-6 grid sm:grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (!category) return setError("আপনার কাজের ক্যাটাগরি বেছে নিন।");
              if (areas.length === 0) return setError("কমপক্ষে একটি সেবার এলাকা বেছে নিন।");
              if (!nid.trim()) return setError("যাচাইয়ের জন্য আপনার NID নম্বর দিন।");
              if (!nidFront || !nidBack) return setError("পরিচয় যাচাইয়ের জন্য NID কার্ডের সামনের ও পেছনের ছবি দিন।");
              reg.mutate();
            }}
          >
            <div>
              <label className={labelCls} htmlFor="jp-name">পুরো নাম *</label>
              <input id="jp-name" className={inputCls} {...FIELDS.registerProfessional.name} value={name} onChange={(e) => setName(e.target.value)} required placeholder="আপনার নাম" />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-phone">মোবাইল নম্বর *</label>
              <input id="jp-phone" className={inputCls} inputMode="numeric" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-pass">পাসওয়ার্ড *</label>
              <input id="jp-pass" type="password" className={inputCls} {...FIELDS.registerProfessional.password} autoComplete="new-password" placeholder="কমপক্ষে ১২ অক্ষর" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-email">ইমেইল (ঐচ্ছিক)</label>
              <input id="jp-email" type="email" className={inputCls} {...FIELDS.registerProfessional.email} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-cat">কাজের ক্যাটাগরি *</label>
              <select id="jp-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="">— বেছে নিন —</option>
                {services.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.nameBn}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-exp">অভিজ্ঞতা (বছর) *</label>
              <input id="jp-exp" type="number" {...FIELDS.registerProfessional.experienceYears} className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-skills">দক্ষতা ও বিশেষত্ব</label>
              <input id="jp-skills" className={inputCls} {...FIELDS.registerProfessional.skills} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="যেমন: বাসার ওয়ারিং, IPS লাইন, সুইচবোর্ড" />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className={labelCls}>সেবার এলাকা (যেসব উপজেলায় কাজ করবেন) *</legend>
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => {
                  const on = areas.includes(l.nameBn);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleArea(l.nameBn)}
                      aria-pressed={on}
                      className={`px-3.5 py-2 rounded-full text-sm font-medium border ${
                        on ? "bg-[#075B35] text-white border-[#075B35]" : "bg-white text-[#43534B] border-[#E1E9E4]"
                      }`}
                    >
                      {l.nameBn}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-addr">ঠিকানা</label>
              <input id="jp-addr" className={inputCls} {...FIELDS.registerProfessional.address} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="গ্রাম / এলাকা, উপজেলা" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-nid">জাতীয় পরিচয়পত্র (NID) নম্বর *</label>
              <input id="jp-nid" className={inputCls} {...FIELDS.registerProfessional.nidNumber} inputMode="numeric" value={nid} onChange={(e) => setNid(e.target.value)} placeholder="যাচাইয়ের জন্য NID নম্বর" />
              <p className="mt-1 text-[13px] text-[#5C6B76]">আপনার NID নম্বর ও ডকুমেন্ট শুধুমাত্র অ্যাডমিন যাচাইয়ের জন্য ব্যবহার হবে — গ্রাহক বা অন্য কারো কাছে কখনো দেখানো হবে না।</p>
            </div>
            <div className="sm:col-span-2">
              <PhotoField
                label="NID কার্ডের সামনের ছবি *"
                fileName={nidFrontName}
                onPick={(img) => {
                  setNidFront(img);
                  setNidFrontName(img ? "ছবি যুক্ত হয়েছে" : "");
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <PhotoField
                label="NID কার্ডের পেছনের ছবি *"
                fileName={nidBackName}
                onPick={(img) => {
                  setNidBack(img);
                  setNidBackName(img ? "ছবি যুক্ত হয়েছে" : "");
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-bio">সংক্ষিপ্ত পরিচিতি</label>
              <textarea id="jp-bio" className={inputCls} rows={3} {...FIELDS.registerProfessional.bio} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="আপনার কাজের অভিজ্ঞতা সম্পর্কে দুই-এক লাইন লিখুন" />
            </div>
            <div className="sm:col-span-2">
              <PhotoField
                label="প্রোফাইল ছবি"
                fileName={photoName}
                onPick={(img) => {
                  setPhoto(img);
                  setPhotoName(img ? "ছবি যুক্ত হয়েছে" : "");
                }}
              />
            </div>
            {error && (
              <div className="sm:col-span-2">
                <ErrorBox message={error} />
              </div>
            )}
            <button type="submit" disabled={reg.isPending} className="sm:col-span-2 w-full bg-[#FF8500] hover:bg-[#E67600] disabled:opacity-60 text-white font-bold py-3 rounded-xl">
              {reg.isPending ? "জমা হচ্ছে…" : "আবেদন জমা দিন"}
            </button>
          </form>
          <p className="mt-5 text-[15px] text-[#43534B]">
            ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
            <a className="text-[#075B35] font-semibold hover:underline" href="#/login">লগইন করুন</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function AdminSetupPage() {
  const meta = useQuery({ queryKey: ["public-meta"], queryFn: () => api.getPublicMeta({}) });
  const redirect = useSessionRedirect();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const claim = useMutation({
    mutationFn: () => api.claimAdmin({ name, phone: phone.trim(), password }),
    onSuccess: (r) => redirect(r.token, r.user.role, null),
    onError: (e) => setError(errMsg(e)),
  });
  if (meta.isPending) return <Spinner />;
  if (meta.data?.adminExists) {
    return (
      <AuthShell title="অ্যাডমিন ইতিমধ্যে সেটআপ করা আছে" sub="অ্যাডমিন অ্যাকাউন্ট তৈরি হয়ে গেছে।">
        <a href="#/login" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">অ্যাডমিন লগইন করুন</a>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="অ্যাডমিন সেটআপ" sub="এটি একবারই করা যাবে — প্ল্যাটফর্মের মালিক হিসেবে আপনার অ্যাডমিন অ্যাকাউন্ট তৈরি করুন।">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          claim.mutate();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="as-name">নাম</label>
          <input id="as-name" className={inputCls} {...FIELDS.claimAdmin.name} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="as-phone">মোবাইল নম্বর</label>
          <input id="as-phone" className={inputCls} inputMode="numeric" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="as-pass">পাসওয়ার্ড</label>
          <input id="as-pass" type="password" className={inputCls} {...FIELDS.claimAdmin.password} autoComplete="new-password" placeholder="শক্তিশালী পাসওয়ার্ড দিন" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={claim.isPending} className="w-full bg-[#054A2B] hover:bg-[#03301D] disabled:opacity-60 text-white font-bold py-3 rounded-xl">
          {claim.isPending ? "তৈরি হচ্ছে…" : "অ্যাডমিন অ্যাকাউন্ট তৈরি করুন"}
        </button>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------------ static pages

function PageShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 lg:py-14">
      <h1 className="text-[28px] sm:text-[34px] font-bold text-[#054A2B]">{title}</h1>
      {sub && <p className="mt-2 text-[16px] text-[#5C6B76] leading-relaxed">{sub}</p>}
      <div className="mt-7 space-y-5 text-[15.5px] leading-relaxed text-[#2E4238]">{children}</div>
    </div>
  );
}

function HowPage() {
  return (
    <PageShell title="কিভাবে কাজ করে?" sub="MistriDako একটি সার্ভিস সমন্বয় প্ল্যাটফর্ম — বুকিং থেকে কাজ শেষ পর্যন্ত পুরো প্রক্রিয়াটি স্বচ্ছ ও সহজ।">
      <div className="bg-[#F3F8F4] rounded-3xl p-6">
        <HowSteps />
      </div>
      <h2 className="text-xl font-bold text-[#054A2B]">এরপর যা ঘটে</h2>
      <ol className="list-decimal list-inside space-y-2">
        <li>আপনি বুকিং রিকোয়েস্ট পাঠালে সেটি প্রথমে <b>অপেক্ষমাণ</b> অবস্থায় অ্যাডমিনের কাছে যায়।</li>
        <li>অ্যাডমিন কাজের বিবরণ দেখে উপযুক্ত যাচাইকৃত প্রফেশনালের সাথে কথা বলেন। এরপর অ্যাডমিন বা প্রফেশনাল কাজের খরচের <b>আইটেমভিত্তিক কোটেশন</b> পাঠান — কাজের খরচ, মালামাল ও যাতায়াত আলাদা আলাদা করে দেখানো থাকে।</li>
        <li>কোটেশন <b>আপনি অনুমোদন না করলে মূল্য চূড়ান্ত হয় না</b> — অনুমোদনের আগ পর্যন্ত কোনো পেমেন্টও করা যায় না। কাজের মাঝে অতিরিক্ত কাজ লাগলে নতুন কোটেশন আসবে এবং আবার আপনার অনুমোদন লাগবে; চুপচাপ দাম বাড়ানো যায় না।</li>
        <li>মূল্য নিশ্চিত হলে প্রফেশনাল অ্যাসাইন হয় ও আপনার ঠিকানায় গিয়ে কাজ সম্পন্ন করেন; কাজ শেষে আপনি <b>সম্পন্ন নিশ্চিত</b> করেন।</li>
        <li>কাজ সম্পন্ন হলে প্রফেশনালের কাজ নিয়ে <b>রিভিউ</b> দিতে পারবেন — যা অন্য গ্রাহকদের সিদ্ধান্তে সাহায্য করবে।</li>
      </ol>
      <p>প্রতিটি ধাপে আপনি নোটিফিকেশন পাবেন এবং "আমার বুকিং" থেকে বুকিংয়ের অবস্থা যেকোনো সময় দেখতে পারবেন।</p>
      <a href="#/services" className="inline-flex bg-[#FF8500] hover:bg-[#E67600] text-white font-bold px-6 py-3 rounded-xl">এখনই সার্ভিস খুঁজুন</a>
    </PageShell>
  );
}

// Tangail location landing page (SEO Phase 8): the ONE genuinely
// served area — Tangail district and its 12 upazilas, read live from
// the catalog. No other city page exists, because no other area is
// served; inventing one would be a fake page.
function TangailPage() {
  const catalog = useCatalog();
  const services = catalog.data?.services ?? [];
  const locations = catalog.data?.locations ?? [];
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
      <nav aria-label="ব্রেডক্রাম্ব" className="text-[14px] text-[#5C6B76]">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><a href="#/" className="hover:text-[#075B35] hover:underline">হোম</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-[#172B3A]">টাঙ্গাইল</li>
        </ol>
      </nav>
      <h1 className="mt-4 text-[28px] sm:text-[36px] font-bold text-[#054A2B] leading-tight">
        টাঙ্গাইলে হোম সার্ভিস — যাচাইকৃত মিস্ত্রি, এক ডাকেই
      </h1>
      <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-[#43534B]">
        MistriDako বর্তমানে শুধুমাত্র <b>টাঙ্গাইল জেলায়</b> সেবা দেয়। ইলেকট্রিশিয়ান, প্লাম্বার, রাজমিস্ত্রি,
        রংমিস্ত্রি, কাঠমিস্ত্রি, এসি টেকনিশিয়ানসহ সব হোম সার্ভিসের জন্য পরিচয়-যাচাইকৃত স্থানীয় প্রফেশনাল
        বুকিং করুন — বুকিং সম্পূর্ণ ফ্রি, মূল্য নির্ধারণ হয় আইটেমভিত্তিক কোটেশনে আপনার অনুমোদনের পর।
      </p>

      <h2 className="text-[21px] font-bold text-[#054A2B] mt-10 mb-4">সেবা এলাকা — টাঙ্গাইলের ১২টি উপজেলা</h2>
      {catalog.isPending ? (
        <Spinner />
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {locations.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-2xl border border-[#E1E9E4] bg-[#F3F8F4] px-4 py-3 font-medium text-[#172B3A]">
              <span className="text-[#075B35]">{Icon.pin("w-4 h-4")}</span> {l.nameBn}
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-[21px] font-bold text-[#054A2B] mt-10 mb-4">টাঙ্গাইলে পাওয়া যাচ্ছে যেসব সার্ভিস</h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.map((s) => (
          <li key={s.slug}>
            <a
              href={`#/service/${s.slug}`}
              className="flex items-center gap-3 rounded-2xl border border-[#E1E9E4] bg-white px-4 py-3.5 hover:border-[#075B35] transition-colors"
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#F3F8F4] text-[#075B35] shrink-0">
                <ServiceIcon icon={s.icon} className="w-6 h-6" />
              </span>
              <span>
                <span className="block font-semibold text-[#172B3A]">{s.nameBn} — টাঙ্গাইল</span>
                {s.tagline && <span className="block text-[13.5px] text-[#5C6B76]">{s.tagline}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <h2 className="text-[21px] font-bold text-[#054A2B] mt-10 mb-4">কিভাবে বুকিং করবেন</h2>
      <ol className="list-decimal list-inside space-y-2 max-w-3xl text-[15.5px] leading-relaxed text-[#43534B]">
        <li>পছন্দের সার্ভিস বেছে নিয়ে আপনার উপজেলা ও ঠিকানা দিয়ে বুকিং রিকোয়েস্ট পাঠান।</li>
        <li>অ্যাডমিন যাচাইকৃত প্রফেশনালের আইটেমভিত্তিক কোটেশন পাঠাবেন — আপনি অনুমোদন না করলে মূল্য চূড়ান্ত হয় না।</li>
        <li>প্রফেশনাল আপনার ঠিকানায় গিয়ে কাজ সম্পন্ন করবেন; কাজ শেষে আপনি সম্পন্ন নিশ্চিত করে রিভিউ দিতে পারবেন।</li>
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href="#/services" className="inline-flex bg-[#FF8500] hover:bg-[#E67600] text-white font-bold px-6 py-3 rounded-xl">
          সব সার্ভিস দেখুন
        </a>
        <a href="#/contact" className="inline-flex border-[1.5px] border-[#075B35] text-[#075B35] font-bold px-6 py-3 rounded-xl hover:bg-[#F3F8F4]">
          যোগাযোগ করুন
        </a>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <PageShell title="আমাদের সম্পর্কে" sub="MistriDako — এক ডাকেই, ঘরের সমাধান।">
      <p>
        MistriDako টাঙ্গাইল থেকে শুরু হওয়া একটি হোম-সার্ভিস প্ল্যাটফর্ম। আমাদের লক্ষ্য সহজ: বাসা-বাড়ির যেকোনো কাজের জন্য
        বিশ্বস্ত, যাচাইকৃত স্থানীয় মিস্ত্রি খুঁজে পাওয়া যেন ফোনের কয়েকটি ছোঁয়াতেই সম্ভব হয় — আর দক্ষ মিস্ত্রিদের জন্যও
        যেন নিয়মিত ও সম্মানজনক কাজের সুযোগ তৈরি হয়।
      </p>
      <h2 className="text-xl font-bold text-[#054A2B]">বিশ্বাস ও নিরাপত্তা</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>প্রতিটি প্রফেশনালের নিবন্ধন অ্যাডমিন যাচাই করার পরই তার প্রোফাইল ও "যাচাইকৃত" ব্যাজ প্রকাশিত হয়।</li>
        <li>রেটিং ও রিভিউ আসে শুধুমাত্র আসল, সম্পন্ন বুকিং থেকে — কোনো বানানো প্রশংসা আমরা দেখাই না।</li>
        <li>মূল্য সবসময় কাজের ধরন ও পরিমাণ অনুযায়ী, আপনার সম্মতি নিয়ে নির্ধারিত হয়।</li>
        <li>প্রফেশনালদের জাতীয় পরিচয়পত্রের তথ্য শুধু যাচাইয়ের জন্য ব্যবহৃত হয় — কখনো প্রকাশ্যে দেখানো হয় না।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">আমাদের সেবার এলাকা</h2>
      <p>বর্তমানে টাঙ্গাইল জেলার ১২টি উপজেলায় সেবা চালু আছে — ভবিষ্যতে ধাপে ধাপে অন্য জেলায় বিস্তারের পরিকল্পনা রয়েছে।</p>
      <a href="#/join" className="inline-flex bg-[#075B35] hover:bg-[#054A2B] text-white font-bold px-6 py-3 rounded-xl">মিস্ত্রি হিসেবে যোগ দিন</a>
    </PageShell>
  );
}

function ContactPage() {
  const catalog = useCatalog();
  const social = useSocialLinks();
  const me = useMe();
  const c = catalog.data;
  const has =
    c?.supportPhone || c?.supportEmail || c?.supportWhatsapp || c?.businessAddress || c?.officeHours;
  const links = social.data?.links ?? [];
  const user = me.data?.user;
  const supportHref =
    user?.role === "professional"
      ? "#/pro-dashboard?tab=support"
      : user?.role === "admin"
        ? "#/admin?tab=tickets"
        : "#/dashboard?tab=support";
  return (
    <PageShell title="যোগাযোগ করুন" sub="বুকিং বা সার্ভিস নিয়ে যেকোনো প্রয়োজনে আমাদের সাথে যোগাযোগ করুন।">
      {has ? (
        <ul className="space-y-3">
          {c?.supportPhone && (
            <li className="flex items-center gap-3 rounded-2xl border border-[#E1E9E4] p-4">
              <span className="text-[#075B35]">{Icon.phone("w-5 h-5")}</span>
              <span>ফোন: <a className="font-semibold font-en hover:underline" href={`tel:${c.supportPhone}`}>{c.supportPhone}</a></span>
            </li>
          )}
          {c?.supportWhatsapp && (
            <li className="flex items-center gap-3 rounded-2xl border border-[#E1E9E4] p-4">
              <span className="text-[#075B35]">{Icon.whatsapp("w-5 h-5")}</span>
              <span>WhatsApp: <a className="font-semibold font-en hover:underline" href={`https://wa.me/${c.supportWhatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">{c.supportWhatsapp}</a></span>
            </li>
          )}
          {c?.supportEmail && (
            <li className="flex items-center gap-3 rounded-2xl border border-[#E1E9E4] p-4">
              <span className="text-[#075B35]">{Icon.message("w-5 h-5")}</span>
              <span>ইমেইল: <a className="font-semibold font-en hover:underline" href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a></span>
            </li>
          )}
          <li className="flex items-start gap-3 rounded-2xl border border-[#E1E9E4] p-4">
            <span className="text-[#075B35] mt-0.5">{Icon.pin("w-5 h-5")}</span>
            <span>ঠিকানা: {c?.businessAddress ?? "টাঙ্গাইল, বাংলাদেশ"}</span>
          </li>
          {c?.officeHours && (
            <li className="flex items-start gap-3 rounded-2xl border border-[#E1E9E4] p-4">
              <span className="text-[#075B35] mt-0.5">{Icon.clock("w-5 h-5")}</span>
              <span>অফিস সময়: {c.officeHours}</span>
            </li>
          )}
        </ul>
      ) : (
        <div className="rounded-2xl bg-[#F3F8F4] border border-[#C9DFD2] p-5">
          <p>আমাদের সরাসরি ফোন নম্বর ও ইমেইল শীঘ্রই এখানে যুক্ত হবে। আপাতত যোগাযোগের সবচেয়ে ভালো উপায়:</p>
          <ul className="list-disc list-inside mt-2 space-y-1.5">
            <li>সার্ভিস প্রয়োজন হলে সরাসরি <a className="text-[#075B35] font-semibold hover:underline" href="#/services">বুকিং করুন</a> — অ্যাডমিন আপনার দেওয়া নম্বরে যোগাযোগ করবেন।</li>
            <li>অ্যাকাউন্ট থাকলে নিচে থেকে সাপোর্ট টিকিট খুলুন — আমরা সেখানেই উত্তর দিয়ে থাকি।</li>
          </ul>
        </div>
      )}
      {links.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-[#054A2B]">সোশ্যাল মিডিয়ায় আমরা</h2>
          <ul className="mt-3 space-y-3">
            {links.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-[#E1E9E4] p-4 hover:border-[#075B35] hover:bg-[#F3F8F4] transition-colors"
                >
                  <span className="text-[#075B35]">{socialIcon(l.platform, "w-5 h-5")}</span>
                  <span className="font-semibold">{socialLabel(l)}</span>
                  <span className="ml-auto text-[#075B35]">{Icon.arrowRight("w-4 h-4")}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-2xl bg-[#F3F8F4] border border-[#C9DFD2] p-5">
        <h2 className="text-xl font-bold text-[#054A2B]">সাপোর্ট টিকিট খুলুন</h2>
        <p className="mt-1.5">
          বুকিং, পেমেন্ট বা অ্যাকাউন্ট নিয়ে সাহায্য দরকার? সাপোর্ট টিকিট খুললে আমাদের টিম আপনার
          ড্যাশবোর্ডেই উত্তর দেবে — টিকিটের অবস্থা (খোলা, কাজ চলছে, সমাধান হয়েছে) সেখানেই দেখতে পাবেন।
        </p>
        {user ? (
          <a href={supportHref} className="inline-flex mt-3 bg-[#075B35] hover:bg-[#054A2B] text-white font-bold px-5 py-2.5 rounded-xl">
            টিকিট খুলুন
          </a>
        ) : (
          <a href="#/login" className="inline-flex mt-3 bg-[#075B35] hover:bg-[#054A2B] text-white font-bold px-5 py-2.5 rounded-xl">
            লগইন করে টিকিট খুলুন
          </a>
        )}
      </div>
    </PageShell>
  );
}

function HelpPage() {
  const [open, setOpen] = useState(0);
  const items = [
    ...FAQS,
    {
      q: "প্রফেশনাল হিসেবে কীভাবে যোগ দেবো?",
      a: "'মিস্ত্রি হিসেবে যোগ দিন' পেজ থেকে আবেদন জমা দিন। অ্যাডমিন আপনার তথ্য যাচাই করলে প্রোফাইল প্রকাশিত হবে এবং আপনি কাজ পেতে শুরু করবেন।",
    },
    {
      q: "আমার বুকিং এখনো 'অপেক্ষমাণ' কেন?",
      a: "প্রতিটি বুকিং অ্যাডমিন যাচাই করে নিশ্চিত করেন — এতে কিছুটা সময় লাগতে পারে। বুকিং নিশ্চিত হলে বা প্রফেশনাল অ্যাসাইন হলে আপনি নোটিফিকেশন পাবেন।",
    },
    {
      q: "কাজে সমস্যা হলে কী করবো?",
      a: "ড্যাশবোর্ডের 'সাপোর্ট / অভিযোগ' থেকে বিস্তারিত লিখে পাঠান। আমাদের টিম অভিযোগ দেখে ব্যবস্থা নিয়ে আপনাকে জানিয়ে দেবে।",
    },
  ];
  return (
    <PageShell title="সাহায্য ও সাধারণ জিজ্ঞাসা" sub="সবচেয়ে বেশি জিজ্ঞাসিত প্রশ্নের উত্তর এখানে পাবেন।">
      <div className="divide-y divide-[#E1E9E4] border border-[#E1E9E4] rounded-2xl bg-white overflow-hidden">
        {items.map((f, i) => (
          <div key={f.q}>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-semibold"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
            >
              {f.q}
              <span className={`text-[#075B35] transition-transform ${open === i ? "rotate-180" : ""}`}>{Icon.chevronDown("w-5 h-5")}</span>
            </button>
            {open === i && <p className="px-5 pb-4 text-[15px] text-[#43534B] leading-relaxed">{f.a}</p>}
          </div>
        ))}
      </div>
      <p>
        উত্তর না পেলে ড্যাশবোর্ড থেকে অভিযোগ/অনুরোধ পাঠান, অথবা <a className="text-[#075B35] font-semibold hover:underline" href="#/contact">যোগাযোগ পেজ</a> দেখুন।
      </p>
    </PageShell>
  );
}

function PrivacyPage() {
  return (
    <PageShell title="গোপনীয়তা নীতি" sub="সর্বশেষ হালনাগাদ: ১৯ নভেম্বর ২০২৬">
      <h2 className="text-xl font-bold text-[#054A2B]">আমরা কোন তথ্য সংগ্রহ করি</h2>
      <p>অ্যাকাউন্ট তৈরির সময় নাম, মোবাইল নম্বর ও ঠিকানা; বুকিংয়ের সময় কাজের বিবরণ, ঠিকানা ও পছন্দের সময়; এবং প্রফেশনালদের ক্ষেত্রে যাচাইয়ের জন্য জাতীয় পরিচয়পত্রের নম্বর ও ডকুমেন্টের ছবি সংগ্রহ করা হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">তথ্য কীভাবে ব্যবহার হয়</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>বুকিং প্রক্রিয়া সম্পন্ন করা ও প্রফেশনাল অ্যাসাইন করা।</li>
        <li>বুকিংয়ের অবস্থা সম্পর্কে নোটিফিকেশন পাঠানো।</li>
        <li>প্রফেশনালদের পরিচয় যাচাই করা (NID নম্বর ও ডকুমেন্ট শুধু অ্যাডমিনের জন্য দৃশ্যমান, কখনো প্রকাশ্যে নয়)।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">তথ্য ভাগাভাগি</h2>
      <p>আপনার ব্যক্তিগত তথ্য কোনো তৃতীয় পক্ষের কাছে বিক্রি করা হয় না। বুকিং সম্পন্নের জন্য প্রয়োজনীয় তথ্য (নাম, ফোন, ঠিকানা) শুধুমাত্র আপনাকে অ্যাসাইন করা প্রফেশনালের সাথে ভাগ করা হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">পেমেন্ট তথ্য</h2>
      <p>অনলাইন পেমেন্টের ক্ষেত্রে আপনি যে TrxID ও প্রেরকের নম্বর জমা দেন, তা যাচাই ও হিসাবরক্ষণের জন্য সংরক্ষণ করা হয়। মিস্ত্রি ডাকো কোনো কার্ড নম্বর, PIN বা মোবাইল ব্যাংকিং পাসওয়ার্ড কখনো চায় না এবং সংরক্ষণও করে না — কেউ চাইলে তা প্রতারণা; সাপোর্টে জানান।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">আপনার অধিকার</h2>
      <p>ড্যাশবোর্ড থেকে যেকোনো সময় আপনার প্রোফাইল তথ্য হালনাগাদ করতে পারবেন। অ্যাকাউন্ট বা তথ্য মুছে ফেলতে চাইলে সাপোর্টে অনুরোধ পাঠান।</p>
    </PageShell>
  );
}

function TermsPage() {
  return (
    <PageShell title="শর্তাবলী" sub="সর্বশেষ হালনাগাদ: ১৯ নভেম্বর ২০২৬">
      <h2 className="text-xl font-bold text-[#054A2B]">সেবার ধরন</h2>
      <p>MistriDako একটি সার্ভিস সমন্বয় প্ল্যাটফর্ম — আমরা গ্রাহক ও যাচাইকৃত স্থানীয় প্রফেশনালদের মধ্যে সংযোগ স্থাপন করি। বুকিং রিকোয়েস্ট পাঠানো মানেই বুকিং নিশ্চিত নয়; অ্যাডমিন নিশ্চিত করলেই বুকিং চূড়ান্ত হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">মূল্য ও পেমেন্ট</h2>
      <p>সার্ভিসের মূল্য কাজের ধরন ও পরিমাণ অনুযায়ী নির্ধারিত হয়। মূল্য চূড়ান্ত হয় শুধুমাত্র আইটেমভিত্তিক কোটেশনে গ্রাহকের অনুমোদনের পর — অনুমোদনের আগে কোনো পেমেন্ট নেওয়া হয় না। অনলাইন পেমেন্টের দুটি পদ্ধতি আছে: সম্পূর্ণ অনলাইন এবং ৫০% অনলাইন + ৫০% নগদ। অনলাইনে টাকা পাঠানো হয় মিস্ত্রি ডাকোর নির্ধারিত নম্বরে ম্যানুয়াল TrxID পদ্ধতিতে; অ্যাডমিন যাচাই করার পরই পেমেন্ট সফল বলে গণ্য হয়। বিস্তারিত <a className="text-[#075B35] font-semibold hover:underline" href="#/payment-policy">পেমেন্ট নীতিতে</a> দেওয়া আছে।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">বাতিল নীতি</h2>
      <p>গ্রাহক বুকিং বাতিলের অনুরোধ পাঠাতে পারবেন — অ্যাডমিন যাচাই করে সিদ্ধান্ত দিলেই কেবল বুকিং বাতিল হয়; সিদ্ধান্ত গৃহীত না হলে বুকিং আগের মতোই চলবে। অনলাইন পেমেন্ট করা থাকলে রিফান্ডের পরিমাণ প্রতিটি ক্ষেত্রে আলাদাভাবে যাচাই করে অ্যাডমিন ঠিক করেন — কোনো নির্দিষ্ট হার আগাম নির্ধারিত নেই। বাতিল বা অসম্পূর্ণ কাজে কোনো কমিশন কাটা হয় না। কাজ চলমান অবস্থায় বাতিল বা পরিবর্তনের জন্য সাপোর্টে যোগাযোগ করুন।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">প্রফেশনালদের জন্য</h2>
      <p>প্রফেশনালদের তথ্য যাচাইয়ের পর প্রোফাইল প্রকাশিত হয়। ভুল তথ্য, অভিযোগ প্রমাণিত হওয়া বা নিয়ম ভঙ্গের ক্ষেত্রে অ্যাডমিন প্রোফাইল স্থগিত বা বাতিল করতে পারবেন।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">দায়বদ্ধতা</h2>
      <p>আমরা প্রতিটি বুকিংয়ে সর্বোচ্চ যত্ন নেওয়ার চেষ্টা করি। কোনো বিরোধ দেখা দিলে প্রথমে আমাদের সাপোর্টে অভিযোগ জানান — আমরা দুই পক্ষের কথা শুনে সমাধানের চেষ্টা করবো।</p>
    </PageShell>
  );
}

// ------------------------------------------------------------- legal pages
//
// Master Phase 11 (Scope A): the Legal & Trust pages. Every statement
// below describes the payment flow AS IMPLEMENTED — Manual TrxID is
// the live payment route; the SSLCOMMERZ gateway exists only as a
// disabled sandbox layer; commission and fees are snapshotted onto a
// booking when its price is confirmed; no percentage is promised here
// that is not the admin-configured rate shown at checkout. MistriDako
// is a service-coordination marketplace: it is NOT an escrow service
// and NOT a licensed payment institution, and no page may claim
// otherwise.

const LEGAL_UPDATED = "সর্বশেষ হালনাগাদ: ১৯ নভেম্বর ২০২৬";

function PaymentPolicyPage() {
  return (
    <PageShell title="গ্রাহক পেমেন্ট নীতি" sub={LEGAL_UPDATED}>
      <h2 className="text-xl font-bold text-[#054A2B]">পেমেন্ট কখন দিতে হয়</h2>
      <p>বুকিংয়ের মূল্য চূড়ান্ত হয় শুধুমাত্র আইটেমভিত্তিক কোটেশন (কাজের খরচ, মালামাল, যাতায়াত ও অতিরিক্ত খরচ আলাদাভাবে দেখানো) গ্রাহক অনুমোদন দেওয়ার পর। অনুমোদনের আগে কোনো পেমেন্ট দিতে হয় না, এবং অনুমোদিত মূল্য পরে একতরফাভাবে বদলানো যায় না — অতিরিক্ত কাজ লাগলে নতুন কোটেশনে আবার অনুমোদন নেওয়া হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">দুটি পেমেন্ট পদ্ধতি</h2>
      <ul className="list-disc list-inside space-y-2">
        <li><strong>সম্পূর্ণ অনলাইন:</strong> পুরো বিল অনলাইনে পরিশোধ করা হয়। এই পদ্ধতিতে গ্রাহক ফি প্রযোজ্য হলে তা চেকআউটে আগেই দেখানো হয়।</li>
        <li><strong>৫০% অনলাইন + ৫০% নগদ:</strong> বিলের অর্ধেক অনলাইনে (প্রযোজ্য ফিসহ) এবং বাকি অর্ধেক কাজ শেষে প্রফেশনালকে সরাসরি নগদে দেওয়া হয়।</li>
      </ul>
      <p>প্রতিটি পদ্ধতির ফি ও কমিশনের হার অ্যাডমিন নির্ধারণ করেন এবং মূল্য নিশ্চিত হওয়ার মুহূর্তে বুকিংয়ে স্থির (স্ন্যাপশট) হয়ে যায় — পরে হার বদলালেও আপনার নিশ্চিত বুকিংয়ের হিসাব বদলায় না। চেকআউটে দেখানো হিসাবই চূড়ান্ত; কোনো লুকানো চার্জ নেই।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">ম্যানুয়াল TrxID পদ্ধতি (বর্তমান চালু পদ্ধতি)</h2>
      <p>বর্তমানে অনলাইন পেমেন্ট নেওয়া হয় ম্যানুয়াল TrxID পদ্ধতিতে: চেকআউটে দেখানো মিস্ত্রি ডাকোর অফিসিয়াল নম্বরে (bKash / Nagad / Rocket) টাকা পাঠিয়ে TrxID জমা দিতে হয়। অ্যাডমিন TrxID যাচাই করার পরই পেমেন্টটি "যাচাইকৃত" বলে গণ্য হয় — শুধু TrxID জমা দেওয়া মানেই পেমেন্ট সম্পন্ন নয়। যাচাই ব্যর্থ হলে কারণসহ জানানো হয় এবং সঠিক TrxID আবার জমা দেওয়া যায়। একই TrxID একই মাধ্যমে দুবার ব্যবহার করা যায় না।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">নগদ অংশ</h2>
      <p>৫০% অনলাইন + ৫০% নগদ পদ্ধতিতে নগদ অংশটি গ্রাহক সরাসরি প্রফেশনালকে দেন। এই টাকা মিস্ত্রি ডাকোর হাতে আসে না; বুকিং রেকর্ডে তা লিপিবদ্ধ থাকে মাত্র। নগদ দেওয়ার সময় প্রফেশনালের কাছ থেকে প্রাপ্তি নিশ্চিত করে নিন।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">গেটওয়ে পেমেন্টের অবস্থা</h2>
      <p>কার্ড/গেটওয়ে পেমেন্ট (SSLCOMMERZ) বর্তমানে শুধুমাত্র পরীক্ষামূলক (sandbox) পর্যায়ে আছে এবং সাধারণ গ্রাহকদের জন্য চালু নয়। চালু হলে এই পেজে ও চেকআউটে আলাদাভাবে জানানো হবে।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">আমাদের ভূমিকা সম্পর্কে স্পষ্টীকরণ</h2>
      <p>মিস্ত্রি ডাকো একটি সার্ভিস সমন্বয় প্ল্যাটফর্ম — এটি কোনো ব্যাংক, লাইসেন্সপ্রাপ্ত পেমেন্ট প্রতিষ্ঠান বা এস্ক্রো (escrow) সেবা নয়। যাচাইকৃত অনলাইন পেমেন্ট কাজ সম্পন্ন ও নিষ্পত্তি না হওয়া পর্যন্ত মিস্ত্রি ডাকোর হিসাবে রেকর্ডভুক্ত থাকে এবং <a className="text-[#075B35] font-semibold hover:underline" href="#/commission-policy">কমিশন নীতি</a> অনুযায়ী প্রফেশনালকে পরিশোধ করা হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">নিরাপত্তা সতর্কতা</h2>
      <p>মিস্ত্রি ডাকো কখনো আপনার কার্ড নম্বর, PIN, OTP বা মোবাইল ব্যাংকিং পাসওয়ার্ড চাইবে না। শুধুমাত্র চেকআউটে দেখানো অফিসিয়াল নম্বরেই টাকা পাঠান; অন্য কোনো নম্বরে টাকা পাঠালে তার দায়িত্ব মিস্ত্রি ডাকো নেবে না।</p>
    </PageShell>
  );
}

function ProAgreementPage() {
  return (
    <PageShell title="প্রফেশনাল চুক্তি" sub={LEGAL_UPDATED}>
      <h2 className="text-xl font-bold text-[#054A2B]">যোগ্যতা ও যাচাই</h2>
      <p>প্রফেশনাল হিসেবে কাজ করতে নিবন্ধনের সময় সঠিক তথ্য, জাতীয় পরিচয়পত্রের (NID) নম্বর এবং NID-এর সামনে ও পেছনের ছবি জমা দিতে হয়। অ্যাডমিন যাচাই করে অনুমোদন দিলেই প্রোফাইল প্রকাশিত হয় এবং কাজ নেওয়া যায় — যাচাই ছাড়া কোনো কাজ গ্রহণ করা যায় না। NID তথ্য শুধু যাচাইয়ের জন্য ব্যবহৃত হয় এবং শুধু অনুমোদিত অ্যাডমিন দেখতে পারেন।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">কাজের নিয়ম</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>অ্যাসাইন করা কাজ গ্রহণ বা বাতিলের সিদ্ধান্ত দ্রুত জানাতে হবে; গ্রহণ করা কাজ নির্ধারিত সময়ে সম্পন্ন করতে হবে।</li>
        <li>মূল্য নির্ধারিত হয় আইটেমভিত্তিক কোটেশনে গ্রাহকের অনুমোদনের মাধ্যমে। অনুমোদিত মূল্যের বাইরে অতিরিক্ত টাকা দাবি করা যাবে না — অতিরিক্ত কাজ লাগলে নতুন কোটেশন ও গ্রাহকের অনুমোদন আবশ্যক।</li>
        <li>গ্রাহকের সাথে সরাসরি যোগাযোগ করে প্ল্যাটফর্মের বাইরে কাজ নেওয়ার চেষ্টা, ভুল তথ্য দেওয়া বা অভিযোগ প্রমাণিত হলে প্রোফাইল স্থগিত বা বাতিল হতে পারে।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">কমিশন ও পেআউট</h2>
      <p>প্রতিটি সম্পন্ন কাজে <a className="text-[#075B35] font-semibold hover:underline" href="#/commission-policy">কমিশন নীতি</a> অনুযায়ী কমিশন প্রযোজ্য, যা মূল্য নিশ্চিত হওয়ার সময় বুকিংয়ে স্থির হয়ে যায়। অনলাইনে সংগৃহীত টাকা থেকে কমিশন কেটে বাকি অংশ প্রফেশনালের হেল্ড ব্যালেন্সে থাকে; প্রফেশনাল নিজের নির্ধারিত নম্বরে (bKash / Nagad / ব্যাংক) উত্তোলনের অনুরোধ পাঠালে অ্যাডমিন যাচাই করে আসল লেনদেন রেফারেন্সসহ পরিশোধ রেকর্ড করেন। বিরোধ চলমান বুকিংয়ের টাকা বিরোধ নিষ্পত্তি না হওয়া পর্যন্ত পরিশোধ স্থগিত থাকে।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">দায়িত্ব</h2>
      <p>কাজের মান, নিজের সরঞ্জাম ও নিরাপত্তার দায়িত্ব প্রফেশনালের নিজের। কাজে ক্ষতি বা বিরোধ হলে <a className="text-[#075B35] font-semibold hover:underline" href="#/dispute-policy">বিরোধ নিষ্পত্তি নীতি</a> অনুসরণ করা হবে।</p>
    </PageShell>
  );
}

function CancellationPolicyPage() {
  return (
    <PageShell title="বাতিল নীতি" sub={LEGAL_UPDATED}>
      <h2 className="text-xl font-bold text-[#054A2B]">গ্রাহকের বাতিলের অনুরোধ</h2>
      <p>গ্রাহক যেকোনো সময় বুকিং বাতিলের অনুরোধ পাঠাতে পারেন। অনুরোধ পাঠালেই বুকিং সাথে সাথে বাতিল হয় না — অ্যাডমিন যাচাই করে তিনটি সিদ্ধান্তের একটি দেন:</p>
      <ul className="list-disc list-inside space-y-2">
        <li><strong>যাচাই চলছে (Waiting):</strong> অনুরোধটি পর্যালোচনাধীন আছে; বুকিং আগের অবস্থাতেই থাকে।</li>
        <li><strong>সম্পূর্ণ (Complete):</strong> বাতিল অনুমোদিত — বুকিং বাতিল হয়ে যায়।</li>
        <li><strong>গৃহীত হয়নি (Rejected):</strong> বাতিলের অনুরোধ গৃহীত হয়নি — বুকিং আগের মতোই চলবে।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">বাতিল অনুমোদিত হলে যা হয়</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>যাচাইয়ের অপেক্ষায় থাকা অনলাইন পেমেন্ট আপনা-আপনি ব্যর্থ হিসেবে চিহ্নিত হয়।</li>
        <li>বাতিল হওয়া কাজে কোনো কমিশন কাটা হয় না।</li>
        <li>ইতিমধ্যে যাচাইকৃত অনলাইন পেমেন্ট থাকলে রিফান্ডের সিদ্ধান্ত <a className="text-[#075B35] font-semibold hover:underline" href="#/refund-policy">রিফান্ড নীতি</a> অনুযায়ী প্রতিটি ক্ষেত্রে আলাদাভাবে নেওয়া হয়।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">সময় পরিবর্তন</h2>
      <p>বাতিল না করে সময় বদলাতে চাইলে বুকিং থেকে পুনঃনির্ধারণের অনুরোধ পাঠানো যায় — অ্যাডমিন নিশ্চিত করলে নতুন সময়ে বুকিংটি চলবে এবং পুরনো ও নতুন সময়ের ইতিহাস সংরক্ষিত থাকে।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">প্রফেশনাল বা প্ল্যাটফর্ম কর্তৃক বাতিল</h2>
      <p>প্রফেশনাল কাজ বাতিল করলে বা প্ল্যাটফর্মের পক্ষ থেকে বুকিং বাতিল হলে গ্রাহককে নোটিফিকেশন দিয়ে জানানো হয় এবং যাচাইকৃত অনলাইন পেমেন্ট থাকলে রিফান্ড নীতি অনুসরণ করা হয়।</p>
    </PageShell>
  );
}

function RefundPolicyPage() {
  return (
    <PageShell title="রিফান্ড নীতি" sub={LEGAL_UPDATED}>
      <h2 className="text-xl font-bold text-[#054A2B]">কখন রিফান্ড বিবেচনা করা হয়</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>বাতিলের অনুরোধ অনুমোদিত হয়েছে এবং যাচাইকৃত অনলাইন পেমেন্ট রয়েছে।</li>
        <li>কাজ সম্পন্ন হয়নি, প্রফেশনাল আসেননি, বা বিরোধ নিষ্পত্তিতে রিফান্ডের সিদ্ধান্ত হয়েছে।</li>
        <li>ভুল করে অতিরিক্ত বা দ্বিগুণ পেমেন্ট যাচাইয়ে প্রমাণিত হয়েছে।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">কীভাবে সিদ্ধান্ত হয়</h2>
      <p>রিফান্ডের কোনো নির্দিষ্ট শতকরা হার আগাম নির্ধারিত নেই। প্রতিটি ক্ষেত্রে কাজের অবস্থা, সম্পন্ন অংশ ও প্রমাণ যাচাই করে ফাইন্যান্স অ্যাডমিন রিফান্ডের পরিমাণ ঠিক করেন। সিদ্ধান্ত হলে আসল রিফান্ড লেনদেনের পরিমাণ ও রেফারেন্স রেকর্ড করা হয় এবং গ্রাহককে নোটিফিকেশন দিয়ে জানানো হয় — রেকর্ডে না থাকা কোনো রিফান্ডের প্রতিশ্রুতি দেওয়া হয় না।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">রিফান্ডের অনুরোধ করা</h2>
      <p>গ্রাহক ড্যাশবোর্ডের "রিফান্ড" অংশ থেকে কারণসহ অনুরোধ পাঠাতে পারেন। অনুরোধ পাঠানো মানেই রিফান্ড নিশ্চিত নয় — যাচাই শেষে সিদ্ধান্ত জানানো হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">যা রিফান্ডের আওতায় নয়</h2>
      <p>গ্রাহক সরাসরি প্রফেশনালকে দেওয়া নগদ টাকা মিস্ত্রি ডাকোর হাতে আসে না, তাই সেই অংশের রিফান্ড মিস্ত্রি ডাকো প্রক্রিয়া করতে পারে না — তবে বিরোধ হিসেবে জানালে আমরা দুই পক্ষের মধ্যে সমাধানের চেষ্টা করি। যাচাই হয়নি এমন (শুধু TrxID জমা দেওয়া) পেমেন্টে কোনো টাকা সংগৃহীত হয়নি, তাই সেখানে রিফান্ডের প্রশ্ন ওঠে না।</p>
    </PageShell>
  );
}

function CommissionPolicyPage() {
  return (
    <PageShell title="কমিশন নীতি" sub={LEGAL_UPDATED}>
      <h2 className="text-xl font-bold text-[#054A2B]">কমিশন কীভাবে নির্ধারিত হয়</h2>
      <p>প্রতিটি পেমেন্ট পদ্ধতির জন্য গ্রাহক ফি ও প্রফেশনাল কমিশনের হার অ্যাডমিন প্ল্যাটফর্ম সেটিংসে নির্ধারণ করেন। হার দুটি জায়গায় প্রকাশ্যে দেখানো হয়: চেকআউটে প্রতিটি পদ্ধতির বিস্তারিত হিসাবে এবং বুকিংয়ের রসিদে। এই পেজে কোনো নির্দিষ্ট শতকরা হার উল্লেখ করা হয়নি, কারণ হার বদলালে বুকিংয়ে তা আগেই দেখানো হিসাবই প্রযোজ্য থাকে।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">স্ন্যাপশট নিয়ম</h2>
      <p>মূল্য নিশ্চিত হওয়ার (কোটেশন অনুমোদনের) মুহূর্তে তখনকার হার বুকিংয়ে স্থির (স্ন্যাপশট) হয়ে যায়। পরে অ্যাডমিন হার বদলালেও সেই বুকিংয়ের ফি ও কমিশন বদলায় না — নতুন হার শুধু এরপর নিশ্চিত হওয়া বুকিংয়ে প্রযোজ্য।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">হিসাবের ভিত্তি</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>ফি ও কমিশন হিসাব হয় যোগ্য সার্ভিস চার্জের (কাজের খরচ ও অনুমোদিত অতিরিক্ত চার্জ) উপর।</li>
        <li>আইটেমভিত্তিক মালামাল ও যাতায়াত খরচ এই ভিত্তির বাইরে থাকে।</li>
        <li>কুপন ছাড় প্রযোজ্য হলে ফি ও কমিশন ছাড়-পরবর্তী চার্জের উপর হিসাব হয়।</li>
        <li>বাতিল হওয়া কাজে কোনো কমিশন কাটা হয় না।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">অর্জিত বনাম সংগৃহীত</h2>
      <p>কমিশন "অর্জিত" হয় যাচাইকৃত অনলাইন পেমেন্টের সময় এবং "সংগৃহীত" হয় সেটেলমেন্টের (প্রফেশনালকে পেআউটের) সময়। প্রফেশনাল নিজের আয়ের পেজে প্রতিটি বুকিংয়ের স্ন্যাপশট কমিশন দেখতে পারেন।</p>
    </PageShell>
  );
}

function DisputePolicyPage() {
  return (
    <PageShell title="বিরোধ নিষ্পত্তি নীতি" sub={LEGAL_UPDATED}>
      <h2 className="text-xl font-bold text-[#054A2B]">বিরোধ জানানো</h2>
      <p>কাজের মান, মূল্য বা আচরণ নিয়ে মতবিরোধ হলে গ্রাহক, প্রফেশনাল বা অ্যাডমিন — যেকোনো পক্ষ বুকিং থেকে বিরোধ জানাতে পারেন। বিরোধ জানানোর সময় কারণ লিখে দেওয়া বাধ্যতামূলক।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">বিরোধ চলাকালে যা হয়</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>ওই বুকিংয়ের সেটেলমেন্ট সাথে সাথে স্থগিত (ফ্রিজ) হয়ে যায় — সিদ্ধান্ত না হওয়া পর্যন্ত প্রফেশনালের ওই বুকিংয়ের টাকা পরিশোধ করা হয় না।</li>
        <li>বুকিংয়ের অবস্থা "বিরোধ চলমান" হিসেবে চিহ্নিত থাকে এবং দুই পক্ষই নোটিফিকেশন পান।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#054A2B]">নিষ্পত্তির প্রক্রিয়া</h2>
      <p>অ্যাডমিন দুই পক্ষের বক্তব্য ও বুকিংয়ের রেকর্ড (কোটেশন, পেমেন্ট, কাজের অবস্থা) যাচাই করে কারণসহ সিদ্ধান্ত দেন। সিদ্ধান্তে প্রয়োজনে রিফান্ড (রিফান্ড নীতি অনুযায়ী), পেআউট ছাড়, বা উভয়ই থাকতে পারে। সিদ্ধান্ত ও তার কারণ বুকিংয়ের ইতিহাসে স্থায়ীভাবে সংরক্ষিত থাকে এবং দুই পক্ষকে জানানো হয়।</p>
      <h2 className="text-xl font-bold text-[#054A2B]">আমাদের সীমাবদ্ধতা</h2>
      <p>মিস্ত্রি ডাকো কোনো আদালত বা সালিশি প্রতিষ্ঠান নয় — বিরোধ নিষ্পত্তি প্ল্যাটফর্মের অভ্যন্তরীণ প্রক্রিয়া। এতে সমাধান না হলে আইনগত পথে যাওয়ার অধিকার দুই পক্ষেরই থাকে।</p>
    </PageShell>
  );
}

export function BookingStatusChip({ status, stage }: { status: string; stage?: string }) {
  // Prefer the master-flow stage (Phase 7) when the caller has it: a
  // legacy "assigned" row whose professional already accepted reads
  // as "accepted", a legacy "completed" as customer-confirmed, etc.
  const shown = stage ?? status;
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${statusColor(shown)}`}>
      {STATUS_BN[shown] ?? shown}
    </span>
  );
}
