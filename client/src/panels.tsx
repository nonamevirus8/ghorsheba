// Customer, Professional and Admin dashboards.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { FIELDS } from "./fields";
import {
ADMIN_STAGE_NEXT,
Avatar,
EmptyState,
ErrorBox,
Icon,
PRO_STATUS_BN,
SOCIAL_PLATFORM_BN,
STAGE_BN,
Spinner,
TICKET_CATEGORY_BN,
TICKET_STATUS_BN,
socialIcon,
ticketStatusColor,
Stars,
bdt,
errMsg,
fmtDate,
fmtDateTime,
fmtTime,
getToken,
providerEn,
setToken,
useCatalog,
useMe,
type Booking,
type Me,
} from "./lib";
import { BookingStatusChip, PhotoField, inputCls, labelCls } from "./App";
import {
BreakdownRows,
PAYMENT_MODEL_BN,
PaymentStatusChip,
PROVIDER_BN,
QuotationPanel,
type PaymentView,
} from "./booking";

type Notif = ApiResponse<typeof api, "getNotifications">["notifications"][number];

// ------------------------------------------------------------- shared bits

function TabsBar({
  tabs,
  active,
  href,
}: {
  tabs: { key: string; label: string; badge?: number }[];
  active: string;
  href: (key: string) => string;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="ড্যাশবোর্ড ট্যাব">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={href(t.key)}
          role="tab"
          aria-selected={active === t.key}
          className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[14.5px] font-semibold whitespace-nowrap ${
            active === t.key ? "bg-[#075B35] text-white" : "bg-[#F3F8F4] text-[#054A2B] hover:bg-[#E4F1E8]"
          }`}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span className={`min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold grid place-items-center ${active === t.key ? "bg-white text-[#075B35]" : "bg-[#FF8500] text-white"}`}>
              {t.badge}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
      <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-[#F3F8F4] text-[#075B35] mb-2">{icon}</span>
      <p className="text-[22px] font-bold leading-none text-[#054A2B]">{value}</p>
      <p className="mt-1 text-[13px] text-[#5C6B76]">{label}</p>
    </div>
  );
}

// ------------------------------------------------- Phase 11 admin bits
//
// Money figures must read identically on every device and browser, so
// the money tabs refetch on focus + on a short interval and show when
// the numbers were last refreshed, with a manual refresh button.
const MONEY_REFETCH = { refetchInterval: 30_000, refetchOnWindowFocus: true } as const;

function FreshnessBar({
  dataUpdatedAt,
  isFetching,
  onRefresh,
}: {
  dataUpdatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  if (!dataUpdatedAt) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[#5C6B76]">
      <span className="inline-flex items-center gap-1.5">
        {Icon.clock("w-4 h-4")} সর্বশেষ আপডেট: <span className="font-en font-semibold text-[#43534B]">{fmtTime(dataUpdatedAt)}</span>
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        className="inline-flex items-center gap-1.5 border border-[#E1E9E4] bg-white hover:bg-[#F3F8F4] disabled:opacity-60 text-[#054A2B] font-semibold px-3 py-1.5 rounded-lg"
      >
        {Icon.refresh("w-4 h-4")} {isFetching ? "আপডেট হচ্ছে…" : "রিফ্রেশ করুন"}
      </button>
    </div>
  );
}

// Search + sort + pagination controls shared by the admin management
// lists (Master Phase 11). Filtering and sorting happen on rows the
// server already returned — no figure is ever computed here.
const ADMIN_PAGE_SIZE = 10;

function useListControls<T>(
  rows: T[],
  searchText: (row: T) => string,
  sorters: Record<string, (a: T, b: T) => number>,
  defaultSort: string,
) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : [...rows];
    const sorter = sorters[sort];
    if (sorter) base.sort(sorter);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE);
  return {
    query,
    setQuery: (v: string) => {
      setQuery(v);
      setPage(1);
    },
    sort,
    setSort: (v: string) => {
      setSort(v);
      setPage(1);
    },
    page: safePage,
    setPage,
    pageCount,
    total: filtered.length,
    pageRows,
  };
}

function ListControls({
  query,
  setQuery,
  sort,
  setSort,
  sortOptions,
  total,
  page,
  pageCount,
  setPage,
  searchLabel,
}: {
  query: string;
  setQuery: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  sortOptions: [string, string][];
  total: number;
  page: number;
  pageCount: number;
  setPage: (n: number) => void;
  searchLabel: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6B76] pointer-events-none">{Icon.search("w-4 h-4")}</span>
          <label className="sr-only" htmlFor={searchLabel}>{searchLabel}</label>
          <input
            id={searchLabel}
            className={`${inputCls} pl-9`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchLabel}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor={`${searchLabel}-sort`}>সাজান</label>
          <select
            id={`${searchLabel}-sort`}
            className="w-full sm:w-auto border border-[#E1E9E4] rounded-xl px-3 py-2.5 bg-white text-sm font-medium"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {sortOptions.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-[#5C6B76]">
          <span>মোট {total}টি • পেজ {page} / {pageCount}</span>
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="inline-flex items-center gap-1 border border-[#E1E9E4] bg-white px-3 py-1.5 rounded-lg font-semibold text-[#054A2B] disabled:opacity-40"
            >
              {Icon.chevronLeft("w-4 h-4")} আগের
            </button>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
              className="inline-flex items-center gap-1 border border-[#E1E9E4] bg-white px-3 py-1.5 rounded-lg font-semibold text-[#054A2B] disabled:opacity-40"
            >
              পরের {Icon.chevronRight("w-4 h-4")}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

export function BookingCard({ b }: { b: Booking }) {
  return (
    <a
      href={`#/booking/${b.code}`}
      className="block rounded-2xl border border-[#E1E9E4] bg-white p-4 hover:border-[#075B35] hover:shadow-[0_8px_24px_rgba(5,74,43,0.08)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[#172B3A] truncate">{b.serviceName}</p>
          <p className="text-[13px] text-[#5C6B76]">
            <span className="font-en">{b.code}</span> • {b.upazila}
          </p>
        </div>
        <BookingStatusChip status={b.status} stage={b.stage} />
      </div>
      <p className="mt-2 text-sm text-[#43534B] line-clamp-2">{b.description}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#5C6B76]">
        <span className="inline-flex items-center gap-1">{Icon.calendar("w-4 h-4")} {fmtDate(b.preferredDate)} • {b.preferredTime}</span>
        <span className="inline-flex items-center gap-1">{Icon.user("w-4 h-4")} {b.professionalName ?? "প্রফেশনাল অ্যাসাইন হয়নি"}</span>
      </p>
      {b.stage === "assigned" && (
        <p className="mt-2 text-[13px] font-semibold text-[#B45309]">প্রফেশনালের সাড়ার অপেক্ষায়</p>
      )}
      {b.stage === "pro_completed" && (
        <p className="mt-2 text-[13px] font-semibold text-[#075B35]">কাজ শেষ — নিশ্চিতকরণ বাকি</p>
      )}
      {b.stage === "disputed" && (
        <p className="mt-2 text-[13px] font-semibold text-red-700">এই বুকিংয়ে বিরোধ চলমান — সেটেলমেন্ট স্থগিত</p>
      )}
      {b.stage === "rescheduled" && (
        <p className="mt-2 text-[13px] font-semibold text-sky-800">সময় পুনঃনির্ধারিত হয়েছে — অ্যাডমিনের নিশ্চিতকরণ বাকি</p>
      )}
    </a>
  );
}

function NotificationsList({ notifs, token }: { notifs: Notif[]; token: string }) {
  const qc = useQueryClient();
  const mark = useMutation({
    mutationFn: () => api.markNotificationsRead({ token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const markOne = useMutation({
    mutationFn: (id: number) => api.markNotificationRead({ token, notificationId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  if (notifs.length === 0) {
    return <EmptyState title="কোনো নোটিফিকেশন নেই" body="বুকিং আপডেট হলে এখানে জানানো হবে।" />;
  }
  const unread = notifs.filter((n) => !n.isRead).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[#5C6B76]" aria-live="polite">
          {unread > 0 ? `${unread}টি অপঠিত নোটিফিকেশন` : "সব নোটিফিকেশন পড়া হয়েছে"}
        </p>
        <button
          type="button"
          onClick={() => mark.mutate()}
          disabled={mark.isPending}
          className="text-sm font-semibold text-[#075B35] hover:underline disabled:opacity-60"
        >
          সব পড়া হয়েছে হিসেবে চিহ্নিত করুন
        </button>
      </div>
      <ul className="space-y-2.5">
        {notifs.map((n) => {
          const content = (
            <>
              <p className="font-semibold text-[15px] flex items-center gap-2">
                <span className="text-[#075B35]">{Icon.bell("w-4 h-4")}</span>
                {n.title}
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#FF8500]" aria-label="অপঠিত" />}
              </p>
              {n.body && <p className="mt-1 text-sm text-[#43534B]">{n.body}</p>}
              <p className="mt-1 text-[12.5px] text-[#5C6B76]">{fmtDateTime(n.createdAt)}</p>
              {n.link && (
                <p className="mt-1.5 text-[13px] font-semibold text-[#075B35]">সংশ্লিষ্ট পেজে যান →</p>
              )}
            </>
          );
          const cls = `block rounded-2xl border p-4 ${n.isRead ? "border-[#E1E9E4] bg-white" : "border-[#C9DFD2] bg-[#F3F8F4]"}`;
          return (
            <li key={n.id}>
              {n.link ? (
                <a
                  href={n.link}
                  className={`${cls} hover:border-[#075B35] transition-colors`}
                  onClick={() => {
                    if (!n.isRead) markOne.mutate(n.id);
                  }}
                >
                  {content}
                </a>
              ) : (
                <div className={cls}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GateMessage({ query }: { query: ReturnType<typeof useMe> }) {
  const token = getToken();
  // A stored token the server no longer accepts (expired session, suspended
  // or deleted account) makes getMe fail forever — clear the stale token and
  // offer a fresh login instead of spinning indefinitely.
  const sessionFailed = !!token && query.isError;
  useEffect(() => {
    if (sessionFailed) setToken(null);
  }, [sessionFailed]);
  if (!token || sessionFailed) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="লগইন প্রয়োজন"
          body={sessionFailed ? "আপনার সেশন শেষ হয়ে গেছে — আবার লগইন করুন।" : "ড্যাশবোর্ড দেখতে প্রথমে লগইন করুন।"}
          action={<a href="#/login" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">লগইন করুন</a>}
        />
      </div>
    );
  }
  if (!query.data) return <Spinner label="লোড হচ্ছে…" />;
  return null;
}

// -------------------------------------------------------- Customer panel

export function CustomerDashboard({ params }: { params: URLSearchParams }) {
  const token = getToken() ?? "";
  const me = useMe();
  const tabRaw = params.get("tab") ?? "bookings";
  const tab = ["bookings", "payments", "refunds", "reviews", "notifications", "support", "profile", "security"].includes(tabRaw) ? tabRaw : "bookings";
  const bookings = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => api.getMyBookings({ token }),
    enabled: !!token && me.data?.user.role === "customer",
  });
  const refundsQ = useQuery({
    queryKey: ["my-refunds"],
    queryFn: () => api.getMyRefundRequests({ token }),
    enabled: !!token && me.data?.user.role === "customer",
  });
  const notifs = useQuery({
    queryKey: ["notifs"],
    queryFn: () => api.getNotifications({ token }),
    enabled: !!token,
  });
  const gate = GateMessage({ query: me });
  if (gate) return gate;
  const user = me.data!.user;
  if (user.role === "professional") {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState title="আপনি প্রফেশনাল হিসেবে লগইন করেছেন" body="আপনার কাজের ড্যাশবোর্ড প্রফেশনাল প্যানেলে।" action={<a href="#/pro-dashboard" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">প্রফেশনাল ড্যাশবোর্ড</a>} />
      </div>
    );
  }
  if (user.role === "admin") {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState title="আপনি অ্যাডমিন হিসেবে লগইন করেছেন" body="অ্যাডমিন প্যানেল থেকে পুরো প্ল্যাটফর্ম পরিচালনা করুন।" action={<a href="#/admin" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">অ্যাডমিন প্যানেল</a>} />
      </div>
    );
  }
  const list = bookings.data?.bookings ?? [];
  const active = list.filter((b) =>
    ["pending", "price_confirmed", "assigned", "accepted", "in_progress", "pro_completed", "rescheduled", "disputed"].includes(b.stage),
  );
  const openRefunds = (refundsQ.data?.requests ?? []).filter((r) => r.status === "requested").length;
  const tabs = [
    { key: "bookings", label: "আমার বুকিং", badge: active.length },
    { key: "payments", label: "পেমেন্ট ও রসিদ" },
    { key: "refunds", label: "রিফান্ড", badge: openRefunds },
    { key: "reviews", label: "আমার রিভিউ" },
    { key: "notifications", label: "নোটিফিকেশন", badge: me.data?.unreadNotifications },
    { key: "support", label: "সাপোর্ট / অভিযোগ" },
    { key: "profile", label: "প্রোফাইল ও ঠিকানা" },
    { key: "security", label: "নিরাপত্তা" },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3.5 mb-6">
        <Avatar name={user.name} photoUrl={user.photoUrl} size="w-13 h-13" />
        <div>
          <h1 className="text-[24px] font-bold text-[#054A2B] leading-tight">স্বাগতম, {user.name}</h1>
          <p className="text-sm text-[#5C6B76] font-en">{user.phone}</p>
        </div>
        <a href="#/services" className="ml-auto hidden sm:inline-flex bg-[#FF8500] hover:bg-[#E67600] text-white font-bold px-4 py-2.5 rounded-xl">
          + নতুন বুকিং
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="মোট বুকিং" value={list.length} icon={Icon.briefcase("w-5 h-5")} />
        <StatCard label="চলমান বুকিং" value={active.length} icon={Icon.clock("w-5 h-5")} />
        <StatCard label="সম্পন্ন কাজ" value={list.filter((b) => b.stage === "customer_confirmed" || b.stage === "admin_reviewed").length} icon={Icon.checkCircle("w-5 h-5")} />
      </div>
      <TabsBar tabs={tabs} active={tab} href={(k) => `#/dashboard?tab=${k}`} />
      <div className="mt-6">
        {tab === "bookings" &&
          (bookings.isPending ? (
            <Spinner />
          ) : list.length === 0 ? (
            <EmptyState
              title="এখনো কোনো বুকিং করেননি"
              body="পছন্দের সার্ভিস বেছে প্রথম বুকিংটি করুন।"
              action={<a href="#/services" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">সার্ভিস দেখুন</a>}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-3.5">
              {list.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </div>
          ))}
        {tab === "payments" && <PaymentsTab token={token} />}
        {tab === "refunds" && <RefundsTab token={token} />}
        {tab === "reviews" && <ReviewsTab token={token} />}
        {tab === "notifications" &&
          (notifs.isPending ? <Spinner /> : <NotificationsList notifs={notifs.data?.notifications ?? []} token={token} />)}
        {tab === "support" && <SupportTab token={token} />}
        {tab === "profile" && <CustomerProfileTab me={me.data!} token={token} />}
        {tab === "security" && <SecurityTab token={token} />}
      </div>
    </div>
  );
}


// ------------------------------------------- support tickets (Phase 6)
//
// The ticket system is the primary support channel: a signed-in user
// opens a ticket, the support team replies in the same thread, and the
// status moves open → in_progress → waiting_customer → resolved →
// closed. The older complaints form/list below it is unchanged and
// keeps working alongside.

function TicketStatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${ticketStatusColor(status)}`}>
      {TICKET_STATUS_BN[status] ?? status}
    </span>
  );
}

function TicketThread({ token, ticketId, admin = false }: { token: string; ticketId: number; admin?: boolean }) {
  const qc = useQueryClient();
  const thread = useQuery({
    queryKey: ["ticket-thread", ticketId],
    queryFn: () => api.getSupportTicket({ token, ticketId }),
  });
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const reply = useMutation({
    mutationFn: () => api.replyToSupportTicket({ token, ticketId, body }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["ticket-thread", ticketId] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: (status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed") =>
      api.adminSetTicketStatus({ token, ticketId, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-thread", ticketId] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  if (thread.isPending) return <Spinner />;
  if (thread.isError || !thread.data) return <ErrorBox message={errMsg(thread.error ?? new Error("টিকিট লোড করা যায়নি।"))} />;
  const t = thread.data.ticket;
  const closed = t.status === "closed";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-en text-[13px] font-semibold text-[#5C6B76]">{t.code}</span>
        <TicketStatusChip status={t.status} />
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F3F8F4] text-[#054A2B]">
          {TICKET_CATEGORY_BN[t.category] ?? t.category}
        </span>
        {t.bookingCode && <span className="font-en text-[13px] text-[#5C6B76]">বুকিং: {t.bookingCode}</span>}
        {admin && (
          <span className="text-[13px] text-[#5C6B76]">
            {t.ownerName} • <span className="font-en">{t.ownerPhone}</span> • {t.ownerRole === "professional" ? "প্রফেশনাল" : "গ্রাহক"}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2.5">
        {thread.data.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-2xl px-3.5 py-2.5 text-sm ${
              m.authorRole === "admin" ? "bg-[#F3F8F4] border border-[#C9DFD2]" : "bg-[#F4F8F5] border border-[#E1E9E4]"
            }`}
          >
            <p className="text-[12.5px] font-semibold text-[#054A2B]">
              {m.authorRole === "admin" ? "সাপোর্ট টিম" : m.authorName}
              <span className="ml-2 font-normal text-[#5C6B76]">{fmtDateTime(m.createdAt)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[#2E4238]">{m.body}</p>
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor={`ticket-status-${ticketId}`}>টিকিটের অবস্থা</label>
          <select
            id={`ticket-status-${ticketId}`}
            className="border border-[#E1E9E4] rounded-xl px-3 py-2 bg-white text-sm"
            value={t.status}
            disabled={setStatus.isPending}
            onChange={(e) =>
              setStatus.mutate(e.target.value as "open" | "in_progress" | "waiting_customer" | "resolved" | "closed")
            }
          >
            {Object.keys(TICKET_STATUS_BN).map((s) => (
              <option key={s} value={s}>{TICKET_STATUS_BN[s]}</option>
            ))}
          </select>
          {setStatus.isPending && <span className="text-sm text-[#5C6B76]">বদলানো হচ্ছে…</span>}
        </div>
      )}
      {closed ? (
        <p className="mt-3 text-sm text-[#5C6B76]">এই টিকিট বন্ধ করা হয়েছে — নতুন সাহায্য লাগলে নতুন টিকিট খুলুন।</p>
      ) : (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            reply.mutate();
          }}
        >
          <label className={labelCls} htmlFor={`ticket-reply-${ticketId}`}>উত্তর লিখুন</label>
          <textarea
            id={`ticket-reply-${ticketId}`}
            className={inputCls}
            rows={3}
            {...FIELDS.replyToSupportTicket.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            placeholder="আপনার বার্তা লিখুন…"
          />
          {error && <ErrorBox message={error} />}
          <button
            type="submit"
            disabled={reply.isPending || !body.trim()}
            className="self-start bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {reply.isPending ? "পাঠানো হচ্ছে…" : "উত্তর পাঠান"}
          </button>
        </form>
      )}
    </div>
  );
}

function TicketSupport({ token }: { token: string }) {
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ["my-tickets"], queryFn: () => api.getMyTickets({ token }) });
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [bookingCode, setBookingCode] = useState("");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.createSupportTicket({
        token,
        subject,
        message,
        category: category as "general" | "booking" | "payment" | "account" | "verification" | "other",
        bookingCode: bookingCode || undefined,
      }),
    onSuccess: (res) => {
      setSubject("");
      setMessage("");
      setBookingCode("");
      setCategory("general");
      setOpenId(res.ticket.id);
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const tickets = mine.data?.tickets ?? [];
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <form
        className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          create.mutate();
        }}
      >
        <h2 className="font-bold text-[#054A2B]">সাপোর্ট টিকিট খুলুন</h2>
        <p className="text-sm text-[#5C6B76] -mt-2">আমাদের টিম এই থ্রেডেই উত্তর দেবে — উত্তর এলে নোটিফিকেশন পাবেন।</p>
        <div>
          <label className={labelCls} htmlFor="tk-subject">বিষয় *</label>
          <input id="tk-subject" className={inputCls} {...FIELDS.createSupportTicket.subject} value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="যেমন: পেমেন্ট নিয়ে প্রশ্ন" />
        </div>
        <div>
          <label className={labelCls} htmlFor="tk-category">বিষয়ের ধরন</label>
          <select id="tk-category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(TICKET_CATEGORY_BN).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="tk-code">বুকিং কোড (যদি থাকে)</label>
          <input id="tk-code" className={inputCls} {...FIELDS.createSupportTicket.bookingCode} value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} placeholder="GS-XXXXXX-XX" />
        </div>
        <div>
          <label className={labelCls} htmlFor="tk-msg">বিস্তারিত *</label>
          <textarea id="tk-msg" className={inputCls} rows={4} {...FIELDS.createSupportTicket.message} value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="আপনার সমস্যাটি বিস্তারিত লিখুন" />
        </div>
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={create.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
          {create.isPending ? "খোলা হচ্ছে…" : "টিকিট খুলুন"}
        </button>
      </form>
      <div>
        <h2 className="font-bold text-[#054A2B] mb-3">আমার সাপোর্ট টিকিট</h2>
        {mine.isPending ? (
          <Spinner />
        ) : tickets.length === 0 ? (
          <EmptyState title="কোনো টিকিট নেই" body="সাহায্য লাগলে বামে ফর্মটি পূরণ করে টিকিট খুলুন।" />
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  aria-expanded={openId === t.id}
                  onClick={() => setOpenId(openId === t.id ? null : t.id)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{t.subject}</span>
                    <TicketStatusChip status={t.status} />
                  </span>
                  <span className="mt-1 block text-[12.5px] text-[#5C6B76]">
                    <span className="font-en">{t.code}</span> • {t.messageCount}টি বার্তা • {fmtDateTime(t.updatedAt)}
                  </span>
                </button>
                {openId === t.id && (
                  <div className="mt-3 border-t border-[#E1E9E4] pt-3">
                    <TicketThread token={token} ticketId={t.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SupportTab({ token }: { token: string }) {
  return (
    <div className="space-y-10">
      <TicketSupport token={token} />
      <div>
        <h2 className="font-bold text-[#054A2B] mb-3">অভিযোগ (আগের পদ্ধতি)</h2>
        <p className="text-sm text-[#5C6B76] mb-4 -mt-1">
          আগের অভিযোগগুলো এখানেই আছে — নতুন করে সাহায্য চাইতে উপরের সাপোর্ট টিকিট ব্যবহার করুন, সেখানে সরাসরি উত্তর পাবেন।
        </p>
        <ComplaintsSection token={token} />
      </div>
    </div>
  );
}

function ComplaintsSection({ token }: { token: string }) {
  const qc = useQueryClient();
  const mine = useQuery({
    queryKey: ["my-complaints"],
    queryFn: () => api.getMyComplaints({ token }),
  });
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [bookingCode, setBookingCode] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const submit = useMutation({
    mutationFn: () =>
      api.submitComplaint({ token, subject, message, bookingCode: bookingCode || undefined }),
    onSuccess: () => {
      setOk(true);
      setSubject("");
      setMessage("");
      setBookingCode("");
      qc.invalidateQueries({ queryKey: ["my-complaints"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <form
        className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setOk(false);
          submit.mutate();
        }}
      >
        <h2 className="font-bold text-[#054A2B]">অভিযোগ / অনুরোধ পাঠান</h2>
        <div>
          <label className={labelCls} htmlFor="cp-subject">বিষয় *</label>
          <input id="cp-subject" className={inputCls} {...FIELDS.submitComplaint.subject} value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="যেমন: বুকিং নিয়ে সমস্যা" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cp-code">বুকিং কোড (যদি থাকে)</label>
          <input id="cp-code" className={inputCls} {...FIELDS.submitComplaint.bookingCode} value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} placeholder="GS-XXXXXX-XX" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cp-msg">বিস্তারিত *</label>
          <textarea id="cp-msg" className={inputCls} rows={4} {...FIELDS.submitComplaint.message} value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="আপনার সমস্যাটি বিস্তারিত লিখুন" />
        </div>
        {error && <ErrorBox message={error} />}
        {ok && <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">আপনার বার্তা পৌঁছেছে — আমাদের টিম দেখে ব্যবস্থা নেবে।</p>}
        <button type="submit" disabled={submit.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
          {submit.isPending ? "পাঠানো হচ্ছে…" : "পাঠান"}
        </button>
      </form>
      <div>
        <h2 className="font-bold text-[#054A2B] mb-3">আমার আগের অভিযোগসমূহ</h2>
        {mine.isPending ? (
          <Spinner />
        ) : (mine.data?.complaints.length ?? 0) === 0 ? (
          <EmptyState title="কোনো অভিযোগ নেই" />
        ) : (
          <ul className="space-y-3">
            {mine.data?.complaints.map((c) => (
              <li key={c.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{c.subject}</p>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.status === "resolved" ? "bg-[#075B35] text-white" : "bg-amber-100 text-amber-800"}`}>
                    {c.status === "resolved" ? "সমাধান হয়েছে" : "খোলা আছে"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#43534B]">{c.message}</p>
                {c.adminNote && <p className="mt-2 text-sm bg-[#F3F8F4] rounded-lg px-3 py-2">অ্যাডমিনের জবাব: {c.adminNote}</p>}
                <p className="mt-1.5 text-[12.5px] text-[#5C6B76]">{fmtDateTime(c.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CustomerProfileTab({ me, token }: { me: Me; token: string }) {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const [name, setName] = useState(me.user.name);
  const [location, setLocation] = useState(me.user.location ?? "");
  const [address, setAddress] = useState(me.user.address ?? "");
  const [photo, setPhoto] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [photoName, setPhotoName] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.updateMyProfile({ token, name, location: location || undefined, address: address || undefined, photo }),
    onSuccess: () => {
      setOk(true);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <div className="space-y-8">
    <form
      className="max-w-xl rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setOk(false);
        save.mutate();
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={me.user.name} photoUrl={me.user.photoUrl} size="w-14 h-14" />
        <div>
          <p className="font-bold">{me.user.name}</p>
          <p className="text-sm text-[#5C6B76] font-en">{me.user.phone}</p>
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="pf-name">নাম</label>
        <input id="pf-name" className={inputCls} {...FIELDS.updateMyProfile.name} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls} htmlFor="pf-loc">উপজেলা</label>
        <select id="pf-loc" className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">— বেছে নিন —</option>
          {(catalog.data?.locations ?? []).map((l) => (
            <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="pf-addr">ঠিকানা</label>
        <input id="pf-addr" className={inputCls} {...FIELDS.updateMyProfile.address} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <PhotoField
        label="নতুন প্রোফাইল ছবি"
        fileName={photoName}
        onPick={(img) => {
          setPhoto(img);
          setPhotoName(img ? "ছবি যুক্ত হয়েছে" : "");
        }}
      />
      {error && <ErrorBox message={error} />}
      {ok && <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">প্রোফাইল সংরক্ষিত হয়েছে।</p>}
      <button type="submit" disabled={save.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
        {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
    </form>
    <AddressesSection token={token} />
    </div>
  );
}

// ------------------------------------------- Phase 3 customer tab pieces

const LEDGER_ENTRY_BN: Record<string, string> = {
  online_collection: "অনলাইন সংগ্রহ",
  customer_fee: "গ্রাহক প্ল্যাটফর্ম ফি",
  commission_due: "প্রফেশনাল কমিশন পাওনা",
  commission_collected: "কমিশন সংগ্রহ",
  held_balance: "হেল্ড ব্যালেন্স",
  payout: "প্রফেশনাল পেআউট",
  refund: "রিফান্ড",
  adjustment: "সমন্বয়",
};

function ReceiptView({ token, code }: { token: string; code: string }) {
  const receipt = useQuery({
    queryKey: ["my-receipt", code],
    queryFn: () => api.getMyReceipt({ token, bookingCode: code }),
    retry: false,
  });
  if (receipt.isPending) return <Spinner label="রসিদ লোড হচ্ছে…" />;
  if (receipt.isError) return <ErrorBox message={errMsg(receipt.error)} />;
  const r = receipt.data!;
  return (
    <div className="mt-3 rounded-2xl border border-[#C9DFD2] bg-[#FAFCFB] p-4">
      <p className="font-bold text-[#054A2B]">
        রসিদ — {r.serviceName} • <span className="font-en">{r.bookingCode}</span>
      </p>
      {r.breakdown ? (
        <div className="mt-3 max-w-md">
          <BreakdownRows bd={r.breakdown} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#5C6B76]">এই বুকিংয়ের মূল্য হিসাব এখনো সংরক্ষিত হয়নি।</p>
      )}
      {r.ledger.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-[#5C6B76] mb-1.5">লেজার এন্ট্রি (যাচাইকৃত হিসাব)</p>
          <ul className="space-y-1 text-sm">
            {r.ledger.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4">
                <span>
                  {LEDGER_ENTRY_BN[e.entryType] ?? e.entryType}
                  <span className="text-[#5C6B76]"> • {fmtDateTime(e.createdAt)}</span>
                </span>
                <span className="font-en font-medium">{bdt(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PaymentsTab({ token }: { token: string }) {
  const payments = useQuery({
    queryKey: ["my-payments"],
    queryFn: () => api.getMyPayments({ token }),
  });
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  if (payments.isPending) return <Spinner />;
  if (payments.isError) return <ErrorBox message={errMsg(payments.error)} />;
  const list = payments.data?.payments ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title="কোনো অনলাইন পেমেন্ট নেই"
        body="মূল্য নিশ্চিত হওয়া বুকিংয়ের বিবরণ পেজ থেকে অনলাইন পেমেন্ট (বিকাশ/নগদ/রকেট — TrxID) জমা দিতে পারবেন।"
        action={<a href="#/dashboard" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">আমার বুকিং দেখুন</a>}
      />
    );
  }
  const byBooking = new Map<string, PaymentView[]>();
  for (const p of list) {
    const arr = byBooking.get(p.bookingCode) ?? [];
    arr.push(p);
    byBooking.set(p.bookingCode, arr);
  }
  return (
    <div className="space-y-3.5">
      {list.map((p) => (
        <div key={p.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">
                <span className="font-en">{bdt(p.amount)}</span> • {PROVIDER_BN[p.provider] ?? providerEn(p.provider)}
              </p>
              <p className="text-[13px] text-[#5C6B76]">
                বুকিং <a className="font-en font-semibold text-[#075B35] hover:underline" href={`#/booking/${p.bookingCode}`}>{p.bookingCode}</a>
                {" • "}{PAYMENT_MODEL_BN[p.paymentModel] ?? p.paymentModel}
                {" • "}TrxID: <span className="font-en">{p.providerTrxId}</span>
              </p>
            </div>
            <PaymentStatusChip status={p.status} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-[#5C6B76]">
            জমা: {fmtDateTime(p.createdAt)}
            {p.verifiedAt ? ` • যাচাই: ${fmtDateTime(p.verifiedAt)}` : ""}
          </p>
          {p.status === "failed" && p.rejectionReason && (
            <p className="mt-2 text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">বাতিলের কারণ: {p.rejectionReason}</p>
          )}
          <button
            type="button"
            onClick={() => setReceiptFor(receiptFor === p.bookingCode ? null : p.bookingCode)}
            className="mt-2.5 text-sm font-semibold text-[#075B35] hover:underline"
            aria-expanded={receiptFor === p.bookingCode}
          >
            {receiptFor === p.bookingCode ? "রসিদ লুকান" : "রসিদ ও হিসাব দেখুন"}
          </button>
          {receiptFor === p.bookingCode && <ReceiptView token={token} code={p.bookingCode} />}
        </div>
      ))}
    </div>
  );
}

const REFUND_REASON_BN: Record<string, string> = {
  work_not_completed: "কাজ সম্পন্ন হয়নি",
  poor_quality: "কাজের মান খারাপ",
  incorrect_price: "ভুল মূল্য",
  professional_no_show: "প্রফেশনাল আসেননি",
  other: "অন্যান্য",
};

const REFUND_STATUS_BN: Record<string, { label: string; cls: string }> = {
  requested: { label: "বিচারাধীন", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "অনুমোদিত — রিফান্ড প্রক্রিয়াধীন", cls: "bg-sky-100 text-sky-800" },
  rejected: { label: "প্রত্যাখ্যাত", cls: "bg-red-100 text-red-700" },
  refunded: { label: "রিফান্ড সম্পন্ন", cls: "bg-[#075B35] text-white" },
};

function RefundsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ["my-refunds"],
    queryFn: () => api.getMyRefundRequests({ token }),
  });
  const payments = useQuery({
    queryKey: ["my-payments"],
    queryFn: () => api.getMyPayments({ token }),
  });
  const [bookingCode, setBookingCode] = useState("");
  const [reason, setReason] = useState("work_not_completed");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const refundableCodes = [
    ...new Set(
      (payments.data?.payments ?? [])
        .filter((p) => p.status === "verified" || p.status === "pending")
        .map((p) => p.bookingCode),
    ),
  ];
  const submit = useMutation({
    mutationFn: () =>
      api.submitRefundRequest({
        token,
        bookingCode,
        reason: reason as "work_not_completed" | "poor_quality" | "incorrect_price" | "professional_no_show" | "other",
        detail,
      }),
    onSuccess: () => {
      setOk(true);
      setDetail("");
      qc.invalidateQueries({ queryKey: ["my-refunds"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const list = requests.data?.requests ?? [];
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <form
        className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setOk(false);
          submit.mutate();
        }}
      >
        <h2 className="font-bold text-[#054A2B]">রিফান্ডের অনুরোধ পাঠান</h2>
        <p className="text-sm text-[#5C6B76] leading-relaxed">
          অনুরোধ পাঠালেই রিফান্ড হয় না — অ্যাডমিন যাচাই করে সিদ্ধান্ত জানাবেন এবং অনুমোদিত হলে আলাদাভাবে
          রিফান্ড প্রক্রিয়া হবে। শুধু অনলাইন পেমেন্ট করা বুকিংয়ের জন্যই রিফান্ড অনুরোধ করা যায়।
        </p>
        {refundableCodes.length === 0 ? (
          <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">
            রিফান্ড অনুরোধের মতো কোনো অনলাইন পেমেন্ট এখনো নেই।
          </p>
        ) : (
          <>
            <div>
              <label className={labelCls} htmlFor="rf-booking">বুকিং *</label>
              <select id="rf-booking" className={`${inputCls} font-en`} value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} required>
                <option value="">— বুকিং বেছে নিন —</option>
                {refundableCodes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="rf-reason">কারণ *</label>
              <select id="rf-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                {Object.entries(REFUND_REASON_BN).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="rf-detail">বিস্তারিত *</label>
              <textarea id="rf-detail" className={inputCls} rows={4} {...FIELDS.submitRefundRequest.detail} value={detail} onChange={(e) => setDetail(e.target.value)} required placeholder="কী হয়েছিল, কেন রিফান্ড চাইছেন — বিস্তারিত লিখুন" />
            </div>
            {error && <ErrorBox message={error} />}
            {ok && <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">আপনার রিফান্ড অনুরোধ পৌঁছেছে — অ্যাডমিন যাচাই করে জানাবেন।</p>}
            <button type="submit" disabled={submit.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
              {submit.isPending ? "পাঠানো হচ্ছে…" : "অনুরোধ পাঠান"}
            </button>
          </>
        )}
      </form>
      <div>
        <h2 className="font-bold text-[#054A2B] mb-3">আমার রিফান্ড অনুরোধসমূহ</h2>
        {requests.isPending ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState title="কোনো রিফান্ড অনুরোধ নেই" />
        ) : (
          <ul className="space-y-3">
            {list.map((r) => {
              const st = REFUND_STATUS_BN[r.status] ?? { label: r.status, cls: "bg-[#EEF3F0] text-[#43534B]" };
              return (
                <li key={r.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">
                      {REFUND_REASON_BN[r.reason] ?? r.reason}
                      <span className="block text-[13px] font-normal text-[#5C6B76]">
                        বুকিং <span className="font-en">{r.bookingCode}</span> • {fmtDateTime(r.createdAt)}
                      </span>
                    </p>
                    <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#43534B]">{r.detail}</p>
                  {r.adminNote && <p className="mt-2 text-sm bg-[#F3F8F4] rounded-lg px-3 py-2">অ্যাডমিনের নোট: {r.adminNote}</p>}
                  {r.status === "refunded" && r.refundAmount != null && (
                    <p className="mt-2 text-sm font-semibold text-[#054A2B]">
                      ফেরত পেয়েছেন: {bdt(r.refundAmount)}
                      {r.refundReference ? (
                        <>
                          {" "}• লেনদেন রেফারেন্স: <span className="font-en">{r.refundReference}</span>
                        </>
                      ) : null}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReviewsTab({ token }: { token: string }) {
  const reviews = useQuery({
    queryKey: ["my-reviews"],
    queryFn: () => api.getMyReviews({ token }),
  });
  if (reviews.isPending) return <Spinner />;
  if (reviews.isError) return <ErrorBox message={errMsg(reviews.error)} />;
  const list = reviews.data?.reviews ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title="এখনো কোনো রিভিউ দেননি"
        body="কাজ সম্পন্ন হওয়া বুকিংয়ের বিবরণ পেজ থেকে রিভিউ দিতে পারবেন।"
      />
    );
  }
  return (
    <ul className="space-y-3">
      {list.map((r) => (
        <li key={r.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{r.serviceName}</p>
              <p className="text-[13px] text-[#5C6B76]">
                প্রফেশনাল: {r.professionalName ?? "—"} • {fmtDateTime(r.createdAt)}
              </p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.status === "approved" ? "bg-[#075B35] text-white" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
              {r.status === "approved" ? "প্রকাশিত" : r.status === "rejected" ? "প্রকাশ করা হয়নি" : "মডারেশনের অপেক্ষায়"}
            </span>
          </div>
          <div className="mt-2">
            <Stars value={r.rating} />
          </div>
          <p className="mt-1.5 text-[15px] text-[#43534B]">“{r.text}”</p>
        </li>
      ))}
    </ul>
  );
}

type AddressView = ApiResponse<typeof api, "getMyAddresses">["addresses"][number];

function AddressesSection({ token }: { token: string }) {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const addresses = useQuery({
    queryKey: ["my-addresses"],
    queryFn: () => api.getMyAddresses({ token }),
  });
  const [editing, setEditing] = useState<AddressView | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("বাসা");
  const [upazila, setUpazila] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setLabel("বাসা");
    setUpazila("");
    setArea("");
    setAddress("");
    setPhone("");
    setIsDefault(false);
    setError("");
  };
  const startEdit = (a: AddressView) => {
    setEditing(a);
    setShowForm(true);
    setLabel(a.label);
    setUpazila(a.upazila);
    setArea(a.area ?? "");
    setAddress(a.address);
    setPhone(a.phone ?? "");
    setIsDefault(a.isDefault);
    setError("");
  };
  const save = useMutation({
    mutationFn: () =>
      api.saveMyAddress({
        token,
        id: editing?.id,
        label,
        upazila,
        area: area || undefined,
        address,
        phone: phone || undefined,
        isDefault,
      }),
    onSuccess: () => {
      resetForm();
      qc.invalidateQueries({ queryKey: ["my-addresses"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteMyAddress({ token, id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-addresses"] }),
    onError: (e) => setError(errMsg(e)),
  });
  const list = addresses.data?.addresses ?? [];
  return (
    <section aria-label="সংরক্ষিত ঠিকানা" className="max-w-xl">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-bold text-[#054A2B]">আমার ঠিকানাসমূহ</h2>
        {!showForm && (
          <button type="button" onClick={() => { resetForm(); setShowForm(true); }} className="text-sm font-semibold text-[#075B35] hover:underline">
            + নতুন ঠিকানা
          </button>
        )}
      </div>
      {addresses.isPending ? (
        <Spinner />
      ) : list.length === 0 && !showForm ? (
        <EmptyState title="কোনো ঠিকানা সংরক্ষিত নেই" body="ঠিকানা সংরক্ষণ করলে পরের বুকিংয়ে দ্রুত ব্যবহার করা যাবে।" />
      ) : (
        <ul className="space-y-3 mb-4">
          {list.map((a) => (
            <li key={a.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">
                  {a.label}
                  {a.isDefault && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-[#075B35] text-white">ডিফল্ট</span>}
                </p>
                <span className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => startEdit(a)} className="text-sm font-semibold text-[#075B35] hover:underline">সম্পাদনা</button>
                  <button type="button" disabled={del.isPending} onClick={() => del.mutate(a.id)} className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-60">মুছুন</button>
                </span>
              </div>
              <p className="mt-1 text-sm text-[#43534B]">
                {a.address}{a.area ? `, ${a.area}` : ""}, {a.upazila}, টাঙ্গাইল
                {a.phone ? <> • <span className="font-en">{a.phone}</span></> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
      {showForm && (
        <form
          className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            save.mutate();
          }}
        >
          <h3 className="font-bold text-[#054A2B]">{editing ? "ঠিকানা সম্পাদনা" : "নতুন ঠিকানা"}</h3>
          <div>
            <label className={labelCls} htmlFor="ad-label">নাম/লেবেল *</label>
            <input id="ad-label" className={inputCls} {...FIELDS.saveMyAddress.label} value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="যেমন: বাসা, অফিস" />
          </div>
          <div>
            <label className={labelCls} htmlFor="ad-upazila">উপজেলা *</label>
            <select id="ad-upazila" className={inputCls} value={upazila} onChange={(e) => setUpazila(e.target.value)} required>
              <option value="">— বেছে নিন —</option>
              {(catalog.data?.locations ?? []).map((l) => (
                <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ad-area">এলাকা / গ্রাম</label>
            <input id="ad-area" className={inputCls} {...FIELDS.saveMyAddress.area} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ad-addr">বিস্তারিত ঠিকানা *</label>
            <input id="ad-addr" className={inputCls} {...FIELDS.saveMyAddress.address} value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="বাসা/হোল্ডিং, রোড…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="ad-phone">যোগাযোগের নম্বর</label>
            <input id="ad-phone" className={`${inputCls} font-en`} {...FIELDS.saveMyAddress.phone} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" inputMode="numeric" />
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="w-4 h-4 accent-[#075B35]" />
            এটিকে ডিফল্ট ঠিকানা করুন
          </label>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2.5">
            <button type="submit" disabled={save.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
              {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
            <button type="button" onClick={resetForm} className="border border-[#E1E9E4] font-semibold px-4 py-2.5 rounded-xl">
              বাতিল
            </button>
          </div>
        </form>
      )}
      {!showForm && error && <ErrorBox message={error} />}
    </section>
  );
}

function SecurityTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ["my-sessions"],
    queryFn: () => api.getMySessions({ token }),
  });
  const deletion = useQuery({
    queryKey: ["my-deletion"],
    queryFn: () => api.getMyDeletionRequest({ token }),
  });
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwOk, setPwOk] = useState(false);
  const [delReason, setDelReason] = useState("");
  const [delError, setDelError] = useState("");
  const [sessError, setSessError] = useState("");

  const changePw = useMutation({
    mutationFn: () => api.changeMyPassword({ token, currentPassword: currentPw, newPassword: newPw }),
    onSuccess: () => {
      setPwOk(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      qc.invalidateQueries({ queryKey: ["my-sessions"] });
    },
    onError: (e) => setPwError(errMsg(e)),
  });
  const revoke = useMutation({
    mutationFn: (ref: string) => api.revokeMySession({ token, ref }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-sessions"] }),
    onError: (e) => setSessError(errMsg(e)),
  });
  const requestDeletion = useMutation({
    mutationFn: () => api.requestAccountDeletion({ token, reason: delReason || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-deletion"] }),
    onError: (e) => setDelError(errMsg(e)),
  });
  const delReq = deletion.data?.request ?? null;
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="space-y-6">
        <form
          className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPwError("");
            setPwOk(false);
            if (newPw !== confirmPw) {
              setPwError("নতুন পাসওয়ার্ড দুইবার একই হয়নি।");
              return;
            }
            changePw.mutate();
          }}
        >
          <h2 className="font-bold text-[#054A2B]">পাসওয়ার্ড পরিবর্তন</h2>
          <div>
            <label className={labelCls} htmlFor="sec-current">বর্তমান পাসওয়ার্ড *</label>
            <input id="sec-current" type="password" className={inputCls} {...FIELDS.changeMyPassword.currentPassword} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
          </div>
          <div>
            <label className={labelCls} htmlFor="sec-new">নতুন পাসওয়ার্ড (কমপক্ষে ১২ অক্ষর) *</label>
            <input id="sec-new" type="password" className={inputCls} {...FIELDS.changeMyPassword.newPassword} value={newPw} onChange={(e) => setNewPw(e.target.value)} required autoComplete="new-password" />
          </div>
          <div>
            <label className={labelCls} htmlFor="sec-confirm">নতুন পাসওয়ার্ড আবার লিখুন *</label>
            <input id="sec-confirm" type="password" className={inputCls} {...FIELDS.changeMyPassword.newPassword} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password" />
          </div>
          <p className="text-[13px] text-[#5C6B76]">পাসওয়ার্ড বদলালে অন্য সব ডিভাইসের সেশন বাতিল হয়ে যাবে; এই ডিভাইসে লগইন থাকবে।</p>
          {pwError && <ErrorBox message={pwError} />}
          {pwOk && <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">পাসওয়ার্ড পরিবর্তন হয়েছে।</p>}
          <button type="submit" disabled={changePw.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
            {changePw.isPending ? "পরিবর্তন হচ্ছে…" : "পাসওয়ার্ড পরিবর্তন করুন"}
          </button>
        </form>

        <div className="rounded-3xl border border-red-200 bg-white p-5 sm:p-6 space-y-3">
          <h2 className="font-bold text-red-700">অ্যাকাউন্ট মুছে ফেলার অনুরোধ</h2>
          {delReq && delReq.status === "pending" ? (
            <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
              আপনার মুছে ফেলার অনুরোধটি বিচারাধীন আছে ({fmtDateTime(delReq.createdAt)})। অ্যাডমিন পর্যালোচনা করে ব্যবস্থা নেবেন —
              আর্থিক রেকর্ড সংরক্ষণের বাধ্যবাধকতার কারণে কিছু তথ্য আইনগত মেয়াদ পর্যন্ত থেকে যেতে পারে।
            </p>
          ) : (
            <>
              <p className="text-sm text-[#5C6B76] leading-relaxed">
                অনুরোধ পাঠালে অ্যাকাউন্ট সাথে সাথে মুছে যায় না — অ্যাডমিন পর্যালোচনা করে প্রক্রিয়া করবেন।
                {delReq ? ` আগের অনুরোধের অবস্থা: ${delReq.status === "approved" ? "অনুমোদিত" : "প্রত্যাখ্যাত"}।` : ""}
              </p>
              <div>
                <label className={labelCls} htmlFor="sec-del-reason">কারণ (ঐচ্ছিক)</label>
                <textarea id="sec-del-reason" className={inputCls} rows={2} {...FIELDS.requestAccountDeletion.reason} value={delReason} onChange={(e) => setDelReason(e.target.value)} placeholder="কেন অ্যাকাউন্ট মুছতে চান…" />
              </div>
              {delError && <ErrorBox message={delError} />}
              <button
                type="button"
                disabled={requestDeletion.isPending}
                onClick={() => {
                  setDelError("");
                  requestDeletion.mutate();
                }}
                className="border-[1.5px] border-red-300 text-red-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60"
              >
                {requestDeletion.isPending ? "পাঠানো হচ্ছে…" : "মুছে ফেলার অনুরোধ পাঠান"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6">
        <h2 className="font-bold text-[#054A2B]">সক্রিয় সেশনসমূহ</h2>
        <p className="mt-1 text-sm text-[#5C6B76]">যেসব ডিভাইস/ব্রাউজারে এই অ্যাকাউন্টে লগইন আছে। অপরিচিত সেশন দেখলে বাতিল করুন।</p>
        {sessError && (
          <div className="mt-3">
            <ErrorBox message={sessError} />
          </div>
        )}
        {sessions.isPending ? (
          <Spinner />
        ) : (sessions.data?.sessions.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-[#5C6B76]">কোনো সক্রিয় সেশন পাওয়া যায়নি।</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sessions.data?.sessions.map((s) => (
              <li key={s.ref} className="rounded-2xl border border-[#E1E9E4] p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[15px]">
                    {s.current ? "এই ডিভাইস / ব্রাউজার" : "অন্য সেশন"}
                    {s.current && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-[#075B35] text-white">বর্তমান</span>}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[#5C6B76]">
                    লগইন: {fmtDateTime(s.createdAt)} • মেয়াদ শেষ: {fmtDateTime(s.expiresAt)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() => {
                      setSessError("");
                      revoke.mutate(s.ref);
                    }}
                    className="shrink-0 border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-3.5 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60"
                  >
                    বাতিল করুন
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------- Professional panel

export function ProDashboard({ params }: { params: URLSearchParams }) {
  const token = getToken() ?? "";
  const me = useMe();
  const tabRaw = params.get("tab") ?? "jobs";
  const tab = ["jobs", "earnings", "reviews", "verification", "support", "profile", "notifications"].includes(tabRaw) ? tabRaw : "jobs";
  const [filter, setFilter] = useState("requests");
  const jobs = useQuery({
    queryKey: ["pro-jobs"],
    queryFn: () => api.getProJobs({ token }),
    enabled: !!token && !!me.data?.professional,
  });
  const earningsQ = useQuery({
    queryKey: ["pro-earnings"],
    queryFn: () => api.getProEarnings({ token }),
    enabled: !!token && !!me.data?.professional,
  });
  const notifs = useQuery({
    queryKey: ["notifs"],
    queryFn: () => api.getNotifications({ token }),
    enabled: !!token,
  });
  const gate = GateMessage({ query: me });
  if (gate) return gate;
  const user = me.data!.user;
  const pro = me.data!.professional;
  if (user.role === "customer") {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState title="আপনি গ্রাহক হিসেবে লগইন করেছেন" action={<a href="#/dashboard" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">গ্রাহক ড্যাশবোর্ড</a>} />
      </div>
    );
  }
  if (!pro) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="প্রফেশনাল প্রোফাইল পাওয়া যায়নি"
          body="প্রফেশনাল হিসেবে কাজ করতে আবেদন করুন।"
          action={<a href="#/join" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">আবেদন করুন</a>}
        />
      </div>
    );
  }
  const list = jobs.data?.bookings ?? [];
  const newReq = list.filter((b) => b.stage === "assigned");
  const accepted = list.filter((b) => b.stage === "accepted");
  const activeJobs = list.filter((b) => b.stage === "in_progress" || b.stage === "pro_completed");
  const completed = list.filter((b) => b.stage === "customer_confirmed" || b.stage === "admin_reviewed");
  const cancelled = list.filter((b) => b.stage === "cancelled" || b.stage === "rejected");
  const filtered =
    filter === "requests"
      ? newReq
      : filter === "accepted"
        ? accepted
        : filter === "active"
          ? activeJobs
          : filter === "completed"
            ? completed
            : filter === "cancelled"
              ? cancelled
              : list;
  const earnedTotal = earningsQ.data?.totals.earned ?? 0;
  const tabs = [
    { key: "jobs", label: "আমার কাজ", badge: newReq.length },
    { key: "earnings", label: "আয় ও উইথড্র" },
    { key: "reviews", label: "রিভিউ" },
    { key: "verification", label: "যাচাই অবস্থা" },
    { key: "support", label: "সাপোর্ট / আপিল" },
    { key: "profile", label: "প্রোফাইল সম্পাদনা" },
    { key: "notifications", label: "নোটিফিকেশন", badge: me.data?.unreadNotifications },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3.5 mb-5">
        <Avatar name={user.name} photoUrl={user.photoUrl} size="w-13 h-13" />
        <div>
          <h1 className="text-[24px] font-bold text-[#054A2B] leading-tight">{user.name}</h1>
          <p className="text-sm text-[#5C6B76]">
            {pro.categoryName} • {pro.experienceYears} বছরের অভিজ্ঞতা
          </p>
        </div>
        <span className={`ml-auto text-xs font-bold px-3 py-1.5 rounded-full ${pro.status === "verified" ? "bg-[#075B35] text-white" : pro.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
          {PRO_STATUS_BN[pro.status]}
        </span>
      </div>

      {pro.status === "pending" && (
        <div className="mb-5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5 text-[15px] text-amber-900">
          আপনার আবেদনটি <b>যাচাইয়ের অপেক্ষায়</b> আছে। অ্যাডমিন যাচাই সম্পন্ন করলে আপনার প্রোফাইল গ্রাহকদের কাছে প্রকাশিত হবে এবং আপনি কাজ গ্রহণ করতে পারবেন। বিস্তারিত <a href="#/pro-dashboard?tab=verification" className="font-bold underline">যাচাই অবস্থা</a> ট্যাবে দেখুন।
        </div>
      )}
      {pro.status === "rejected" && (
        <div className="mb-5 rounded-2xl bg-red-50 border border-red-200 px-4 py-3.5 text-[15px] text-red-800">
          দুঃখিত, আপনার আবেদনটি গৃহীত হয়নি। <a href="#/pro-dashboard?tab=verification" className="font-bold underline">যাচাই অবস্থা</a> ট্যাবে কারণ দেখে সংশোধিত ডকুমেন্ট আবার জমা দিন।
        </div>
      )}
      {pro.status === "suspended" && (
        <div className="mb-5 rounded-2xl bg-red-50 border border-red-200 px-4 py-3.5 text-[15px] text-red-800">
          আপনার প্রোফাইল সাময়িকভাবে স্থগিত আছে। বিস্তারিত জানতে <a href="#/pro-dashboard?tab=support" className="font-bold underline">সাপোর্টে</a> যোগাযোগ করুন।
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="নতুন কাজের অনুরোধ" value={newReq.length} icon={Icon.bell("w-5 h-5")} />
        <StatCard label="সম্পন্ন কাজ" value={completed.length} icon={Icon.checkCircle("w-5 h-5")} />
        <StatCard
          label="গড় রেটিং"
          value={pro.avgRating != null ? <span className="inline-flex items-center gap-1.5">{pro.avgRating} <Stars value={pro.avgRating} /></span> : "—"}
          icon={Icon.star(true, "w-5 h-5")}
        />
        <StatCard
          label="মোট আয় (যাচাইকৃত পেমেন্ট থেকে)"
          value={earningsQ.data ? bdt(earnedTotal) : "—"}
          icon={Icon.wallet("w-5 h-5")}
        />
      </div>

      <TabsBar tabs={tabs} active={tab} href={(k) => `#/pro-dashboard?tab=${k}`} />
      <div className="mt-6">
        {tab === "jobs" && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="কাজের ফিল্টার">
              {(
                [
                  ["requests", `অনুরোধ (${newReq.length})`],
                  ["accepted", `গৃহীত (${accepted.length})`],
                  ["active", `চলমান (${activeJobs.length})`],
                  ["completed", `সম্পন্ন (${completed.length})`],
                  ["cancelled", `বাতিল (${cancelled.length})`],
                  ["all", `সব (${list.length})`],
                ] as [string, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold ${filter === k ? "bg-[#054A2B] text-white" : "bg-white border border-[#E1E9E4] text-[#43534B]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {jobs.isPending ? (
              <Spinner />
            ) : filtered.length === 0 ? (
              <EmptyState title="এখানে কোনো কাজ নেই" body={pro.status !== "verified" ? "যাচাই সম্পন্ন হলেই অ্যাডমিন আপনাকে কাজ অ্যাসাইন করতে পারবেন।" : "নতুন কাজ অ্যাসাইন হলে এখানে দেখা যাবে।"} />
            ) : (
              <div className="grid md:grid-cols-2 gap-3.5">
                {filtered.map((b) => (
                  <BookingCard key={b.id} b={b} />
                ))}
              </div>
            )}
            <p className="mt-4 text-sm text-[#5C6B76]">কাজ গ্রহণ/শুরু/শেষ করতে বুকিং কার্ডে চাপ দিয়ে বিবরণ পেজে যান।</p>
          </div>
        )}
        {tab === "earnings" && <ProEarningsTab token={token} />}
        {tab === "reviews" && <ProReviewsTab token={token} />}
        {tab === "verification" && <ProVerificationTab token={token} proId={pro.id} status={pro.status} />}
        {tab === "support" && <SupportTab token={token} />}
        {tab === "profile" && <ProProfileTab me={me.data!} token={token} />}
        {tab === "notifications" &&
          (notifs.isPending ? <Spinner /> : <NotificationsList notifs={notifs.data?.notifications ?? []} token={token} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- pro earnings

const WITHDRAWAL_METHOD_BN: Record<string, string> = {
  bkash: "বিকাশ",
  nagad: "নগদ",
  bank: "ব্যাংক অ্যাকাউন্ট",
  // Pathao Pay has no public merchant API (researched 2026-11-17), so
  // it stays a clearly labelled placeholder: choosing it only records
  // the preference; any payout is arranged manually by an admin.
  pathao_pay: "পাঠাও পে (শীঘ্রই আসছে)",
};

const WITHDRAWAL_STATUS_BN: Record<string, { label: string; cls: string }> = {
  requested: { label: "অপেক্ষমাণ", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "অনুমোদিত", cls: "bg-sky-100 text-sky-800" },
  held: { label: "হোল্ডে আছে", cls: "bg-red-100 text-red-700" },
  rejected: { label: "বাতিল", cls: "bg-red-100 text-red-700" },
  paid: { label: "পরিশোধিত", cls: "bg-[#075B35] text-white" },
};

function MoneyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[14px] text-[#5C6B76]">{label}</span>
      <span className={`font-en text-[14.5px] ${strong ? "font-bold text-[#054A2B]" : "font-semibold text-[#172B3A]"}`}>{value}</span>
    </div>
  );
}

function ProEarningsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const earningsQ = useQuery({ queryKey: ["pro-earnings"], queryFn: () => api.getProEarnings({ token }) });
  const walletQ = useQuery({ queryKey: ["pro-wallet"], queryFn: () => api.getProWallet({ token }) });
  const [method, setMethod] = useState("");
  const [number, setNumber] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [infoErr, setInfoErr] = useState("");
  const [amount, setAmount] = useState("");
  const [wdMsg, setWdMsg] = useState("");
  const [wdErr, setWdErr] = useState("");
  useEffect(() => {
    if (walletQ.data) {
      setMethod(walletQ.data.withdrawalMethod ?? "");
      setNumber(walletQ.data.withdrawalNumber ?? "");
    }
  }, [walletQ.data]);
  const saveInfo = useMutation({
    mutationFn: () =>
      api.updateWithdrawalInfo({
        token,
        method: method as "bkash" | "nagad" | "bank" | "pathao_pay",
        number,
      }),
    onSuccess: () => {
      setInfoMsg("উইথড্রয়াল তথ্য সংরক্ষিত হয়েছে।");
      setInfoErr("");
      qc.invalidateQueries({ queryKey: ["pro-wallet"] });
    },
    onError: (e) => {
      setInfoErr(errMsg(e));
      setInfoMsg("");
    },
  });
  const requestWd = useMutation({
    mutationFn: () => api.requestWithdrawal({ token, amount: Number(amount) }),
    onSuccess: () => {
      setWdMsg("উইথড্রয়াল অনুরোধ পাঠানো হয়েছে। অ্যাডমিন যাচাই করে সিদ্ধান্ত নিলে এখানে স্ট্যাটাস বদলে যাবে।");
      setWdErr("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["pro-wallet"] });
      qc.invalidateQueries({ queryKey: ["pro-earnings"] });
    },
    onError: (e) => {
      setWdErr(errMsg(e));
      setWdMsg("");
    },
  });
  if (earningsQ.isPending || walletQ.isPending) return <Spinner />;
  if (earningsQ.isError || walletQ.isError || !earningsQ.data || !walletQ.data) {
    return <ErrorBox message="আয়ের তথ্য লোড করা যায়নি — আবার চেষ্টা করুন।" />;
  }
  const { rows, totals } = earningsQ.data;
  const wallet = walletQ.data;
  const amt = Number(amount);
  const amtValid = Number.isInteger(amt) && amt > 0 && amt <= wallet.availableBalance;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="মোট আয় (সব যাচাইকৃত কাজ)" value={bdt(totals.earned)} icon={Icon.wallet("w-5 h-5")} />
        <StatCard label="হেল্ড ব্যালেন্স (অবশিষ্ট)" value={bdt(totals.held)} icon={Icon.clock("w-5 h-5")} />
        <StatCard label="মোট কমিশন কাটা হয়েছে" value={bdt(totals.commission)} icon={Icon.settings("w-5 h-5")} />
        <StatCard label="ইতিমধ্যে পেইড আউট" value={bdt(totals.paidOut)} icon={Icon.checkCircle("w-5 h-5")} />
      </div>

      <section aria-label="বুকিং অনুযায়ী আয়ের হিসাব">
        <h2 className="text-lg font-bold text-[#054A2B] mb-3">বুকিং অনুযায়ী হিসাব</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="এখনো কোনো যাচাইকৃত পেমেন্ট নেই"
            body="গ্রাহকের অনলাইন পেমেন্ট অ্যাডমিন যাচাই করলেই সেই কাজের হিসাব এখানে দেখা যাবে।"
          />
        ) : (
          <div className="grid md:grid-cols-2 gap-3.5">
            {rows.map((r) => (
              <div key={r.bookingId} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-bold text-[15px]">
                    {r.serviceName} <span className="font-en text-[13px] text-[#5C6B76]">• {r.code}</span>
                  </p>
                  {r.paymentModel && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F3F8F4] text-[#054A2B]">
                      {PAYMENT_MODEL_BN[r.paymentModel] ?? r.paymentModel}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[#EEF3F0]">
                  <MoneyRow label="সার্ভিস চার্জ (বিল)" value={r.serviceCharge != null ? bdt(r.serviceCharge) : "—"} />
                  <MoneyRow label="কমিশন" value={`− ${bdt(r.commission)}`} />
                  <MoneyRow label="হেল্ড (অনলাইন অংশ)" value={bdt(r.held)} />
                  {r.cashReceived > 0 && <MoneyRow label="নগদে সরাসরি পেয়েছেন" value={bdt(r.cashReceived)} />}
                  <MoneyRow label="হেল্ড থেকে পাওনা" value={bdt(r.payoutFromHeld)} />
                  <MoneyRow label="পেইড আউট হয়েছে" value={bdt(r.paidOut)} />
                  {r.refunded > 0 && <MoneyRow label="রিফান্ড হয়েছে (হেল্ড থেকে ছাড়া)" value={bdt(r.refunded)} />}
                  <MoneyRow label="এখনো হেল্ডে আছে" value={bdt(r.remainingHeld)} />
                  <MoneyRow label="এই কাজে আপনার মোট আয়" value={bdt(r.proTotal)} strong />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="উইথড্র" className="rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[#054A2B]">টাকা উত্তোলন (উইথড্র)</h2>
        <p className="mt-1 text-[15px] text-[#43534B]">
          উত্তোলনযোগ্য ব্যালেন্স: <b className="font-en text-[#054A2B]">{bdt(wallet.availableBalance)}</b>
          {wallet.openWithdrawalTotal > 0 && (
            <span className="text-[#5C6B76]"> (হেল্ড {bdt(wallet.held)} থেকে অপেক্ষমাণ অনুরোধ {bdt(wallet.openWithdrawalTotal)} বাদ দিয়ে)</span>
          )}
          {wallet.frozenHeld > 0 && (
            <span className="block mt-1 font-semibold text-red-700">
              বিরোধ চলমান বা বাতিল হওয়া বুকিংয়ে {bdt(wallet.frozenHeld)} স্থগিত আছে — অ্যাডমিনের সিদ্ধান্ত না হওয়া পর্যন্ত এটি তোলা যাবে না।
            </span>
          )}
        </p>

        <form
          className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setInfoMsg("");
            setInfoErr("");
            if (!method) return setInfoErr("উইথড্রয়ালের মাধ্যম বেছে নিন।");
            saveInfo.mutate();
          }}
        >
          <div>
            <label className={labelCls} htmlFor="wd-method">উইথড্রয়ালের মাধ্যম</label>
            <select id="wd-method" className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)} required>
              <option value="" disabled>বেছে নিন</option>
              <option value="bkash">বিকাশ</option>
              <option value="nagad">নগদ</option>
              <option value="bank">ব্যাংক অ্যাকাউন্ট</option>
              <option value="pathao_pay">পাঠাও পে (শীঘ্রই আসছে)</option>
            </select>
            {method === "pathao_pay" && (
              <p className="mt-1.5 text-[13px] text-[#5C6B76]">
                পাঠাও পে এখনো চালু হয়নি — এর কোনো পাবলিক মার্চেন্ট API নেই। এই মাধ্যম বেছে নিলে পেআউট অ্যাডমিন ম্যানুয়ালি সমন্বয় করবেন।
              </p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="wd-number">{method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর" : "মোবাইল নম্বর"}</label>
            <input id="wd-number" className={`${inputCls} font-en`} {...FIELDS.updateWithdrawalInfo.number} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={method === "bank" ? "অ্যাকাউন্ট নম্বর" : "01XXXXXXXXX"} required />
          </div>
          <button type="submit" disabled={saveInfo.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
            {saveInfo.isPending ? "সংরক্ষণ হচ্ছে…" : "তথ্য সংরক্ষণ"}
          </button>
        </form>
        {infoErr && <div className="mt-3"><ErrorBox message={infoErr} /></div>}
        {infoMsg && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">{infoMsg}</p>}

        <form
          className="mt-5 grid sm:grid-cols-[1fr_auto] gap-3 items-end border-t border-[#E1E9E4] pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            setWdMsg("");
            setWdErr("");
            requestWd.mutate();
          }}
        >
          <div>
            <label className={labelCls} htmlFor="wd-amount">উত্তোলনের পরিমাণ (৳)</label>
            <input id="wd-amount" type="number" {...FIELDS.requestWithdrawal.amount} className={`${inputCls} font-en`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
          </div>
          <button
            type="submit"
            disabled={requestWd.isPending || !amtValid || !wallet.withdrawalMethod}
            className="bg-[#FF8500] hover:bg-[#E67600] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {requestWd.isPending ? "পাঠানো হচ্ছে…" : "উইথড্র অনুরোধ করুন"}
          </button>
        </form>
        {!wallet.withdrawalMethod && <p className="mt-2 text-sm text-[#5C6B76]">অনুরোধ করতে আগে উপরে মাধ্যম ও নম্বর সংরক্ষণ করুন।</p>}
        {amount !== "" && !amtValid && wallet.availableBalance >= 0 && (
          <p className="mt-2 text-sm text-red-700">পরিমাণটি উত্তোলনযোগ্য ব্যালেন্সের মধ্যে হতে হবে।</p>
        )}
        {wdErr && <div className="mt-3"><ErrorBox message={wdErr} /></div>}
        {wdMsg && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">{wdMsg}</p>}

        <h3 className="mt-6 font-bold text-[#054A2B]">আগের অনুরোধসমূহ</h3>
        {wallet.requests.length === 0 ? (
          <p className="mt-2 text-sm text-[#5C6B76]">এখনো কোনো উইথড্র অনুরোধ করেননি।</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#EEF3F0]">
            {wallet.requests.map((r) => {
              const st = WITHDRAWAL_STATUS_BN[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-700" };
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-en font-bold">{bdt(r.amount)}</span>
                  <span className="text-sm text-[#43534B]">{WITHDRAWAL_METHOD_BN[r.method] ?? providerEn(r.method)} • <span className="font-en">{r.number}</span></span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  <span className="text-[13px] text-[#5C6B76] ml-auto">{fmtDate(r.createdAt)}</span>
                  {r.status === "paid" && r.transactionReference && (
                    <span className="w-full text-[13px] text-[#5C6B76]">লেনদেন রেফারেন্স: <span className="font-en">{r.transactionReference}</span></span>
                  )}
                  {r.status === "held" && r.holdReason && (
                    <span className="w-full text-[13px] text-red-700">হোল্ডের কারণ: {r.holdReason} — হোল্ড ছাড়া না হলে এই টাকা পাঠানো হবে না।</span>
                  )}
                  {r.status === "rejected" && r.rejectionReason && (
                    <span className="w-full text-[13px] text-red-700">কারণ: {r.rejectionReason}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ pro reviews

function ProReviewsTab({ token }: { token: string }) {
  const q = useQuery({ queryKey: ["pro-reviews"], queryFn: () => api.getProReviews({ token }) });
  if (q.isPending) return <Spinner />;
  const reviews = q.data?.reviews ?? [];
  if (reviews.length === 0) {
    return (
      <EmptyState
        title="এখনো কোনো রিভিউ আসেনি"
        body="কাজ সম্পন্ন হলে গ্রাহক রিভিউ দিতে পারবেন। অ্যাডমিন অনুমোদন করা রিভিউগুলো এখানে ও আপনার পাবলিক প্রোফাইলে দেখা যাবে।"
      />
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-3.5">
      {reviews.map((r) => (
        <article key={r.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
          <div className="flex items-center gap-2">
            <Stars value={r.rating} />
            <span className="font-en font-bold text-[14px]">{r.rating}/5</span>
            <span className="ml-auto text-[13px] text-[#5C6B76]">{fmtDate(r.createdAt)}</span>
          </div>
          <p className="mt-2 text-[15px] text-[#172B3A]">{r.text}</p>
          <p className="mt-2 text-[13.5px] text-[#5C6B76]">
            {r.customerName} • {r.serviceName}
          </p>
        </article>
      ))}
    </div>
  );
}

// ------------------------------------------------------- pro verification

const VERIFICATION_ITEM_BN: Record<string, string> = {
  nid_number: "NID নম্বর",
  nid_front: "NID কার্ডের সামনের ছবি",
  nid_back: "NID কার্ডের পেছনের ছবি",
};

function ProVerificationTab({ token, proId, status }: { token: string; proId: number; status: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pro-verification"], queryFn: () => api.getProVerification({ token }) });
  const [nidNumber, setNidNumber] = useState("");
  const [front, setFront] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [back, setBack] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [frontName, setFrontName] = useState("");
  const [backName, setBackName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const resubmit = useMutation({
    mutationFn: () =>
      api.resubmitIdentityDocuments({
        token,
        nidNumber: nidNumber.trim() ? nidNumber.trim() : undefined,
        nidFrontPhoto: front,
        nidBackPhoto: back,
      }),
    onSuccess: () => {
      setMsg("ডকুমেন্ট আবার জমা দেওয়া হয়েছে — আপনার আবেদন এখন যাচাইয়ের অপেক্ষায়।");
      setErr("");
      qc.invalidateQueries({ queryKey: ["pro-verification"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => {
      setErr(errMsg(e));
      setMsg("");
    },
  });
  if (q.isPending) return <Spinner />;
  if (q.isError || !q.data) return <ErrorBox message="যাচাইয়ের তথ্য লোড করা যায়নি — আবার চেষ্টা করুন।" />;
  const v = q.data;
  const items: { key: string; label: string; done: boolean }[] = [
    { key: "nid_number", label: VERIFICATION_ITEM_BN.nid_number!, done: v.hasNidNumber },
    { key: "nid_front", label: VERIFICATION_ITEM_BN.nid_front!, done: v.documents.nidFront },
    { key: "nid_back", label: VERIFICATION_ITEM_BN.nid_back!, done: v.documents.nidBack },
  ];
  return (
    <div className="max-w-2xl space-y-5">
      <div
        className={`rounded-2xl border px-4 py-3.5 text-[15px] ${
          v.status === "verified"
            ? "bg-[#F3F8F4] border-[#C9DFD2] text-[#054A2B]"
            : v.status === "pending"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-red-50 border-red-200 text-red-800"
        }`}
        role="status"
      >
        বর্তমান অবস্থা: <b>{PRO_STATUS_BN[v.status] ?? v.status}</b>
        {v.status === "pending" && " — অ্যাডমিনের যাচাই শেষ হলে প্রোফাইল প্রকাশিত হবে ও কাজ গ্রহণ করা যাবে।"}
        {v.status === "verified" && " — আপনার প্রোফাইল গ্রাহকদের কাছে প্রকাশিত এবং আপনি কাজ গ্রহণ করতে পারবেন।"}
        {v.status === "rejected" && " — নিচের কারণ দেখে সংশোধিত ডকুমেন্ট আবার জমা দিন।"}
        {v.status === "suspended" && " — বিস্তারিত জানতে সাপোর্ট ট্যাবে যোগাযোগ করুন।"}
      </div>

      {v.verificationNote && (
        <div className="rounded-2xl border border-[#E1E9E4] bg-white px-4 py-3.5">
          <p className="font-bold text-[15px] text-[#054A2B]">অ্যাডমিনের নোট</p>
          <p className="mt-1 text-[15px] text-[#172B3A]">{v.verificationNote}</p>
        </div>
      )}

      <div className="rounded-2xl border border-[#E1E9E4] bg-white px-4 py-3.5">
        <p className="font-bold text-[15px] text-[#054A2B]">যাচাইয়ের জন্য যা লাগে</p>
        <ul className="mt-2 space-y-1.5">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-2 text-[15px]">
              <span className={it.done ? "text-[#075B35]" : "text-red-600"}>{it.done ? Icon.checkCircle("w-5 h-5") : Icon.clock("w-5 h-5")}</span>
              <span>{it.label}</span>
              <span className={`ml-auto text-[13px] font-semibold ${it.done ? "text-[#075B35]" : "text-red-600"}`}>
                {it.done ? "জমা হয়েছে" : "বাকি আছে"}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-[#E1E9E4] pt-3">
          <span className={labelCls}>আমার জমা দেওয়া ডকুমেন্ট</span>
          <IdentityDocViewer token={token} professionalId={proId} documents={v.documents} />
          <p className="mt-1 text-[13px] text-[#5C6B76]">এই ডকুমেন্টগুলো শুধু আপনি ও যাচাইকারী অ্যাডমিন দেখতে পারবেন — কোনো পাবলিক লিংক নেই।</p>
        </div>
      </div>

      {status === "rejected" && (
        <form
          className="rounded-2xl border border-[#E1E9E4] bg-white px-4 py-4 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg("");
            setErr("");
            if (!front || !back) return setErr("NID-এর সামনে ও পেছনের দুটি ছবিই আবার দিন।");
            resubmit.mutate();
          }}
        >
          <p className="font-bold text-[15px] text-[#054A2B]">সংশোধিত ডকুমেন্ট আবার জমা দিন</p>
          <p className="mt-1 text-sm text-[#5C6B76]">আগের ছবিগুলো বদলে নতুন ছবি বসবে এবং আবেদনটি আবার যাচাইয়ের অপেক্ষায় যাবে।</p>
          <div className="mt-3">
            <label className={labelCls} htmlFor="rs-nid">NID নম্বর (শুধু বদলাতে চাইলে)</label>
            <input id="rs-nid" className={`${inputCls} font-en`} {...FIELDS.resubmitIdentityDocuments.nidNumber} value={nidNumber} onChange={(e) => setNidNumber(e.target.value)} placeholder="আগের নম্বরই থাকবে" />
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <PhotoField
              label="NID সামনের ছবি"
              fileName={frontName}
              onPick={(img) => {
                setFront(img);
                setFrontName(img ? "ছবি যুক্ত হয়েছে" : "");
              }}
            />
            <PhotoField
              label="NID পেছনের ছবি"
              fileName={backName}
              onPick={(img) => {
                setBack(img);
                setBackName(img ? "ছবি যুক্ত হয়েছে" : "");
              }}
            />
          </div>
          {err && <div className="mt-3"><ErrorBox message={err} /></div>}
          {msg && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">{msg}</p>}
          <button type="submit" disabled={resubmit.isPending} className="mt-4 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
            {resubmit.isPending ? "জমা দেওয়া হচ্ছে…" : "আবার জমা দিন"}
          </button>
        </form>
      )}
    </div>
  );
}

type DocKind = "nid_front" | "nid_back";

const DOC_KIND_BN: { kind: DocKind; label: string }[] = [
  { kind: "nid_front", label: "NID সামনের ছবি" },
  { kind: "nid_back", label: "NID পেছনের ছবি" },
];

// Identity documents are fetched one at a time through the
// getIdentityDocument action (never a public URL): the server allows
// only the owning professional or an operations/super admin, and logs
// every admin view.
function IdentityDocViewer({
  token,
  professionalId,
  documents,
}: {
  token: string;
  professionalId: number;
  documents?: { nidFront: boolean; nidBack: boolean };
}) {
  const [view, setView] = useState<{ kind: DocKind; url: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const has = (kind: DocKind) => !documents || (kind === "nid_front" ? documents.nidFront : documents.nidBack);
  const open = async (kind: DocKind) => {
    setBusy(kind);
    setError("");
    try {
      const r = await api.getIdentityDocument({ token, professionalId, kind });
      setView({ kind, url: `data:${r.mimeType};base64,${r.dataBase64}` });
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy("");
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {DOC_KIND_BN.map(({ kind, label }) =>
          has(kind) ? (
            <button
              key={kind}
              type="button"
              disabled={busy === kind}
              onClick={() => open(kind)}
              className="border border-[#E1E9E4] font-semibold text-[13px] px-3 py-1.5 rounded-lg hover:bg-[#F3F8F4] disabled:opacity-60"
            >
              {busy === kind ? "লোড হচ্ছে…" : label}
            </button>
          ) : (
            <span key={kind} className="text-[13px] text-[#5C6B76] border border-dashed border-[#E1E9E4] px-3 py-1.5 rounded-lg">
              {label}: জমা হয়নি
            </span>
          ),
        )}
      </div>
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
      {view && (
        <div className="mt-3">
          <img
            src={view.url}
            alt={DOC_KIND_BN.find((d) => d.kind === view.kind)?.label ?? "পরিচয় ডকুমেন্ট"}
            className="max-h-72 w-auto rounded-xl border border-[#E1E9E4] object-contain"
          />
          <div>
            <button type="button" onClick={() => setView(null)} className="mt-2 text-[13px] font-semibold text-[#075B35] hover:underline">
              ছবি বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Weekday chips for per-day availability (JS weekday numbers:
// 0 = Sunday … 6 = Saturday), ordered Saturday-first as in Bangladesh.
const WEEKDAY_BN: { d: number; label: string }[] = [
  { d: 6, label: "শনিবার" },
  { d: 0, label: "রবিবার" },
  { d: 1, label: "সোমবার" },
  { d: 2, label: "মঙ্গলবার" },
  { d: 3, label: "বুধবার" },
  { d: 4, label: "বৃহস্পতিবার" },
  { d: 5, label: "শুক্রবার" },
];

function ProProfileTab({ me, token }: { me: Me; token: string }) {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const pro = me.professional!;
  const [name, setName] = useState(me.user.name);
  const [experience, setExperience] = useState(String(pro.experienceYears));
  const [skills, setSkills] = useState(pro.skills ?? "");
  const [areas, setAreas] = useState<string[]>(pro.areas);
  const [address, setAddress] = useState(pro.address ?? "");
  const [bio, setBio] = useState(pro.bio ?? "");
  const [available, setAvailable] = useState(pro.available);
  const [availableDays, setAvailableDays] = useState<number[]>(pro.availableDays);
  const [photo, setPhoto] = useState<{ dataBase64: string; mimeType: string } | undefined>();
  const [photoName, setPhotoName] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.updateProProfile({
        token,
        name,
        experienceYears: Number(experience) || 0,
        skills: skills || undefined,
        areas,
        address: address || undefined,
        bio: bio || undefined,
        available,
        availableDays,
        photo,
      }),
    onSuccess: () => {
      setOk(true);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const toggleArea = (a: string) =>
    setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  return (
    <form
      className="max-w-2xl rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 grid sm:grid-cols-2 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setOk(false);
        if (areas.length === 0) return setError("কমপক্ষে একটি সেবার এলাকা বেছে নিন।");
        if (availableDays.length === 0) return setError("কমপক্ষে একটি কাজের দিন বেছে নিন।");
        save.mutate();
      }}
    >
      <div>
        <label className={labelCls} htmlFor="pp-name">নাম</label>
        <input id="pp-name" className={inputCls} {...FIELDS.updateProProfile.name} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls} htmlFor="pp-exp">অভিজ্ঞতা (বছর)</label>
        <input id="pp-exp" type="number" {...FIELDS.updateProProfile.experienceYears} className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value)} required />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="pp-skills">দক্ষতা ও বিশেষত্ব</label>
        <input id="pp-skills" className={inputCls} {...FIELDS.updateProProfile.skills} value={skills} onChange={(e) => setSkills(e.target.value)} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={labelCls}>সেবার এলাকা</legend>
        <div className="flex flex-wrap gap-2">
          {(catalog.data?.locations ?? []).map((l) => {
            const on = areas.includes(l.nameBn);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleArea(l.nameBn)}
                aria-pressed={on}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border ${on ? "bg-[#075B35] text-white border-[#075B35]" : "bg-white text-[#43534B] border-[#E1E9E4]"}`}
              >
                {l.nameBn}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="pp-addr">ঠিকানা</label>
        <input id="pp-addr" className={inputCls} {...FIELDS.updateProProfile.address} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="pp-bio">পরিচিতি</label>
        <textarea id="pp-bio" className={inputCls} rows={3} {...FIELDS.updateProProfile.bio} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl bg-[#F3F8F4] px-4 py-3 cursor-pointer">
        <span className="font-semibold text-[15px]">এখন কাজ নেওয়ার জন্য উপলব্ধ</span>
        <input
          type="checkbox"
          className="w-5 h-5 accent-[#075B35]"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
          aria-label="উপলব্ধতা"
        />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className={labelCls}>কোন কোন দিন কাজ করেন</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_BN.map(({ d, label }) => {
            const on = availableDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setAvailableDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))
                }
                aria-pressed={on}
                className={`px-3.5 py-2 rounded-full text-sm font-medium border ${on ? "bg-[#075B35] text-white border-[#075B35]" : "bg-white text-[#43534B] border-[#E1E9E4]"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[13px] text-[#5C6B76]">সব দিন বেছে রাখলে প্রতিদিনই কাজের জন্য উপলব্ধ থাকবেন।</p>
      </fieldset>
      <div className="sm:col-span-2">
        <span className={labelCls}>আমার পরিচয় ডকুমেন্ট</span>
        <IdentityDocViewer token={token} professionalId={pro.id} />
        <p className="mt-1 text-[13px] text-[#5C6B76]">এই ডকুমেন্টগুলো শুধু আপনি ও অ্যাডমিন দেখতে পারবেন — কোনো পাবলিক লিংক নেই।</p>
      </div>
      <div className="sm:col-span-2">
        <PhotoField
          label="নতুন প্রোফাইল ছবি"
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
      {ok && <p className="sm:col-span-2 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">প্রোফাইল সংরক্ষিত হয়েছে।</p>}
      <button type="submit" disabled={save.isPending} className="sm:col-span-2 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
        {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
    </form>
  );
}

// ------------------------------------------------------------ Admin panel

type AdminPro = ApiResponse<typeof api, "adminListProfessionals">["professionals"][number];
type AdminService = ApiResponse<typeof api, "adminListServicesAll">["services"][number];

export function AdminPanel({ params }: { params: URLSearchParams }) {
  const token = getToken() ?? "";
  const me = useMe();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabRaw = params.get("tab") ?? "overview";
  const tab = ["overview", "analytics", "bookings", "professionals", "customers", "services", "locations", "reviews", "complaints", "tickets", "social", "announce", "coupons", "payments", "settings", "staff", "logs"].includes(tabRaw)
    ? tabRaw
    : "overview";
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.getAdminOverview({ token }),
    enabled: !!token && me.data?.user.role === "admin",
    ...MONEY_REFETCH,
  });
  const gate = GateMessage({ query: me });
  if (gate) return gate;
  if (me.data!.user.role !== "admin") {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="অনুমতি নেই"
          body="অ্যাডমিন প্যানেল শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিনের জন্য। এই পেজের সব ডেটা সার্ভার থেকেও সুরক্ষিত — অন্য কোনো ভূমিকা দিয়ে এখানকার তথ্য পাওয়া যাবে না।"
          action={<a href="#/" className="inline-flex bg-[#075B35] text-white font-semibold px-5 py-2.5 rounded-xl">হোমে ফিরুন</a>}
        />
      </div>
    );
  }
  const ov = overview.data;
  // Tabs follow the admin's permission level; the server enforces the
  // same levels on every action, so a hidden tab is only a shortcut —
  // the API itself stays closed to levels without permission.
  const level = me.data!.user.adminLevel ?? "super";
  const canOps = level === "super" || level === "operations";
  const canSupport = level === "super" || level === "support";
  const canFinance = level === "super" || level === "finance";
  type AdminTab = { key: string; label: string; icon: ReactNode; badge?: number };
  const groups: { title: string; tabs: AdminTab[] }[] = [
    {
      title: "প্রধান",
      tabs: [
        { key: "overview", label: "ড্যাশবোর্ড", icon: Icon.home("w-5 h-5") },
        { key: "analytics", label: "অ্যানালিটিক্স ও রিপোর্ট", icon: Icon.chart("w-5 h-5") },
      ],
    },
    ...(canOps
      ? [
          {
            title: "পরিচালনা",
            tabs: [
              { key: "bookings", label: "বুকিং", icon: Icon.calendar("w-5 h-5"), badge: ov?.pendingBookings },
              { key: "professionals", label: "প্রফেশনাল", icon: Icon.briefcase("w-5 h-5"), badge: ov?.pendingVerifications },
              { key: "customers", label: "গ্রাহক", icon: Icon.users("w-5 h-5") },
              { key: "services", label: "সার্ভিস", icon: Icon.grid("w-5 h-5") },
              { key: "locations", label: "এলাকা", icon: Icon.pin("w-5 h-5") },
            ] as AdminTab[],
          },
        ]
      : []),
    ...(canOps || canSupport
      ? [
          {
            title: "সাপোর্ট",
            tabs: [
              ...((canOps || canSupport)
                ? [{ key: "reviews", label: "রিভিউ", icon: Icon.star(true, "w-5 h-5"), badge: ov?.pendingReviews } as AdminTab]
                : []),
              ...(canSupport
                ? [
                    { key: "complaints", label: "অভিযোগ", icon: Icon.message("w-5 h-5"), badge: ov?.openComplaints } as AdminTab,
                    { key: "tickets", label: "সাপোর্ট টিকিট", icon: Icon.message("w-5 h-5"), badge: ov?.openTickets } as AdminTab,
                  ]
                : []),
            ],
          },
        ]
      : []),
    ...(canOps
      ? [
          {
            title: "মার্কেটিং",
            tabs: [
              { key: "announce", label: "ঘোষণা", icon: Icon.bell("w-5 h-5") },
              { key: "social", label: "সোশ্যাল লিংক", icon: Icon.globe("w-5 h-5") },
            ] as AdminTab[],
          },
        ]
      : []),
    ...(canFinance
      ? [
          {
            title: "ফাইন্যান্স",
            tabs: [
              { key: "payments", label: "পেমেন্ট ও ফাইন্যান্স", icon: Icon.wallet("w-5 h-5"), badge: ov?.pendingPayments },
              { key: "coupons", label: "কুপন", icon: Icon.sparkle("w-5 h-5") },
            ] as AdminTab[],
          },
        ]
      : []),
    {
      title: "সিস্টেম",
      tabs: [
        ...(canFinance ? [{ key: "settings", label: "সেটিংস", icon: Icon.settings("w-5 h-5") } as AdminTab] : []),
        ...(level === "super"
          ? [
              { key: "staff", label: "অ্যাডমিন টিম", icon: Icon.shield("w-5 h-5") } as AdminTab,
              { key: "logs", label: "কার্যকলাপ লগ", icon: Icon.fileText("w-5 h-5") } as AdminTab,
            ]
          : []),
      ],
    },
  ].filter((g) => g.tabs.length > 0);
  const allTabs = groups.flatMap((g) => g.tabs);
  const shownTab = allTabs.some((t) => t.key === tab) ? tab : "overview";
  const activeLabel = allTabs.find((t) => t.key === shownTab)?.label ?? "ড্যাশবোর্ড";

  const navList = (onNavigate?: () => void) => (
    <nav aria-label="অ্যাডমিন নেভিগেশন" className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          {!collapsed && <p className="px-3 mb-1.5 text-[11.5px] font-bold tracking-wide text-[#5C6B76]">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.tabs.map((t) => {
              const active = shownTab === t.key;
              return (
                <li key={t.key}>
                  <a
                    href={`#/admin?tab=${t.key}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? t.label : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold ${
                      active ? "bg-[#075B35] text-white" : "text-[#054A2B] hover:bg-[#F3F8F4]"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    <span className="shrink-0">{t.icon}</span>
                    {!collapsed && <span className="flex-1 truncate">{t.label}</span>}
                    {!collapsed && t.badge != null && t.badge > 0 && (
                      <span className={`min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold grid place-items-center ${active ? "bg-white text-[#075B35]" : "bg-[#FF8500] text-white"}`}>
                        {t.badge}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  // Mobile bottom nav: Dashboard, Bookings, Users, Finance, More.
  const bottomItems: { key: string; label: string; icon: ReactNode; href?: string }[] = [
    { key: "overview", label: "ড্যাশবোর্ড", icon: Icon.home("w-5 h-5"), href: "#/admin?tab=overview" },
    ...(canOps ? [{ key: "bookings", label: "বুকিং", icon: Icon.calendar("w-5 h-5"), href: "#/admin?tab=bookings" }] : []),
    ...(canOps ? [{ key: "customers", label: "ব্যবহারকারী", icon: Icon.users("w-5 h-5"), href: "#/admin?tab=customers" }] : []),
    ...(canFinance ? [{ key: "payments", label: "ফাইন্যান্স", icon: Icon.wallet("w-5 h-5"), href: "#/admin?tab=payments" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-4 py-5 lg:py-8">
      {/* Mobile admin top bar */}
      <div className="lg:hidden flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="অ্যাডমিন মেনু খুলুন"
          className="grid place-items-center w-11 h-11 rounded-xl border border-[#E1E9E4] bg-white text-[#054A2B]"
        >
          {Icon.menu("w-5 h-5")}
        </button>
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold text-[#054A2B] leading-tight truncate">{activeLabel}</h1>
          <p className="text-[12.5px] text-[#5C6B76] truncate">{me.data!.user.name} • {ADMIN_LEVEL_BN[level] ?? "অ্যাডমিন"}</p>
        </div>
      </div>

      <div className="lg:flex lg:gap-6 lg:items-start">
        {/* Desktop sidebar (collapsible) */}
        <aside className={`hidden lg:block shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-[#E1E9E4] bg-white p-3 ${collapsed ? "w-[76px]" : "w-64"}`}>
          <div className={`flex items-center gap-2.5 px-2 pb-3 ${collapsed ? "justify-center" : ""}`}>
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#054A2B] text-white shrink-0">{Icon.settings("w-5 h-5")}</span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-bold text-[#054A2B] leading-tight">অ্যাডমিন প্যানেল</p>
                <p className="text-[12px] text-[#5C6B76] truncate">{me.data!.user.name} • {ADMIN_LEVEL_BN[level] ?? "অ্যাডমিন"}</p>
              </div>
            )}
          </div>
          {navList()}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="mt-5 w-full inline-flex items-center justify-center gap-1.5 border border-[#E1E9E4] rounded-xl px-3 py-2 text-[13px] font-semibold text-[#054A2B] hover:bg-[#F3F8F4]"
          >
            {collapsed ? Icon.chevronRight("w-4 h-4") : (<>{Icon.chevronLeft("w-4 h-4")} ছোট করুন</>)}
          </button>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="অ্যাডমিন মেনু">
            <button type="button" aria-label="মেনু বন্ধ করুন" className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-xl overflow-y-auto p-4 pb-safe">
              <div className="flex items-center gap-2.5 pb-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-[#054A2B] text-white">{Icon.settings("w-5 h-5")}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[#054A2B] leading-tight">অ্যাডমিন প্যানেল</p>
                  <p className="text-[12px] text-[#5C6B76] truncate">{me.data!.user.name} • {ADMIN_LEVEL_BN[level] ?? "অ্যাডমিন"}</p>
                </div>
                <button type="button" onClick={() => setDrawerOpen(false)} aria-label="বন্ধ করুন" className="grid place-items-center w-9 h-9 rounded-lg border border-[#E1E9E4] text-[#054A2B]">
                  {Icon.x("w-4 h-4")}
                </button>
              </div>
              {navList(() => setDrawerOpen(false))}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0 pb-20 lg:pb-0">
          <h1 className="hidden lg:block text-[24px] font-bold text-[#054A2B] leading-tight mb-5">{activeLabel}</h1>
          {shownTab === "overview" && <AdminOverview token={token} />}
          {shownTab === "overview" && level === "super" && <FullBackupCard token={token} />}
          {shownTab === "analytics" && <AdminAnalytics token={token} />}
          {shownTab === "bookings" && <AdminBookings token={token} />}
          {shownTab === "professionals" && <AdminProfessionals token={token} />}
          {shownTab === "customers" && <AdminCustomers token={token} />}
          {shownTab === "services" && <AdminServices token={token} />}
          {shownTab === "locations" && <AdminLocations token={token} />}
          {shownTab === "reviews" && <AdminReviews token={token} />}
          {shownTab === "complaints" && <AdminComplaints token={token} />}
          {shownTab === "tickets" && <AdminTickets token={token} />}
          {shownTab === "social" && <AdminSocialLinks token={token} />}
          {shownTab === "announce" && <AdminAnnouncements token={token} />}
          {shownTab === "coupons" && <AdminCoupons token={token} />}
          {shownTab === "payments" && <AdminPayments token={token} />}
          {shownTab === "settings" && <AdminSettings token={token} />}
          {shownTab === "staff" && <AdminStaff token={token} />}
          {shownTab === "logs" && <AdminLogs token={token} />}
        </div>
      </div>

      {/* Admin mobile bottom navigation (replaces the customer one,
          which App.tsx hides on admin pages) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E1E9E4] pb-safe shadow-[0_-2px_12px_rgba(5,74,43,0.06)]" aria-label="অ্যাডমিন মোবাইল নেভিগেশন">
        <div className={`grid ${bottomItems.length >= 4 ? "grid-cols-5" : "grid-cols-4"}`}>
          {bottomItems.map((item) => (
            <a
              key={item.key}
              href={item.href}
              aria-current={shownTab === item.key ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${shownTab === item.key ? "text-[#075B35]" : "text-[#5C6B76]"}`}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="আরও মেনু খুলুন"
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-[#5C6B76]"
          >
            {Icon.menu("w-5 h-5")}
            আরও
          </button>
        </div>
      </nav>
    </div>
  );
}

// Super Admin only: downloads a complete restorable backup of the
// whole database as one gzipped JSON file. The server builds it only
// for the caller's own logged-in Super Admin session (the token goes
// in the action request body — never in a URL) and the backup never
// contains live session tokens. This component only turns the
// returned base64 gzip bytes into a file download.
function FullBackupCard({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await api.downloadFullBackup({ token });
      const bin = atob(res.gzipBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/gzip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const tableCount = Object.keys(res.tableCounts).length;
      const rowTotal = Object.values(res.tableCounts).reduce((s, n) => s + n, 0);
      setDone(`ব্যাকআপ ডাউনলোড হয়েছে — ${tableCount}টি টেবিল, মোট ${rowTotal}টি রো। ফাইলটি নিরাপদ জায়গায় রাখুন: এতে পাসওয়ার্ড হ্যাশ ও পরিচয়পত্রের তথ্য আছে।`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 rounded-2xl border border-[#E1E9E4] bg-white p-5">
      <h2 className="font-bold text-[#054A2B]">ডাটাবেস ব্যাকআপ</h2>
      <p className="mt-1 text-sm text-[#5C6B76]">
        পুরো ডাটাবেসের একটি সম্পূর্ণ ব্যাকআপ (সব টেবিল ও সব রো) gzip-compressed JSON ফাইল হিসেবে ডাউনলোড করুন। লগইন সেশন টোকেন ব্যাকআপে থাকে না। শুধুমাত্র সুপার অ্যাডমিন এই ডাউনলোড করতে পারবেন।
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
      >
        {Icon.download("w-4 h-4")}
        {busy ? "ব্যাকআপ তৈরি হচ্ছে…" : "Full backup download"}
      </button>
      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      {done && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-2.5">{done}</p>}
    </div>
  );
}

function AdminOverview({ token }: { token: string }) {
  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.getAdminOverview({ token }), ...MONEY_REFETCH });
  const recent = useQuery({ queryKey: ["admin-bookings", "pending"], queryFn: () => api.adminListBookings({ token, status: "pending" }) });
  if (ov.isPending) return <Spinner />;
  if (ov.isError) return <ErrorBox message={errMsg(ov.error)} />;
  const d = ov.data!;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm text-[#5C6B76]">সব সংখ্যা সার্ভারের আসল রেকর্ড থেকে — প্রতিটি ডিভাইসে একই হিসাব দেখা যাবে।</p>
        <FreshnessBar dataUpdatedAt={ov.dataUpdatedAt} isFetching={ov.isFetching} onRefresh={() => void ov.refetch()} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="মোট গ্রাহক" value={d.totalCustomers} icon={Icon.users("w-5 h-5")} />
        <StatCard label="মোট প্রফেশনাল" value={d.totalProfessionals} icon={Icon.briefcase("w-5 h-5")} />
        <StatCard label="যাচাইয়ের অপেক্ষায়" value={d.pendingVerifications} icon={Icon.badgeCheck("w-5 h-5")} />
        <StatCard label="মোট বুকিং" value={d.totalBookings} icon={Icon.calendar("w-5 h-5")} />
        <StatCard label="অপেক্ষমাণ বুকিং" value={d.pendingBookings} icon={Icon.clock("w-5 h-5")} />
        <StatCard label="সম্পন্ন বুকিং" value={d.completedBookings} icon={Icon.checkCircle("w-5 h-5")} />
        <StatCard label="বাতিল বুকিং" value={d.cancelledBookings} icon={Icon.x("w-5 h-5")} />
        <StatCard label="খোলা অভিযোগ" value={d.openComplaints} icon={Icon.message("w-5 h-5")} />
        <StatCard label="খোলা সাপোর্ট টিকিট" value={d.openTickets} icon={Icon.message("w-5 h-5")} />
      </div>
      <div className="mt-4 rounded-2xl border border-[#E1E9E4] bg-[#F3F8F4] p-5">
        <h2 className="font-bold text-[#054A2B] mb-1">টাকার হিসাব (যাচাইকৃত পেমেন্ট ও লেজার থেকে)</h2>
        <p className="text-[12.5px] text-[#5C6B76] mb-3">
          কমিশনের এই হিসাব লাইভ লেজার থেকে — প্রফেশনালের আয়ের পেজে প্রতিটি বুকিংয়ের কোটেশনের সময় স্থির (স্ন্যাপশট) কমিশন দেখানো হয়, তাই দুটি সংখ্যা সবসময় হুবহু মিলবে না; দুটোই নিজ নিজ জায়গায় সঠিক।
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <MoneyStat label="অনলাইনে সংগৃহীত" value={d.onlineCollected} />
          <MoneyStat label="হেল্ড ব্যালেন্স (সেটলমেন্ট বাকি)" value={d.heldBalanceTotal} />
          <MoneyStat label="কমিশন অর্জিত" value={d.commissionEarned} />
          <MoneyStat label="কমিশন সংগৃহীত" value={d.commissionCollected} />
          <MoneyStat label="ক্যাশে সংগৃহীত" value={d.cashCollected} />
          <MoneyStat label="পেআউট হয়েছে" value={d.paidOutTotal} />
          <MoneyStat label="যাচাইয়ের অপেক্ষায়" value={d.pendingPaymentAmount} sub={`${d.pendingPayments}টি পেমেন্ট`} />
          <MoneyStat label="পেআউটের অপেক্ষায়" value={d.pendingPayoutAmount} sub={`${d.pendingPayoutCount}টি অনুরোধ`} />
        </div>
        {(d.failedPayments > 0 || d.disputedPayments > 0) && (
          <p className="mt-3 text-[13.5px] text-red-700">
            ব্যর্থ পেমেন্ট: {d.failedPayments}টি
            {d.disputedPayments > 0 ? ` • বিরোধপূর্ণ বুকিং: ${d.disputedPayments}টি` : ""}
          </p>
        )}
      </div>
      <h2 className="font-bold text-[#054A2B] mt-7 mb-3">নতুন অপেক্ষমাণ বুকিং</h2>
      {recent.isPending ? (
        <Spinner />
      ) : (recent.data?.bookings.length ?? 0) === 0 ? (
        <EmptyState title="কোনো অপেক্ষমাণ বুকিং নেই" />
      ) : (
        <div className="grid md:grid-cols-2 gap-3.5">
          {recent.data?.bookings.slice(0, 4).map((b) => <BookingCard key={b.id} b={b} />)}
        </div>
      )}
    </div>
  );
}

const CANCEL_REQUEST_STATUS_BN: Record<string, { label: string; cls: string }> = {
  requested: { label: "সিদ্ধান্তের অপেক্ষায়", cls: "bg-amber-100 text-amber-800" },
  under_review: { label: "যাচাই চলছে (Waiting)", cls: "bg-sky-100 text-sky-800" },
  approved: { label: "অনুমোদিত — বুকিং বাতিল হয়েছে", cls: "bg-[#075B35] text-white" },
  rejected: { label: "গৃহীত হয়নি — বুকিং চলমান", cls: "bg-red-100 text-red-700" },
};

/** Master Phase 9: customer cancellation requests. A customer cancel
 *  is only a request — the booking keeps running until an admin here
 *  decides Waiting (under review) / Complete (approve → cancelled) /
 *  Rejected (booking continues). */
function CancelRequestsPanel({ token }: { token: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-cancel-requests"], queryFn: () => api.adminListCancelRequests({ token }) });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState<number | null>(null);
  const decide = useMutation({
    mutationFn: (v: { id: number; decision: "review" | "approve" | "reject" }) =>
      api.adminDecideCancelRequest({ token, requestId: v.id, decision: v.decision, note: notes[v.id]?.trim() || undefined }),
    onSuccess: (_d, v) => {
      setDoneId(v.id);
      setError("");
      qc.invalidateQueries({ queryKey: ["admin-cancel-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-settlement"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  if (q.isPending) return null;
  if (q.isError) return <ErrorBox message={errMsg(q.error)} />;
  const open = (q.data?.requests ?? []).filter((r) => r.status === "requested" || r.status === "under_review");
  const decided = (q.data?.requests ?? []).filter((r) => r.status === "approved" || r.status === "rejected").slice(0, 5);
  return (
    <section aria-label="বাতিলের অনুরোধ" className="mb-6">
      <h2 className="text-lg font-bold text-[#054A2B]">বাতিলের অনুরোধ ({open.length}টি সিদ্ধান্তের অপেক্ষায়)</h2>
      <p className="mt-1 text-sm text-[#5C6B76]">
        গ্রাহকের বাতিলের অনুরোধে বুকিং সাথে সাথে বাতিল হয় না — আপনি যাচাই করে সিদ্ধান্ত দিলেই কেবল বাতিল হবে।
        অনুমোদিত হলে অপেক্ষমাণ অনলাইন পেমেন্ট আপনা-আপনি ব্যর্থ হবে; যাচাইকৃত পেমেন্ট থাকলে রিফান্ডের সিদ্ধান্ত ফাইন্যান্স অ্যাডমিন কেস অনুযায়ী নেবেন (কোনো নির্দিষ্ট হার নেই)।
      </p>
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-[#5C6B76]">কোনো খোলা বাতিলের অনুরোধ নেই।</p>
      ) : (
        <div className="mt-3 space-y-3">
          {open.map((r) => {
            const st = CANCEL_REQUEST_STATUS_BN[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-700" };
            return (
              <div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">
                    {r.customerName} — বুকিং <span className="font-en">{r.bookingCode}</span>
                  </p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  <span className="text-[12.5px] text-[#5C6B76]">{fmtDateTime(r.createdAt)}</span>
                </div>
                {r.reason && <p className="mt-1 text-sm text-[#43534B]">গ্রাহকের কারণ: {r.reason}</p>}
                <div className="mt-3">
                  <label className={labelCls} htmlFor={`cancel-note-${r.id}`}>অ্যাডমিন নোট (ঐচ্ছিক)</label>
                  <input
                    id={`cancel-note-${r.id}`}
                    className={inputCls}
                    {...FIELDS.adminDecideCancelRequest.note}
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((m) => ({ ...m, [r.id]: e.target.value }))}
                    placeholder="সিদ্ধান্তের নোট"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === "requested" && (
                    <button
                      type="button"
                      disabled={decide.isPending}
                      onClick={() => { setError(""); decide.mutate({ id: r.id, decision: "review" }); }}
                      className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl"
                    >
                      যাচাই শুরু করুন (Waiting)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => { setError(""); decide.mutate({ id: r.id, decision: "approve" }); }}
                    className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-xl"
                  >
                    অনুমোদন করুন — বুকিং বাতিল হবে (Complete)
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => { setError(""); decide.mutate({ id: r.id, decision: "reject" }); }}
                    className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60"
                  >
                    গৃহীত হয়নি — বুকিং চলবে (Rejected)
                  </button>
                </div>
                {doneId === r.id && <p className="mt-2 text-sm text-[#054A2B] font-semibold">সিদ্ধান্ত সংরক্ষিত হয়েছে।</p>}
              </div>
            );
          })}
        </div>
      )}
      {decided.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="font-semibold text-[#054A2B] text-[15px]">সাম্প্রতিক সিদ্ধান্ত</h3>
          {decided.map((r) => {
            const st = CANCEL_REQUEST_STATUS_BN[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-700" };
            return (
              <div key={r.id} className="rounded-xl border border-[#E1E9E4] bg-white px-4 py-2.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{r.customerName} — <span className="font-en">{r.bookingCode}</span></span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                {r.adminNote && <span className="text-[13px] text-[#5C6B76]">{r.adminNote}</span>}
                {r.decidedAt && <span className="text-[12.5px] text-[#5C6B76] ml-auto">{fmtDateTime(r.decidedAt)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------ admin analytics
//
// Master Phase 11 (Scope A): real figures only, computed server-side
// by getAdminAnalytics from the payments table, the immutable ledger
// and booking snapshots. Online money, fees, commission earned vs
// collected, payouts, refunds and failed transactions stay separate;
// cash is shown as what it is — money paid directly to professionals
// and recorded on bookings, never platform-verified collections.

function dhakaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function dhakaDaysAgo(n: number): string {
  const d = new Date(`${dhakaToday()}T00:00:00+06:00`);
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function AdminAnalytics({ token }: { token: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({
    queryKey: ["admin-analytics", from, to],
    queryFn: () => api.getAdminAnalytics({ token, from: from || undefined, to: to || undefined }),
    ...MONEY_REFETCH,
  });
  const d = q.data;
  const quick: [string, string, string][] = [
    ["সব সময়", "", ""],
    ["আজ", dhakaToday(), dhakaToday()],
    ["গত ৭ দিন", dhakaDaysAgo(6), dhakaToday()],
    ["গত ৩০ দিন", dhakaDaysAgo(29), dhakaToday()],
    ["এই মাস", `${dhakaToday().slice(0, 8)}01`, dhakaToday()],
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor="an-from">শুরুর তারিখ</label>
          <input id="an-from" type="date" className={inputCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="an-to">শেষ তারিখ</label>
          <input id="an-to" type="date" className={inputCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="দ্রুত সময়সীমা">
          {quick.map(([label, f, t]) => (
            <button
              key={label}
              type="button"
              aria-pressed={from === f && to === t}
              onClick={() => {
                setFrom(f);
                setTo(t);
              }}
              className={`px-3 py-2 rounded-full text-[13px] font-semibold ${from === f && to === t ? "bg-[#054A2B] text-white" : "bg-white border border-[#E1E9E4] text-[#43534B]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <FreshnessBar dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} onRefresh={() => void q.refetch()} />
        </div>
      </div>

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorBox message={errMsg(q.error)} />
      ) : d ? (
        <>
          <section aria-label="অনলাইন সংগ্রহ" className="rounded-2xl border border-[#E1E9E4] bg-[#F3F8F4] p-5">
            <h2 className="font-bold text-[#054A2B]">অনলাইন সংগ্রহ (যাচাইকৃত)</h2>
            <p className="mt-0.5 text-[12.5px] text-[#5C6B76]">শুধু অ্যাডমিন-যাচাইকৃত অনলাইন পেমেন্ট — {d.verifiedPaymentsInRange}টি যাচাইকৃত পেমেন্ট এই সময়ে।</p>
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <MoneyStat label="মোট অনলাইন সংগ্রহ" value={d.onlineCollected} />
              <MoneyStat label="সম্পূর্ণ অনলাইন পেমেন্ট" value={d.onlineFullOnline} />
              <MoneyStat label="আংশিক অনলাইন পেমেন্ট" value={d.onlineSplit} />
            </div>
          </section>

          <section aria-label="ফি, কমিশন ও রাজস্ব" className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
            <h2 className="font-bold text-[#054A2B]">ফি, কমিশন ও মিস্ত্রি ডাকোর রাজস্ব</h2>
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
              <MoneyStat label="গ্রাহক সার্ভিস ফি সংগৃহীত" value={d.customerFeesCollected} />
              <MoneyStat label="প্রফেশনাল কমিশন অর্জিত (পাওনা)" value={d.commissionEarned} />
              <MoneyStat label="প্রফেশনাল কমিশন সংগৃহীত" value={d.commissionCollected} />
              <MoneyStat label="মিস্ত্রি ডাকোর রাজস্ব (ফি + সংগৃহীত কমিশন)" value={d.revenue} />
            </div>
            <p className="mt-3 text-[12.5px] text-[#5C6B76]">
              কমিশন অর্জিত হয় যাচাইকৃত পেমেন্টের সময়। অর্জিত ও সংগৃহীতের পার্থক্য হলো সেই কমিশন, যা এখনো হেল্ড ব্যালেন্সে জমা আছে (পেআউটের সময় কমিশনের অংশ হেল্ড ব্যালেন্সেই থেকে যায়)।
            </p>
          </section>

          <section aria-label="পেআউট, রিফান্ড ও ক্যাশ" className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
            <h2 className="font-bold text-[#054A2B]">পেআউট, রিফান্ড, ব্যর্থ ও ক্যাশ</h2>
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
              <MoneyStat label="পেআউট সম্পন্ন হয়েছে" value={d.payoutsCompleted} />
              <MoneyStat label="পেআউটের অপেক্ষায় (বর্তমান)" value={d.pendingPayoutAmount} sub={`${d.pendingPayoutCount}টি অনুরোধ`} />
              <MoneyStat label="হেল্ড ব্যালেন্স (বর্তমান)" value={d.heldBalanceTotal} />
              <MoneyStat label="রিফান্ড হয়েছে" value={d.refundsTotal} sub={`${d.refundsCount}টি এন্ট্রি`} />
              <MoneyStat label="ব্যর্থ লেনদেন" value={d.failedAmount} sub={`${d.failedCount}টি পেমেন্ট`} />
              <MoneyStat label="ক্যাশ — প্রফেশনালকে সরাসরি" value={d.cashToProfessionals} />
            </div>
            <p className="mt-3 text-[12.5px] text-[#5C6B76]">
              ক্যাশের টাকা গ্রাহক সরাসরি প্রফেশনালকে দেন — এটি বুকিং রেকর্ডে লিপিবদ্ধ হিসাব, মিস্ত্রি ডাকোর যাচাইকৃত সংগ্রহ নয়; তাই অনলাইন সংগ্রহের সাথে এটি যোগ করা হয়নি।
            </p>
          </section>

          <section aria-label="লেজার ইতিহাস">
            <h2 className="font-bold text-[#054A2B] mb-3">লেজার ইতিহাস (সাম্প্রতিক ১০০টি)</h2>
            {d.ledger.length === 0 ? (
              <EmptyState title="এই সময়ে কোনো লেজার এন্ট্রি নেই" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[#E1E9E4] bg-white">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-[#5C6B76] border-b border-[#E1E9E4]">
                      <th className="px-4 py-2.5 font-semibold">তারিখ</th>
                      <th className="px-4 py-2.5 font-semibold">বুকিং</th>
                      <th className="px-4 py-2.5 font-semibold">ধরন</th>
                      <th className="px-4 py-2.5 font-semibold text-right">পরিমাণ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ledger.map((e) => (
                      <tr key={e.id} className="border-b border-[#EEF3F0] last:border-0">
                        <td className="px-4 py-2.5 whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          {e.bookingCode ? (
                            <a className="font-en font-semibold text-[#075B35] hover:underline" href={`#/booking/${e.bookingCode}`}>{e.bookingCode}</a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5">{LEDGER_TYPE_BN[e.entryType] ?? e.entryType}{e.note ? <span className="block text-[12px] text-[#5C6B76]">{e.note}</span> : null}</td>
                        <td className="px-4 py-2.5 text-right font-en font-bold whitespace-nowrap">{bdt(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="পেমেন্ট ইতিহাস">
            <h2 className="font-bold text-[#054A2B] mb-3">পেমেন্ট ইতিহাস (সাম্প্রতিক ১০০টি)</h2>
            {d.payments.length === 0 ? (
              <EmptyState title="এই সময়ে কোনো পেমেন্ট নেই" />
            ) : (
              <div className="space-y-2.5">
                {d.payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-[#E1E9E4] bg-white px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-en font-bold">{bdt(p.amount)}</span>
                    <span className="font-semibold">{PROVIDER_BN[p.provider] ?? providerEn(p.provider)}</span>
                    <span className="font-en text-[13px] text-[#5C6B76]">{p.providerTrxId}</span>
                    <PaymentStatusChip status={p.status} />
                    <span className="text-[13px] text-[#5C6B76]">
                      {PAYMENT_MODEL_BN[p.paymentModel] ?? p.paymentModel} • {p.customerName} •{" "}
                      <a className="font-en font-semibold text-[#075B35] hover:underline" href={`#/booking/${p.bookingCode}`}>{p.bookingCode}</a> • {fmtDateTime(p.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function AdminBookings({ token }: { token: string }) {
  const [status, setStatus] = useState("");
  const list = useQuery({
    queryKey: ["admin-bookings", status],
    queryFn: () => api.adminListBookings({ token, status: status || undefined }),
  });
  const ctl = useListControls<Booking>(
    list.data?.bookings ?? [],
    (b) => `${b.code} ${b.customerName} ${b.phone} ${b.serviceName} ${b.upazila}`,
    {
      new: (a, b) => b.id - a.id,
      old: (a, b) => a.id - b.id,
      name: (a, b) => a.customerName.localeCompare(b.customerName, "bn"),
    },
    "new",
  );
  return (
    <div>
      <CancelRequestsPanel token={token} />
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="স্ট্যাটাস ফিল্টার">
        {(
          [
            ["", "সব"],
            ["pending", "অপেক্ষমাণ"],
            ["price_confirmed", "মূল্য নিশ্চিত"],
            ["assigned", "অ্যাসাইনড"],
            ["accepted", "গৃহীত"],
            ["in_progress", "চলমান"],
            ["pro_completed", "কাজ শেষ"],
            ["customer_confirmed", "সম্পন্ন"],
            ["admin_reviewed", "যাচাই সম্পন্ন"],
            ["disputed", "বিরোধ"],
            ["rescheduled", "পুনঃনির্ধারিত"],
            ["cancelled", "বাতিল"],
            ["rejected", "প্রত্যাখ্যাত"],
          ] as [string, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k)}
            aria-pressed={status === k}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold ${status === k ? "bg-[#054A2B] text-white" : "bg-white border border-[#E1E9E4] text-[#43534B]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox message={errMsg(list.error)} />
      ) : (list.data?.bookings.length ?? 0) === 0 ? (
        <EmptyState title="এই ফিল্টারে কোনো বুকিং নেই" />
      ) : (
        <>
          <ListControls
            query={ctl.query}
            setQuery={ctl.setQuery}
            sort={ctl.sort}
            setSort={ctl.setSort}
            sortOptions={[["new", "নতুন আগে"], ["old", "পুরনো আগে"], ["name", "গ্রাহকের নাম অনুযায়ী"]]}
            total={ctl.total}
            page={ctl.page}
            pageCount={ctl.pageCount}
            setPage={ctl.setPage}
            searchLabel="কোড, নাম, ফোন বা সার্ভিস দিয়ে খুঁজুন"
          />
          {ctl.pageRows.length === 0 ? (
            <EmptyState title="খোঁজার সাথে মিলে এমন বুকিং নেই" />
          ) : (
            <div className="space-y-3.5">
              {ctl.pageRows.map((b) => <AdminBookingCard key={b.id} b={b} token={token} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdminBookingCard({ b, token }: { b: Booking; token: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // The form works in master-flow STAGES (Phase 7); the server maps
  // the chosen stage to the canonical stored status and re-validates
  // the transition.
  const [status, setStatus] = useState(b.stage);
  // Price editing survives only for legacy admin-priced bookings:
  // a quotation-locked price is read-only here, and an unpriced
  // booking gets its price from a customer-approved quotation.
  const priceEditable = b.finalPrice != null && b.priceFinalizedVia !== "quotation";
  const [proId, setProId] = useState<string>(b.professionalId ? String(b.professionalId) : "");
  const [price, setPrice] = useState(b.finalPrice != null ? String(b.finalPrice) : "");
  const [payment, setPayment] = useState(b.paymentStatus);
  const [note, setNote] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pros = useQuery({
    queryKey: ["assign-pros", b.serviceSlug],
    queryFn: () => api.adminListVerifiedPros({ token, category: b.serviceSlug }),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () =>
      api.adminUpdateBooking({
        token,
        bookingId: b.id,
        status: status as
          | "pending"
          | "price_confirmed"
          | "assigned"
          | "accepted"
          | "in_progress"
          | "pro_completed"
          | "customer_confirmed"
          | "admin_reviewed"
          | "cancelled"
          | "rejected"
          | "disputed",
        professionalId: proId === "" ? null : Number(proId),
        finalPrice: priceEditable ? (price === "" ? null : Number(price)) : undefined,
        paymentStatus: payment as "unpaid" | "cash_paid",
        adminNote: note || undefined,
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <div className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">
            {b.serviceName} — {b.customerName}
          </p>
          <p className="text-[13px] text-[#5C6B76]">
            <span className="font-en">{b.code}</span> • {b.upazila} • {fmtDate(b.preferredDate)} • {b.preferredTime}
          </p>
          <p className="text-[13px] text-[#5C6B76] font-en">{b.phone}</p>
        </div>
        <BookingStatusChip status={b.status} stage={b.stage} />
      </div>
      <p className="mt-2 text-sm text-[#43534B] line-clamp-2">{b.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            // Re-sync the form from the latest booking data every time it is
            // opened, so a refetch never leaves stale values in the fields.
            if (!open) {
              setStatus(b.stage);
              setProId(b.professionalId ? String(b.professionalId) : "");
              setPrice(b.finalPrice != null ? String(b.finalPrice) : "");
              setPayment(b.paymentStatus);
              setNote("");
              setError("");
              setSaved(false);
            }
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className="bg-[#F3F8F4] text-[#054A2B] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#E4F1E8]"
        >
          {open ? "বন্ধ করুন" : "পরিচালনা করুন"}
        </button>
        <a href={`#/booking/${b.code}`} className="border border-[#E1E9E4] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F6FAF7]">
          বিস্তারিত দেখুন
        </a>
        <button
          type="button"
          onClick={() => setPayOpen((v) => !v)}
          aria-expanded={payOpen}
          className="bg-[#FFF4E5] text-[#8a5200] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#FFE9C7]"
        >
          {payOpen ? "পেমেন্ট বিবরণ বন্ধ করুন" : "পেমেন্ট বিবরণ"}
        </button>
      </div>
      {payOpen && (
        <div className="mt-4 border-t border-[#EEF3F0] pt-4">
          <BookingPaymentDetail token={token} bookingId={b.id} />
        </div>
      )}
      {open && (
        <>
        <form
          className="mt-4 border-t border-[#EEF3F0] pt-4 grid sm:grid-cols-2 gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setSaved(false);
            save.mutate();
          }}
        >
          <div>
            <label className={labelCls} htmlFor={`ab-status-${b.id}`}>স্ট্যাটাস (ধাপ)</label>
            <select
              id={`ab-status-${b.id}`}
              className={inputCls}
              value={status}
              disabled={b.stage === "disputed" || b.stage === "rescheduled"}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value={b.stage}>{STAGE_BN[b.stage] ?? b.stage} (বর্তমান)</option>
              {(ADMIN_STAGE_NEXT[b.stage] ?? []).map((s) => (
                <option key={s} value={s}>{STAGE_BN[s] ?? s}</option>
              ))}
            </select>
            {(b.stage === "disputed" || b.stage === "rescheduled") && (
              <p className="text-xs text-[#5C6B76] mt-1">
                {b.stage === "disputed"
                  ? "বিরোধ নিষ্পত্তি না হলে স্ট্যাটাস বদলানো যাবে না — নিচের বোতামে নিষ্পত্তি করুন।"
                  : "পুনঃনির্ধারণ নিশ্চিত না হলে স্ট্যাটাস বদলানো যাবে না — নিচের বোতামে নিশ্চিত করুন।"}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor={`ab-pro-${b.id}`}>প্রফেশনাল অ্যাসাইন</label>
            <select
              id={`ab-pro-${b.id}`}
              className={inputCls}
              value={proId}
              onChange={(e) => {
                const v = e.target.value;
                setProId(v);
                // Picking a professional moves the booking to the assigned
                // stage — reflect that in the status dropdown so what the
                // admin sees is exactly what will be saved.
                if (v !== "" && (status === "pending" || status === "price_confirmed")) setStatus("assigned");
              }}
            >
              <option value="">— কেউ না —</option>
              {(pros.data?.professionals ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.completedJobs}টি কাজ) — {p.areas.slice(0, 2).join(", ")}
                </option>
              ))}
            </select>
            {pros.isPending && <p className="text-xs text-[#5C6B76] mt-1">প্রফেশনাল লোড হচ্ছে…</p>}
            {pros.data && pros.data.professionals.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">এই ক্যাটাগরিতে কোনো যাচাইকৃত প্রফেশনাল নেই।</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor={`ab-price-${b.id}`}>চূড়ান্ত মূল্য (৳)</label>
            {b.finalPrice == null ? (
              <>
                <input id={`ab-price-${b.id}`} type="number" className={inputCls} value="" disabled placeholder="এখনো নির্ধারিত হয়নি" />
                <p className="text-xs text-[#5C6B76] mt-1">মূল্য এখানে বসানো যায় না — নিচে কোটেশন তৈরি করুন; গ্রাহক অনুমোদন দিলেই মূল্য চূড়ান্ত হবে।</p>
              </>
            ) : b.priceFinalizedVia === "quotation" ? (
              <>
                <input id={`ab-price-${b.id}`} type="number" {...FIELDS.adminUpdateBooking.finalPrice} className={inputCls} value={price} disabled />
                <p className="text-xs text-[#5C6B76] mt-1">গ্রাহক-অনুমোদিত কোটেশনে নির্ধারিত — বদলাতে হলে নতুন অতিরিক্ত কোটেশন লাগবে।</p>
              </>
            ) : (
              <input id={`ab-price-${b.id}`} type="number" {...FIELDS.adminUpdateBooking.finalPrice} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="চূড়ান্ত মূল্য" />
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor={`ab-pay-${b.id}`}>পেমেন্ট</label>
            <select id={`ab-pay-${b.id}`} className={inputCls} value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="unpaid">পরিশোধ হয়নি</option>
              <option value="cash_paid">ক্যাশে পরিশোধিত</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor={`ab-note-${b.id}`}>অ্যাডমিন নোট</label>
            <input id={`ab-note-${b.id}`} className={inputCls} {...FIELDS.adminUpdateBooking.adminNote} value={note} onChange={(e) => setNote(e.target.value)} placeholder="স্ট্যাটাস বদলের কারণ বা মন্তব্য (ঐচ্ছিক)" />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <ErrorBox message={error} />
            </div>
          )}
          {saved && <p className="sm:col-span-2 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-2.5">সংরক্ষিত হয়েছে — গ্রাহক নোটিফিকেশন পেয়েছেন।</p>}
          <button type="submit" disabled={save.isPending} className="sm:col-span-2 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold py-2.5 rounded-xl">
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "পরিবর্তন সংরক্ষণ করুন"}
          </button>
        </form>
        <div className="mt-5 border-t border-[#EEF3F0] pt-4">
          <QuotationPanel token={token} booking={b} viewerRole="admin" isOwnerCustomer={false} isAssignedPro={false} />
        </div>
        <AdminBookingFlowControls b={b} token={token} />
        </>
      )}
    </div>
  );
}

/** Phase 7 admin controls for the parked states (rescheduled /
 *  disputed) and for customer reschedule requests. Each button maps
 *  to exactly one server action; the server re-validates everything. */
function AdminBookingFlowControls({ b, token }: { b: Booking; token: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  const handlers = (okMsg: string) => ({
    onSuccess: () => {
      setDone(okMsg);
      setError("");
      refresh();
    },
    onError: (e: unknown) => setError(errMsg(e)),
  });
  const confirmResched = useMutation({
    mutationFn: () => api.adminConfirmReschedule({ token, bookingId: b.id }),
    ...handlers("পুনঃনির্ধারিত সময় নিশ্চিত হয়েছে।"),
  });
  const applyResched = useMutation({
    mutationFn: (v: { date?: string; time?: string }) =>
      api.adminRescheduleBooking({ token, bookingId: b.id, date: v.date, time: v.time }),
    ...handlers("বুকিং পুনঃনির্ধারণ করা হয়েছে।"),
  });
  const declineResched = useMutation({
    mutationFn: () => api.adminDeclineReschedule({ token, bookingId: b.id }),
    ...handlers("সময় বদলের অনুরোধ বাতিল করা হয়েছে।"),
  });
  const [disputeReason, setDisputeReason] = useState("");
  const clearDispute = useMutation({
    mutationFn: () => api.adminClearDispute({ token, bookingId: b.id, note: disputeReason.trim() }),
    ...handlers("বিরোধ নিষ্পত্তি হয়েছে — বুকিং আগের অবস্থায় ফিরেছে।"),
  });
  const busy = confirmResched.isPending || applyResched.isPending || declineResched.isPending || clearDispute.isPending;
  const canReschedule = ["pending", "price_confirmed", "assigned", "accepted"].includes(b.stage);
  if (b.stage !== "rescheduled" && b.stage !== "disputed" && !b.rescheduleRequestedDate && !canReschedule) {
    return null;
  }
  return (
    <div className="mt-5 border-t border-[#EEF3F0] pt-4">
      <h3 className="font-bold text-[#054A2B] text-[15px]">সময় পুনঃনির্ধারণ ও বিরোধ</h3>
      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      {done && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-2.5">{done}</p>}
      {b.stage === "disputed" && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800 font-semibold">এই বুকিংয়ে বিরোধ চলমান — সেটেলমেন্ট স্থগিত আছে।</p>
          <p className="mt-1 text-[13px] text-red-800">
            নিষ্পত্তির সিদ্ধান্ত কারণসহ রেকর্ড করা বাধ্যতামূলক — সিদ্ধান্ত গ্রাহক ও প্রফেশনাল দুজনকেই জানানো হবে এবং সেটেলমেন্টের স্থগিতাদেশ উঠবে।
          </p>
          <div className="mt-2.5">
            <label className={labelCls} htmlFor={`dispute-reason-${b.id}`}>নিষ্পত্তির সিদ্ধান্ত / কারণ</label>
            <input
              id={`dispute-reason-${b.id}`}
              className={inputCls}
              {...FIELDS.adminClearDispute.note}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="যেমন: দুই পক্ষের কথা শুনে সমাধান হয়েছে"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setDone("");
              if (!disputeReason.trim()) {
                setError("বিরোধ নিষ্পত্তি করতে হলে সিদ্ধান্তের কারণ লিখুন।");
                return;
              }
              clearDispute.mutate();
            }}
            className="mt-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-xl"
          >
            বিরোধ নিষ্পত্তি করে আগের অবস্থায় ফেরান
          </button>
        </div>
      )}
      {b.stage === "rescheduled" && (
        <div className="mt-3 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3">
          <p className="text-sm text-sky-900">
            নতুন সময়: <b>{fmtDate(b.preferredDate)} • {b.preferredTime}</b> — নিশ্চিত করলে বুকিং আগের ধাপে ফিরে যাবে।
          </p>
          <button type="button" disabled={busy} onClick={() => confirmResched.mutate()} className="mt-2.5 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-xl">
            পুনঃনির্ধারণ নিশ্চিত করুন
          </button>
        </div>
      )}
      {b.stage !== "rescheduled" && b.rescheduleRequestedDate && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-900">
            গ্রাহক সময় বদলের অনুরোধ করেছেন: <b>{fmtDate(b.rescheduleRequestedDate)} • {b.rescheduleRequestedTime}</b>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => applyResched.mutate({})} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-xl">
              অনুরোধ অনুযায়ী পুনঃনির্ধারণ করুন
            </button>
            <button type="button" disabled={busy} onClick={() => declineResched.mutate()} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
              অনুরোধ বাতিল করুন
            </button>
          </div>
        </div>
      )}
      {canReschedule && (
        <form
          className="mt-3 grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setDone("");
            applyResched.mutate({ date, time });
          }}
        >
          <div>
            <label className={labelCls} htmlFor={`rs-date-${b.id}`}>নতুন তারিখ</label>
            <input id={`rs-date-${b.id}`} type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`rs-time-${b.id}`}>নতুন সময়</label>
            <input id={`rs-time-${b.id}`} type="text" required className={inputCls} {...FIELDS.adminRescheduleBooking.time} value={time} onChange={(e) => setTime(e.target.value)} placeholder="যেমন: সকাল ১০টা" />
          </div>
          <button type="submit" disabled={busy} className="col-span-2 border-[1.5px] border-[#075B35] text-[#075B35] font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-[#F3F8F4] disabled:opacity-60">
            এই সময়ে পুনঃনির্ধারণ করুন
          </button>
        </form>
      )}
    </div>
  );
}

function AdminProfessionals({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const list = useQuery({ queryKey: ["admin-pros"], queryFn: () => api.adminListProfessionals({ token }) });
  const setStatus = useMutation({
    mutationFn: (v: { id: number; status: "verified" | "rejected" | "suspended" | "pending"; note?: string }) =>
      api.adminSetProStatus({ token, professionalId: v.id, status: v.status, note: v.note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pros"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
  const setUserStatus = useMutation({
    mutationFn: (v: { userId: number; status: "active" | "suspended" }) =>
      api.adminSetUserStatus({ token, userId: v.userId, status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-pros"] }),
  });
  const all = list.data?.professionals ?? [];
  const shown = filter ? all.filter((p) => p.status === filter) : all;
  const ctl = useListControls<AdminPro>(
    shown,
    (p) => `${p.name} ${p.phone} ${p.categoryName} ${p.areas.join(" ")}`,
    {
      new: (a, b) => b.id - a.id,
      name: (a, b) => a.name.localeCompare(b.name, "bn"),
      jobs: (a, b) => b.completedJobs - a.completedJobs,
    },
    "new",
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="প্রফেশনাল ফিল্টার">
        {(
          [
            ["", "সব"],
            ["pending", "যাচাইয়ের অপেক্ষায়"],
            ["verified", "যাচাইকৃত"],
            ["rejected", "বাতিল হয়েছে"],
            ["suspended", "স্থগিত"],
          ] as [string, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold ${filter === k ? "bg-[#054A2B] text-white" : "bg-white border border-[#E1E9E4] text-[#43534B]"}`}
          >
            {label} ({k ? all.filter((p) => p.status === k).length : all.length})
          </button>
        ))}
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox message={errMsg(list.error)} />
      ) : shown.length === 0 ? (
        <EmptyState title="কোনো প্রফেশনাল আবেদন নেই" body="নতুন আবেদন এলে এখানে দেখা যাবে এবং নোটিফিকেশন পাবেন।" />
      ) : (
        <>
          <ListControls
            query={ctl.query}
            setQuery={ctl.setQuery}
            sort={ctl.sort}
            setSort={ctl.setSort}
            sortOptions={[["new", "নতুন আগে"], ["name", "নাম অনুযায়ী"], ["jobs", "বেশি সম্পন্ন কাজ আগে"]]}
            total={ctl.total}
            page={ctl.page}
            pageCount={ctl.pageCount}
            setPage={ctl.setPage}
            searchLabel="নাম, ফোন, সার্ভিস বা এলাকা দিয়ে খুঁজুন"
          />
          {ctl.pageRows.length === 0 ? (
            <EmptyState title="খোঁজার সাথে মিলে এমন প্রফেশনাল নেই" />
          ) : (
            <div className="space-y-3.5">
              {ctl.pageRows.map((p) => (
            <AdminProCard
              key={p.id}
              p={p}
              token={token}
              onStatus={(s, note) => setStatus.mutate({ id: p.id, status: s, note })}
              onUserStatus={(s) => setUserStatus.mutate({ userId: p.userId, status: s })}
              busy={setStatus.isPending || setUserStatus.isPending}
            />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdminProCard({
  p,
  token,
  onStatus,
  onUserStatus,
  busy,
}: {
  p: AdminPro;
  token: string;
  onStatus: (s: "verified" | "rejected" | "suspended" | "pending", note?: string) => void;
  onUserStatus: (s: "active" | "suspended") => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
      <div className="flex items-start gap-3.5">
        <Avatar name={p.name} photoUrl={p.photoUrl} size="w-14 h-14" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {p.name}{" "}
            <span className={`ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full align-middle ${p.status === "verified" ? "bg-[#075B35] text-white" : p.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
              {PRO_STATUS_BN[p.status]}
            </span>
          </p>
          <p className="text-[13.5px] text-[#5C6B76]">
            {p.categoryName} • {p.experienceYears} বছর অভিজ্ঞতা • <span className="font-en">{p.phone}</span>
            {p.email ? <span className="font-en"> • {p.email}</span> : ""}
          </p>
          <p className="text-[13.5px] text-[#5C6B76]">এলাকা: {p.areas.join(", ") || "—"}</p>
          {p.skills && <p className="text-[13.5px] text-[#43534B]">দক্ষতা: {p.skills}</p>}
          {p.nidNumber && (
            <p className="text-[13.5px] text-[#43534B]">
              NID (শুধু যাচাইয়ের জন্য): <span className="font-en font-semibold">{p.nidNumber}</span>
            </p>
          )}
          <IdentityDocViewer token={token} professionalId={p.id} documents={p.documents} />
          <p className="text-[13.5px] text-[#5C6B76]">
            সম্পন্ন কাজ: {p.completedJobs} • রেটিং: {p.avgRating != null ? `${p.avgRating} (${p.reviewCount}টি রিভিউ)` : "এখনো নেই"}
            {p.userStatus === "suspended" ? " • অ্যাকাউন্ট স্থগিত" : ""}
          </p>
          {p.verificationNote && (
            <p className="text-[13.5px] text-[#43534B]">সর্বশেষ যাচাই নোট: {p.verificationNote}</p>
          )}
        </div>
      </div>
      {(p.status === "pending" || p.status === "verified") && (
        <div className="mt-3">
          <label className={labelCls} htmlFor={`pro-note-${p.id}`}>যাচাই নোট (বাতিল/স্থগিত করলে প্রফেশনালকে দেখানো হবে)</label>
          <input
            id={`pro-note-${p.id}`}
            className={inputCls}
            {...FIELDS.adminSetProStatus.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="যেমন: NID ছবি ঝাপসা — স্পষ্ট ছবি আবার জমা দিন"
          />
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {p.status !== "verified" && (
          <button type="button" disabled={busy} onClick={() => onStatus("verified")} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl">
            যাচাই করে অনুমোদন দিন
          </button>
        )}
        {p.status === "pending" && (
          <button type="button" disabled={busy} onClick={() => onStatus("rejected", note.trim() || undefined)} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
            আবেদন বাতিল করুন
          </button>
        )}
        {p.status === "verified" && (
          <button type="button" disabled={busy} onClick={() => onStatus("suspended", note.trim() || undefined)} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
            প্রোফাইল স্থগিত করুন
          </button>
        )}
        {(p.status === "suspended" || p.status === "rejected") && (
          <button type="button" disabled={busy} onClick={() => onStatus("pending")} className="border-[1.5px] border-[#075B35] text-[#075B35] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F3F8F4] disabled:opacity-60">
            আবার যাচাইয়ের অপেক্ষায় রাখুন
          </button>
        )}
        {p.userStatus === "active" ? (
          <button type="button" disabled={busy} onClick={() => onUserStatus("suspended")} className="border border-[#E1E9E4] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 hover:text-red-700 disabled:opacity-60">
            অ্যাকাউন্ট স্থগিত
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => onUserStatus("active")} className="border border-[#E1E9E4] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F3F8F4] disabled:opacity-60">
            অ্যাকাউন্ট সক্রিয় করুন
          </button>
        )}
        <a href={`tel:${p.phone}`} className="border border-[#E1E9E4] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F3F8F4] inline-flex items-center gap-1.5">
          {Icon.phone("w-4 h-4")} কল
        </a>
      </div>
    </div>
  );
}

function AdminCustomers({ token }: { token: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-customers"], queryFn: () => api.adminListCustomers({ token }) });
  const setUserStatus = useMutation({
    mutationFn: (v: { userId: number; status: "active" | "suspended" }) =>
      api.adminSetUserStatus({ token, userId: v.userId, status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-customers"] }),
  });
  type AdminCustomerRow = ApiResponse<typeof api, "adminListCustomers">["customers"][number];
  const ctl = useListControls<AdminCustomerRow>(
    list.data?.customers ?? [],
    (c) => `${c.name} ${c.phone} ${c.location ?? ""}`,
    {
      new: (a, b) => b.id - a.id,
      name: (a, b) => a.name.localeCompare(b.name, "bn"),
      bookings: (a, b) => b.bookingCount - a.bookingCount,
    },
    "new",
  );
  if (list.isPending) return <Spinner />;
  if (list.isError) return <ErrorBox message={errMsg(list.error)} />;
  const rows = list.data?.customers ?? [];
  if (rows.length === 0) return <EmptyState title="এখনো কোনো গ্রাহক নিবন্ধন করেননি" />;
  return (
    <div>
      <ListControls
        query={ctl.query}
        setQuery={ctl.setQuery}
        sort={ctl.sort}
        setSort={ctl.setSort}
        sortOptions={[["new", "নতুন আগে"], ["name", "নাম অনুযায়ী"], ["bookings", "বেশি বুকিং আগে"]]}
        total={ctl.total}
        page={ctl.page}
        pageCount={ctl.pageCount}
        setPage={ctl.setPage}
        searchLabel="নাম বা ফোন দিয়ে খুঁজুন"
      />
      {ctl.pageRows.length === 0 ? (
        <EmptyState title="খোঁজার সাথে মিলে এমন গ্রাহক নেই" />
      ) : (
        <div className="grid md:grid-cols-2 gap-3.5">
          {ctl.pageRows.map((c) => (
        <div key={c.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4 flex items-start gap-3.5">
          <Avatar name={c.name} photoUrl={c.photoUrl} size="w-12 h-12" textSize="text-base" />
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">
              {c.name}
              {c.status === "suspended" && <span className="ml-2 text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full align-middle">স্থগিত</span>}
            </p>
            <p className="text-[13.5px] text-[#5C6B76]">
              <span className="font-en">{c.phone}</span> • {c.location ?? "টাঙ্গাইল"}
            </p>
            <p className="text-[13.5px] text-[#5C6B76]">বুকিং: {c.bookingCount} • অভিযোগ: {c.complaintCount} • যোগ দিয়েছেন {fmtDate(c.createdAt)}</p>
            <div className="mt-2.5 flex gap-2">
              {c.status === "active" ? (
                <button type="button" disabled={setUserStatus.isPending} onClick={() => setUserStatus.mutate({ userId: c.id, status: "suspended" })} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-[13px] px-3.5 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-60">
                  স্থগিত করুন
                </button>
              ) : (
                <button type="button" disabled={setUserStatus.isPending} onClick={() => setUserStatus.mutate({ userId: c.id, status: "active" })} className="border-[1.5px] border-[#075B35] text-[#075B35] font-semibold text-[13px] px-3.5 py-1.5 rounded-lg hover:bg-[#F3F8F4] disabled:opacity-60">
                  সক্রিয় করুন
                </button>
              )}
              <a href={`tel:${c.phone}`} className="border border-[#E1E9E4] font-semibold text-[13px] px-3.5 py-1.5 rounded-lg hover:bg-[#F3F8F4] inline-flex items-center gap-1">
                {Icon.phone("w-3.5 h-3.5")} কল
              </a>
            </div>
          </div>
        </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminServices({ token }: { token: string }) {
  const list = useQuery({ queryKey: ["admin-services"], queryFn: () => api.adminListServicesAll({ token }) });
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  if (list.isPending) return <Spinner />;
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button type="button" onClick={() => setAdding((v) => !v)} className="bg-[#075B35] hover:bg-[#054A2B] text-white font-semibold text-sm px-4 py-2.5 rounded-xl">
          {adding ? "বন্ধ করুন" : "+ নতুন সার্ভিস যোগ করুন"}
        </button>
      </div>
      {adding && (
        <div className="mb-5">
          <ServiceForm token={token} onDone={() => setAdding(false)} />
        </div>
      )}
      <div className="space-y-3.5">
        {(list.data?.services ?? []).map((s) => (
          <div key={s.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">
                  {s.nameBn} <span className="text-[#5C6B76] font-en font-medium text-sm">{s.nameEn}</span>
                  {!s.active && <span className="ml-2 text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full align-middle">বন্ধ আছে</span>}
                </p>
                <p className="text-[13.5px] text-[#5C6B76] mt-0.5">
                  {s.startingPrice != null ? `শুরু ৳${s.startingPrice.toLocaleString("bn-BD")} • ` : ""}
                  {s.hourlyRate != null ? `ঘণ্টা ৳${s.hourlyRate.toLocaleString("bn-BD")} • ` : ""}
                  {s.dailyRate != null ? `দিন ৳${s.dailyRate.toLocaleString("bn-BD")} • ` : ""}
                  {s.unitRate != null ? `একক ৳${s.unitRate.toLocaleString("bn-BD")} • ` : ""}
                  {s.startingPrice == null && s.hourlyRate == null && s.dailyRate == null && s.unitRate == null
                    ? "মূল্য নির্ধারণ হয়নি — কোটেশন ভিত্তিক"
                    : ""}
                  {s.inspectionFee != null ? `পরিদর্শন ফি ৳${s.inspectionFee.toLocaleString("bn-BD")}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(editing === s.id ? null : s.id)}
                aria-expanded={editing === s.id}
                className="shrink-0 bg-[#F3F8F4] text-[#054A2B] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#E4F1E8]"
              >
                {editing === s.id ? "বন্ধ করুন" : "সম্পাদনা"}
              </button>
            </div>
            {editing === s.id && (
              <div className="mt-4">
                <ServiceForm token={token} service={s} onDone={() => setEditing(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceForm({ token, service, onDone }: { token: string; service?: AdminService; onDone: () => void }) {
  const qc = useQueryClient();
  const [nameBn, setNameBn] = useState(service?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(service?.nameEn ?? "");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState(service?.tagline ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [starting, setStarting] = useState(service?.startingPrice != null ? String(service.startingPrice) : "");
  const [hourly, setHourly] = useState(service?.hourlyRate != null ? String(service.hourlyRate) : "");
  const [daily, setDaily] = useState(service?.dailyRate != null ? String(service.dailyRate) : "");
  const [unit, setUnit] = useState(service?.unitRate != null ? String(service.unitRate) : "");
  const [unitLabel, setUnitLabel] = useState(service?.unitLabel ?? "");
  const [inspection, setInspection] = useState(service?.inspectionFee != null ? String(service.inspectionFee) : "");
  const [priceNote, setPriceNote] = useState(service?.priceNote ?? "");
  const [active, setActive] = useState(service?.active ?? true);
  const [error, setError] = useState("");
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: () =>
      api.adminSaveService({
        token,
        id: service?.id,
        slug: service ? undefined : slug,
        nameBn,
        nameEn,
        tagline: tagline || undefined,
        description: description || undefined,
        startingPrice: num(starting),
        hourlyRate: num(hourly),
        dailyRate: num(daily),
        unitRate: num(unit),
        unitLabel: unitLabel || null,
        inspectionFee: num(inspection),
        priceNote: priceNote || null,
        active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-services"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
      onDone();
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <form
      className="rounded-2xl border border-[#C9DFD2] bg-[#FAFCFB] p-4 grid sm:grid-cols-3 gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        save.mutate();
      }}
    >
      <div>
        <label className={labelCls} htmlFor={`sf-bn-${service?.id ?? "new"}`}>নাম (বাংলা) *</label>
        <input id={`sf-bn-${service?.id ?? "new"}`} className={inputCls} {...FIELDS.adminSaveService.nameBn} value={nameBn} onChange={(e) => setNameBn(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls} htmlFor={`sf-en-${service?.id ?? "new"}`}>নাম (English) *</label>
        <input id={`sf-en-${service?.id ?? "new"}`} className={inputCls} {...FIELDS.adminSaveService.nameEn} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
      </div>
      {!service && (
        <div>
          <label className={labelCls} htmlFor="sf-slug">Slug (URL) *</label>
          <input id="sf-slug" className={inputCls} {...FIELDS.adminSaveService.slug} value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="e.g. solar-installer" />
        </div>
      )}
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`sf-tag-${service?.id ?? "new"}`}>ট্যাগলাইন</label>
        <input id={`sf-tag-${service?.id ?? "new"}`} className={inputCls} {...FIELDS.adminSaveService.tagline} value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`sf-desc-${service?.id ?? "new"}`}>বিবরণ</label>
        <textarea id={`sf-desc-${service?.id ?? "new"}`} className={inputCls} rows={2} {...FIELDS.adminSaveService.description} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {(
        [
          ["শুরুর মূল্য (৳)", starting, setStarting, FIELDS.adminSaveService.startingPrice],
          ["ঘণ্টা প্রতি (৳)", hourly, setHourly, FIELDS.adminSaveService.hourlyRate],
          ["দিন প্রতি (৳)", daily, setDaily, FIELDS.adminSaveService.dailyRate],
          ["একক প্রতি (৳)", unit, setUnit, FIELDS.adminSaveService.unitRate],
          ["পরিদর্শন ফি (৳)", inspection, setInspection, FIELDS.adminSaveService.inspectionFee],
        ] as [string, string, (v: string) => void, Record<string, string | number | boolean | undefined>][]
      ).map(([label, v, set, fieldProps]) => (
        <div key={label}>
          <label className={labelCls}>{label}</label>
          <input type="number" {...fieldProps} className={inputCls} value={v} onChange={(e) => set(e.target.value)} placeholder="খালি = অনির্ধারিত" aria-label={label} />
        </div>
      ))}
      <div>
        <label className={labelCls} htmlFor={`sf-unit-${service?.id ?? "new"}`}>এককের নাম</label>
        <input id={`sf-unit-${service?.id ?? "new"}`} className={inputCls} {...FIELDS.adminSaveService.unitLabel} value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="যেমন: বর্গফুট, রুম" />
      </div>
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`sf-note-${service?.id ?? "new"}`}>মূল্য নোট</label>
        <input id={`sf-note-${service?.id ?? "new"}`} className={inputCls} {...FIELDS.adminSaveService.priceNote} value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="মূল্য সংক্রান্ত বিশেষ শর্ত থাকলে" />
      </div>
      <label className="sm:col-span-3 flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" className="w-5 h-5 accent-[#075B35]" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="সার্ভিস সক্রিয়" />
        <span className="font-medium text-[15px]">সার্ভিস সক্রিয় (গ্রাহকদের কাছে দৃশ্যমান)</span>
      </label>
      {error && (
        <div className="sm:col-span-3">
          <ErrorBox message={error} />
        </div>
      )}
      <div className="sm:col-span-3 flex gap-2">
        <button type="submit" disabled={save.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
          {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
        </button>
        <button type="button" onClick={onDone} className="border border-[#E1E9E4] font-semibold px-4 py-2.5 rounded-xl">
          বাতিল
        </button>
      </div>
    </form>
  );
}

function AdminLocations({ token }: { token: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-locations"], queryFn: () => api.adminListLocationsAll({ token }) });
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [district, setDistrict] = useState("টাঙ্গাইল");
  const [error, setError] = useState("");
  const toggle = useMutation({
    mutationFn: (v: { id: number; active: boolean }) => api.adminSaveLocation({ token, id: v.id, active: v.active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  const add = useMutation({
    mutationFn: () => api.adminSaveLocation({ token, nameEn, nameBn, district, active: true }),
    onSuccess: () => {
      setNameEn("");
      setNameBn("");
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  if (list.isPending) return <Spinner />;
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
      <ul className="divide-y divide-[#EEF3F0] border border-[#E1E9E4] rounded-2xl bg-white overflow-hidden">
        {(list.data?.locations ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-[#075B35]">{Icon.pin("w-5 h-5")}</span>
            <span className="font-semibold">{l.nameBn}</span>
            <span className="text-sm text-[#5C6B76] font-en">{l.nameEn}</span>
            <span className="text-sm text-[#5C6B76]">• {l.district}</span>
            <label className="ml-auto flex items-center gap-2 cursor-pointer">
              <span className={`text-xs font-bold ${l.active ? "text-[#075B35]" : "text-[#5C6B76]"}`}>{l.active ? "চালু" : "বন্ধ"}</span>
              <input
                type="checkbox"
                className="w-5 h-5 accent-[#075B35]"
                checked={l.active}
                disabled={toggle.isPending}
                onChange={(e) => toggle.mutate({ id: l.id, active: e.target.checked })}
                aria-label={`${l.nameBn} সক্রিয় রাখুন`}
              />
            </label>
          </li>
        ))}
      </ul>
      <form
        className="rounded-2xl border border-[#E1E9E4] bg-white p-5 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          add.mutate();
        }}
      >
        <h2 className="font-bold text-[#054A2B]">নতুন এলাকা যোগ করুন</h2>
        <div>
          <label className={labelCls} htmlFor="loc-bn">নাম (বাংলা) *</label>
          <input id="loc-bn" className={inputCls} {...FIELDS.adminSaveLocation.nameBn} value={nameBn} onChange={(e) => setNameBn(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="loc-en">নাম (English) *</label>
          <input id="loc-en" className={inputCls} {...FIELDS.adminSaveLocation.nameEn} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="loc-dist">জেলা</label>
          <input id="loc-dist" className={inputCls} {...FIELDS.adminSaveLocation.district} value={district} onChange={(e) => setDistrict(e.target.value)} />
        </div>
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={add.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl w-full">
          {add.isPending ? "যোগ হচ্ছে…" : "এলাকা যোগ করুন"}
        </button>
        <p className="text-[13px] text-[#5C6B76]">নতুন জেলার এলাকা যোগ করলেই সিস্টেম অন্য জেলাতেও সম্প্রসারণের জন্য প্রস্তুত থাকবে।</p>
      </form>
    </div>
  );
}

function AdminReviews({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const list = useQuery({ queryKey: ["admin-reviews"], queryFn: () => api.adminListReviews({ token }) });
  const moderate = useMutation({
    mutationFn: (v: { id: number; status: "approved" | "rejected" | "pending" }) =>
      api.adminSetReviewStatus({ token, reviewId: v.id, status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["home-reviews"] });
    },
    onError: (e) => setModError(errMsg(e)),
  });
  const [modError, setModError] = useState("");
  if (list.isPending) return <Spinner />;
  if (list.isError) return <ErrorBox message={errMsg(list.error)} />;
  const rows = list.data?.reviews ?? [];
  if (rows.length === 0) return <EmptyState title="এখনো কোনো রিভিউ আসেনি" body="গ্রাহকরা সম্পন্ন কাজের রিভিউ দিলে এখানে মডারেশনের জন্য আসবে।" />;
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
  const order = (s: string) => (s === "pending" ? 0 : s === "approved" ? 1 : 2);
  const sorted = [...rows]
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => order(a.status) - order(b.status) || b.id - a.id);
  const chip = (key: typeof filter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      aria-pressed={filter === key}
      className={`text-[13px] font-semibold px-3.5 py-1.5 rounded-full border ${filter === key ? "bg-[#075B35] text-white border-[#075B35]" : "bg-white text-[#43534B] border-[#E1E9E4] hover:border-[#075B35]"}`}
    >
      {label} ({counts[key]})
    </button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="রিভিউ ফিল্টার">
        {chip("all", "সব")}
        {chip("pending", "মডারেশন বাকি")}
        {chip("approved", "প্রকাশিত")}
        {chip("rejected", "বাতিল")}
      </div>
      {modError && (
        <div className="mb-3">
          <ErrorBox message={modError} />
        </div>
      )}
      {sorted.length === 0 ? (
        <EmptyState title="এই ফিল্টারে কোনো রিভিউ নেই" body="অন্য অবস্থার রিভিউ দেখতে উপরের ফিল্টার বদলান।" />
      ) : (
        <div className="space-y-3.5">
          {sorted.map((r) => (
            <div key={r.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Stars value={r.rating} />
                  <p className="mt-1.5 text-[15px]">“{r.text}”</p>
                  <p className="mt-1.5 text-[13px] text-[#5C6B76]">
                    {r.customerName} • {r.serviceName}
                    {r.professionalName ? ` • প্রফেশনাল: ${r.professionalName}` : ""} • {fmtDate(r.createdAt)}
                    {r.bookingCode && (
                      <>
                        {" "}•{" "}
                        <a href={`#/booking/${r.bookingCode}`} className="font-semibold text-[#075B35] hover:underline">
                          বুকিং {r.bookingCode}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${r.status === "approved" ? "bg-[#075B35] text-white" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                  {r.status === "approved" ? "প্রকাশিত" : r.status === "rejected" ? "বাতিল" : "মডারেশন বাকি"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                {r.status !== "approved" && (
                  <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: r.id, status: "approved" })} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl">
                    প্রকাশ করুন
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: r.id, status: "rejected" })} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
                    বাতিল করুন
                  </button>
                )}
                {r.status !== "pending" && (
                  <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: r.id, status: "pending" })} className="border-[1.5px] border-[#E1E9E4] text-[#43534B] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F6FAF7] disabled:opacity-60">
                    মডারেশনে ফেরত পাঠান
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AUDIENCE_ROLE_BN: Record<string, string> = {
  customer: "গ্রাহক",
  professional: "প্রফেশনাল",
  admin: "অ্যাডমিন",
};

/**
 * Manual notification manager (Master Phase 10): an operations admin
 * composes an announcement and sends it to all users, one role, or
 * one specific user. Every send is recorded server-side and lands in
 * exactly the recipients' notification centers.
 */
function AdminAnnouncements({ token }: { token: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "role" | "user">("all");
  const [role, setRole] = useState<"customer" | "professional" | "admin">("customer");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: number; name: string; phone: string; role: string } | null>(null);
  const [titleError, setTitleError] = useState("");
  const [bodyError, setBodyError] = useState("");
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");
  const history = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => api.adminListAnnouncements({ token }),
  });
  const searchUsers = useMutation({
    mutationFn: (q: string) => api.adminSearchUsers({ token, query: q }),
    onError: (e) => setFormError(errMsg(e)),
  });
  const send = useMutation({
    mutationFn: () =>
      api.adminSendAnnouncement({
        token,
        title: title.trim(),
        body: body.trim(),
        audience,
        audienceRole: audience === "role" ? role : undefined,
        audienceUserId: audience === "user" ? picked?.id : undefined,
      }),
    onSuccess: (res) => {
      setDone(`${res.recipientCount} জন ব্যবহারকারীর নোটিফিকেশন সেন্টারে ঘোষণাটি পাঠানো হয়েছে।`);
      setFormError("");
      setTitle("");
      setBody("");
      setPicked(null);
      setSearch("");
      searchUsers.reset();
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: (e) => setFormError(errMsg(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone("");
    setFormError("");
    if (!title.trim()) {
      setTitleError("ঘোষণার শিরোনাম দিন।");
      return;
    }
    setTitleError("");
    if (!body.trim()) {
      setBodyError("ঘোষণার লেখা দিন।");
      return;
    }
    setBodyError("");
    if (audience === "user" && !picked) {
      setFormError("নির্দিষ্ট একজনকে পাঠাতে হলে আগে নাম/মোবাইল দিয়ে খুঁজে একজন ব্যবহারকারী বেছে নিন।");
      return;
    }
    send.mutate();
  };
  return (
    <div>
      <form onSubmit={submit} className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
        <h2 className="font-bold text-[#054A2B]">নতুন ঘোষণা পাঠান</h2>
        <p className="mt-1 text-sm text-[#5C6B76]">
          ঘোষণাটি বেছে নেওয়া ব্যবহারকারীদের নোটিফিকেশন সেন্টারে যাবে। প্রতিটি পাঠানো ঘোষণা নিচে ইতিহাসে থেকে যায়।
        </p>
        <div className="mt-4">
          <label className={labelCls} htmlFor="ann-title">শিরোনাম</label>
          <input
            id="ann-title"
            className={inputCls}
            {...FIELDS.adminSendAnnouncement.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="যেমন: সার্ভিস সময়সূচি পরিবর্তন"
          />
          {titleError && <p className="mt-1 text-[13px] font-semibold text-red-700">{titleError}</p>}
        </div>
        <div className="mt-3">
          <label className={labelCls} htmlFor="ann-body">ঘোষণার লেখা</label>
          <textarea
            id="ann-body"
            className={inputCls}
            rows={3}
            {...FIELDS.adminSendAnnouncement.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="বিস্তারিত লিখুন…"
          />
          {bodyError && <p className="mt-1 text-[13px] font-semibold text-red-700">{bodyError}</p>}
        </div>
        <div className="mt-3">
          <label className={labelCls} htmlFor="ann-audience">কাদের কাছে পাঠাবেন</label>
          <select
            id="ann-audience"
            className={inputCls}
            value={audience}
            onChange={(e) => setAudience(e.target.value as "all" | "role" | "user")}
          >
            <option value="all">সব ব্যবহারকারী</option>
            <option value="role">একটি ভূমিকা (গ্রাহক / প্রফেশনাল / অ্যাডমিন)</option>
            <option value="user">নির্দিষ্ট একজন ব্যবহারকারী</option>
          </select>
        </div>
        {audience === "role" && (
          <div className="mt-3">
            <label className={labelCls} htmlFor="ann-role">ভূমিকা</label>
            <select
              id="ann-role"
              className={inputCls}
              value={role}
              onChange={(e) => setRole(e.target.value as "customer" | "professional" | "admin")}
            >
              <option value="customer">গ্রাহক</option>
              <option value="professional">প্রফেশনাল</option>
              <option value="admin">অ্যাডমিন</option>
            </select>
          </div>
        )}
        {audience === "user" && (
          <div className="mt-3">
            <label className={labelCls} htmlFor="ann-search">ব্যবহারকারী খুঁজুন (নাম বা মোবাইল)</label>
            <div className="flex gap-2">
              <input
                id="ann-search"
                className={inputCls}
                {...FIELDS.adminSearchUsers.query}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPicked(null);
                }}
                placeholder="যেমন: রহিম বা 017…"
              />
              <button
                type="button"
                disabled={searchUsers.isPending || !search.trim()}
                onClick={() => {
                  if (!search.trim()) {
                    setFormError("খুঁজতে নাম বা মোবাইল নম্বর লিখুন।");
                    return;
                  }
                  setFormError("");
                  searchUsers.mutate(search.trim());
                }}
                className="shrink-0 bg-[#F3F8F4] border-[1.5px] border-[#C9DFD2] text-[#054A2B] font-semibold text-sm px-4 rounded-xl hover:bg-[#E4F1E8] disabled:opacity-60"
              >
                খুঁজুন
              </button>
            </div>
            {picked ? (
              <p className="mt-2 text-sm rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] px-3.5 py-2">
                প্রাপক: <b>{picked.name}</b> • <span className="font-en">{picked.phone}</span> • {AUDIENCE_ROLE_BN[picked.role] ?? picked.role}
              </p>
            ) : (
              searchUsers.data &&
              (searchUsers.data.users.length === 0 ? (
                <p className="mt-2 text-sm text-[#5C6B76]">এই নাম/নম্বরে কোনো ব্যবহারকারী পাওয়া যায়নি।</p>
              ) : (
                <ul className="mt-2 divide-y divide-[#EEF3F0] rounded-xl border border-[#E1E9E4]">
                  {searchUsers.data.users.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(u)}
                        className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-[#F6FAF7]"
                        aria-label={`${u.name} কে প্রাপক হিসেবে বেছে নিন`}
                      >
                        <b>{u.name}</b> • <span className="font-en">{u.phone}</span> • {AUDIENCE_ROLE_BN[u.role] ?? u.role}
                      </button>
                    </li>
                  ))}
                </ul>
              ))
            )}
          </div>
        )}
        {formError && (
          <div className="mt-3">
            <ErrorBox message={formError} />
          </div>
        )}
        {done && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-2.5">{done}</p>}
        <button
          type="submit"
          disabled={send.isPending}
          className="mt-4 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
        >
          {send.isPending ? "পাঠানো হচ্ছে…" : "ঘোষণা পাঠান"}
        </button>
      </form>

      <h2 className="mt-8 font-bold text-[#054A2B]">পাঠানো ঘোষণার ইতিহাস</h2>
      {history.isPending ? (
        <Spinner />
      ) : history.isError ? (
        <div className="mt-3">
          <ErrorBox message={errMsg(history.error)} />
        </div>
      ) : (history.data?.announcements ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-[#5C6B76]">এখনো কোনো ঘোষণা পাঠানো হয়নি।</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {(history.data?.announcements ?? []).map((a) => (
            <li key={a.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
              <p className="font-semibold text-[15px]">{a.title}</p>
              <p className="mt-1 text-sm text-[#43534B]">{a.body}</p>
              <p className="mt-1.5 text-[12.5px] text-[#5C6B76]">
                {a.senderName} •{" "}
                {a.audience === "all"
                  ? "সব ব্যবহারকারী"
                  : a.audience === "role"
                    ? `${AUDIENCE_ROLE_BN[a.audienceRole ?? ""] ?? a.audienceRole} — সবাই`
                    : `একজন: ${a.audienceUserName ?? "ব্যবহারকারী"}`}{" "}
                • {a.recipientCount} জন পেয়েছেন • {fmtDateTime(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CouponRowView = ApiResponse<typeof api, "adminListCoupons">["coupons"][number];

/**
 * Coupon manager (Master Phase 10): finance admins create coupons —
 * fixed taka or percent off the eligible charge, with optional
 * expiry, usage limit, minimum bill and service restriction. Usage
 * figures are counted server-side from real redemptions.
 */
function AdminCoupons({ token }: { token: string }) {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const list = useQuery({ queryKey: ["admin-coupons"], queryFn: () => api.adminListCoupons({ token }) });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [serviceSlug, setServiceSlug] = useState("");
  const [couponActive, setCouponActive] = useState(true);
  const [codeError, setCodeError] = useState("");
  const [valueError, setValueError] = useState("");
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setDiscountType("fixed");
    setDiscountValue("");
    setMinAmount("");
    setExpiresOn("");
    setUsageLimit("");
    setServiceSlug("");
    setCouponActive(true);
    setCodeError("");
    setValueError("");
  };
  const save = useMutation({
    mutationFn: () =>
      api.adminSaveCoupon({
        token,
        id: editingId ?? undefined,
        code: code.trim(),
        discountType,
        discountValue: Number(discountValue),
        minAmount: minAmount.trim() ? Number(minAmount) : null,
        expiresOn: expiresOn || null,
        usageLimit: usageLimit.trim() ? Number(usageLimit) : null,
        serviceSlug: serviceSlug || null,
        active: couponActive,
      }),
    onSuccess: () => {
      setDone(editingId ? "কুপন আপডেট হয়েছে।" : "কুপন তৈরি হয়েছে — এখন থেকে এই কোডে ছাড় প্রযোজ্য হবে।");
      setFormError("");
      resetForm();
      refresh();
    },
    onError: (e) => setFormError(errMsg(e)),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: number; active: boolean }) =>
      api.adminSetCouponActive({ token, couponId: v.id, active: v.active }),
    onSuccess: refresh,
    onError: (e) => setFormError(errMsg(e)),
  });
  const startEdit = (c: CouponRowView) => {
    setEditingId(c.id);
    setCode(c.code);
    setDiscountType(c.discountType === "percent" ? "percent" : "fixed");
    setDiscountValue(String(c.discountValue));
    setMinAmount(c.minAmount != null ? String(c.minAmount) : "");
    setExpiresOn(c.expiresOn ?? "");
    setUsageLimit(c.usageLimit != null ? String(c.usageLimit) : "");
    setServiceSlug(c.serviceSlug ?? "");
    setCouponActive(c.active);
    setCodeError("");
    setValueError("");
    setFormError("");
    setDone("");
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone("");
    setFormError("");
    if (!code.trim()) {
      setCodeError("কুপন কোড দিন।");
      return;
    }
    setCodeError("");
    const v = Number(discountValue);
    if (!discountValue.trim() || !Number.isFinite(v) || v <= 0) {
      setValueError(discountType === "percent" ? "ছাড়ের শতাংশ দিন (১–১০০)।" : "ছাড়ের পরিমাণ টাকায় দিন।");
      return;
    }
    if (discountType === "percent" && v > 100) {
      setValueError("শতাংশ ছাড় ১০০%-এর বেশি হতে পারে না।");
      return;
    }
    setValueError("");
    save.mutate();
  };
  const services = catalog.data?.services ?? [];
  return (
    <div>
      <form onSubmit={submit} className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
        <h2 className="font-bold text-[#054A2B]">{editingId ? "কুপন সম্পাদনা করুন" : "নতুন কুপন তৈরি করুন"}</h2>
        <p className="mt-1 text-sm text-[#5C6B76]">
          ছাড়টি প্রযোজ্য হয় কোটেশন অনুমোদনের সময়, শুধু যোগ্য চার্জের (শ্রম + অতিরিক্ত) উপর — কমিশনও হিসাব হয় ছাড়ের পরের অঙ্কে। এখানে তৈরি না করা কোনো ছাড়ের প্রতিশ্রুতি সাইটে কোথাও দেওয়া হয় না।
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="cp-code">কুপন কোড</label>
            <input
              id="cp-code"
              className={`${inputCls} font-en uppercase`}
              {...FIELDS.adminSaveCoupon.code}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="যেমন: EID2026"
            />
            {codeError && <p className="mt-1 text-[13px] font-semibold text-red-700">{codeError}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="cp-type">ছাড়ের ধরন</label>
            <select
              id="cp-type"
              className={inputCls}
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}
            >
              <option value="fixed">নির্দিষ্ট টাকা ছাড়</option>
              <option value="percent">শতাংশ ছাড় (%)</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="cp-value">{discountType === "percent" ? "শতাংশ (%)" : "ছাড়ের পরিমাণ (৳)"}</label>
            <input
              id="cp-value"
              type="number"
              className={inputCls}
              {...FIELDS.adminSaveCoupon.discountValue}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "যেমন: 10" : "যেমন: 200"}
            />
            {valueError && <p className="mt-1 text-[13px] font-semibold text-red-700">{valueError}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="cp-min">সর্বনিম্ন বিল (৳) — ঐচ্ছিক</label>
            <input
              id="cp-min"
              type="number"
              className={inputCls}
              {...FIELDS.adminSaveCoupon.minAmount}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="খালি রাখলে সীমা নেই"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="cp-exp">মেয়াদ শেষের তারিখ — ঐচ্ছিক</label>
            <input
              id="cp-exp"
              type="date"
              className={inputCls}
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="cp-limit">মোট ব্যবহারের সীমা — ঐচ্ছিক</label>
            <input
              id="cp-limit"
              type="number"
              className={inputCls}
              {...FIELDS.adminSaveCoupon.usageLimit}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              placeholder="খালি রাখলে অসীম"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="cp-service">সার্ভিস — ঐচ্ছিক</label>
            <select
              id="cp-service"
              className={inputCls}
              value={serviceSlug}
              onChange={(e) => setServiceSlug(e.target.value)}
            >
              <option value="">সব সার্ভিসে প্রযোজ্য</option>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nameBn}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#43534B]">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[#075B35]"
                checked={couponActive}
                onChange={(e) => setCouponActive(e.target.checked)}
              />
              কুপন সক্রিয়
            </label>
          </div>
        </div>
        {formError && (
          <div className="mt-3">
            <ErrorBox message={formError} />
          </div>
        )}
        {done && <p className="mt-3 rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-2.5">{done}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={save.isPending}
            className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : editingId ? "আপডেট করুন" : "কুপন তৈরি করুন"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setDone("");
                setFormError("");
              }}
              className="border-[1.5px] border-[#E1E9E4] text-[#43534B] font-semibold px-4 py-2.5 rounded-xl hover:bg-[#F6FAF7]"
            >
              বাতিল
            </button>
          )}
        </div>
      </form>

      <h2 className="mt-8 font-bold text-[#054A2B]">সব কুপন</h2>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <div className="mt-3">
          <ErrorBox message={errMsg(list.error)} />
        </div>
      ) : (list.data?.coupons ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-[#5C6B76]">এখনো কোনো কুপন তৈরি হয়নি — কোনো ছাড়ও প্রযোজ্য নয়।</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {(list.data?.coupons ?? []).map((c) => (
            <li key={c.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[15px]">
                    <span className="font-en">{c.code}</span>{" "}
                    <span className="text-[#075B35]">
                      — {c.discountType === "percent" ? `${c.discountValue}% ছাড়` : `${bdt(c.discountValue)} ছাড়`}
                    </span>
                  </p>
                  <p className="mt-1 text-[13px] text-[#5C6B76]">
                    {c.serviceName ? `শুধু: ${c.serviceName}` : "সব সার্ভিস"}
                    {c.minAmount != null ? ` • সর্বনিম্ন বিল ${bdt(c.minAmount)}` : ""}
                    {c.expiresOn ? ` • মেয়াদ: ${fmtDate(c.expiresOn)} পর্যন্ত` : " • মেয়াদ নেই"}
                    {" "}• ব্যবহৃত: {c.usedCount} বার
                    {c.remaining != null ? ` • বাকি: ${c.remaining} বার` : " • সীমা নেই"}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${c.active ? "bg-[#075B35] text-white" : "bg-[#EEF3F0] text-[#5C6B76]"}`}>
                  {c.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="border-[1.5px] border-[#C9DFD2] text-[#054A2B] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F3F8F4]"
                >
                  সম্পাদনা
                </button>
                <button
                  type="button"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: c.id, active: !c.active })}
                  className="border-[1.5px] border-[#E1E9E4] text-[#43534B] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F6FAF7] disabled:opacity-60"
                >
                  {c.active ? "নিষ্ক্রিয় করুন" : "সক্রিয় করুন"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminComplaints({ token }: { token: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-complaints"], queryFn: () => api.adminListComplaints({ token }) });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const resolve = useMutation({
    mutationFn: (v: { id: number; note?: string }) => api.adminResolveComplaint({ token, complaintId: v.id, note: v.note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });
  type AdminComplaintRow = ApiResponse<typeof api, "adminListComplaints">["complaints"][number];
  const ctl = useListControls<AdminComplaintRow>(
    list.data?.complaints ?? [],
    (c) => `${c.subject} ${c.message} ${c.customerName} ${c.customerPhone} ${c.bookingCode ?? ""}`,
    {
      new: (a, b) => b.id - a.id,
      old: (a, b) => a.id - b.id,
    },
    "new",
  );
  if (list.isPending) return <Spinner />;
  if (list.isError) return <ErrorBox message={errMsg(list.error)} />;
  const rows = list.data?.complaints ?? [];
  if (rows.length === 0) return <EmptyState title="কোনো অভিযোগ নেই" />;
  return (
    <div>
      <ListControls
        query={ctl.query}
        setQuery={ctl.setQuery}
        sort={ctl.sort}
        setSort={ctl.setSort}
        sortOptions={[["new", "নতুন আগে"], ["old", "পুরনো আগে"]]}
        total={ctl.total}
        page={ctl.page}
        pageCount={ctl.pageCount}
        setPage={ctl.setPage}
        searchLabel="বিষয়, নাম বা বুকিং কোড দিয়ে খুঁজুন"
      />
      {ctl.pageRows.length === 0 ? (
        <EmptyState title="খোঁজার সাথে মিলে এমন অভিযোগ নেই" />
      ) : (
        <div className="space-y-3.5">
          {ctl.pageRows.map((c) => (
        <div key={c.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold">{c.subject}</p>
              <p className="text-[13.5px] text-[#5C6B76]">
                {c.customerName} • <span className="font-en">{c.customerPhone}</span>
                {c.bookingCode ? <span> • বুকিং <span className="font-en">{c.bookingCode}</span></span> : ""} • {fmtDateTime(c.createdAt)}
              </p>
            </div>
            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${c.status === "resolved" ? "bg-[#075B35] text-white" : "bg-amber-100 text-amber-800"}`}>
              {c.status === "resolved" ? "সমাধান হয়েছে" : "খোলা আছে"}
            </span>
          </div>
          <p className="mt-2 text-[15px] text-[#43534B]">{c.message}</p>
          {c.status === "resolved" ? (
            c.adminNote && <p className="mt-2 text-sm bg-[#F3F8F4] rounded-lg px-3 py-2">সমাধান নোট: {c.adminNote}</p>
          ) : (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <label className="sr-only" htmlFor={`cmp-note-${c.id}`}>সমাধান নোট</label>
              <input
                id={`cmp-note-${c.id}`}
                className={inputCls}
                {...FIELDS.adminResolveComplaint.note}
                placeholder="গ্রাহককে জানানোর জন্য সমাধান নোট"
                value={notes[c.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: c.id, note: notes[c.id] || undefined })}
                className="shrink-0 bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2.5 rounded-xl"
              >
                সমাধান হিসেবে চিহ্নিত করুন
              </button>
              <a href={`tel:${c.customerPhone}`} className="shrink-0 border border-[#E1E9E4] font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-[#F3F8F4] inline-flex items-center gap-1.5 justify-center">
                {Icon.phone("w-4 h-4")} কল
              </a>
            </div>
          )}
        </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ------------------------------------- support tickets admin (Phase 6)

function AdminTickets({ token }: { token: string }) {
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useQuery({
    queryKey: ["admin-tickets", filter],
    queryFn: () =>
      api.adminListTickets({
        token,
        status: (filter || undefined) as
          | "open"
          | "in_progress"
          | "waiting_customer"
          | "resolved"
          | "closed"
          | undefined,
      }),
  });
  const rows = list.data?.tickets ?? [];
  type AdminTicketRow = ApiResponse<typeof api, "adminListTickets">["tickets"][number];
  const ctl = useListControls<AdminTicketRow>(
    rows,
    (t) => `${t.subject} ${t.code} ${t.ownerName} ${t.ownerPhone}`,
    {
      new: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      old: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
    },
    "new",
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="font-bold text-[#054A2B]">সাপোর্ট টিকিট</h2>
        <label className="sr-only" htmlFor="admin-ticket-filter">অবস্থা অনুযায়ী ছাঁকুন</label>
        <select
          id="admin-ticket-filter"
          className="border border-[#E1E9E4] rounded-xl px-3 py-2 bg-white text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">সব অবস্থা</option>
          {Object.entries(TICKET_STATUS_BN).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox message={errMsg(list.error)} />
      ) : rows.length === 0 ? (
        <EmptyState title="কোনো টিকিট নেই" />
      ) : (
        <>
          <ListControls
            query={ctl.query}
            setQuery={ctl.setQuery}
            sort={ctl.sort}
            setSort={ctl.setSort}
            sortOptions={[["new", "সাম্প্রতিক আগে"], ["old", "পুরনো আগে"]]}
            total={ctl.total}
            page={ctl.page}
            pageCount={ctl.pageCount}
            setPage={ctl.setPage}
            searchLabel="বিষয়, কোড বা নাম দিয়ে খুঁজুন"
          />
          {ctl.pageRows.length === 0 ? (
            <EmptyState title="খোঁজার সাথে মিলে এমন টিকিট নেই" />
          ) : (
            <ul className="space-y-3">
              {ctl.pageRows.map((t) => (
            <li key={t.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
              <button
                type="button"
                className="w-full text-left"
                aria-expanded={openId === t.id}
                onClick={() => setOpenId(openId === t.id ? null : t.id)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{t.subject}</span>
                  <TicketStatusChip status={t.status} />
                </span>
                <span className="mt-1 block text-[12.5px] text-[#5C6B76]">
                  <span className="font-en">{t.code}</span> • {t.ownerName} (<span className="font-en">{t.ownerPhone}</span>) •{" "}
                  {t.ownerRole === "professional" ? "প্রফেশনাল" : "গ্রাহক"} • {t.messageCount}টি বার্তা • {fmtDateTime(t.updatedAt)}
                </span>
              </button>
              {openId === t.id && (
                <div className="mt-3 border-t border-[#E1E9E4] pt-3">
                  <TicketThread token={token} ticketId={t.id} admin />
                </div>
              )}
            </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------- social links manager (Phase 6)
//
// Owner-supplied social links only. The list starts empty and the
// public site shows no social icons until a real link is added here
// and enabled. The server validates every URL against the platform's
// domain, so a wrong or placeholder URL cannot be saved.

type AdminSocialLink = ApiResponse<typeof api, "adminListSocialLinks">["links"][number];
type SocialPlatform = "facebook" | "instagram" | "youtube" | "tiktok" | "whatsapp" | "other";

const SOCIAL_PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "youtube", "tiktok", "whatsapp", "other"];

function SocialLinkEditor({
  token,
  link,
}: {
  token: string;
  link?: AdminSocialLink;
}) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<SocialPlatform>((link?.platform as SocialPlatform) ?? "facebook");
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [sortOrder, setSortOrder] = useState(String(link?.sortOrder ?? 0));
  const [enabled, setEnabled] = useState(link?.enabled ?? true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.adminSaveSocialLink({
        token,
        id: link?.id,
        platform,
        label: label.trim() || null,
        url: url.trim(),
        enabled,
        sortOrder: Number(sortOrder) || 0,
      }),
    onSuccess: () => {
      setOk(true);
      if (!link) {
        setLabel("");
        setUrl("");
        setSortOrder("0");
        setEnabled(true);
      }
      qc.invalidateQueries({ queryKey: ["admin-social-links"] });
      qc.invalidateQueries({ queryKey: ["social-links"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => api.adminDeleteSocialLink({ token, id: link!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-social-links"] });
      qc.invalidateQueries({ queryKey: ["social-links"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const fid = link ? `sl-${link.id}` : "sl-new";
  return (
    <form
      className="rounded-2xl border border-[#E1E9E4] bg-white p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setOk(false);
        save.mutate();
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-[#075B35]">{socialIcon(platform, "w-5 h-5")}</span>
        <span className="font-semibold">{link ? (link.label ?? SOCIAL_PLATFORM_BN[link.platform] ?? link.platform) : "নতুন লিংক যোগ করুন"}</span>
        {link && (
          <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${link.enabled ? "bg-[#075B35] text-white" : "bg-[#E1E9E4] text-[#5C6B76]"}`}>
            {link.enabled ? "চালু" : "বন্ধ"}
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor={`${fid}-platform`}>প্ল্যাটফর্ম</label>
          <select id={`${fid}-platform`} className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform)}>
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>{SOCIAL_PLATFORM_BN[p] ?? p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor={`${fid}-label`}>নাম (ঐচ্ছিক)</label>
          <input id={`${fid}-label`} className={inputCls} {...FIELDS.adminSaveSocialLink.label} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="যেমন: MistriDako অফিসিয়াল পেজ" />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${fid}-url`}>URL *</label>
        <input
          id={`${fid}-url`}
          className={`${inputCls} font-en`}
          {...FIELDS.adminSaveSocialLink.url}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder={platform === "whatsapp" ? "https://wa.me/8801XXXXXXXXX" : "https://…"}
        />
        <p className="mt-1 text-[13px] text-[#5C6B76]">শুধু আসল অ্যাকাউন্ট/পেজের লিংক দিন — প্ল্যাটফর্মের নিজের ডোমেইন ছাড়া অন্য URL সার্ভার গ্রহণ করবে না।</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className={labelCls} htmlFor={`${fid}-order`}>ক্রম</label>
          <input id={`${fid}-order`} type="number" {...FIELDS.adminSaveSocialLink.sortOrder} className={`${inputCls} font-en w-24`} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 font-medium pb-2" htmlFor={`${fid}-enabled`}>
          <input id={`${fid}-enabled`} type="checkbox" className="w-4.5 h-4.5 accent-[#075B35]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          সাইটে দেখান
        </label>
        <div className="ml-auto flex gap-2">
          {link && (
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => {
                setError("");
                del.mutate();
              }}
              className="border border-red-200 text-red-600 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60"
            >
              {del.isPending ? "মোছা হচ্ছে…" : "মুছুন"}
            </button>
          )}
          <button type="submit" disabled={save.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : link ? "সংরক্ষণ করুন" : "যোগ করুন"}
          </button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {ok && <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">সংরক্ষিত হয়েছে।</p>}
    </form>
  );
}

function AdminSocialLinks({ token }: { token: string }) {
  const list = useQuery({ queryKey: ["admin-social-links"], queryFn: () => api.adminListSocialLinks({ token }) });
  const rows = list.data?.links ?? [];
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="font-bold text-[#054A2B]">সোশ্যাল মিডিয়া লিংক</h2>
        <p className="mt-1 text-sm text-[#5C6B76]">
          এখানে যোগ করা চালু লিংকগুলোই শুধু সাইটের ফুটার, যোগাযোগ পেজ ও মোবাইল মেনুতে দেখানো হবে।
          কোনো লিংক না থাকলে সাইটে কোনো সোশ্যাল আইকন দেখানো হবে না।
        </p>
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorBox message={errMsg(list.error)} />
      ) : (
        <>
          {rows.map((l) => (
            <SocialLinkEditor key={l.id} token={token} link={l} />
          ))}
          {rows.length === 0 && <EmptyState title="এখনো কোনো সোশ্যাল লিংক যোগ হয়নি" body="আসল Facebook পেজ / YouTube চ্যানেল তৈরি হলে নিচে থেকে লিংক যোগ করুন।" />}
          <SocialLinkEditor token={token} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------- payments (Phase 5)
//
// Payment Management: money figures come from the server (verified
// payments + immutable ledger), TrxID verification wires the existing
// adminVerifyPayment action, and commission rates are edited per
// payment model — a rate change never touches a confirmed booking's
// snapshot. Master Phase 9 adds the decisions: withdrawal decide/pay
// in the settlement queue below, and refund decisions in
// RefundRequestsPanel (finance only, real transfer recorded per case).

const LEDGER_TYPE_BN: Record<string, string> = {
  online_collection: "অনলাইন সংগ্রহ",
  customer_fee: "গ্রাহক ফি",
  commission_due: "কমিশন পাওনা",
  commission_collected: "কমিশন সংগৃহীত",
  held_balance: "হেল্ড ব্যালেন্স",
  payout: "পেআউট",
  refund: "রিফান্ড",
  adjustment: "সমন্বয়",
};

const EXTENDED_STATUS_BN: Record<string, string> = {
  unpaid: "পরিশোধ হয়নি",
  payment_initiated: "পেমেন্ট শুরু হয়েছে",
  payment_pending: "পেমেন্ট যাচাইয়ের অপেক্ষায়",
  payment_verified: "পেমেন্ট যাচাইকৃত",
  held_settlement_pending: "হেল্ড — সেটলমেন্ট বাকি",
  payout_requested: "পেআউট অনুরোধ হয়েছে",
  admin_verification: "অ্যাডমিন যাচাইয়ে",
  paid: "পরিশোধিত",
  failed: "ব্যর্থ",
  cancelled: "বাতিল",
  disputed: "বিরোধপূর্ণ",
  refund_pending: "রিফান্ড অপেক্ষমাণ",
  refunded: "রিফান্ড হয়েছে",
  rejected: "প্রত্যাখ্যাত",
};

const WITHDRAW_METHOD_BN: Record<string, string> = {
  ...PROVIDER_BN,
  bank: "ব্যাংক",
};

function MoneyStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div>
      <p className="text-[20px] font-bold text-[#054A2B]">{bdt(value)}</p>
      <p className="text-[13px] text-[#5C6B76]">
        {label}
        {sub ? ` (${sub})` : ""}
      </p>
    </div>
  );
}

function PaymentVerifyBox({ token, p }: { token: string; p: PaymentView }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const verify = useMutation({
    mutationFn: (v: { decision: "verify" | "reject"; reason?: string }) =>
      api.adminVerifyPayment({ token, paymentId: p.id, decision: v.decision, reason: v.reason }),
    onSuccess: (_res, v) => {
      setDone(v.decision === "verify" ? "পেমেন্ট যাচাই সম্পন্ন হয়েছে।" : "পেমেন্ট বাতিল করা হয়েছে।");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      qc.invalidateQueries({ queryKey: ["admin-booking-payment"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-settlement"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const pending = p.status === "pending" || p.status === "initiated";
  return (
    <div className="rounded-xl border border-[#E1E9E4] bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{PROVIDER_BN[p.provider] ?? providerEn(p.provider)}</span>
        <span className="font-en text-sm">{p.providerTrxId}</span>
        <span className="font-en font-bold">{bdt(p.amount)}</span>
        <PaymentStatusChip status={p.status} />
        <span className="text-[12.5px] text-[#5C6B76]">{fmtDateTime(p.createdAt)}</span>
      </div>
      <p className="mt-1 text-[13px] text-[#5C6B76]">
        মডেল: {PAYMENT_MODEL_BN[p.paymentModel] ?? p.paymentModel}
        {p.senderNumber ? (
          <>
            {" "}• প্রেরকের নম্বর: <span className="font-en">{p.senderNumber}</span>
          </>
        ) : null}
      </p>
      {p.status === "failed" && p.rejectionReason && (
        <p className="mt-1 text-[13px] text-red-700">বাতিলের কারণ: {p.rejectionReason}</p>
      )}
      {pending && !done && (
        <div className="mt-3 space-y-2">
          <div>
            <label className={labelCls} htmlFor={`rej-${p.id}`}>বাতিলের কারণ (শুধু বাতিল করলেই লাগবে)</label>
            <input
              id={`rej-${p.id}`}
              className={inputCls}
              {...FIELDS.adminVerifyPayment.reason}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="যেমন: TrxID মেলেনি / টাকা পৌঁছায়নি"
            />
          </div>
          {error && <ErrorBox message={error} />}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={verify.isPending}
              onClick={() => {
                setError("");
                verify.mutate({ decision: "verify" });
              }}
              className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl"
            >
              যাচাই করে অনুমোদন করুন
            </button>
            <button
              type="button"
              disabled={verify.isPending}
              onClick={() => {
                setError("");
                if (!reason.trim()) {
                  setError("পেমেন্ট বাতিল করতে হলে কারণ লিখুন।");
                  return;
                }
                verify.mutate({ decision: "reject", reason: reason.trim() });
              }}
              className="border border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60"
            >
              বাতিল করুন
            </button>
          </div>
        </div>
      )}
      {done && <p className="mt-2 rounded-lg bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-3 py-2">{done}</p>}
    </div>
  );
}

function BookingPaymentDetail({ token, bookingId }: { token: string; bookingId: number }) {
  const detail = useQuery({
    queryKey: ["admin-booking-payment", bookingId],
    queryFn: () => api.adminGetBookingPaymentDetail({ token, bookingId }),
  });
  if (detail.isPending) return <Spinner />;
  if (detail.isError) return <ErrorBox message={errMsg(detail.error)} />;
  const d = detail.data!;
  const s = d.snapshot;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-bold text-[#054A2B] mb-2">মূল্য ও পেমেন্ট স্ন্যাপশট</h3>
        {d.breakdown ? (
          <>
            <p className="text-[13px] text-[#5C6B76] mb-2">
              মডেল: {PAYMENT_MODEL_BN[s.paymentModel ?? ""] ?? s.paymentModel} • অনলাইন পেমেন্টের অবস্থা:{" "}
              {EXTENDED_STATUS_BN[s.extendedPaymentStatus] ?? s.extendedPaymentStatus}
              {s.heldBalance != null && s.heldBalance > 0 ? ` • বর্তমান হেল্ড: ${bdt(s.heldBalance)}` : ""}
            </p>
            <BreakdownRows bd={d.breakdown} />
            <p className="mt-2 text-[12.5px] text-[#5C6B76]">
              এই হিসাব মূল্য নিশ্চিত করার সময়ের হার (গ্রাহক ফি {s.customerFeePercent}% • প্রফেশনাল কমিশন{" "}
              {s.proCommissionPercent}%) দিয়ে জমা করা স্ন্যাপশট — পরে হার বদলালেও এই বুকিংয়ের হিসাব বদলায় না।
            </p>
          </>
        ) : (
          <p className="text-sm text-[#5C6B76]">এই বুকিংয়ের মূল্য এখনো নিশ্চিত হয়নি, তাই কোনো পেমেন্ট স্ন্যাপশট নেই।</p>
        )}
      </div>
      <div>
        <h3 className="font-bold text-[#054A2B] mb-2">TrxID জমা ও যাচাই</h3>
        {d.payments.length === 0 ? (
          <p className="text-sm text-[#5C6B76]">এই বুকিংয়ে কোনো অনলাইন পেমেন্ট জমা হয়নি।</p>
        ) : (
          <div className="space-y-2.5">
            {d.payments.map((p) => (
              <PaymentVerifyBox key={p.id} token={token} p={p} />
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="font-bold text-[#054A2B] mb-2">লেজার এন্ট্রি</h3>
        {d.ledger.length === 0 ? (
          <p className="text-sm text-[#5C6B76]">এখনো কোনো লেজার এন্ট্রি নেই — পেমেন্ট যাচাই হলেই এন্ট্রি তৈরি হয়।</p>
        ) : (
          <ul className="divide-y divide-[#EEF3F0] border border-[#E1E9E4] rounded-xl overflow-hidden">
            {d.ledger.map((e) => (
              <li key={e.id} className="px-3.5 py-2.5 flex flex-wrap items-baseline gap-x-3 bg-white">
                <span className="text-[13px] font-semibold bg-[#F3F8F4] text-[#054A2B] px-2 py-0.5 rounded">
                  {LEDGER_TYPE_BN[e.entryType] ?? e.entryType}
                </span>
                <span className="font-en font-semibold">{bdt(e.amount)}</span>
                {e.note && <span className="text-[13px] text-[#43534B]">{e.note}</span>}
                <span className="ml-auto text-[12.5px] text-[#5C6B76]">{fmtDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CommissionRatesCard({ token }: { token: string }) {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.adminGetSettings({ token }) });
  const [fullFee, setFullFee] = useState("");
  const [fullComm, setFullComm] = useState("");
  const [splitFee, setSplitFee] = useState("");
  const [splitComm, setSplitComm] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  if (data.data && !loaded) {
    setLoaded(true);
    setFullFee(String(data.data.fullOnlineCustomerFeePercent));
    setFullComm(String(data.data.fullOnlineProCommissionPercent));
    setSplitFee(String(data.data.splitCustomerFeePercent));
    setSplitComm(String(data.data.splitProCommissionPercent));
  }
  const save = useMutation({
    mutationFn: () =>
      api.adminSaveSettings({
        token,
        fullOnlineCustomerFeePercent: Number(fullFee) || 0,
        fullOnlineProCommissionPercent: Number(fullComm) || 0,
        splitCustomerFeePercent: Number(splitFee) || 0,
        splitProCommissionPercent: Number(splitComm) || 0,
      }),
    onSuccess: () => {
      setOk(true);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  if (data.isPending) return <Spinner />;
  if (data.isError) return <ErrorBox message={errMsg(data.error)} />;
  const rateField = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    fieldProps: Record<string, string | number | boolean | undefined>,
  ) => (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <input id={id} type="number" {...fieldProps} className={inputCls} value={value} onChange={(e) => set(e.target.value)} required />
    </div>
  );
  return (
    <section>
      <h2 className="text-lg font-bold text-[#054A2B]">কমিশন ও ফি-এর হার</h2>
      <p className="mt-1 text-sm text-[#5C6B76]">
        প্রতিটি পেমেন্ট মডেলের আলাদা হার। হার বদলালে তা শুধু এরপর মূল্য-নিশ্চিত হওয়া নতুন বুকিংয়ে প্রযোজ্য হবে —
        ইতিমধ্যে নিশ্চিত বা যাচাইকৃত বুকিংয়ের স্ন্যাপশট কখনো বদলায় না।
      </p>
      <form
        className="mt-4 max-w-xl rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setOk(false);
          save.mutate();
        }}
      >
        <fieldset>
          <legend className="font-semibold text-[#054A2B] mb-2">সম্পূর্ণ অনলাইন পেমেন্ট</legend>
          <div className="grid grid-cols-2 gap-3">
            {rateField("cr-full-fee", "গ্রাহক ফি (%)", fullFee, setFullFee, FIELDS.adminSaveSettings.fullOnlineCustomerFeePercent)}
            {rateField("cr-full-comm", "প্রফেশনাল কমিশন (%)", fullComm, setFullComm, FIELDS.adminSaveSettings.fullOnlineProCommissionPercent)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold text-[#054A2B] mb-2">৫০% অনলাইন + ৫০% নগদ</legend>
          <div className="grid grid-cols-2 gap-3">
            {rateField("cr-split-fee", "গ্রাহক ফি (%)", splitFee, setSplitFee, FIELDS.adminSaveSettings.splitCustomerFeePercent)}
            {rateField("cr-split-comm", "প্রফেশনাল কমিশন (%)", splitComm, setSplitComm, FIELDS.adminSaveSettings.splitProCommissionPercent)}
          </div>
        </fieldset>
        {error && <ErrorBox message={error} />}
        {ok && (
          <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">
            হার সংরক্ষিত হয়েছে — এখন থেকে মূল্য-নিশ্চিত হওয়া বুকিংয়ে প্রযোজ্য।
          </p>
        )}
        <button type="submit" disabled={save.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
          {save.isPending ? "সংরক্ষণ হচ্ছে…" : "হার সংরক্ষণ করুন"}
        </button>
      </form>
    </section>
  );
}

type SettlementWithdrawal = ApiResponse<typeof api, "adminListSettlementQueue">["withdrawalRequests"][number];

/** Master Phase 9: finance admin decides a withdrawal request —
 *  pay (real transfer reference required), hold (reason required),
 *  release a hold, or reject (reason required). The server re-checks
 *  the finance level and the releasable balance on every decision. */
function WithdrawalDecisionBox({ token, w }: { token: string; w: SettlementWithdrawal }) {
  const qc = useQueryClient();
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const decide = useMutation({
    mutationFn: (v: { decision: "pay" | "reject" | "hold" | "release"; transactionReference?: string; note?: string }) =>
      api.adminDecideWithdrawal({ token, withdrawalId: w.id, decision: v.decision, transactionReference: v.transactionReference, note: v.note }),
    onSuccess: (_d, v) => {
      setDone(
        v.decision === "pay"
          ? "পরিশোধ সম্পন্ন — পেআউট লেজারে লেখা হয়েছে।"
          : v.decision === "reject"
            ? "অনুরোধ বাতিল হয়েছে — টাকা প্রফেশনালের ব্যালেন্সে ফিরেছে।"
            : v.decision === "hold"
              ? "অনুরোধ হোল্ডে রাখা হয়েছে।"
              : "হোল্ড ছাড়া হয়েছে — অনুরোধ আবার সিদ্ধান্তের অপেক্ষায়।",
      );
      setError("");
      qc.invalidateQueries({ queryKey: ["admin-settlement"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const st = WITHDRAWAL_STATUS_BN[w.status] ?? { label: w.status, cls: "bg-gray-100 text-gray-700" };
  return (
    <div className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">
          {w.professionalName} — {bdt(w.amount)}
        </p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
      </div>
      <p className="mt-0.5 text-[13.5px] text-[#5C6B76]">
        {WITHDRAW_METHOD_BN[w.method] ?? providerEn(w.method)} • <span className="font-en">{w.number}</span> •{" "}
        {fmtDateTime(w.requestedAt)}
        {w.bookingCode ? (
          <>
            {" "}• বুকিং <span className="font-en">{w.bookingCode}</span>
          </>
        ) : null}
      </p>
      {w.status === "held" && w.holdReason && (
        <p className="mt-1 text-[13px] text-red-700 font-semibold">হোল্ডের কারণ: {w.holdReason}</p>
      )}
      {done ? (
        <p className="mt-2 rounded-lg bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-3 py-2">{done}</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          <div className="grid sm:grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls} htmlFor={`wd-ref-${w.id}`}>আসল লেনদেনের TrxID / রেফারেন্স (পরিশোধে লাগবে)</label>
              <input
                id={`wd-ref-${w.id}`}
                className={`${inputCls} font-en`}
                {...FIELDS.adminDecideWithdrawal.transactionReference}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="যেমন: 9HX7K2LM1P"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`wd-note-${w.id}`}>কারণ (হোল্ড / বাতিলে লাগবে)</label>
              <input
                id={`wd-note-${w.id}`}
                className={inputCls}
                {...FIELDS.adminDecideWithdrawal.note}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেমন: বুকিংয়ে বিরোধ চলমান"
              />
            </div>
          </div>
          <p className="text-[12.5px] text-[#5C6B76]">
            শুধু স্ক্রিনশট প্রমাণ নয় — টাকা সত্যিই পাঠিয়ে তার লেনদেন রেফারেন্স লিখলেই কেবল "পরিশোধিত" হবে। একবার পরিশোধ হলে আবার পরিশোধ করা যাবে না।
            {w.status === "held" && " এই অনুরোধ হোল্ডে আছে — পরিশোধের আগে হোল্ড ছাড়তে হবে।"}
          </p>
          {error && <ErrorBox message={error} />}
          <div className="flex flex-wrap gap-2">
            {w.status !== "held" && (
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  setError("");
                  if (!reference.trim()) {
                    setError("পরিশোধ করতে হলে আসল লেনদেনের TrxID / রেফারেন্স লিখুন।");
                    return;
                  }
                  decide.mutate({ decision: "pay", transactionReference: reference.trim() });
                }}
                className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-xl"
              >
                টাকা পাঠিয়ে পরিশোধ করুন
              </button>
            )}
            {w.status !== "held" ? (
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  setError("");
                  if (!note.trim()) {
                    setError("হোল্ড করতে হলে কারণ লিখুন।");
                    return;
                  }
                  decide.mutate({ decision: "hold", note: note.trim() });
                }}
                className="border-[1.5px] border-amber-400 text-amber-800 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 disabled:opacity-60"
              >
                হোল্ড করুন
              </button>
            ) : (
              <button
                type="button"
                disabled={decide.isPending}
                onClick={() => {
                  setError("");
                  decide.mutate({ decision: "release" });
                }}
                className="border-[1.5px] border-amber-400 text-amber-800 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 disabled:opacity-60"
              >
                হোল্ড ছাড়ুন
              </button>
            )}
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => {
                setError("");
                if (!note.trim()) {
                  setError("বাতিল করতে হলে কারণ লিখুন।");
                  return;
                }
                decide.mutate({ decision: "reject", note: note.trim() });
              }}
              className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60"
            >
              বাতিল করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettlementQueue({ token }: { token: string }) {
  const q = useQuery({ queryKey: ["admin-settlement"], queryFn: () => api.adminListSettlementQueue({ token }) });
  return (
    <section>
      <h2 className="text-lg font-bold text-[#054A2B]">সেটলমেন্ট কিউ</h2>
      <p className="mt-1 text-sm text-[#5C6B76]">
        হেল্ড ব্যালেন্সের তালিকা ও প্রফেশনালদের উইথড্র অনুরোধ। উইথড্রের সিদ্ধান্ত শুধু ফাইন্যান্স অ্যাডমিন (বা সুপার) দিতে
        পারেন; পরিশোধে আসল লেনদেনের রেফারেন্স বাধ্যতামূলক। বিরোধ বা বাতিল হওয়া বুকিংয়ের টাকা স্থগিত — সিদ্ধান্ত না
        হওয়া পর্যন্ত তা ছাড়া হয় না।
      </p>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorBox message={errMsg(q.error)} />
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="font-semibold text-[#054A2B] mb-2">
              হেল্ড ব্যালেন্স — ছাড়ের অপেক্ষায় (মোট {bdt(q.data!.totals.heldAwaitingRelease)})
              {q.data!.totals.frozenDisputedHeld > 0 && (
                <span className="block text-[13px] font-semibold text-red-700">
                  বিরোধের কারণে স্থগিত: {bdt(q.data!.totals.frozenDisputedHeld)} (ছাড়যোগ্য মোটে ধরা হয়নি)
                </span>
              )}
              {q.data!.totals.frozenCancelledHeld > 0 && (
                <span className="block text-[13px] font-semibold text-red-700">
                  বাতিল/প্রত্যাখ্যাত বুকিংয়ে স্থগিত (রিফান্ডের সিদ্ধান্ত বাকি): {bdt(q.data!.totals.frozenCancelledHeld)} (ছাড়যোগ্য মোটে ধরা হয়নি)
                </span>
              )}
            </h3>
            {q.data!.heldBookings.length === 0 ? (
              <EmptyState title="কোনো হেল্ড ব্যালেন্স বাকি নেই" />
            ) : (
              <div className="space-y-2.5">
                {q.data!.heldBookings.map((h) => (
                  <div key={h.bookingId} className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
                    <p className="font-bold">
                      {h.serviceName} — <span className="font-en">{h.code}</span>
                    </p>
                    <p className="text-[13.5px] text-[#5C6B76]">
                      প্রফেশনাল: {h.professionalName ?? "—"} • হেল্ড {bdt(h.heldTotal)} • কমিশন {bdt(h.commissionDue)} •
                      পেআউট হয়েছে {bdt(h.paidOut)}
                    </p>
                    <p className="text-[14px] font-semibold text-[#054A2B]">
                      ছাড়যোগ্য: {bdt(h.remainingHeld)}
                      {h.disputed && <span className="ml-2 text-red-700">• বিরোধ চলমান — সেটেলমেন্ট স্থগিত</span>}
                      {!h.disputed && h.frozen && <span className="ml-2 text-red-700">• বুকিং বাতিল/প্রত্যাখ্যাত — রিফান্ডের সিদ্ধান্ত বাকি, পেআউট হবে না</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-[#054A2B] mb-2">
              উইথড্র অনুরোধ — সিদ্ধান্তের অপেক্ষায় ({q.data!.totals.openWithdrawalCount}টি, মোট{" "}
              {bdt(q.data!.totals.openWithdrawalAmount)})
            </h3>
            {q.data!.withdrawalRequests.length === 0 ? (
              <EmptyState title="কোনো খোলা উইথড্র অনুরোধ নেই" />
            ) : (
              <div className="space-y-2.5">
                {q.data!.withdrawalRequests.map((w) => (
                  <WithdrawalDecisionBox key={w.id} token={token} w={w} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const ADMIN_REFUND_REASON_BN: Record<string, string> = {
  work_not_completed: "কাজ সম্পন্ন হয়নি",
  poor_quality: "কাজের মান খারাপ",
  incorrect_price: "ভুল মূল্য",
  professional_no_show: "প্রফেশনাল আসেনি",
  other: "অন্যান্য",
};

const ADMIN_REFUND_STATUS_BN: Record<string, { label: string; cls: string }> = {
  requested: { label: "সিদ্ধান্তের অপেক্ষায়", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "অনুমোদিত", cls: "bg-sky-100 text-sky-800" },
  rejected: { label: "গৃহীত হয়নি", cls: "bg-red-100 text-red-700" },
  refunded: { label: "রিফান্ড সম্পন্ন", cls: "bg-[#075B35] text-white" },
};

type AdminRefundRequest = ApiResponse<typeof api, "adminListRefundRequests">["requests"][number];

function RefundDecisionBox({ token, r }: { token: string; r: AdminRefundRequest }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const decide = useMutation({
    mutationFn: (v: { decision: "refund" | "reject"; refundAmount?: number; refundReference?: string; note?: string }) =>
      api.adminDecideRefundRequest({ token, requestId: r.id, decision: v.decision, refundAmount: v.refundAmount, refundReference: v.refundReference, note: v.note }),
    onSuccess: (_d, v) => {
      setDone(v.decision === "refund" ? "রিফান্ড রেকর্ড হয়েছে — গ্রাহককে জানানো হয়েছে।" : "অনুরোধ বাতিল হয়েছে — গ্রাহককে কারণ জানানো হয়েছে।");
      setError("");
      qc.invalidateQueries({ queryKey: ["admin-refunds"] });
      qc.invalidateQueries({ queryKey: ["admin-settlement"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const st = ADMIN_REFUND_STATUS_BN[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-700" };
  const open = r.status === "requested";
  return (
    <div className="rounded-2xl border border-[#E1E9E4] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">
          {r.customerName} — বুকিং <span className="font-en">{r.bookingCode}</span>
        </p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        <span className="text-[12.5px] text-[#5C6B76]">{fmtDateTime(r.createdAt)}</span>
      </div>
      <p className="mt-1 text-[13.5px] text-[#5C6B76]">
        কারণ: {ADMIN_REFUND_REASON_BN[r.reason] ?? r.reason} — {r.detail}
      </p>
      <p className="text-[13.5px] text-[#5C6B76]">
        অনলাইন পেমেন্ট: {r.paymentAmount != null ? bdt(r.paymentAmount) : "—"}
        {r.paymentProvider ? ` (${PROVIDER_BN[r.paymentProvider] ?? providerEn(r.paymentProvider)})` : ""}
        {r.paymentStatus ? ` • অবস্থা: ${r.paymentStatus === "verified" ? "যাচাইকৃত" : r.paymentStatus === "refunded" ? "রিফান্ড হয়েছে" : r.paymentStatus}` : ""}
      </p>
      {r.status === "refunded" && r.refundAmount != null && (
        <p className="mt-1 text-[13.5px] font-semibold text-[#054A2B]">
          ফেরত দেওয়া হয়েছে: {bdt(r.refundAmount)}
          {r.refundReference ? (
            <>
              {" "}• রেফারেন্স: <span className="font-en">{r.refundReference}</span>
            </>
          ) : null}
        </p>
      )}
      {r.status === "rejected" && r.adminNote && (
        <p className="mt-1 text-[13px] text-red-700">বাতিলের কারণ: {r.adminNote}</p>
      )}
      {open && !done && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[12.5px] text-[#5C6B76]">
            রিফান্ডের পরিমাণ প্রকাশিত বাতিল নীতি অনুযায়ী প্রতিটি কেসে আপনি ঠিক করবেন — সিস্টেমে কোনো নির্দিষ্ট হার বসানো নেই।
            টাকা সত্যিই ফেরত পাঠিয়ে তার পরিমাণ ও রেফারেন্স লিখলেই কেবল "রিফান্ড সম্পন্ন" হবে।
          </p>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <div>
              <label className={labelCls} htmlFor={`rf-amt-${r.id}`}>রিফান্ডের পরিমাণ (৳)</label>
              <input id={`rf-amt-${r.id}`} type="number" {...FIELDS.adminDecideRefundRequest.refundAmount} className={`${inputCls} font-en`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`rf-ref-${r.id}`}>ফেরত লেনদেনের TrxID / রেফারেন্স</label>
              <input id={`rf-ref-${r.id}`} className={`${inputCls} font-en`} {...FIELDS.adminDecideRefundRequest.refundReference} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="যেমন: 9HX7K2LM1P" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`rf-note-${r.id}`}>নোট / বাতিলের কারণ</label>
              <input id={`rf-note-${r.id}`} className={inputCls} {...FIELDS.adminDecideRefundRequest.note} value={note} onChange={(e) => setNote(e.target.value)} placeholder="বাতিলে কারণ লাগবে" />
            </div>
          </div>
          {error && <ErrorBox message={error} />}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => {
                setError("");
                const amt = Number(amount);
                if (!Number.isInteger(amt) || amt <= 0) {
                  setError("রিফান্ডের সঠিক পরিমাণ লিখুন।");
                  return;
                }
                if (!reference.trim()) {
                  setError("রিফান্ড করতে হলে ফেরত লেনদেনের TrxID / রেফারেন্স লিখুন।");
                  return;
                }
                decide.mutate({ decision: "refund", refundAmount: amt, refundReference: reference.trim(), note: note.trim() || undefined });
              }}
              className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold text-sm px-4 py-2 rounded-xl"
            >
              রিফান্ড সম্পন্ন করুন
            </button>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => {
                setError("");
                if (!note.trim()) {
                  setError("বাতিল করতে হলে কারণ লিখুন।");
                  return;
                }
                decide.mutate({ decision: "reject", note: note.trim() });
              }}
              className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60"
            >
              অনুরোধ বাতিল করুন
            </button>
          </div>
        </div>
      )}
      {done && <p className="mt-2 rounded-lg bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-3 py-2">{done}</p>}
    </div>
  );
}

/** Master Phase 9: refund requests queue for the finance admin. */
function RefundRequestsPanel({ token }: { token: string }) {
  const q = useQuery({ queryKey: ["admin-refunds"], queryFn: () => api.adminListRefundRequests({ token }) });
  const openCount = (q.data?.requests ?? []).filter((r) => r.status === "requested").length;
  return (
    <section>
      <h2 className="text-lg font-bold text-[#054A2B]">রিফান্ড অনুরোধ ({openCount}টি সিদ্ধান্তের অপেক্ষায়)</h2>
      <p className="mt-1 text-sm text-[#5C6B76]">
        গ্রাহকের রিফান্ড অনুরোধে কোনো টাকা নিজে থেকে নড়ে না — আপনি যাচাই করে আসল ফেরত লেনদেন রেকর্ড করলেই রিফান্ড সম্পন্ন হয়।
      </p>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorBox message={errMsg(q.error)} />
      ) : (q.data?.requests.length ?? 0) === 0 ? (
        <div className="mt-3">
          <EmptyState title="কোনো রিফান্ড অনুরোধ নেই" />
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {q.data!.requests.map((r) => (
            <RefundDecisionBox key={r.id} token={token} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function AdminPayments({ token }: { token: string }) {
  const [status, setStatus] = useState("");
  const [openBooking, setOpenBooking] = useState<number | null>(null);
  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.getAdminOverview({ token }), ...MONEY_REFETCH });
  const analytics = useQuery({
    queryKey: ["admin-analytics", "", ""],
    queryFn: () => api.getAdminAnalytics({ token }),
    ...MONEY_REFETCH,
  });
  const list = useQuery({
    queryKey: ["admin-payments", status],
    queryFn: () => api.adminListPayments({ token, status: status || undefined }),
  });
  type AdminPaymentRow = ApiResponse<typeof api, "adminListPayments">["payments"][number];
  const payCtl = useListControls<AdminPaymentRow>(
    list.data?.payments ?? [],
    (p) => `${p.bookingCode} ${p.providerTrxId} ${p.provider} ${providerEn(p.provider)}`,
    {
      new: (a, b) => b.id - a.id,
      old: (a, b) => a.id - b.id,
      amount: (a, b) => b.amount - a.amount,
    },
    "new",
  );
  const d = ov.data;
  const a = analytics.data;
  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#054A2B]">ফাইন্যান্স ড্যাশবোর্ড</h2>
            <p className="mt-1 text-sm text-[#5C6B76]">
              প্রতিটি সংখ্যা সার্ভারের যাচাইকৃত পেমেন্ট ও লেজার এন্ট্রি থেকে হিসাব করা — ক্লায়েন্টে কোনো হিসাব হয় না। কমিশনের এই হিসাব লাইভ লেজারের; প্রফেশনালের আয়ের পেজের স্ন্যাপশট কমিশনের সাথে এটি হুবহু মিলবে না।
            </p>
          </div>
          <FreshnessBar dataUpdatedAt={ov.dataUpdatedAt} isFetching={ov.isFetching || analytics.isFetching} onRefresh={() => { void ov.refetch(); void analytics.refetch(); }} />
        </div>
        {ov.isPending || analytics.isPending ? (
          <Spinner />
        ) : ov.isError ? (
          <ErrorBox message={errMsg(ov.error)} />
        ) : analytics.isError ? (
          <ErrorBox message={errMsg(analytics.error)} />
        ) : d && a ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[#E1E9E4] bg-[#F3F8F4] p-5">
              <h3 className="font-bold text-[#054A2B]">অনলাইন সংগ্রহ</h3>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <MoneyStat label="মোট অনলাইন সংগ্রহ" value={a.onlineCollected} />
                <MoneyStat label="সম্পূর্ণ অনলাইন পেমেন্ট" value={a.onlineFullOnline} />
                <MoneyStat label="আংশিক অনলাইন পেমেন্ট" value={a.onlineSplit} />
              </div>
            </div>
            <div className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
              <h3 className="font-bold text-[#054A2B]">ফি, কমিশন ও রাজস্ব</h3>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                <MoneyStat label="গ্রাহক সার্ভিস ফি সংগৃহীত" value={d.customerFeesCollected} />
                <MoneyStat label="প্রফেশনাল কমিশন অর্জিত (পাওনা)" value={d.commissionEarned} />
                <MoneyStat label="প্রফেশনাল কমিশন সংগৃহীত" value={d.commissionCollected} />
                <MoneyStat label="মিস্ত্রি ডাকোর রাজস্ব (ফি + সংগৃহীত কমিশন)" value={a.revenue} />
              </div>
            </div>
            <div className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
              <h3 className="font-bold text-[#054A2B]">পেআউট ও হেল্ড ব্যালেন্স</h3>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <MoneyStat label="প্রফেশনাল পেআউট সম্পন্ন" value={d.paidOutTotal} />
                <MoneyStat label="পেআউটের অপেক্ষায়" value={d.pendingPayoutAmount} sub={`${d.pendingPayoutCount}টি অনুরোধ`} />
                <MoneyStat label="হেল্ড ব্যালেন্স (সেটলমেন্ট বাকি)" value={d.heldBalanceTotal} />
              </div>
            </div>
            <div className="rounded-2xl border border-[#E1E9E4] bg-white p-5">
              <h3 className="font-bold text-[#054A2B]">রিফান্ড, ব্যর্থ ও অন্যান্য</h3>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                <MoneyStat label="রিফান্ড হয়েছে" value={d.refundedTotal} />
                <MoneyStat label="ব্যর্থ লেনদেন" value={a.failedAmount} sub={`${a.failedCount}টি পেমেন্ট`} />
                <MoneyStat label="যাচাইয়ের অপেক্ষায়" value={d.pendingPaymentAmount} sub={`${d.pendingPayments}টি পেমেন্ট`} />
                <MoneyStat label="ক্যাশ — প্রফেশনালকে সরাসরি" value={d.cashCollected} />
              </div>
              {d.disputedPayments > 0 && (
                <p className="mt-3 text-[13.5px] text-red-700">বিরোধপূর্ণ বুকিং: {d.disputedPayments}টি — সিদ্ধান্ত না হওয়া পর্যন্ত সেগুলোর সেটেলমেন্ট স্থগিত।</p>
              )}
              <p className="mt-3 text-[12.5px] text-[#5C6B76]">
                বর্তমান হার — সম্পূর্ণ অনলাইন: ফি {d.fullOnlineCustomerFeePercent}% / কমিশন {d.fullOnlineProCommissionPercent}% •
                ৫০% অনলাইন + ৫০% নগদ: ফি {d.splitCustomerFeePercent}% / কমিশন {d.splitProCommissionPercent}%। ক্যাশ গ্রাহক সরাসরি প্রফেশনালকে দেন — এটি যাচাইকৃত অনলাইন সংগ্রহ নয়।
              </p>
            </div>
          </div>
        ) : null}
      </section>
      <CommissionRatesCard token={token} />
      <section>
        <h2 className="text-lg font-bold text-[#054A2B]">TrxID যাচাই ও পেমেন্ট ইতিহাস</h2>
        <div className="flex flex-wrap gap-2 mt-3 mb-4" role="group" aria-label="পেমেন্ট স্ট্যাটাস ফিল্টার">
          {(
            [
              ["", "সব"],
              ["pending", "যাচাইয়ের অপেক্ষায়"],
              ["verified", "যাচাইকৃত"],
              ["failed", "ব্যর্থ"],
            ] as [string, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              aria-pressed={status === k}
              className={`px-3.5 py-2 rounded-full text-sm font-semibold ${status === k ? "bg-[#054A2B] text-white" : "bg-white border border-[#E1E9E4] text-[#43534B]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorBox message={errMsg(list.error)} />
        ) : (list.data?.payments.length ?? 0) === 0 ? (
          <EmptyState title="এই ফিল্টারে কোনো পেমেন্ট নেই" />
        ) : (
          <>
            <ListControls
              query={payCtl.query}
              setQuery={payCtl.setQuery}
              sort={payCtl.sort}
              setSort={payCtl.setSort}
              sortOptions={[["new", "নতুন আগে"], ["old", "পুরনো আগে"], ["amount", "বেশি টাকা আগে"]]}
              total={payCtl.total}
              page={payCtl.page}
              pageCount={payCtl.pageCount}
              setPage={payCtl.setPage}
              searchLabel="বুকিং কোড, TrxID বা নাম দিয়ে খুঁজুন"
            />
            {payCtl.pageRows.length === 0 ? (
              <EmptyState title="খোঁজার সাথে মিলে এমন পেমেন্ট নেই" />
            ) : (
              <div className="space-y-4">
                {payCtl.pageRows.map((p) => (
                  <div key={p.id}>
                    <p className="text-[13px] text-[#5C6B76] mb-1.5">
                      বুকিং{" "}
                      <a className="font-en font-semibold text-[#075B35] underline" href={`#/booking/${p.bookingCode}`}>
                        {p.bookingCode}
                      </a>
                    </p>
                    <PaymentVerifyBox token={token} p={p} />
                    <button
                      type="button"
                      onClick={() => setOpenBooking(openBooking === p.bookingId ? null : p.bookingId)}
                      aria-expanded={openBooking === p.bookingId}
                      className="mt-2 bg-[#F3F8F4] text-[#054A2B] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#E4F1E8]"
                    >
                      {openBooking === p.bookingId ? "পেমেন্ট বিবরণ বন্ধ করুন" : "বুকিংয়ের পেমেন্ট বিবরণ"}
                    </button>
                    {openBooking === p.bookingId && (
                      <div className="mt-3 rounded-2xl border border-[#E1E9E4] bg-white p-4">
                        <BookingPaymentDetail token={token} bookingId={p.bookingId} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <RefundRequestsPanel token={token} />
      <SettlementQueue token={token} />
    </div>
  );
}


function AdminSettings({ token }: { token: string }) {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.adminGetSettings({ token }) });
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [payNumber, setPayNumber] = useState("");
  const [payProvider, setPayProvider] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  if (data.data && !loaded) {
    setLoaded(true);
    setPhone(data.data.supportPhone ?? "");
    setWhatsapp(data.data.supportWhatsapp ?? "");
    setEmail(data.data.supportEmail ?? "");
    setAddress(data.data.businessAddress ?? "");
    setHours(data.data.officeHours ?? "");
    setAnnouncement(data.data.announcement ?? "");
    setPayNumber(data.data.paymentReceiveNumber ?? "");
    setPayProvider(data.data.paymentReceiveProvider ?? "");
  }
  const save = useMutation({
    mutationFn: () =>
      api.adminSaveSettings({
        token,
        supportPhone: phone || null,
        supportWhatsapp: whatsapp || null,
        supportEmail: email || null,
        businessAddress: address.trim() || null,
        officeHours: hours.trim() || null,
        announcement: announcement || null,
        paymentReceiveNumber: payNumber.trim() || null,
        paymentReceiveProvider: (payProvider || null) as "bkash" | "nagad" | "rocket" | null,
      }),
    onSuccess: () => {
      setOk(true);
      qc.invalidateQueries({ queryKey: ["catalog"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  if (data.isPending) return <Spinner />;
  return (
    <form
      className="max-w-xl rounded-3xl border border-[#E1E9E4] bg-white p-5 sm:p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setOk(false);
        save.mutate();
      }}
    >
      <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">
        কমিশন ও গ্রাহক ফি-এর হার <strong>পেমেন্ট</strong> ট্যাব থেকে বদলানো যায় — প্রতিটি পেমেন্ট মডেলের (সম্পূর্ণ
        অনলাইন / ৫০% অনলাইন + ৫০% নগদ) আলাদা হার সেখানে দেখানো ও সম্পাদনা করা যায়।
      </p>
      <div>
        <label className={labelCls} htmlFor="st-phone">সাপোর্ট ফোন নম্বর</label>
        <input id="st-phone" className={inputCls} {...FIELDS.adminSaveSettings.supportPhone} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="খালি রাখলে সাইটে দেখানো হবে না" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-wa">WhatsApp নম্বর</label>
        <input id="st-wa" className={inputCls} {...FIELDS.adminSaveSettings.supportWhatsapp} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="দেশের কোডসহ, যেমন 8801XXXXXXXXX" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-email">সাপোর্ট ইমেইল</label>
        <input id="st-email" type="email" className={inputCls} {...FIELDS.adminSaveSettings.supportEmail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="খালি রাখলে সাইটে দেখানো হবে না" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-address">ব্যবসায়িক ঠিকানা (যোগাযোগ পেজ ও ফুটারে দেখানো হবে)</label>
        <input id="st-address" className={inputCls} {...FIELDS.adminSaveSettings.businessAddress} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="খালি রাখলে শুধু এলাকা (টাঙ্গাইল) দেখানো হবে" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-hours">অফিস সময়</label>
        <input id="st-hours" className={inputCls} {...FIELDS.adminSaveSettings.officeHours} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="যেমন: প্রতিদিন সকাল ৯টা – রাত ৯টা (খালি রাখলে দেখানো হবে না)" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-ann">ঘোষণা (সাইটের উপরে দেখানো হবে)</label>
        <input id="st-ann" className={inputCls} {...FIELDS.adminSaveSettings.announcement} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="বিশেষ ঘোষণা থাকলে লিখুন (ঐচ্ছিক)" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-pay-provider">পেমেন্ট গ্রহণের মাধ্যম (ম্যানুয়াল TrxID)</label>
        <select id="st-pay-provider" className={inputCls} value={payProvider} onChange={(e) => setPayProvider(e.target.value)}>
          <option value="">— সেট করা নেই —</option>
          <option value="bkash">বিকাশ</option>
          <option value="nagad">নগদ</option>
          <option value="rocket">রকেট</option>
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="st-pay-number">পেমেন্ট গ্রহণের নম্বর</label>
        <input id="st-pay-number" className={`${inputCls} font-en`} {...FIELDS.adminSaveSettings.paymentReceiveNumber} value={payNumber} onChange={(e) => setPayNumber(e.target.value)} placeholder="খালি রাখলে চেকআউটে নম্বর দেখানো হবে না" />
        <p className="mt-1 text-[13px] text-[#5C6B76]">গ্রাহক এই নম্বরে টাকা পাঠিয়ে চেকআউটে TrxID জমা দেবেন — নম্বরটি চেকআউটে গ্রাহকদের দেখানো হয়।</p>
      </div>
      {error && <ErrorBox message={error} />}
      {ok && <p className="rounded-xl bg-[#F3F8F4] border border-[#C9DFD2] text-[#054A2B] text-sm px-4 py-3">সেটিংস সংরক্ষিত হয়েছে।</p>}
      <button type="submit" disabled={save.isPending} className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
        {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
      <p className="text-[13px] text-[#5C6B76]">দ্রষ্টব্য: অনলাইন পেমেন্ট এখন ম্যানুয়াল TrxID পদ্ধতিতে চলে — গ্রাহক উপরের নম্বরে টাকা পাঠিয়ে TrxID জমা দেন, অ্যাডমিন যাচাই করলেই পেমেন্ট চূড়ান্ত হয়। কোনো পেমেন্ট গেটওয়ে (কার্ড/অটোমেটিক) এখনো যুক্ত হয়নি।</p>
    </form>
  );
}

const ADMIN_LEVEL_OPTIONS: { key: "super" | "operations" | "finance" | "support"; label: string }[] = [
  { key: "super", label: "সুপার অ্যাডমিন" },
  { key: "operations", label: "অপারেশনস অ্যাডমিন" },
  { key: "finance", label: "ফাইন্যান্স অ্যাডমিন" },
  { key: "support", label: "সাপোর্ট অ্যাডমিন" },
];

const ADMIN_LEVEL_BN: Record<string, string> = {
  super: "সুপার অ্যাডমিন",
  operations: "অপারেশনস অ্যাডমিন",
  finance: "ফাইন্যান্স অ্যাডমিন",
  support: "সাপোর্ট অ্যাডমিন",
};

function AdminStaff({ token }: { token: string }) {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["admin-staff"], queryFn: () => api.adminListStaff({ token }) });
  const customers = useQuery({ queryKey: ["admin-customers"], queryFn: () => api.adminListCustomers({ token }) });
  const [pick, setPick] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const setLevel = useMutation({
    mutationFn: (v: { userId: number; level: "super" | "operations" | "finance" | "support" }) =>
      api.adminSetAdminLevel({ token, userId: v.userId, level: v.level }),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (e) => setError(errMsg(e)),
  });
  const levelSelect = (userId: number, current: string, label: string) => (
    <select
      aria-label={label}
      className={`${inputCls} !w-auto`}
      value={pick[userId] ?? current}
      onChange={(e) => setPick((p) => ({ ...p, [userId]: e.target.value }))}
    >
      {ADMIN_LEVEL_OPTIONS.map((l) => (
        <option key={l.key} value={l.key}>
          {l.label}
        </option>
      ))}
    </select>
  );
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-bold text-[#054A2B]">অ্যাডমিন টিম</h2>
        <p className="mt-1 text-sm text-[#5C6B76]">
          প্রতিটি স্তরের অনুমতি সার্ভার থেকে যাচাই করা হয় — ফাইন্যান্স অ্যাডমিন পেমেন্ট যাচাই করতে পারবেন কিন্তু কারো স্তর বদলাতে পারবেন না; সাপোর্ট অ্যাডমিন অভিযোগ সামলাবেন কিন্তু পেআউট অনুমোদন করতে পারবেন না।
        </p>
        {error && (
          <div className="mt-3">
            <ErrorBox message={error} />
          </div>
        )}
        {staff.isPending ? (
          <Spinner />
        ) : (
          <div className="mt-4 space-y-3">
            {(staff.data?.staff ?? []).map((s) => (
              <div key={s.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {s.name}{" "}
                    <span className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full align-middle bg-[#054A2B] text-white">
                      {ADMIN_LEVEL_BN[s.adminLevel] ?? s.adminLevel}
                    </span>
                    {s.status === "suspended" && <span className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full align-middle bg-red-100 text-red-700">স্থগিত</span>}
                  </p>
                  <p className="text-[13.5px] text-[#5C6B76] font-en">{s.phone}</p>
                </div>
                {levelSelect(s.id, s.adminLevel, `${s.name}-এর অ্যাডমিন স্তর`)}
                <button
                  type="button"
                  disabled={setLevel.isPending || (pick[s.id] ?? s.adminLevel) === s.adminLevel}
                  onClick={() => setLevel.mutate({ userId: s.id, level: (pick[s.id] ?? s.adminLevel) as "super" | "operations" | "finance" | "support" })}
                  className="bg-[#075B35] hover:bg-[#054A2B] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl"
                >
                  স্তর সংরক্ষণ করুন
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#054A2B]">গ্রাহককে অ্যাডমিন করুন</h2>
        <p className="mt-1 text-sm text-[#5C6B76]">নিবন্ধিত গ্রাহকদের মধ্য থেকে বেছে নিয়ে নির্দিষ্ট স্তরের অ্যাডমিন দায়িত্ব দিন।</p>
        {customers.isPending ? (
          <Spinner />
        ) : (customers.data?.customers ?? []).length === 0 ? (
          <EmptyState title="কোনো গ্রাহক নেই" body="গ্রাহক নিবন্ধন করলে এখানে দেখা যাবে।" />
        ) : (
          <div className="mt-4 space-y-3">
            {(customers.data?.customers ?? []).map((c) => (
              <div key={c.id} className="rounded-2xl border border-[#E1E9E4] bg-white p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-[13.5px] text-[#5C6B76] font-en">{c.phone}</p>
                </div>
                {levelSelect(c.id, "support", `${c.name}-এর নতুন অ্যাডমিন স্তর`)}
                <button
                  type="button"
                  disabled={setLevel.isPending}
                  onClick={() => setLevel.mutate({ userId: c.id, level: (pick[c.id] ?? "support") as "super" | "operations" | "finance" | "support" })}
                  className="border-[1.5px] border-[#075B35] text-[#075B35] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F3F8F4] disabled:opacity-60"
                >
                  অ্যাডমিন করুন
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AdminLogs({ token }: { token: string }) {
  const [action, setAction] = useState("");
  const [adminId, setAdminId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const staff = useQuery({ queryKey: ["admin-staff"], queryFn: () => api.adminListStaff({ token }) });
  const all = useQuery({ queryKey: ["admin-logs", "all"], queryFn: () => api.adminListLogs({ token, limit: 200 }) });
  const logs = useQuery({
    queryKey: ["admin-logs", action, adminId, from, to],
    queryFn: () =>
      api.adminListLogs({
        token,
        limit: 100,
        action: action || undefined,
        adminId: adminId ? Number(adminId) : undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      }),
  });
  const actionOptions = Array.from(new Set((all.data?.logs ?? []).map((l) => l.action))).sort();
  const rows = logs.data?.logs ?? [];
  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label className={labelCls} htmlFor="log-action">কাজের ধরন</label>
          <select id="log-action" className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">সব ধরন</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="log-admin">অ্যাডমিন</label>
          <select id="log-admin" className={inputCls} value={adminId} onChange={(e) => setAdminId(e.target.value)}>
            <option value="">সব অ্যাডমিন</option>
            {(staff.data?.staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({ADMIN_LEVEL_BN[s.adminLevel] ?? s.adminLevel})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="log-from">শুরুর তারিখ</label>
          <input id="log-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="log-to">শেষের তারিখ</label>
          <input id="log-to" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {logs.isPending ? (
        <Spinner />
      ) : logs.isError ? (
        <ErrorBox message={errMsg(logs.error)} />
      ) : rows.length === 0 ? (
        <EmptyState title="এই ফিল্টারে কোনো লগ নেই" />
      ) : (
        <ul className="divide-y divide-[#EEF3F0] border border-[#E1E9E4] rounded-2xl bg-white overflow-hidden">
          {rows.map((l) => (
            <li key={l.id} className="px-4 py-3 flex flex-wrap items-baseline gap-x-3">
              <span className="font-en text-[13px] font-semibold bg-[#F3F8F4] text-[#054A2B] px-2 py-0.5 rounded">{l.action}</span>
              {l.adminName && <span className="text-[13px] font-semibold text-[#43534B]">{l.adminName}</span>}
              <span className="text-sm text-[#43534B]">{l.detail}</span>
              <span className="ml-auto text-[12.5px] text-[#5C6B76]">{fmtDateTime(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
