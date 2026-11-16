// GhorSheba — app shell, routing, homepage and public pages.
// Dashboards live in ./panels; booking flow in ./booking.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
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
import heroImg from "./assets/hero-team.webp";
import mistriImg from "./assets/mistri-portrait.webp";
import svcElectrician from "./assets/svc-electrician.webp";
import svcPlumber from "./assets/svc-plumber.jpg";
import svcMason from "./assets/svc-mason.webp";
import svcPainter from "./assets/svc-painter.webp";
import { BookingDetailPage, BookingPage } from "./booking";
import { AdminPanel, CustomerDashboard, ProDashboard } from "./panels";

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
    default:
      content = (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-[#064B27]">পেজটি পাওয়া যায়নি</h1>
          <p className="mt-2 text-[#737B73]">আপনি যে পেজটি খুঁজছেন তা নেই বা সরানো হয়েছে।</p>
          <a href="#/" className="inline-block mt-5 bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">
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
    <div className="min-h-screen bg-white text-[#202820] flex flex-col">
      <Header catalog={catalog.data} />
      {catalog.data?.announcement && (
        <div className="bg-[#FF8A00] text-white text-center text-sm font-medium px-4 py-2">
          {catalog.data.announcement}
        </div>
      )}
      {page === "" && !isStandaloneApp() && (
        <div className="bg-[#064B27] text-white">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm">
            <span className="text-[#FF8A00]">{Icon.smartphone("w-5 h-5")}</span>
            <p className="font-medium">GhorSheba এখন মোবাইল অ্যাপ হিসেবেও ইনস্টল করা যায়</p>
            <a
              href="#/download-app"
              className="shrink-0 bg-[#FF8A00] hover:bg-[#E67A00] text-white font-semibold px-3.5 py-1.5 rounded-lg"
            >
              অ্যাপ ডাউনলোড করুন
            </a>
          </div>
        </div>
      )}
      <main className="flex-1 pb-20 lg:pb-0">{content}</main>
      <Footer catalog={catalog.data} />
      {/* Mobile bottom navigation */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E5EAE5] pb-safe shadow-[0_-2px_12px_rgba(6,75,39,0.06)]"
        aria-label="মোবাইল নেভিগেশন"
      >
        <div className="grid grid-cols-4">
          <BottomNavItem href="#/" active={page === ""} icon={Icon.home("w-5 h-5")} label="হোম" />
          <BottomNavItem href="#/services" active={page === "services" || page === "service"} icon={Icon.grid("w-5 h-5")} label="সার্ভিস" />
          <BottomNavItem href={bookingsHref} active={page === "dashboard" || page === "booking"} icon={Icon.calendar("w-5 h-5")} label="আমার বুকিং" />
          <BottomNavItem href={profileHref} active={false} icon={Icon.user("w-5 h-5")} label="প্রোফাইল" />
        </div>
      </nav>
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
        active ? "text-[#087A35]" : "text-[#737B73]"
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

  const navLink = "px-3 py-2 rounded-lg text-[15px] font-medium text-[#202820] hover:text-[#087A35] hover:bg-[#F0FAF2]";
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[#E5EAE5] pt-safe">
      <div className="max-w-7xl mx-auto px-4 h-[68px] flex items-center gap-3">
        <Logo />
        <div className="hidden md:flex items-center ml-2">
          <label className="sr-only" htmlFor="hdr-loc">এলাকা নির্বাচন</label>
          <span className="relative inline-flex items-center">
            <span className="absolute left-2.5 text-[#087A35] pointer-events-none">{Icon.pin("w-4 h-4")}</span>
            <select
              id="hdr-loc"
              aria-label="এলাকা নির্বাচন"
              className="appearance-none bg-[#F0FAF2] border border-[#cfe3d3] rounded-full pl-8 pr-7 py-1.5 text-sm font-medium text-[#064B27] cursor-pointer"
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
            <span className="absolute right-2 text-[#087A35] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
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
                className="relative grid place-items-center w-10 h-10 rounded-full hover:bg-[#F0FAF2] text-[#064B27]"
                aria-label="নোটিফিকেশন"
              >
                {Icon.bell("w-5 h-5")}
                {(me.data?.unreadNotifications ?? 0) > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-0.5 rounded-full bg-[#FF8A00] text-white text-[10px] font-bold grid place-items-center">
                    {me.data?.unreadNotifications}
                  </span>
                )}
              </a>
              <a href={dashHref} className="hidden sm:flex items-center gap-2 bg-[#F0FAF2] hover:bg-[#E2F4E7] rounded-full pl-1.5 pr-3.5 py-1.5">
                <Avatar name={user.name} photoUrl={user.photoUrl} size="w-7 h-7" textSize="text-xs" />
                <span className="text-sm font-semibold text-[#064B27] max-w-[110px] truncate">{user.name}</span>
              </a>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  go("/");
                }}
                className="hidden sm:grid place-items-center w-10 h-10 rounded-full hover:bg-red-50 text-[#737B73] hover:text-red-600"
                aria-label="লগআউট"
              >
                {Icon.logout("w-5 h-5")}
              </button>
            </>
          ) : (
            <>
              <a
                href="#/login"
                className="hidden sm:inline-flex items-center border-[1.5px] border-[#087A35] text-[#087A35] font-semibold text-[15px] px-4 py-1.5 rounded-[10px] hover:bg-[#F0FAF2]"
              >
                লগইন
              </a>
              <a
                href="#/register"
                className="hidden sm:inline-flex items-center bg-[#087A35] hover:bg-[#064B27] text-white font-semibold text-[15px] px-4 py-2 rounded-[10px]"
              >
                নিবন্ধন
              </a>
            </>
          )}
          <button
            type="button"
            className="lg:hidden grid place-items-center w-10 h-10 rounded-lg hover:bg-[#F0FAF2] text-[#064B27]"
            aria-label={menuOpen ? "মেনু বন্ধ করুন" : "মেনু খুলুন"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? Icon.x("w-6 h-6") : Icon.menu("w-6 h-6")}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="lg:hidden border-t border-[#E5EAE5] bg-white px-4 py-3 gs-fade-up">
          <div className="md:hidden mb-3">
            <label className="text-xs text-[#737B73]" htmlFor="m-loc">আপনার এলাকা</label>
            <select
              id="m-loc"
              aria-label="আপনার এলাকা"
              className="mt-1 w-full border border-[#E5EAE5] rounded-xl px-3 py-2.5 bg-white"
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
              <a key={href} href={href} className="px-3 py-2.5 rounded-lg font-medium hover:bg-[#F0FAF2] hover:text-[#087A35]">
                {label}
              </a>
            ))}
            {user ? (
              <>
                <a href={dashHref} className="px-3 py-2.5 rounded-lg font-medium bg-[#F0FAF2] text-[#087A35]">
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
                <a href="#/login" className="flex-1 text-center border-[1.5px] border-[#087A35] text-[#087A35] font-semibold px-4 py-2.5 rounded-xl">
                  লগইন
                </a>
                <a href="#/register" className="flex-1 text-center bg-[#087A35] text-white font-semibold px-4 py-2.5 rounded-xl">
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
  const hasContact = catalog?.supportPhone || catalog?.supportEmail || catalog?.supportWhatsapp;
  return (
    <footer className="bg-[#064B27] text-white mt-0">
      <div className="max-w-7xl mx-auto px-4 pt-12 pb-6 grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <Logo light />
          <p className="mt-4 text-white/75 text-[15px] leading-relaxed max-w-xs">
            টাঙ্গাইলের যাচাইকৃত স্থানীয় মিস্ত্রি ও প্রফেশনালদের সাথে গ্রাহকদের সংযোগ দেওয়ার নির্ভরযোগ্য প্ল্যাটফর্ম।
          </p>
          <p className="mt-3 text-white/50 text-sm">সোশ্যাল মিডিয়া লিংক শীঘ্রই যুক্ত হবে।</p>
        </div>
        <nav aria-label="দ্রুত লিংক">
          <h3 className="font-bold text-[17px] mb-3.5">দ্রুত লিংক</h3>
          <ul className="space-y-2.5 text-white/80 text-[15px]">
            <li><a className="hover:text-white" href="#/">হোম</a></li>
            <li><a className="hover:text-white" href="#/services">সার্ভিসসমূহ</a></li>
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
              {catalog?.supportEmail && (
                <li className="flex items-center gap-2">
                  {Icon.message("w-4 h-4")} <a href={`mailto:${catalog.supportEmail}`} className="hover:text-white font-en">{catalog.supportEmail}</a>
                </li>
              )}
              <li className="flex items-center gap-2">{Icon.pin("w-4 h-4")} টাঙ্গাইল, বাংলাদেশ</li>
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
          <span className="font-en">© 2026 GhorSheba. All rights reserved.</span>
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
      <section className="bg-[#F0FAF2]">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <div className="flex justify-center">
            <span className="grid place-items-center w-24 h-24 rounded-[26px] bg-[#087A35] shadow-lg shadow-[#087A35]/25">
              <svg viewBox="0 0 48 48" className="w-16 h-16" aria-hidden="true">
                <path d="M6 22 24 7l18 15" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
                <path d="M11 20v16a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V20" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
                <path d="M24 33c-4.5-1.2-6.5-4.3-6.5-8.5 4.2 0 7.3 2 8.6 6.3" fill="#FF8A00" />
                <path d="M24 33c.4-3.9 2.3-6.6 6-8-.3 4-2 7-6 8z" fill="#ffffff" />
              </svg>
            </span>
          </div>
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-[#064B27] leading-snug">
            GhorSheba অ্যাপ ইনস্টল করুন
          </h1>
          <p className="mt-3 text-[#737B73] text-[16px] leading-relaxed max-w-xl mx-auto">
            অ্যাপটি সরাসরি এই ওয়েবসাইট থেকেই ইনস্টল হয় —{" "}
            <strong className="text-[#064B27]">Play Store বা App Store-এ যাওয়ার দরকার নেই</strong>,
            কোনো টাকাও লাগে না। ইনস্টল করতে মাত্র কয়েক সেকেন্ড সময় লাগবে।
          </p>
          {installed || justInstalled ? (
            <p className="mt-7 inline-flex items-center gap-2 bg-[#087A35] text-white font-semibold px-6 py-3.5 rounded-2xl">
              {Icon.checkCircle("w-6 h-6")}
              অ্যাপটি আপনার ফোনে ইনস্টল করা আছে — হোম স্ক্রিন থেকে খুলুন
            </p>
          ) : (
            <button
              type="button"
              onClick={onInstallClick}
              disabled={busy}
              className="mt-7 inline-flex items-center gap-2.5 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white text-lg font-bold px-8 py-4 rounded-2xl shadow-lg shadow-[#087A35]/25"
            >
              {Icon.download("w-6 h-6")}
              {busy ? "ইনস্টল হচ্ছে..." : "অ্যাপ ইনস্টল করুন"}
            </button>
          )}
          {!canPrompt && !installed && !justInstalled && (
            <p className="mt-3 text-sm text-[#737B73]">
              আপনার ব্রাউজারে সরাসরি ইনস্টল বাটন না এলে নিচের ধাপগুলো অনুসরণ করুন।
            </p>
          )}
        </div>
      </section>

      {/* Why install */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <SectionTitle sub="একই GhorSheba, তবে আরও দ্রুত আর সহজে">কেন অ্যাপটি ইনস্টল করবেন?</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => (
            <div key={b.title} className="flex gap-4 bg-white border border-[#E5EAE5] rounded-2xl p-5">
              <span className="shrink-0 grid place-items-center w-12 h-12 rounded-xl bg-[#F0FAF2] text-[#087A35]">
                {b.icon}
              </span>
              <span>
                <span className="block font-bold text-[#064B27] text-[17px]">{b.title}</span>
                <span className="block mt-1 text-[15px] text-[#737B73] leading-relaxed">{b.body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Android steps */}
      <section id="android-steps" className="bg-[#F0FAF2]">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#087A35] text-white">
              {Icon.smartphone("w-6 h-6")}
            </span>
            <h2 className="text-2xl font-bold text-[#064B27]">Android ফোনে ইনস্টল করুন</h2>
          </div>
          <p className="text-[#737B73] text-[15px] mb-6">
            Samsung, Xiaomi, Vivo, Oppo, Realme — সব Android ফোনেই একই পদ্ধতি।
            {isAndroid && " আপনি Android ফোন থেকে দেখছেন — উপরের বাটনেই ইনস্টল করা যাবে।"}
          </p>
          {!installed && !justInstalled && (
            <button
              type="button"
              onClick={onInstallClick}
              disabled={busy}
              className="mb-7 inline-flex items-center gap-2.5 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-7 py-3.5 rounded-2xl"
            >
              {Icon.download("w-5 h-5")}
              {busy ? "ইনস্টল হচ্ছে..." : "এখনই ইনস্টল করুন"}
            </button>
          )}
          <div className={showSteps ? "rounded-2xl ring-2 ring-[#FF8A00] ring-offset-4 ring-offset-[#F0FAF2]" : ""}>
            <h3 className="font-bold text-[#064B27] mb-3">বাটন কাজ না করলে হাতে করে ইনস্টল করুন:</h3>
            <ol className="space-y-3">
              {[
                "Chrome ব্রাউজারে এই ওয়েবসাইটটি (ghorsheba-bd.vercel.app) খুলুন।",
                "ব্রাউজারের উপরের ডানদিকের ⋮ (তিন ডট) মেনুতে চাপুন।",
                "“অ্যাপ ইনস্টল করুন” (Install app) অথবা “হোম স্ক্রিনে যোগ করুন” (Add to Home screen) অপশনটি বেছে নিন।",
                "“ইনস্টল” বাটনে চাপুন — GhorSheba আইকনটি আপনার হোম স্ক্রিনে চলে আসবে।",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 bg-white border border-[#E5EAE5] rounded-xl px-4 py-3">
                  <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[#087A35] text-white text-sm font-bold">
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
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#064B27] text-white">
              {Icon.share("w-6 h-6")}
            </span>
            <h2 className="text-2xl font-bold text-[#064B27]">iPhone / iPad-এ ইনস্টল করুন</h2>
          </div>
          <p className="text-[#737B73] text-[15px] mb-6">
            iPhone-এ ইনস্টল করতে Safari ব্রাউজার লাগবে (Chrome থেকে হয় না)।
            {isIOS && " আপনি iPhone/iPad থেকে দেখছেন — নিচের ধাপগুলোই আপনার জন্য।"}
          </p>
          <ol className="space-y-3">
            {[
              "Safari ব্রাউজারে এই ওয়েবসাইটটি (ghorsheba-bd.vercel.app) খুলুন।",
              "নিচের Share বাটনে (বাক্স থেকে তীর ওঠা আইকন) চাপুন।",
              "তালিকা থেকে “Add to Home Screen” / “হোম স্ক্রিনে যোগ করুন” বেছে নিন।",
              "ডানদিকের উপরে “Add” চাপুন — GhorSheba আইকন হোম স্ক্রিনে যোগ হয়ে যাবে।",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 bg-white border border-[#E5EAE5] rounded-xl px-4 py-3">
                <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-[#064B27] text-white text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-[15px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 bg-[#F0FAF2] border border-[#cfe3d3] rounded-2xl px-5 py-4 text-[15px] leading-relaxed text-[#064B27]">
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
      <section className="relative overflow-hidden bg-[#F0FAF2]">
        <div className="max-w-7xl mx-auto px-4 pt-10 pb-12 lg:pt-16 lg:pb-20 grid lg:grid-cols-2 gap-10 items-center relative">
          <div className="gs-fade-up relative z-10">
            <h1 className="text-[34px] leading-[1.2] sm:text-[44px] lg:text-[48px] font-bold text-[#064B27]">
              আপনার ঘরের সব কাজ,
              <br />
              এখন এক জায়গায়
            </h1>
            <p className="mt-4 text-[17px] sm:text-lg text-[#3d4a3d] max-w-md leading-relaxed">
              টাঙ্গাইলে যাচাই করা দক্ষ মিস্ত্রি খুঁজুন সহজে, দ্রুত এবং নিরাপদে।
            </p>
            <form
              className="mt-6 bg-white rounded-2xl shadow-[0_10px_36px_rgba(6,75,39,0.13)] border border-[#E5EAE5] p-2 flex flex-col sm:flex-row gap-2 max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <label className="flex items-center gap-2 flex-1 px-3 min-h-[48px]">
                <span className="text-[#087A35]">{Icon.search("w-5 h-5")}</span>
                <span className="sr-only">সার্ভিস খুঁজুন</span>
                <input
                  aria-label="সার্ভিস খুঁজুন"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="কী সার্ভিস প্রয়োজন? যেমন: ইলেকট্রিশিয়ান, প্লাম্বার..."
                  className="w-full outline-none text-[15px] placeholder:text-[#9aa79a] bg-transparent"
                />
              </label>
              <label className="relative flex items-center sm:border-l border-[#E5EAE5] sm:pl-3">
                <span className="text-[#087A35] pointer-events-none absolute left-3 sm:left-5">{Icon.pin("w-4 h-4")}</span>
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
                <span className="absolute right-2 text-[#737B73] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
              </label>
              <button
                type="submit"
                className="bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold text-[16px] px-7 py-3 rounded-xl transition-colors"
              >
                খুঁজুন
              </button>
            </form>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14.5px] font-medium text-[#064B27]">
              {["যাচাইকৃত মিস্ত্রি", "নিরাপদ বুকিং", "নির্ভরযোগ্য সাপোর্ট"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="text-[#087A35]">{Icon.checkCircle("w-[18px] h-[18px]")}</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-[520px]">
            <img
              src={heroImg}
              alt="নির্মাণাধীন বাড়ির সামনে হাসিমুখে দাঁড়িয়ে চারজন মিস্ত্রি"
              className="w-full aspect-[4/3] lg:aspect-[5/4] object-cover rounded-[26px] shadow-[0_18px_44px_rgba(6,75,39,0.22)]"
            />
            <div className="absolute -top-1 right-4 sm:right-6 bg-[#064B27] text-white text-center px-4 pt-2.5 pb-4 rounded-b-2xl shadow-lg">
              <p className="font-bold leading-tight text-[15px]">
                টাঙ্গাইল
                <br />
                <span className="text-[#FFC46B]">এখন আরও কাছাকাছি</span>
              </p>
              <span className="absolute left-1/2 -translate-x-1/2 -bottom-[9px] w-0 h-0 border-l-[10px] border-r-[10px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#064B27]" />
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
              className="group rounded-2xl border-2 border-[#087A35] bg-[#F0FAF2] hover:bg-[#E2F4E7] px-3 py-5 flex flex-col items-center justify-center text-center gap-2 transition-colors min-h-[132px]"
              aria-label="সব সার্ভিস দেখুন"
            >
              <span className="grid grid-cols-3 gap-1" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span key={i} className="w-[7px] h-[7px] rounded-full bg-[#087A35]" />
                ))}
              </span>
              <span className="font-bold text-[#087A35]">আরও দেখুন</span>
              <span className="text-[#087A35] group-hover:translate-x-0.5 transition-transform">{Icon.arrowRight("w-5 h-5")}</span>
            </a>
          </div>
        )}
      </section>

      {/* Professionals + How it works */}
      <section className="max-w-7xl mx-auto px-4 pb-12 lg:pb-16 grid lg:grid-cols-[1.65fr_1fr] gap-8 items-start">
        <div>
          <div className="flex items-end justify-between gap-3 mb-5">
            <h2 className="text-[22px] sm:text-[26px] font-bold text-[#064B27]">যাচাইকৃত প্রফেশনালদের সাথে পরিচিত হোন</h2>
            <a href="#/professionals" className="shrink-0 text-[#087A35] font-semibold text-[15px] hover:underline inline-flex items-center gap-1">
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
            <p className="mt-4 text-sm text-[#737B73]">
              এখনো কোনো যাচাইকৃত প্রফেশনাল যুক্ত হননি — নিচের কার্ডগুলো শুধু নমুনা। প্রফেশনালরা নিবন্ধন করলে ও অ্যাডমিন যাচাই করলে এখানে আসল প্রোফাইল দেখা যাবে।
            </p>
          )}
        </div>
        <div className="bg-[#F0FAF2] rounded-3xl p-6 sm:p-7">
          <h2 className="text-[22px] sm:text-[24px] font-bold text-[#064B27] mb-6">কিভাবে কাজ করে?</h2>
          <HowSteps />
          <a href="#/services" className="mt-6 inline-flex items-center gap-2 bg-[#087A35] hover:bg-[#064B27] text-white font-semibold px-5 py-2.5 rounded-xl">
            সার্ভিস খুঁজুন {Icon.arrowRight("w-4 h-4")}
          </a>
        </div>
      </section>

      {/* Why choose */}
      <section className="bg-[#FBFDFB] border-y border-[#E5EAE5]">
        <div className="max-w-7xl mx-auto px-4 py-12 lg:py-16">
          <SectionTitle sub="আস্থা আর সহজ অভিজ্ঞতাই আমাদের অঙ্গীকার">কেন GhorSheba বেছে নেবেন?</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Icon.badgeCheck("w-7 h-7"), title: "যাচাইকৃত প্রফেশনাল", body: "প্রতিটি প্রফেশনালের পরিচয় ও দক্ষতা অ্যাডমিন যাচাই করার পরই প্রোফাইল প্রকাশিত হয়।" },
              { icon: Icon.calendar("w-7 h-7"), title: "সহজ বুকিং", body: "কয়েকটি সহজ ধাপে বুকিং রিকোয়েস্ট পাঠান — কোনো জটিলতা ছাড়াই।" },
              { icon: Icon.pin("w-7 h-7"), title: "স্থানীয় সার্ভিস নেটওয়ার্ক", body: "টাঙ্গাইলের ১২টি উপজেলার স্থানীয় মিস্ত্রি — দ্রুত সেবা, কম অপেক্ষা।" },
              { icon: Icon.wallet("w-7 h-7"), title: "স্বচ্ছ মূল্য", body: "কাজ শুরুর আগে কোটেশন জেনে নিন; সম্মতি ছাড়া কোনো চূড়ান্ত মূল্য নয়।" },
              { icon: Icon.message("w-7 h-7"), title: "গ্রাহক সাপোর্ট", body: "বুকিং নিয়ে যেকোনো সমস্যায় অভিযোগ জানান — আমরা সমাধান করে জানিয়ে দেবো।" },
              { icon: Icon.star(true, "w-7 h-7"), title: "আসল গ্রাহক রিভিউ", body: "শুধুমাত্র সম্পন্ন কাজের গ্রাহকদের যাচাইকৃত রিভিউ প্রকাশিত হয়।" },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-[#E5EAE5] bg-white p-5 hover:shadow-[0_10px_28px_rgba(6,75,39,0.08)] transition-shadow">
                <span className="inline-grid place-items-center w-12 h-12 rounded-xl bg-[#F0FAF2] text-[#087A35] mb-3">{c.icon}</span>
                <h3 className="font-bold text-[#064B27]">{c.title}</h3>
                <p className="mt-1.5 text-sm text-[#737B73] leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews + join banner */}
      <section className="max-w-7xl mx-auto px-4 py-12 lg:py-16 grid lg:grid-cols-[1.65fr_1fr] gap-8 items-start">
        <div>
          <div className="flex items-end justify-between gap-3 mb-5">
            <h2 className="text-[22px] sm:text-[26px] font-bold text-[#064B27]">আমাদের গ্রাহকদের মতামত</h2>
          </div>
          {reviews.isPending ? (
            <Spinner />
          ) : (reviews.data?.reviews.length ?? 0) === 0 ? (
            <EmptyState
              title="এখনো কোনো রিভিউ নেই"
              body="প্রথম গ্রাহকদের কাজ সম্পন্ন হলে তাদের আসল মতামত এখানে দেখা যাবে। আমরা কোনো নমুনা বা বানানো প্রশংসা দেখাই না।"
              action={
                <a href="#/services" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">
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
        <div className="relative overflow-hidden rounded-3xl bg-[#087A35] text-white">
          <img src={mistriImg} alt="হাসিমুখে টুলবক্স হাতে একজন মিস্ত্রি" className="absolute inset-0 w-full h-full object-cover opacity-25" loading="lazy" />
          <div className="relative p-7 sm:p-8">
            <h2 className="text-[24px] sm:text-[28px] font-bold leading-snug">আপনি কি একজন দক্ষ মিস্ত্রি?</h2>
            <p className="mt-2 text-white/85 text-[15.5px]">GhorSheba-তে যুক্ত হয়ে আপনার কাজের সুযোগ বাড়ান।</p>
            <a
              href="#/join"
              className="mt-5 inline-flex items-center gap-2 bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold px-5 py-3 rounded-xl"
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
    { icon: Icon.home("w-8 h-8"), title: "কাজ সম্পন্ন করুন", body: "প্রফেশনাল যোগাযোগ করে কাজ সম্পন্ন করবেন।" },
  ];
  return (
    <ol className="grid sm:grid-cols-3 gap-3">
      {steps.map((s, i) => (
        <li key={s.title} className="relative bg-white rounded-2xl border border-[#E5EAE5] p-4 text-center">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[#087A35] text-white text-[13px] font-bold grid place-items-center font-en">
            {i + 1}
          </span>
          <span className="inline-grid place-items-center w-[52px] h-[52px] rounded-full bg-[#F0FAF2] text-[#087A35] mt-2">{s.icon}</span>
          <h3 className="mt-2.5 font-bold text-[#064B27]">{s.title}</h3>
          <p className="mt-1 text-[13.5px] text-[#737B73] leading-relaxed">{s.body}</p>
          {i < 2 && (
            <span className="hidden sm:block absolute top-1/2 -right-[13px] z-10 text-[#087A35]">{Icon.arrowRight("w-4 h-4")}</span>
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
      className="group rounded-2xl border border-[#E5EAE5] bg-white px-3 py-5 flex flex-col items-center text-center gap-2 hover:border-[#087A35] hover:shadow-[0_10px_28px_rgba(6,75,39,0.10)] transition-all min-h-[132px]"
      aria-label={`${service.nameBn} সার্ভিস দেখুন`}
    >
      <span className="grid place-items-center w-12 h-12 rounded-full bg-[#F0FAF2] text-[#087A35] group-hover:bg-[#087A35] group-hover:text-white transition-colors">
        <ServiceIcon icon={service.icon} className="w-6 h-6" />
      </span>
      <span className="font-bold text-[#202820] leading-tight">{service.nameBn}</span>
      {service.tagline && <span className="text-[12.5px] text-[#737B73] leading-tight line-clamp-2">{service.tagline}</span>}
    </a>
  );
}

export function ProCard({ pro }: { pro: Pro }) {
  return (
    <article className="rounded-2xl border border-[#E5EAE5] bg-white p-4 flex flex-col hover:shadow-[0_10px_28px_rgba(6,75,39,0.09)] transition-shadow">
      <div className="flex items-start gap-3">
        <Avatar name={pro.name} photoUrl={pro.photoUrl} size="w-14 h-14" />
        <div className="min-w-0">
          <p className="font-bold text-[#202820] leading-tight truncate">{pro.name}</p>
          <p className="text-[13.5px] text-[#737B73]">{pro.categoryName}</p>
          <span className="inline-flex items-center gap-1 mt-1 bg-[#087A35] text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
            {Icon.badgeCheck("w-3.5 h-3.5")} যাচাইকৃত
          </span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13.5px] text-[#4c584c]">
        {pro.avgRating != null ? (
          <p className="flex items-center gap-1.5">
            <Stars value={pro.avgRating} /> <span className="font-semibold">{pro.avgRating}</span>
            <span className="text-[#737B73]">({pro.completedJobs}টি কাজ সম্পন্ন)</span>
          </p>
        ) : (
          <p className="text-[#737B73]">এখনো কোনো রিভিউ পাননি • {pro.completedJobs}টি কাজ সম্পন্ন</p>
        )}
        <p className="flex items-center gap-1.5">
          {Icon.briefcase("w-4 h-4")} অভিজ্ঞতা: {pro.experienceYears} বছর
        </p>
        <p className="flex items-center gap-1.5">
          <span className="text-[#087A35]">{Icon.pin("w-4 h-4")}</span>
          {pro.areas.slice(0, 2).join(", ") || "টাঙ্গাইল"}
        </p>
      </div>
      <div className="mt-4 flex gap-2 mt-auto pt-1">
        <a
          href={`tel:${pro.phone}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 border-[1.5px] border-[#087A35] text-[#087A35] font-semibold text-sm px-3 py-2 rounded-xl hover:bg-[#F0FAF2]"
          aria-label={`${pro.name}-কে কল করুন`}
        >
          {Icon.phone("w-4 h-4")} কল করুন
        </a>
        <a
          href={`#/pro/${pro.id}`}
          className="flex-1 inline-flex items-center justify-center bg-[#087A35] hover:bg-[#064B27] text-white font-semibold text-sm px-3 py-2 rounded-xl"
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
    <article className="relative rounded-2xl border border-dashed border-[#cfe3d3] bg-[#FBFDFB] p-4 flex flex-col" aria-label="নমুনা প্রোফাইল">
      <span className="absolute top-3 right-3 bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
        নমুনা প্রোফাইল
      </span>
      <div className="flex items-start gap-3">
        <Avatar name={d.name} photoUrl={null} size="w-14 h-14" />
        <div>
          <p className="font-bold text-[#202820] leading-tight">{d.name}</p>
          <p className="text-[13.5px] text-[#737B73]">{d.cat}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-[#737B73]">
        <span className="text-[#087A35]">{Icon.pin("w-4 h-4")}</span> {d.loc}
      </p>
      <p className="mt-2 text-[13px] text-[#737B73] leading-relaxed">
        এটি একটি নমুনা কার্ড — আসল প্রফেশনাল যাচাই সম্পন্ন করে যুক্ত হলেই এখানে তার আসল তথ্য, রেটিং ও কাজের সংখ্যা দেখা যাবে।
      </p>
      <a href="#/join" className="mt-3 inline-flex items-center justify-center border-[1.5px] border-[#087A35] text-[#087A35] font-semibold text-sm px-3 py-2 rounded-xl hover:bg-[#F0FAF2]">
        মিস্ত্রি হিসেবে যোগ দিন
      </a>
    </article>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="rounded-2xl border border-[#E5EAE5] bg-white p-5">
      <Stars value={review.rating} />
      <p className="mt-2.5 text-[15px] leading-relaxed text-[#202820]">“{review.text}”</p>
      <footer className="mt-3.5 flex items-center gap-2.5">
        <Avatar name={review.customerName} photoUrl={null} size="w-9 h-9" textSize="text-[13px]" />
        <div className="leading-tight">
          <p className="font-semibold text-sm">{review.customerName}</p>
          <p className="text-[12.5px] text-[#737B73]">
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
        <label className="flex items-center gap-2 flex-1 border border-[#E5EAE5] rounded-xl px-3.5 bg-white focus-within:border-[#087A35]">
          <span className="text-[#087A35]">{Icon.search("w-5 h-5")}</span>
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
            className="w-full sm:w-[190px] appearance-none border border-[#E5EAE5] rounded-xl pl-4 pr-9 py-3 bg-white font-medium cursor-pointer"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
            ))}
          </select>
          <span className="absolute right-3 text-[#737B73] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
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

      <h2 className="text-[22px] font-bold text-[#064B27] mt-12 mb-1.5">
        {location} এলাকার যাচাইকৃত প্রফেশনাল
      </h2>
      <p className="text-sm text-[#737B73] mb-5">শুধুমাত্র আপনার বেছে নেওয়া এলাকায় সেবা দেন এমন প্রফেশনালদের দেখানো হচ্ছে।</p>
      {pros.isPending ? (
        <Spinner />
      ) : (pros.data?.professionals.length ?? 0) === 0 ? (
        <EmptyState
          title="এই এলাকায় এখনো যাচাইকৃত প্রফেশনাল নেই"
          body="তবু বুকিং করতে পারবেন — অ্যাডমিন আপনার এলাকার উপযুক্ত প্রফেশনাল খুঁজে অ্যাসাইন করে দেবেন।"
          action={
            <a href="#/services" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">
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

  if (catalog.isPending) return <Spinner />;
  if (!service) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14">
        <EmptyState
          title="সার্ভিসটি পাওয়া যায়নি"
          body="সার্ভিসটি হয়তো সরানো হয়েছে বা এখন সক্রিয় নেই।"
          action={<a href="#/services" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">সব সার্ভিস দেখুন</a>}
        />
      </div>
    );
  }
  const img = SERVICE_IMG[service.slug];
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
      <a href="#/services" className="inline-flex items-center gap-1.5 text-[#087A35] font-medium text-[15px] hover:underline">
        {Icon.arrowLeft("w-4 h-4")} সব সার্ভিস
      </a>
      <div className="mt-4 grid lg:grid-cols-[1.5fr_1fr] gap-8 items-start">
        <div>
          <div className="flex items-center gap-4">
            <span className="grid place-items-center w-16 h-16 rounded-2xl bg-[#F0FAF2] text-[#087A35]">
              <ServiceIcon icon={service.icon} className="w-9 h-9" />
            </span>
            <div>
              <h1 className="text-[28px] sm:text-[34px] font-bold text-[#064B27] leading-tight">{service.nameBn}</h1>
              <p className="text-[#737B73] font-en">{service.nameEn}</p>
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
          {service.tagline && <p className="mt-6 text-lg font-medium text-[#202820]">{service.tagline}</p>}
          {service.description && <p className="mt-2 text-[16px] leading-relaxed text-[#4c584c]">{service.description}</p>}

          <h2 className="text-[21px] font-bold text-[#064B27] mt-10 mb-4">এই সার্ভিসের যাচাইকৃত প্রফেশনাল</h2>
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

          <h2 className="text-[21px] font-bold text-[#064B27] mt-10 mb-4">সাধারণ জিজ্ঞাসা</h2>
          <div className="divide-y divide-[#E5EAE5] border border-[#E5EAE5] rounded-2xl bg-white overflow-hidden">
            {FAQS.map((f, i) => (
              <div key={f.q}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-semibold text-[#202820]"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                >
                  {f.q}
                  <span className={`text-[#087A35] transition-transform ${openFaq === i ? "rotate-180" : ""}`}>{Icon.chevronDown("w-5 h-5")}</span>
                </button>
                {openFaq === i && <p className="px-5 pb-4 text-[15px] text-[#4c584c] leading-relaxed">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="lg:sticky lg:top-24 space-y-4">
          <PriceBlock service={service} />
          <a
            href={`#/book?service=${service.slug}`}
            className="flex items-center justify-center gap-2 w-full bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold text-[17px] px-5 py-3.5 rounded-2xl"
          >
            এখনই বুকিং করুন {Icon.arrowRight("w-5 h-5")}
          </a>
          <p className="text-center text-[13.5px] text-[#737B73]">বুকিং সম্পূর্ণ ফ্রি — মূল্য দিতে হবে কাজ শেষে।</p>
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
        <label className="flex items-center gap-2 flex-1 border border-[#E5EAE5] rounded-xl px-3.5 bg-white focus-within:border-[#087A35]">
          <span className="text-[#087A35]">{Icon.search("w-5 h-5")}</span>
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
            className="w-full md:w-[200px] appearance-none border border-[#E5EAE5] rounded-xl pl-4 pr-9 py-3 bg-white font-medium cursor-pointer"
          >
            <option value="">সব ক্যাটাগরি</option>
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>{s.nameBn}</option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737B73] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
        </label>
        <label className="relative">
          <span className="sr-only">এলাকা</span>
          <select
            aria-label="এলাকা অনুযায়ী ফিল্টার"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full md:w-[190px] appearance-none border border-[#E5EAE5] rounded-xl pl-4 pr-9 py-3 bg-white font-medium cursor-pointer"
          >
            <option value="">সব এলাকা</option>
            {locations.map((l) => (
              <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
            ))}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737B73] pointer-events-none">{Icon.chevronDown("w-4 h-4")}</span>
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
            <a href="#/services" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">
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
  if (data.isPending) return <Spinner />;
  const pro = data.data?.professional;
  if (!pro) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-14">
        <EmptyState
          title="প্রোফাইলটি পাওয়া যায়নি"
          body="এই প্রফেশনালের প্রোফাইল এখন প্রকাশিত নয়।"
          action={<a href="#/professionals" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">সব প্রফেশনাল দেখুন</a>}
        />
      </div>
    );
  }
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 lg:py-12">
      <a href="#/professionals" className="inline-flex items-center gap-1.5 text-[#087A35] font-medium text-[15px] hover:underline">
        {Icon.arrowLeft("w-4 h-4")} সব প্রফেশনাল
      </a>
      <div className="mt-4 rounded-3xl border border-[#E5EAE5] bg-white p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row gap-5">
          <Avatar name={pro.name} photoUrl={pro.photoUrl} size="w-24 h-24" textSize="text-3xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold text-[#064B27]">{pro.name}</h1>
              <span className="inline-flex items-center gap-1 bg-[#087A35] text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                {Icon.badgeCheck("w-4 h-4")} যাচাইকৃত
              </span>
              <span
                className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${pro.available ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
              >
                {pro.available ? "এখন কাজ নিতে পারবেন" : "এখন ব্যস্ত আছেন"}
              </span>
            </div>
            <p className="mt-1 text-[#737B73]">
              {pro.categoryName} • {pro.experienceYears} বছরের অভিজ্ঞতা
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
              {pro.avgRating != null ? (
                <span className="flex items-center gap-1.5">
                  <Stars value={pro.avgRating} /> <b>{pro.avgRating}</b>
                  <span className="text-[#737B73]">({pro.reviewCount}টি রিভিউ)</span>
                </span>
              ) : (
                <span className="text-[#737B73]">এখনো কোনো রিভিউ নেই</span>
              )}
              <span className="text-[#4c584c]">{pro.completedJobs}টি কাজ সম্পন্ন</span>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[15px] text-[#4c584c]">
              <span className="text-[#087A35] mt-0.5">{Icon.pin("w-4 h-4")}</span>
              সেবার এলাকা: {pro.areas.join(", ") || "টাঙ্গাইল"}
            </p>
          </div>
        </div>
        {pro.bio && (
          <div className="mt-6">
            <h2 className="font-bold text-[#064B27] mb-1.5">পরিচিতি</h2>
            <p className="text-[15.5px] leading-relaxed text-[#4c584c]">{pro.bio}</p>
          </div>
        )}
        {pro.skills && (
          <div className="mt-5">
            <h2 className="font-bold text-[#064B27] mb-1.5">দক্ষতা ও বিশেষত্ব</h2>
            <p className="text-[15.5px] text-[#4c584c]">{pro.skills}</p>
          </div>
        )}
        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <a
            href={`tel:${pro.phone}`}
            className="flex-1 inline-flex items-center justify-center gap-2 border-[1.5px] border-[#087A35] text-[#087A35] font-bold px-5 py-3 rounded-xl hover:bg-[#F0FAF2]"
            aria-label={`${pro.name}-কে কল করুন`}
          >
            {Icon.phone("w-5 h-5")} কল করুন
          </a>
          <a
            href={`#/book?service=${pro.categorySlug}&pro=${pro.id}`}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold px-5 py-3 rounded-xl"
          >
            এই প্রফেশনালকে বুক করুন {Icon.arrowRight("w-4 h-4")}
          </a>
        </div>
      </div>

      <h2 className="text-[21px] font-bold text-[#064B27] mt-10 mb-4">গ্রাহকদের রিভিউ</h2>
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
  "w-full border border-[#E5EAE5] rounded-xl px-3.5 py-2.5 text-[15px] bg-white outline-none focus:border-[#087A35] focus:ring-2 focus:ring-[#087A35]/15";
export const labelCls = "block text-sm font-semibold text-[#202820] mb-1.5";

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
      <label className="flex items-center gap-3 border border-dashed border-[#cfe3d3] rounded-xl px-3.5 py-3 cursor-pointer hover:bg-[#F0FAF2]">
        <span className="text-[#087A35]">{Icon.camera("w-5 h-5")}</span>
        <span className="text-sm text-[#4c584c] truncate">{fileName || "ছবি বেছে নিন (ঐচ্ছিক)"}</span>
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
    <div className="bg-[#F0FAF2] min-h-[70vh]">
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl border border-[#E5EAE5] shadow-[0_14px_40px_rgba(6,75,39,0.08)] p-6 sm:p-8 gs-fade-up">
          <h1 className="text-[24px] font-bold text-[#064B27]">{title}</h1>
          <p className="mt-1 text-[15px] text-[#737B73]">{sub}</p>
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
          className="w-full bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold py-3 rounded-xl"
        >
          {login.isPending ? "লগইন হচ্ছে…" : "লগইন"}
        </button>
      </form>
      <div className="mt-5 text-[15px] text-[#4c584c] space-y-2">
        <p>
          অ্যাকাউন্ট নেই?{" "}
          <a className="text-[#087A35] font-semibold hover:underline" href="#/register">গ্রাহক হিসেবে নিবন্ধন করুন</a>
        </p>
        <p>
          মিস্ত্রি হিসেবে কাজ করতে চান?{" "}
          <a className="text-[#087A35] font-semibold hover:underline" href="#/join">প্রফেশনাল নিবন্ধন</a>
        </p>
        {meta.data && !meta.data.adminExists && (
          <p className="pt-2 border-t border-[#F0F3F0]">
            প্ল্যাটফর্ম মালিক?{" "}
            <a className="text-[#FF8A00] font-semibold hover:underline" href="#/admin-setup">প্রথম অ্যাডমিন অ্যাকাউন্ট সেটআপ করুন</a>
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
          <input id="reg-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="পুরো নাম লিখুন" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-phone">মোবাইল নম্বর *</label>
          <input id="reg-phone" className={inputCls} inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="reg-pass">পাসওয়ার্ড *</label>
          <input id="reg-pass" type="password" className={inputCls} autoComplete="new-password" placeholder="কমপক্ষে ৬ অক্ষর" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
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
          <input id="reg-addr" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="গ্রাম / এলাকা, বাসার বিবরণ" />
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
        <button type="submit" disabled={reg.isPending} className="w-full bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold py-3 rounded-xl">
          {reg.isPending ? "অ্যাকাউন্ট তৈরি হচ্ছে…" : "নিবন্ধন করুন"}
        </button>
      </form>
      <p className="mt-5 text-[15px] text-[#4c584c]">
        ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
        <a className="text-[#087A35] font-semibold hover:underline" href="#/login">লগইন করুন</a>
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
        nidNumber: nid || undefined,
        photo,
      }),
    onSuccess: (r) => redirect(r.token, r.user.role, params.get("next")),
    onError: (e) => setError(errMsg(e)),
  });
  const toggleArea = (a: string) =>
    setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  return (
    <div className="bg-[#F0FAF2] min-h-[70vh]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl border border-[#E5EAE5] shadow-[0_14px_40px_rgba(6,75,39,0.08)] p-6 sm:p-8 gs-fade-up">
          <h1 className="text-[24px] font-bold text-[#064B27]">প্রফেশনাল হিসেবে যোগ দিন</h1>
          <p className="mt-1 text-[15px] text-[#737B73]">
            তথ্য জমা দিন — অ্যাডমিন যাচাই সম্পন্ন হলে আপনার প্রোফাইল গ্রাহকদের কাছে প্রকাশিত হবে এবং কাজ পেতে শুরু করবেন।
          </p>
          <form
            className="mt-6 grid sm:grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (!category) return setError("আপনার কাজের ক্যাটাগরি বেছে নিন।");
              if (areas.length === 0) return setError("কমপক্ষে একটি সেবার এলাকা বেছে নিন।");
              reg.mutate();
            }}
          >
            <div>
              <label className={labelCls} htmlFor="jp-name">পুরো নাম *</label>
              <input id="jp-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="আপনার নাম" />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-phone">মোবাইল নম্বর *</label>
              <input id="jp-phone" className={inputCls} inputMode="numeric" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-pass">পাসওয়ার্ড *</label>
              <input id="jp-pass" type="password" className={inputCls} autoComplete="new-password" placeholder="কমপক্ষে ৬ অক্ষর" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div>
              <label className={labelCls} htmlFor="jp-email">ইমেইল (ঐচ্ছিক)</label>
              <input id="jp-email" type="email" className={inputCls} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
              <input id="jp-exp" type="number" min={0} max={60} className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-skills">দক্ষতা ও বিশেষত্ব</label>
              <input id="jp-skills" className={inputCls} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="যেমন: বাসার ওয়ারিং, IPS লাইন, সুইচবোর্ড" />
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
                        on ? "bg-[#087A35] text-white border-[#087A35]" : "bg-white text-[#4c584c] border-[#E5EAE5]"
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
              <input id="jp-addr" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="গ্রাম / এলাকা, উপজেলা" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-nid">জাতীয় পরিচয়পত্র (NID) নম্বর</label>
              <input id="jp-nid" className={inputCls} inputMode="numeric" value={nid} onChange={(e) => setNid(e.target.value)} placeholder="যাচাইয়ের জন্য NID নম্বর" />
              <p className="mt-1 text-[13px] text-[#737B73]">আপনার NID নম্বর শুধুমাত্র অ্যাডমিন যাচাইয়ের জন্য ব্যবহার হবে — কখনো প্রকাশ্যে দেখানো হবে না।</p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="jp-bio">সংক্ষিপ্ত পরিচিতি</label>
              <textarea id="jp-bio" className={inputCls} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="আপনার কাজের অভিজ্ঞতা সম্পর্কে দুই-এক লাইন লিখুন" />
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
            <button type="submit" disabled={reg.isPending} className="sm:col-span-2 w-full bg-[#FF8A00] hover:bg-[#E67A00] disabled:opacity-60 text-white font-bold py-3 rounded-xl">
              {reg.isPending ? "জমা হচ্ছে…" : "আবেদন জমা দিন"}
            </button>
          </form>
          <p className="mt-5 text-[15px] text-[#4c584c]">
            ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
            <a className="text-[#087A35] font-semibold hover:underline" href="#/login">লগইন করুন</a>
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
        <a href="#/login" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">অ্যাডমিন লগইন করুন</a>
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
          <input id="as-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="as-phone">মোবাইল নম্বর</label>
          <input id="as-phone" className={inputCls} inputMode="numeric" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="as-pass">পাসওয়ার্ড</label>
          <input id="as-pass" type="password" className={inputCls} autoComplete="new-password" placeholder="শক্তিশালী পাসওয়ার্ড দিন" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={claim.isPending} className="w-full bg-[#064B27] hover:bg-[#043A1E] disabled:opacity-60 text-white font-bold py-3 rounded-xl">
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
      <h1 className="text-[28px] sm:text-[34px] font-bold text-[#064B27]">{title}</h1>
      {sub && <p className="mt-2 text-[16px] text-[#737B73] leading-relaxed">{sub}</p>}
      <div className="mt-7 space-y-5 text-[15.5px] leading-relaxed text-[#374237]">{children}</div>
    </div>
  );
}

function HowPage() {
  return (
    <PageShell title="কিভাবে কাজ করে?" sub="GhorSheba একটি সার্ভিস সমন্বয় প্ল্যাটফর্ম — বুকিং থেকে কাজ শেষ পর্যন্ত পুরো প্রক্রিয়াটি স্বচ্ছ ও সহজ।">
      <div className="bg-[#F0FAF2] rounded-3xl p-6">
        <HowSteps />
      </div>
      <h2 className="text-xl font-bold text-[#064B27]">এরপর যা ঘটে</h2>
      <ol className="list-decimal list-inside space-y-2">
        <li>আপনি বুকিং রিকোয়েস্ট পাঠালে সেটি প্রথমে <b>অপেক্ষমাণ</b> অবস্থায় অ্যাডমিনের কাছে যায়।</li>
        <li>অ্যাডমিন কাজের বিবরণ দেখে উপযুক্ত যাচাইকৃত প্রফেশনালের সাথে কথা বলে বুকিং <b>নিশ্চিত</b> করেন।</li>
        <li>প্রফেশনাল আপনার ঠিকানায় গিয়ে কাজ সম্পন্ন করেন; কাজ শেষে আপনি <b>সম্পন্ন নিশ্চিত</b> করেন।</li>
        <li>কাজ সম্পন্ন হলে প্রফেশনালের কাজ নিয়ে <b>রিভিউ</b> দিতে পারবেন — যা অন্য গ্রাহকদের সিদ্ধান্তে সাহায্য করবে।</li>
      </ol>
      <p>প্রতিটি ধাপে আপনি নোটিফিকেশন পাবেন এবং "আমার বুকিং" থেকে বুকিংয়ের অবস্থা যেকোনো সময় দেখতে পারবেন।</p>
      <a href="#/services" className="inline-flex bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold px-6 py-3 rounded-xl">এখনই সার্ভিস খুঁজুন</a>
    </PageShell>
  );
}

function AboutPage() {
  return (
    <PageShell title="আমাদের সম্পর্কে" sub="GhorSheba — Your Home. Our Responsibility.">
      <p>
        GhorSheba টাঙ্গাইল থেকে শুরু হওয়া একটি হোম-সার্ভিস প্ল্যাটফর্ম। আমাদের লক্ষ্য সহজ: বাসা-বাড়ির যেকোনো কাজের জন্য
        বিশ্বস্ত, যাচাইকৃত স্থানীয় মিস্ত্রি খুঁজে পাওয়া যেন ফোনের কয়েকটি ছোঁয়াতেই সম্ভব হয় — আর দক্ষ মিস্ত্রিদের জন্যও
        যেন নিয়মিত ও সম্মানজনক কাজের সুযোগ তৈরি হয়।
      </p>
      <h2 className="text-xl font-bold text-[#064B27]">বিশ্বাস ও নিরাপত্তা</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>প্রতিটি প্রফেশনালের নিবন্ধন অ্যাডমিন যাচাই করার পরই তার প্রোফাইল ও "যাচাইকৃত" ব্যাজ প্রকাশিত হয়।</li>
        <li>রেটিং ও রিভিউ আসে শুধুমাত্র আসল, সম্পন্ন বুকিং থেকে — কোনো বানানো প্রশংসা আমরা দেখাই না।</li>
        <li>মূল্য সবসময় কাজের ধরন ও পরিমাণ অনুযায়ী, আপনার সম্মতি নিয়ে নির্ধারিত হয়।</li>
        <li>প্রফেশনালদের জাতীয় পরিচয়পত্রের তথ্য শুধু যাচাইয়ের জন্য ব্যবহৃত হয় — কখনো প্রকাশ্যে দেখানো হয় না।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#064B27]">আমাদের সেবার এলাকা</h2>
      <p>বর্তমানে টাঙ্গাইল জেলার ১২টি উপজেলায় সেবা চালু আছে — ভবিষ্যতে ধাপে ধাপে অন্য জেলায় বিস্তারের পরিকল্পনা রয়েছে।</p>
      <a href="#/join" className="inline-flex bg-[#087A35] hover:bg-[#064B27] text-white font-bold px-6 py-3 rounded-xl">মিস্ত্রি হিসেবে যোগ দিন</a>
    </PageShell>
  );
}

function ContactPage() {
  const catalog = useCatalog();
  const c = catalog.data;
  const has = c?.supportPhone || c?.supportEmail || c?.supportWhatsapp;
  return (
    <PageShell title="যোগাযোগ করুন" sub="বুকিং বা সার্ভিস নিয়ে যেকোনো প্রয়োজনে আমাদের সাথে যোগাযোগ করুন।">
      {has ? (
        <ul className="space-y-3">
          {c?.supportPhone && (
            <li className="flex items-center gap-3 rounded-2xl border border-[#E5EAE5] p-4">
              <span className="text-[#087A35]">{Icon.phone("w-5 h-5")}</span>
              <span>ফোন: <a className="font-semibold font-en hover:underline" href={`tel:${c.supportPhone}`}>{c.supportPhone}</a></span>
            </li>
          )}
          {c?.supportWhatsapp && (
            <li className="flex items-center gap-3 rounded-2xl border border-[#E5EAE5] p-4">
              <span className="text-[#087A35]">{Icon.message("w-5 h-5")}</span>
              <span>WhatsApp: <a className="font-semibold font-en hover:underline" href={`https://wa.me/${c.supportWhatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">{c.supportWhatsapp}</a></span>
            </li>
          )}
          {c?.supportEmail && (
            <li className="flex items-center gap-3 rounded-2xl border border-[#E5EAE5] p-4">
              <span className="text-[#087A35]">{Icon.message("w-5 h-5")}</span>
              <span>ইমেইল: <a className="font-semibold font-en hover:underline" href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a></span>
            </li>
          )}
          <li className="flex items-center gap-3 rounded-2xl border border-[#E5EAE5] p-4">
            <span className="text-[#087A35]">{Icon.pin("w-5 h-5")}</span>
            <span>এলাকা: টাঙ্গাইল, বাংলাদেশ</span>
          </li>
        </ul>
      ) : (
        <div className="rounded-2xl bg-[#F0FAF2] border border-[#cfe3d3] p-5">
          <p>আমাদের সরাসরি ফোন নম্বর ও ইমেইল শীঘ্রই এখানে যুক্ত হবে। আপাতত যোগাযোগের সবচেয়ে ভালো উপায়:</p>
          <ul className="list-disc list-inside mt-2 space-y-1.5">
            <li>সার্ভিস প্রয়োজন হলে সরাসরি <a className="text-[#087A35] font-semibold hover:underline" href="#/services">বুকিং করুন</a> — অ্যাডমিন আপনার দেওয়া নম্বরে যোগাযোগ করবেন।</li>
            <li>অ্যাকাউন্ট থাকলে ড্যাশবোর্ড থেকে অভিযোগ/অনুরোধ পাঠান — আমরা সেখানেই উত্তর দিয়ে থাকি।</li>
          </ul>
        </div>
      )}
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
      <div className="divide-y divide-[#E5EAE5] border border-[#E5EAE5] rounded-2xl bg-white overflow-hidden">
        {items.map((f, i) => (
          <div key={f.q}>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-semibold"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? -1 : i)}
            >
              {f.q}
              <span className={`text-[#087A35] transition-transform ${open === i ? "rotate-180" : ""}`}>{Icon.chevronDown("w-5 h-5")}</span>
            </button>
            {open === i && <p className="px-5 pb-4 text-[15px] text-[#4c584c] leading-relaxed">{f.a}</p>}
          </div>
        ))}
      </div>
      <p>
        উত্তর না পেলে ড্যাশবোর্ড থেকে অভিযোগ/অনুরোধ পাঠান, অথবা <a className="text-[#087A35] font-semibold hover:underline" href="#/contact">যোগাযোগ পেজ</a> দেখুন।
      </p>
    </PageShell>
  );
}

function PrivacyPage() {
  return (
    <PageShell title="গোপনীয়তা নীতি" sub="সর্বশেষ হালনাগাদ: ১৪ নভেম্বর ২০২৬">
      <h2 className="text-xl font-bold text-[#064B27]">আমরা কোন তথ্য সংগ্রহ করি</h2>
      <p>অ্যাকাউন্ট তৈরির সময় নাম, মোবাইল নম্বর ও ঠিকানা; বুকিংয়ের সময় কাজের বিবরণ, ঠিকানা ও পছন্দের সময়; এবং প্রফেশনালদের ক্ষেত্রে যাচাইয়ের জন্য জাতীয় পরিচয়পত্রের তথ্য সংগ্রহ করা হয়।</p>
      <h2 className="text-xl font-bold text-[#064B27]">তথ্য কীভাবে ব্যবহার হয়</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>বুকিং প্রক্রিয়া সম্পন্ন করা ও প্রফেশনাল অ্যাসাইন করা।</li>
        <li>বুকিংয়ের অবস্থা সম্পর্কে নোটিফিকেশন পাঠানো।</li>
        <li>প্রফেশনালদের পরিচয় যাচাই করা (NID তথ্য শুধু অ্যাডমিনের জন্য দৃশ্যমান, কখনো প্রকাশ্যে নয়)।</li>
      </ul>
      <h2 className="text-xl font-bold text-[#064B27]">তথ্য ভাগাভাগি</h2>
      <p>আপনার ব্যক্তিগত তথ্য কোনো তৃতীয় পক্ষের কাছে বিক্রি করা হয় না। বুকিং সম্পন্নের জন্য প্রয়োজনীয় তথ্য (নাম, ফোন, ঠিকানা) শুধুমাত্র আপনাকে অ্যাসাইন করা প্রফেশনালের সাথে ভাগ করা হয়।</p>
      <h2 className="text-xl font-bold text-[#064B27]">আপনার অধিকার</h2>
      <p>ড্যাশবোর্ড থেকে যেকোনো সময় আপনার প্রোফাইল তথ্য হালনাগাদ করতে পারবেন। অ্যাকাউন্ট বা তথ্য মুছে ফেলতে চাইলে সাপোর্টে অনুরোধ পাঠান।</p>
    </PageShell>
  );
}

function TermsPage() {
  return (
    <PageShell title="শর্তাবলী" sub="সর্বশেষ হালনাগাদ: ১৪ নভেম্বর ২০২৬">
      <h2 className="text-xl font-bold text-[#064B27]">সেবার ধরন</h2>
      <p>GhorSheba একটি সার্ভিস সমন্বয় প্ল্যাটফর্ম — আমরা গ্রাহক ও যাচাইকৃত স্থানীয় প্রফেশনালদের মধ্যে সংযোগ স্থাপন করি। বুকিং রিকোয়েস্ট পাঠানো মানেই বুকিং নিশ্চিত নয়; অ্যাডমিন নিশ্চিত করলেই বুকিং চূড়ান্ত হয়।</p>
      <h2 className="text-xl font-bold text-[#064B27]">মূল্য ও পেমেন্ট</h2>
      <p>সার্ভিসের মূল্য কাজের ধরন ও পরিমাণ অনুযায়ী নির্ধারিত হয় এবং কাজ শুরুর আগে গ্রাহকের সম্মতি নেওয়া হয়। আপাতত পেমেন্ট নগদ (ক্যাশ) — অনলাইন পেমেন্ট চালু হলে আলাদাভাবে জানানো হবে।</p>
      <h2 className="text-xl font-bold text-[#064B27]">বাতিল নীতি</h2>
      <p>কাজ শুরু হওয়ার আগে গ্রাহক বুকিং বাতিল করতে পারবেন। কাজ চলমান অবস্থায় বাতিল বা পরিবর্তনের জন্য সাপোর্টে যোগাযোগ করুন।</p>
      <h2 className="text-xl font-bold text-[#064B27]">প্রফেশনালদের জন্য</h2>
      <p>প্রফেশনালদের তথ্য যাচাইয়ের পর প্রোফাইল প্রকাশিত হয়। ভুল তথ্য, অভিযোগ প্রমাণিত হওয়া বা নিয়ম ভঙ্গের ক্ষেত্রে অ্যাডমিন প্রোফাইল স্থগিত বা বাতিল করতে পারবেন।</p>
      <h2 className="text-xl font-bold text-[#064B27]">দায়বদ্ধতা</h2>
      <p>আমরা প্রতিটি বুকিংয়ে সর্বোচ্চ যত্ন নেওয়ার চেষ্টা করি। কোনো বিরোধ দেখা দিলে প্রথমে আমাদের সাপোর্টে অভিযোগ জানান — আমরা দুই পক্ষের কথা শুনে সমাধানের চেষ্টা করবো।</p>
    </PageShell>
  );
}

export function BookingStatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${statusColor(status)}`}>
      {STATUS_BN[status] ?? status}
    </span>
  );
}
