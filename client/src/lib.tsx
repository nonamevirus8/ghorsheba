// Shared helpers, session handling, icon set and small UI primitives.

import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";

export type Catalog = ApiResponse<typeof api, "getCatalog">;
export type Service = Catalog["services"][number];
export type LocationRow = Catalog["locations"][number];
export type Pro = ApiResponse<typeof api, "listProfessionals">["professionals"][number];
export type Booking = ApiResponse<typeof api, "getMyBookings">["bookings"][number];
export type Review = ApiResponse<typeof api, "getHomeReviews">["reviews"][number];
export type Me = ApiResponse<typeof api, "getMe">;

// ------------------------------------------------------------- session

const TOKEN_KEY = "ghorsheba_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function useMe() {
  const token = getToken();
  return useQuery({
    queryKey: ["me", token],
    queryFn: () => api.getMe({ token: token ?? "" }),
    enabled: !!token,
    retry: false,
  });
}

export function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: () => api.getCatalog({}) });
}

// ------------------------------------------------- social links (Phase 6)
//
// Owner-supplied social links. The server returns ONLY enabled links;
// while the owner has added none, this list is empty and every surface
// (footer, contact page, mobile menu) renders no social icons at all.

export type SocialLink = ApiResponse<typeof api, "getSocialLinks">["links"][number];

export function useSocialLinks() {
  return useQuery({ queryKey: ["social-links"], queryFn: () => api.getSocialLinks({}) });
}

export const SOCIAL_PLATFORM_BN: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  other: "ওয়েবসাইট",
};

export function socialIcon(platform: string, cls?: string): ReactNode {
  switch (platform) {
    case "facebook":
      return Icon.facebook(cls);
    case "instagram":
      return Icon.instagram(cls);
    case "youtube":
      return Icon.youtube(cls);
    case "tiktok":
      return Icon.tiktok(cls);
    case "whatsapp":
      return Icon.whatsapp(cls);
    default:
      return Icon.globe(cls);
  }
}

export function socialLabel(link: SocialLink): string {
  return link.label ?? SOCIAL_PLATFORM_BN[link.platform] ?? link.platform;
}

/** Icon row of the enabled social links; renders nothing when empty. */
export function SocialLinksRow({ dark = false }: { dark?: boolean }) {
  const links = useSocialLinks();
  const rows = links.data?.links ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {rows.map((l) => (
        <a
          key={l.id}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          aria-label={socialLabel(l)}
          title={socialLabel(l)}
          className={
            dark
              ? "grid place-items-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-[#FF8A00] transition-colors"
              : "grid place-items-center w-10 h-10 rounded-full bg-[#F0FAF2] text-[#087A35] hover:bg-[#087A35] hover:text-white transition-colors"
          }
        >
          {socialIcon(l.platform, "w-5 h-5")}
        </a>
      ))}
    </div>
  );
}

// ------------------------------------------------ support tickets (Phase 6)

export const TICKET_STATUS_BN: Record<string, string> = {
  open: "খোলা হয়েছে",
  in_progress: "কাজ চলছে",
  waiting_customer: "আপনার উত্তরের অপেক্ষায়",
  resolved: "সমাধান হয়েছে",
  closed: "বন্ধ করা হয়েছে",
};

export const TICKET_CATEGORY_BN: Record<string, string> = {
  general: "সাধারণ",
  booking: "বুকিং",
  payment: "পেমেন্ট",
  account: "অ্যাকাউন্ট",
  verification: "যাচাই (ভেরিফিকেশন)",
  other: "অন্যান্য",
};

export function ticketStatusColor(status: string): string {
  switch (status) {
    case "open":
      return "bg-amber-100 text-amber-800";
    case "in_progress":
      return "bg-sky-100 text-sky-800";
    case "waiting_customer":
      return "bg-orange-100 text-orange-800";
    case "resolved":
      return "bg-[#087A35] text-white";
    case "closed":
      return "bg-[#E5EAE5] text-[#737B73]";
    default:
      return "bg-[#E5EAE5] text-[#737B73]";
  }
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    const token = getToken();
    if (token) {
      try {
        await api.logout({ token });
      } catch {
        /* ignore */
      }
    }
    setToken(null);
    qc.clear();
  };
}

// ------------------------------------------------------------- routing

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash || "#/");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function go(path: string) {
  window.location.hash = path;
}

// ------------------------------------------------------------- formatting

export const STATUS_BN: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  confirmed: "মূল্য নিশ্চিত হয়েছে",
  price_confirmed: "মূল্য নিশ্চিত হয়েছে",
  assigned: "প্রফেশনাল দেওয়া হয়েছে",
  accepted: "প্রফেশনাল গ্রহণ করেছেন",
  in_progress: "কাজ চলছে",
  pro_completed: "কাজ শেষ — নিশ্চিতকরণ বাকি",
  completed: "সম্পন্ন নিশ্চিত হয়েছে",
  customer_confirmed: "সম্পন্ন নিশ্চিত হয়েছে",
  admin_reviewed: "অ্যাডমিন যাচাই সম্পন্ন",
  cancelled: "বাতিল",
  rejected: "প্রত্যাখ্যাত",
  disputed: "বিরোধ চলমান",
  rescheduled: "সময় পুনঃনির্ধারিত",
};

/** Master-flow stage order for progress displays (Phase 7). */
export const STAGE_ORDER = [
  "pending",
  "price_confirmed",
  "assigned",
  "accepted",
  "in_progress",
  "pro_completed",
  "customer_confirmed",
  "admin_reviewed",
] as const;

export const STAGE_BN: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  price_confirmed: "মূল্য নিশ্চিত",
  assigned: "প্রফেশনাল দেওয়া হয়েছে",
  accepted: "গৃহীত",
  in_progress: "কাজ চলছে",
  pro_completed: "কাজ শেষ",
  customer_confirmed: "গ্রাহক নিশ্চিত করেছেন",
  admin_reviewed: "যাচাই সম্পন্ন",
  cancelled: "বাতিল",
  rejected: "প্রত্যাখ্যাত",
  disputed: "বিরোধ চলমান",
  rescheduled: "পুনঃনির্ধারিত",
};

/**
 * Stage moves the admin form may offer from each stage — mirrors the
 * server's ADMIN_STAGE_TRANSITIONS (the server re-checks every move;
 * this only shapes the dropdown). Entering "rescheduled" is not here:
 * it needs a new date/time and has its own controls.
 */
export const ADMIN_STAGE_NEXT: Record<string, string[]> = {
  pending: ["price_confirmed", "assigned", "cancelled", "rejected"],
  price_confirmed: ["assigned", "cancelled", "rejected", "disputed"],
  assigned: ["price_confirmed", "cancelled", "disputed"],
  accepted: ["in_progress", "cancelled", "disputed"],
  in_progress: ["cancelled", "disputed"],
  pro_completed: ["customer_confirmed", "disputed"],
  customer_confirmed: ["admin_reviewed", "disputed"],
  admin_reviewed: ["disputed"],
  cancelled: [],
  rejected: [],
  disputed: [],
  rescheduled: [],
};

export const PRO_STATUS_BN: Record<string, string> = {
  pending: "যাচাইয়ের অপেক্ষায়",
  verified: "যাচাইকৃত",
  rejected: "গৃহীত হয়নি",
  suspended: "স্থগিত",
};

export function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "customer_confirmed":
    case "admin_reviewed":
      return "bg-[#087a35] text-white";
    case "cancelled":
    case "rejected":
      return "bg-red-100 text-red-700";
    case "disputed":
      return "bg-red-600 text-white";
    case "rescheduled":
      return "bg-sky-100 text-sky-800";
    case "in_progress":
    case "pro_completed":
      return "bg-blue-100 text-blue-800";
    case "assigned":
    case "accepted":
      return "bg-violet-100 text-violet-800";
    case "confirmed":
    case "price_confirmed":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
}

export const bdt = (n: number) => `৳${n.toLocaleString("bn-BD")}`;

// ------------------------------------------------------------- images

export async function fileToImage(file: File): Promise<{ dataBase64: string; mimeType: string }> {
  const { fileToBase64 } = await import("@hatch/space-sdk/client");
  const r = await fileToBase64(file);
  return { dataBase64: r.dataBase64, mimeType: r.mimeType };
}

// ------------------------------------------------------------- icons

function svg(path: ReactNode, className = "w-6 h-6") {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const Icon = {
  bolt: (c?: string) =>
    svg(<path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" fill="currentColor" stroke="none" />, c ?? "w-6 h-6"),
  droplet: (c?: string) =>
    svg(<path d="M12 3.5c3.2 3.6 6 6.9 6 10a6 6 0 1 1-12 0c0-3.1 2.8-6.4 6-10z" />, c ?? "w-6 h-6"),
  brick: (c?: string) =>
    svg(
      <>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="M3 12h18M9 5v7M15 5v7M6 12v7M12 12v7M18 12v7" />
      </>,
      c ?? "w-6 h-6",
    ),
  roller: (c?: string) =>
    svg(
      <>
        <rect x="3" y="4" width="13" height="5" rx="1" />
        <path d="M16 6.5h3.5a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H13v3" />
        <path d="M11.5 15v.8" />
        <rect x="10" y="15.5" width="3" height="5" rx="1" />
      </>,
      c ?? "w-6 h-6",
    ),
  hammer: (c?: string) =>
    svg(
      <>
        <path d="m14 5 5 5-2.5 2.5-5-5z" />
        <path d="M11.5 7.5 4 15l2 2 7.5-7.5M14 5l1.8-1.8a2.1 2.1 0 0 1 3 0l1.4 1.4a2.1 2.1 0 0 1 0 3L18.5 9.5" />
        <path d="m4 15-1.2 4.2L7 18" />
      </>,
      c ?? "w-6 h-6",
    ),
  snow: (c?: string) =>
    svg(
      <>
        <path d="M12 2v20M4 6l16 12M20 6 4 18M12 2l-2 3m2-3 2 3M12 22l-2-3m2 3 2-3M4 6l3.6.6M4 6l.6 3.6M20 18l-3.6-.6m3.6.6-.6-3.6M20 6l-3.6.6M20 6l-.6 3.6M4 18l3.6-.6M4 18l.6-3.6" />
      </>,
      c ?? "w-6 h-6",
    ),
  grid: (c?: string) =>
    svg(
      <>
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      </>,
      c ?? "w-6 h-6",
    ),
  flame: (c?: string) =>
    svg(
      <path d="M12 3c1 3-2.5 4.6-2.5 7.5a2.6 2.6 0 0 0 5 0c0-1-.5-1.8-1-2.7 2 1.2 3.5 3.2 3.5 5.7A5.5 5.5 0 0 1 6.5 13C6.5 8.5 10.5 6.5 12 3z" />,
      c ?? "w-6 h-6",
    ),
  sparkle: (c?: string) =>
    svg(
      <>
        <path d="M11 4 12.3 8.7 17 10l-4.7 1.3L11 16l-1.3-4.7L5 10l4.7-1.3z" />
        <path d="M18.5 15.5l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8z" />
      </>,
      c ?? "w-6 h-6",
    ),
  window: (c?: string) =>
    svg(
      <>
        <rect x="4" y="3" width="16" height="18" rx="1.5" />
        <path d="M12 3v18M4 12h16" />
      </>,
      c ?? "w-6 h-6",
    ),
  home: (c?: string) =>
    svg(
      <>
        <path d="m3.5 11 8.5-7 8.5 7" />
        <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </>,
      c ?? "w-6 h-6",
    ),
  shield: (c?: string) =>
    svg(
      <>
        <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.4 7 9.3 4.1-1.9 7-5 7-9.3V5.8z" />
        <path d="m9 11.6 2.2 2.2 4-4.2" />
      </>,
      c ?? "w-6 h-6",
    ),
  tool: (c?: string) =>
    svg(
      <path d="M14.5 6.5a4 4 0 0 1 5.3-3.8L17 5.5l1.5 3 2.8-2.8a4 4 0 0 1-5.5 5.5L8 19a2.1 2.1 0 0 1-3-3l6.8-6.8a4 4 0 0 1 2.7-2.7z" />,
      c ?? "w-6 h-6",
    ),
  search: (c?: string) =>
    svg(
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.8-3.8" />
      </>,
      c ?? "w-5 h-5",
    ),
  pin: (c?: string) =>
    svg(
      <>
        <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </>,
      c ?? "w-5 h-5",
    ),
  check: (c?: string) => svg(<path d="m4.5 12.5 5 5 10-11" />, c ?? "w-5 h-5"),
  checkCircle: (c?: string) =>
    svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.2 2.4 2.4 4.6-5" />
      </>,
      c ?? "w-5 h-5",
    ),
  badgeCheck: (c?: string) =>
    svg(
      <>
        <path d="M12 2.8 14.3 4l2.6-.3 1 2.4 2.3 1.2-1 2.4 1 2.4-2.3 1.2-1 2.4-2.6-.3L12 21.2 9.7 20l-2.6.3-1-2.4L3.8 16.7l1-2.4-1-2.4 2.3-1.2 1-2.4 2.6.3z" fill="currentColor" stroke="none" opacity="0.18" />
        <path d="m8.8 12.2 2.2 2.2 4.2-4.6" />
        <circle cx="12" cy="12" r="9" />
      </>,
      c ?? "w-5 h-5",
    ),
  star: (filled: boolean, c?: string) => (
    <svg
      className={c ?? "w-4 h-4"}
      viewBox="0 0 24 24"
      fill={filled ? "#FF8A00" : "none"}
      stroke="#FF8A00"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  ),
  phone: (c?: string) =>
    svg(
      <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.6 1.5C10 20 4 14 3.5 5.6A1.5 1.5 0 0 1 5 4z" />,
      c ?? "w-5 h-5",
    ),
  calendar: (c?: string) =>
    svg(
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>,
      c ?? "w-5 h-5",
    ),
  clock: (c?: string) =>
    svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>,
      c ?? "w-5 h-5",
    ),
  menu: (c?: string) =>
    svg(<path d="M4 7h16M4 12h16M4 17h16" />, c ?? "w-6 h-6"),
  x: (c?: string) => svg(<path d="M6 6l12 12M18 6 6 18" />, c ?? "w-5 h-5"),
  chevronDown: (c?: string) => svg(<path d="m6 9 6 6 6-6" />, c ?? "w-4 h-4"),
  arrowRight: (c?: string) => svg(<path d="M4 12h15m-6-7 7 7-7 7" />, c ?? "w-5 h-5"),
  arrowLeft: (c?: string) => svg(<path d="M20 12H5m6 7-7-7 7-7" />, c ?? "w-5 h-5"),
  bell: (c?: string) =>
    svg(
      <>
        <path d="M6 16v-5a6 6 0 1 1 12 0v5l1.2 2.7a.6.6 0 0 1-.5.9H5.3a.6.6 0 0 1-.5-.9z" />
        <path d="M10 21a2.2 2.2 0 0 0 4 0" />
      </>,
      c ?? "w-5 h-5",
    ),
  user: (c?: string) =>
    svg(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
      </>,
      c ?? "w-5 h-5",
    ),
  users: (c?: string) =>
    svg(
      <>
        <circle cx="9" cy="8.5" r="3.5" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 14.5A6 6 0 0 1 21 20" />
      </>,
      c ?? "w-5 h-5",
    ),
  briefcase: (c?: string) =>
    svg(
      <>
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13.5h18" />
      </>,
      c ?? "w-5 h-5",
    ),
  wallet: (c?: string) =>
    svg(
      <>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v2" />
        <path d="M3 9.5A1.5 1.5 0 0 1 4.5 8H19a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H4.5A1.5 1.5 0 0 1 3 18.5z" />
        <circle cx="16" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      </>,
      c ?? "w-5 h-5",
    ),
  settings: (c?: string) =>
    svg(
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
      </>,
      c ?? "w-5 h-5",
    ),
  logout: (c?: string) =>
    svg(
      <>
        <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M11 12h10m-3.5-3.5L21 12l-3.5 3.5" />
      </>,
      c ?? "w-5 h-5",
    ),
  camera: (c?: string) =>
    svg(
      <>
        <path d="M4 8h2.5l2-2.5h7L17.5 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
        <circle cx="12" cy="13.5" r="3.5" />
      </>,
      c ?? "w-5 h-5",
    ),
  message: (c?: string) =>
    svg(
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z" />,
      c ?? "w-5 h-5",
    ),
  bookOpen: (c?: string) =>
    svg(
      <path d="M12 6c-1.8-1.5-4-2-8-2v14c4 0 6.2.5 8 2 1.8-1.5 4-2 8-2V4c-4 0-6.2.5-8 2zm0 0v14" />,
      c ?? "w-5 h-5",
    ),
  smartphone: (c?: string) =>
    svg(
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M10.8 18.8h2.4" />
      </>,
      c ?? "w-5 h-5",
    ),
  download: (c?: string) =>
    svg(
      <path d="M12 4v10.5m0 0 4.3-4.3M12 14.5 7.7 10.2M4.5 19.5h15" />,
      c ?? "w-5 h-5",
    ),
  share: (c?: string) =>
    svg(
      <path d="M12 3.5v10.5M12 3.5 8.9 6.6M12 3.5l3.1 3.1M6.5 10h-1A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13A1.5 1.5 0 0 0 20 19.5v-8A1.5 1.5 0 0 0 18.5 10h-1" />,
      c ?? "w-5 h-5",
    ),
  // Social platform glyphs (Master Phase 6). Simple filled marks drawn
  // in the same 24px grid; they render ONLY for owner-added, enabled
  // social links — never as decoration for accounts that do not exist.
  facebook: (c?: string) =>
    svg(
      <path d="M14.2 8.2V6.6c0-.8.5-1 1-1h2.3V2.5h-3.2c-3 0-3.9 2.2-3.9 4v1.7H8v3.3h2.4v10h3.8v-10h2.7l.5-3.3h-3.2z" fill="currentColor" stroke="none" />,
      c ?? "w-5 h-5",
    ),
  instagram: (c?: string) =>
    svg(
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        <circle cx="12" cy="12" r="3.8" />
        <path d="M17.2 6.9h.01" strokeWidth="2.6" />
      </>,
      c ?? "w-5 h-5",
    ),
  youtube: (c?: string) =>
    svg(
      <>
        <rect x="2.8" y="5.5" width="18.4" height="13" rx="4" />
        <path d="M10.3 9.4v5.2L14.9 12z" fill="currentColor" stroke="none" />
      </>,
      c ?? "w-5 h-5",
    ),
  tiktok: (c?: string) =>
    svg(
      <path d="M16.6 3c.4 2.3 1.9 3.8 4.2 4v3.1c-1.6 0-3-.5-4.2-1.3v6.4c0 3.4-2.4 5.8-5.7 5.8A5.5 5.5 0 0 1 5.4 15c0-3.2 2.6-5.7 6-5.5v3.2c-1.5-.3-2.9.8-2.9 2.3 0 1.3 1 2.3 2.3 2.3 1.5 0 2.6-1.1 2.6-2.7V3h3.2z" fill="currentColor" stroke="none" />,
      c ?? "w-5 h-5",
    ),
  whatsapp: (c?: string) =>
    svg(
      <>
        <path d="M12 3.8a8.2 8.2 0 0 0-7 13.1L3.8 20.5l3.7-1.1A8.2 8.2 0 1 0 12 3.8z" />
        <path d="M9.2 8.6c.2-.5.5-.5.8-.5h.7c.2 0 .4 0 .5.4l.6 1.5c.1.2 0 .4-.1.6l-.4.5c.5 1 1.4 1.9 2.5 2.4l.5-.4c.2-.1.4-.2.6-.1l1.5.6c.4.1.4.3.4.5v.7c0 .3-.2.6-.8.7-2.9.5-6.9-2.9-7.4-5.8-.1-.6 0-1.2.3-1.9z" fill="currentColor" stroke="none" />
      </>,
      c ?? "w-5 h-5",
    ),
  globe: (c?: string) =>
    svg(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.3 2.3 3.4 5.2 3.4 8.5s-1.1 6.2-3.4 8.5c-2.3-2.3-3.4-5.2-3.4-8.5s1.1-6.2 3.4-8.5z" />
      </>,
      c ?? "w-5 h-5",
    ),
};

export function ServiceIcon({ icon, className }: { icon: string; className?: string }) {
  const fn =
    (Icon as unknown as Record<string, ((c?: string) => ReactNode) | undefined>)[icon] ??
    Icon.tool;
  return <>{fn(className)}</>;
}

// ------------------------------------------------------------- components

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <a href="#/" className="flex items-center gap-2 shrink-0" aria-label="GhorSheba হোম">
      <span className="relative grid place-items-center w-10 h-10">
        <svg viewBox="0 0 48 48" className="w-10 h-10" aria-hidden="true">
          <path d="M6 22 24 7l18 15" fill="none" stroke="#087A35" strokeWidth="4" strokeLinecap="round" />
          <path d="M11 20v16a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V20" fill="none" stroke="#087A35" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 33c-4.5-1.2-6.5-4.3-6.5-8.5 4.2 0 7.3 2 8.6 6.3" fill="#FF8A00" />
          <path d="M24 33c.4-3.9 2.3-6.6 6-8-.3 4-2 7-6 8z" fill="#087A35" />
        </svg>
      </span>
      <span className="leading-none">
        <span className={`block text-[22px] font-bold font-en tracking-tight ${light ? "text-white" : "text-[#064B27]"}`}>
          Ghor<span className="text-[#FF8A00]">Sheba</span>
        </span>
        {!compact && (
          <span className={`block text-[10.5px] font-en mt-0.5 ${light ? "text-white/70" : "text-[#737B73]"}`}>
            Your Home. Our Responsibility.
          </span>
        )}
      </span>
    </a>
  );
}

export function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} স্টার`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i}>{Icon.star(i <= Math.round(value), size)}</span>
      ))}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="text-center mb-7">
      <div className="flex items-center justify-center gap-3">
        <span className="h-[2.5px] w-10 sm:w-16 bg-[#087A35] rounded-full" />
        <h2 className="text-[24px] sm:text-[30px] font-bold text-[#064B27] leading-snug">{children}</h2>
        <span className="h-[2.5px] w-10 sm:w-16 bg-[#087A35] rounded-full" />
      </div>
      {sub && <p className="mt-2 text-[15px] text-[#737B73] max-w-xl mx-auto">{sub}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cfe3d3] bg-[#F0FAF2] px-5 py-8 text-center">
      <div className="mx-auto w-11 h-11 rounded-full bg-white grid place-items-center text-[#087A35] shadow-sm mb-3">
        {Icon.search("w-5 h-5")}
      </div>
      <p className="font-semibold text-[#064B27]">{title}</p>
      {body && <p className="mt-1 text-sm text-[#737B73] max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-[#737B73]" role="status">
      <span className="w-5 h-5 rounded-full border-2 border-[#cfe3d3] border-t-[#087A35] animate-spin" />
      <span className="text-sm">{label ?? "লোড হচ্ছে…"}</span>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3" role="alert">
      {message}
    </div>
  );
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "কিছু একটা সমস্যা হয়েছে — আবার চেষ্টা করুন।";
}

export function Avatar({
  name,
  photoUrl,
  size = "w-14 h-14",
  textSize = "text-lg",
}: {
  name: string;
  photoUrl: string | null;
  size?: string;
  textSize?: string;
}) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={`${size} rounded-full object-cover shrink-0`} loading="lazy" />;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("");
  return (
    <span
      className={`${size} ${textSize} rounded-full bg-[#E2F4E7] text-[#064B27] font-bold grid place-items-center shrink-0`}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

export function PriceBlock({ service }: { service: Service }) {
  const rows: { label: string; value: string }[] = [];
  if (service.startingPrice != null) rows.push({ label: "শুরুর মূল্য", value: bdt(service.startingPrice) });
  if (service.hourlyRate != null) rows.push({ label: "ঘণ্টা প্রতি", value: bdt(service.hourlyRate) });
  if (service.dailyRate != null) rows.push({ label: "দিন প্রতি", value: bdt(service.dailyRate) });
  if (service.unitRate != null)
    rows.push({ label: service.unitLabel ? `প্রতি ${service.unitLabel}` : "একক প্রতি", value: bdt(service.unitRate) });
  if (service.inspectionFee != null)
    rows.push({ label: "পরিদর্শন ফি", value: service.inspectionFee === 0 ? "ফ্রি" : bdt(service.inspectionFee) });
  return (
    <div className="rounded-2xl border border-[#E5EAE5] bg-white p-5">
      <h3 className="font-bold text-[#064B27] mb-3">মূল্য তথ্য</h3>
      {rows.length > 0 ? (
        <dl className="divide-y divide-[#F0F3F0]">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2 text-[15px]">
              <dt className="text-[#737B73]">{r.label}</dt>
              <dd className="font-semibold text-[#202820]">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[15px] text-[#202820]">কাজের ধরন ও পরিমাণ অনুযায়ী মূল্য নির্ধারণ করা হবে।</p>
      )}
      {service.priceNote && <p className="mt-3 text-sm text-[#737B73]">{service.priceNote}</p>}
      <p className="mt-3 text-sm text-[#737B73]">
        বুকিং পাঠালে অ্যাডমিন কাজ দেখে চূড়ান্ত কোটেশন জানিয়ে দেবেন — কাজ শুরুর আগে আপনার সম্মতি ছাড়া কোনো মূল্য চূড়ান্ত হবে না।
      </p>
    </div>
  );
}
