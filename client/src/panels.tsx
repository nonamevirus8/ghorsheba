// Customer, Professional and Admin dashboards.

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import {
Avatar,
EmptyState,
ErrorBox,
Icon,
PRO_STATUS_BN,
Spinner,
Stars,
errMsg,
fmtDate,
fmtDateTime,
getToken,
setToken,
useCatalog,
useMe,
type Booking,
type Me,
} from "./lib";
import { BookingStatusChip, PhotoField, inputCls, labelCls } from "./App";

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
            active === t.key ? "bg-[#087A35] text-white" : "bg-[#F0FAF2] text-[#064B27] hover:bg-[#E2F4E7]"
          }`}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span className={`min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold grid place-items-center ${active === t.key ? "bg-white text-[#087A35]" : "bg-[#FF8A00] text-white"}`}>
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
    <div className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
      <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-[#F0FAF2] text-[#087A35] mb-2">{icon}</span>
      <p className="text-[22px] font-bold leading-none text-[#064B27]">{value}</p>
      <p className="mt-1 text-[13px] text-[#737B73]">{label}</p>
    </div>
  );
}

export function BookingCard({ b }: { b: Booking }) {
  return (
    <a
      href={`#/booking/${b.code}`}
      className="block rounded-2xl border border-[#E5EAE5] bg-white p-4 hover:border-[#087A35] hover:shadow-[0_8px_24px_rgba(6,75,39,0.08)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[#202820] truncate">{b.serviceName}</p>
          <p className="text-[13px] text-[#737B73]">
            <span className="font-en">{b.code}</span> • {b.upazila}
          </p>
        </div>
        <BookingStatusChip status={b.status} />
      </div>
      <p className="mt-2 text-sm text-[#4c584c] line-clamp-2">{b.description}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#737B73]">
        <span className="inline-flex items-center gap-1">{Icon.calendar("w-4 h-4")} {fmtDate(b.preferredDate)} • {b.preferredTime}</span>
        <span className="inline-flex items-center gap-1">{Icon.user("w-4 h-4")} {b.professionalName ?? "প্রফেশনাল অ্যাসাইন হয়নি"}</span>
      </p>
      {b.status === "assigned" && b.proResponse === "none" && (
        <p className="mt-2 text-[13px] font-semibold text-[#B45309]">প্রফেশনালের সাড়ার অপেক্ষায়</p>
      )}
      {b.status === "in_progress" && b.proDone && (
        <p className="mt-2 text-[13px] font-semibold text-[#087A35]">কাজ শেষ — নিশ্চিতকরণ বাকি</p>
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
  if (notifs.length === 0) {
    return <EmptyState title="কোনো নোটিফিকেশন নেই" body="বুকিং আপডেট হলে এখানে জানানো হবে।" />;
  }
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => mark.mutate()}
          disabled={mark.isPending}
          className="text-sm font-semibold text-[#087A35] hover:underline disabled:opacity-60"
        >
          সব পড়া হয়েছে হিসেবে চিহ্নিত করুন
        </button>
      </div>
      <ul className="space-y-2.5">
        {notifs.map((n) => (
          <li key={n.id} className={`rounded-2xl border p-4 ${n.isRead ? "border-[#E5EAE5] bg-white" : "border-[#cfe3d3] bg-[#F0FAF2]"}`}>
            <p className="font-semibold text-[15px] flex items-center gap-2">
              <span className="text-[#087A35]">{Icon.bell("w-4 h-4")}</span>
              {n.title}
              {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#FF8A00]" aria-label="অপঠিত" />}
            </p>
            {n.body && <p className="mt-1 text-sm text-[#4c584c]">{n.body}</p>}
            <p className="mt-1 text-[12.5px] text-[#737B73]">{fmtDateTime(n.createdAt)}</p>
          </li>
        ))}
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
          action={<a href="#/login" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">লগইন করুন</a>}
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
  const tab = ["bookings", "notifications", "support", "profile"].includes(tabRaw) ? tabRaw : "bookings";
  const bookings = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => api.getMyBookings({ token }),
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
        <EmptyState title="আপনি প্রফেশনাল হিসেবে লগইন করেছেন" body="আপনার কাজের ড্যাশবোর্ড প্রফেশনাল প্যানেলে।" action={<a href="#/pro-dashboard" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">প্রফেশনাল ড্যাশবোর্ড</a>} />
      </div>
    );
  }
  if (user.role === "admin") {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState title="আপনি অ্যাডমিন হিসেবে লগইন করেছেন" body="অ্যাডমিন প্যানেল থেকে পুরো প্ল্যাটফর্ম পরিচালনা করুন।" action={<a href="#/admin" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">অ্যাডমিন প্যানেল</a>} />
      </div>
    );
  }
  const list = bookings.data?.bookings ?? [];
  const active = list.filter((b) => ["pending", "confirmed", "assigned", "in_progress"].includes(b.status));
  const tabs = [
    { key: "bookings", label: "আমার বুকিং", badge: active.length },
    { key: "notifications", label: "নোটিফিকেশন", badge: me.data?.unreadNotifications },
    { key: "support", label: "সাপোর্ট / অভিযোগ" },
    { key: "profile", label: "প্রোফাইল" },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3.5 mb-6">
        <Avatar name={user.name} photoUrl={user.photoUrl} size="w-13 h-13" />
        <div>
          <h1 className="text-[24px] font-bold text-[#064B27] leading-tight">স্বাগতম, {user.name}</h1>
          <p className="text-sm text-[#737B73] font-en">{user.phone}</p>
        </div>
        <a href="#/services" className="ml-auto hidden sm:inline-flex bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold px-4 py-2.5 rounded-xl">
          + নতুন বুকিং
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="মোট বুকিং" value={list.length} icon={Icon.briefcase("w-5 h-5")} />
        <StatCard label="চলমান বুকিং" value={active.length} icon={Icon.clock("w-5 h-5")} />
        <StatCard label="সম্পন্ন কাজ" value={list.filter((b) => b.status === "completed").length} icon={Icon.checkCircle("w-5 h-5")} />
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
              action={<a href="#/services" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">সার্ভিস দেখুন</a>}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-3.5">
              {list.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </div>
          ))}
        {tab === "notifications" &&
          (notifs.isPending ? <Spinner /> : <NotificationsList notifs={notifs.data?.notifications ?? []} token={token} />)}
        {tab === "support" && <SupportTab token={token} />}
        {tab === "profile" && <CustomerProfileTab me={me.data!} token={token} />}
      </div>
    </div>
  );
}

function SupportTab({ token }: { token: string }) {
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
        className="rounded-3xl border border-[#E5EAE5] bg-white p-5 sm:p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setOk(false);
          submit.mutate();
        }}
      >
        <h2 className="font-bold text-[#064B27]">অভিযোগ / অনুরোধ পাঠান</h2>
        <div>
          <label className={labelCls} htmlFor="cp-subject">বিষয় *</label>
          <input id="cp-subject" className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="যেমন: বুকিং নিয়ে সমস্যা" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cp-code">বুকিং কোড (যদি থাকে)</label>
          <input id="cp-code" className={inputCls} value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} placeholder="GS-XXXXXX-XX" />
        </div>
        <div>
          <label className={labelCls} htmlFor="cp-msg">বিস্তারিত *</label>
          <textarea id="cp-msg" className={inputCls} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="আপনার সমস্যাটি বিস্তারিত লিখুন" />
        </div>
        {error && <ErrorBox message={error} />}
        {ok && <p className="rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-3">আপনার বার্তা পৌঁছেছে — আমাদের টিম দেখে ব্যবস্থা নেবে।</p>}
        <button type="submit" disabled={submit.isPending} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
          {submit.isPending ? "পাঠানো হচ্ছে…" : "পাঠান"}
        </button>
      </form>
      <div>
        <h2 className="font-bold text-[#064B27] mb-3">আমার আগের অভিযোগসমূহ</h2>
        {mine.isPending ? (
          <Spinner />
        ) : (mine.data?.complaints.length ?? 0) === 0 ? (
          <EmptyState title="কোনো অভিযোগ নেই" />
        ) : (
          <ul className="space-y-3">
            {mine.data?.complaints.map((c) => (
              <li key={c.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{c.subject}</p>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.status === "resolved" ? "bg-[#087A35] text-white" : "bg-amber-100 text-amber-800"}`}>
                    {c.status === "resolved" ? "সমাধান হয়েছে" : "খোলা আছে"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#4c584c]">{c.message}</p>
                {c.adminNote && <p className="mt-2 text-sm bg-[#F0FAF2] rounded-lg px-3 py-2">অ্যাডমিনের জবাব: {c.adminNote}</p>}
                <p className="mt-1.5 text-[12.5px] text-[#737B73]">{fmtDateTime(c.createdAt)}</p>
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
    <form
      className="max-w-xl rounded-3xl border border-[#E5EAE5] bg-white p-5 sm:p-6 space-y-4"
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
          <p className="text-sm text-[#737B73] font-en">{me.user.phone}</p>
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="pf-name">নাম</label>
        <input id="pf-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
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
        <input id="pf-addr" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
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
      {ok && <p className="rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-3">প্রোফাইল সংরক্ষিত হয়েছে।</p>}
      <button type="submit" disabled={save.isPending} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
        {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
    </form>
  );
}

// ----------------------------------------------------- Professional panel

export function ProDashboard({ params }: { params: URLSearchParams }) {
  const token = getToken() ?? "";
  const me = useMe();
  const tabRaw = params.get("tab") ?? "jobs";
  const tab = ["jobs", "profile", "notifications"].includes(tabRaw) ? tabRaw : "jobs";
  const [filter, setFilter] = useState("active");
  const jobs = useQuery({
    queryKey: ["pro-jobs"],
    queryFn: () => api.getProJobs({ token }),
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
        <EmptyState title="আপনি গ্রাহক হিসেবে লগইন করেছেন" action={<a href="#/dashboard" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">গ্রাহক ড্যাশবোর্ড</a>} />
      </div>
    );
  }
  if (!pro) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="প্রফেশনাল প্রোফাইল পাওয়া যায়নি"
          body="প্রফেশনাল হিসেবে কাজ করতে আবেদন করুন।"
          action={<a href="#/join" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">আবেদন করুন</a>}
        />
      </div>
    );
  }
  const list = jobs.data?.bookings ?? [];
  const newReq = list.filter((b) => b.status === "assigned" && b.proResponse === "none");
  const completed = list.filter((b) => b.status === "completed");
  const earnings = completed
    .filter((b) => b.paymentStatus === "cash_paid" && b.finalPrice != null)
    .reduce((a, b) => a + (b.finalPrice ?? 0), 0);
  const filtered =
    filter === "active"
      ? list.filter((b) => ["assigned", "in_progress"].includes(b.status))
      : filter === "new"
        ? newReq
        : filter === "completed"
          ? completed
          : list.filter((b) => b.status === "cancelled");
  const tabs = [
    { key: "jobs", label: "আমার কাজ", badge: newReq.length },
    { key: "profile", label: "প্রোফাইল সম্পাদনা" },
    { key: "notifications", label: "নোটিফিকেশন", badge: me.data?.unreadNotifications },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3.5 mb-5">
        <Avatar name={user.name} photoUrl={user.photoUrl} size="w-13 h-13" />
        <div>
          <h1 className="text-[24px] font-bold text-[#064B27] leading-tight">{user.name}</h1>
          <p className="text-sm text-[#737B73]">
            {pro.categoryName} • {pro.experienceYears} বছরের অভিজ্ঞতা
          </p>
        </div>
        <span className={`ml-auto text-xs font-bold px-3 py-1.5 rounded-full ${pro.status === "verified" ? "bg-[#087A35] text-white" : pro.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
          {PRO_STATUS_BN[pro.status]}
        </span>
      </div>

      {pro.status === "pending" && (
        <div className="mb-5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5 text-[15px] text-amber-900">
          আপনার আবেদনটি <b>যাচাইয়ের অপেক্ষায়</b> আছে। অ্যাডমিন যাচাই সম্পন্ন করলে আপনার প্রোফাইল গ্রাহকদের কাছে প্রকাশিত হবে এবং আপনি কাজ পেতে শুরু করবেন।
        </div>
      )}
      {pro.status === "rejected" && (
        <div className="mb-5 rounded-2xl bg-red-50 border border-red-200 px-4 py-3.5 text-[15px] text-red-800">
          দুঃখিত, আপনার আবেদনটি গৃহীত হয়নি। তথ্যে কোনো ভুল থাকলে প্রোফাইল সম্পাদনা করে আবার যাচাইয়ের জন্য অপেক্ষা করুন, অথবা সাপোর্টে যোগাযোগ করুন।
        </div>
      )}
      {pro.status === "suspended" && (
        <div className="mb-5 rounded-2xl bg-red-50 border border-red-200 px-4 py-3.5 text-[15px] text-red-800">
          আপনার প্রোফাইল সাময়িকভাবে স্থগিত আছে। বিস্তারিত জানতে অ্যাডমিনের সাথে যোগাযোগ করুন।
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
          label="রেকর্ডকৃত আয় (পরিশোধিত কাজ)"
          value={earnings > 0 ? `৳${earnings.toLocaleString("bn-BD")}` : "—"}
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
                  ["active", "সক্রিয় কাজ"],
                  ["new", `নতুন অনুরোধ (${newReq.length})`],
                  ["completed", "সম্পন্ন"],
                  ["cancelled", "বাতিল"],
                ] as [string, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold ${filter === k ? "bg-[#064B27] text-white" : "bg-white border border-[#E5EAE5] text-[#4c584c]"}`}
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
            <p className="mt-4 text-sm text-[#737B73]">কাজ গ্রহণ/শুরু/শেষ করতে বুকিং কার্ডে চাপ দিয়ে বিবরণ পেজে যান।</p>
          </div>
        )}
        {tab === "profile" && <ProProfileTab me={me.data!} token={token} />}
        {tab === "notifications" &&
          (notifs.isPending ? <Spinner /> : <NotificationsList notifs={notifs.data?.notifications ?? []} token={token} />)}
      </div>
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
              className="border border-[#E5EAE5] font-semibold text-[13px] px-3 py-1.5 rounded-lg hover:bg-[#F0FAF2] disabled:opacity-60"
            >
              {busy === kind ? "লোড হচ্ছে…" : label}
            </button>
          ) : (
            <span key={kind} className="text-[13px] text-[#737B73] border border-dashed border-[#E5EAE5] px-3 py-1.5 rounded-lg">
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
            className="max-h-72 w-auto rounded-xl border border-[#E5EAE5] object-contain"
          />
          <div>
            <button type="button" onClick={() => setView(null)} className="mt-2 text-[13px] font-semibold text-[#087A35] hover:underline">
              ছবি বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      className="max-w-2xl rounded-3xl border border-[#E5EAE5] bg-white p-5 sm:p-6 grid sm:grid-cols-2 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setOk(false);
        if (areas.length === 0) return setError("কমপক্ষে একটি সেবার এলাকা বেছে নিন।");
        save.mutate();
      }}
    >
      <div>
        <label className={labelCls} htmlFor="pp-name">নাম</label>
        <input id="pp-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls} htmlFor="pp-exp">অভিজ্ঞতা (বছর)</label>
        <input id="pp-exp" type="number" min={0} max={60} className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value)} required />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="pp-skills">দক্ষতা ও বিশেষত্ব</label>
        <input id="pp-skills" className={inputCls} value={skills} onChange={(e) => setSkills(e.target.value)} />
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
                className={`px-3.5 py-2 rounded-full text-sm font-medium border ${on ? "bg-[#087A35] text-white border-[#087A35]" : "bg-white text-[#4c584c] border-[#E5EAE5]"}`}
              >
                {l.nameBn}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="pp-addr">ঠিকানা</label>
        <input id="pp-addr" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="pp-bio">পরিচিতি</label>
        <textarea id="pp-bio" className={inputCls} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl bg-[#F0FAF2] px-4 py-3 cursor-pointer">
        <span className="font-semibold text-[15px]">এখন কাজ নেওয়ার জন্য উপলব্ধ</span>
        <input
          type="checkbox"
          className="w-5 h-5 accent-[#087A35]"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
          aria-label="উপলব্ধতা"
        />
      </label>
      <div className="sm:col-span-2">
        <span className={labelCls}>আমার পরিচয় ডকুমেন্ট</span>
        <IdentityDocViewer token={token} professionalId={pro.id} />
        <p className="mt-1 text-[13px] text-[#737B73]">এই ডকুমেন্টগুলো শুধু আপনি ও অ্যাডমিন দেখতে পারবেন — কোনো পাবলিক লিংক নেই।</p>
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
      {ok && <p className="sm:col-span-2 rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-3">প্রোফাইল সংরক্ষিত হয়েছে।</p>}
      <button type="submit" disabled={save.isPending} className="sm:col-span-2 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
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
  const tabRaw = params.get("tab") ?? "overview";
  const tab = ["overview", "bookings", "professionals", "customers", "services", "locations", "reviews", "complaints", "settings", "staff", "logs"].includes(tabRaw)
    ? tabRaw
    : "overview";
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.getAdminOverview({ token }),
    enabled: !!token && me.data?.user.role === "admin",
  });
  const gate = GateMessage({ query: me });
  if (gate) return gate;
  if (me.data!.user.role !== "admin") {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="অনুমতি নেই"
          body="অ্যাডমিন প্যানেল শুধুমাত্র প্ল্যাটফর্ম অ্যাডমিনের জন্য। এই পেজের সব ডেটা সার্ভার থেকেও সুরক্ষিত — অন্য কোনো ভূমিকা দিয়ে এখানকার তথ্য পাওয়া যাবে না।"
          action={<a href="#/" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">হোমে ফিরুন</a>}
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
  const tabs: { key: string; label: string; badge?: number }[] = [
    { key: "overview", label: "ওভারভিউ" },
    ...(canOps
      ? [
          { key: "bookings", label: "বুকিং", badge: ov?.pendingBookings },
          { key: "professionals", label: "প্রফেশনাল", badge: ov?.pendingVerifications },
          { key: "customers", label: "গ্রাহক" },
          { key: "services", label: "সার্ভিস" },
          { key: "locations", label: "এলাকা" },
        ]
      : []),
    ...(canOps || canSupport ? [{ key: "reviews", label: "রিভিউ", badge: ov?.pendingReviews }] : []),
    ...(canSupport ? [{ key: "complaints", label: "অভিযোগ", badge: ov?.openComplaints }] : []),
    ...(canFinance ? [{ key: "settings", label: "সেটিংস" }] : []),
    ...(level === "super"
      ? [
          { key: "staff", label: "অ্যাডমিন টিম" },
          { key: "logs", label: "কার্যকলাপ লগ" },
        ]
      : []),
  ];
  const shownTab = tabs.some((t) => t.key === tab) ? tab : "overview";
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="grid place-items-center w-11 h-11 rounded-2xl bg-[#064B27] text-white">{Icon.settings("w-5 h-5")}</span>
        <div>
          <h1 className="text-[24px] font-bold text-[#064B27] leading-tight">অ্যাডমিন প্যানেল</h1>
          <p className="text-sm text-[#737B73]">{me.data!.user.name} • {ADMIN_LEVEL_BN[level] ?? "অ্যাডমিন"}</p>
        </div>
      </div>
      <TabsBar tabs={tabs} active={shownTab} href={(k) => `#/admin?tab=${k}`} />
      <div className="mt-6">
        {shownTab === "overview" && <AdminOverview token={token} />}
        {shownTab === "overview" && level === "super" && <FullBackupCard token={token} />}
        {shownTab === "bookings" && <AdminBookings token={token} />}
        {shownTab === "professionals" && <AdminProfessionals token={token} />}
        {shownTab === "customers" && <AdminCustomers token={token} />}
        {shownTab === "services" && <AdminServices token={token} />}
        {shownTab === "locations" && <AdminLocations token={token} />}
        {shownTab === "reviews" && <AdminReviews token={token} />}
        {shownTab === "complaints" && <AdminComplaints token={token} />}
        {shownTab === "settings" && <AdminSettings token={token} />}
        {shownTab === "staff" && <AdminStaff token={token} />}
        {shownTab === "logs" && <AdminLogs token={token} />}
      </div>
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
    <div className="mt-6 rounded-2xl border border-[#E5EAE5] bg-white p-5">
      <h2 className="font-bold text-[#064B27]">ডাটাবেস ব্যাকআপ</h2>
      <p className="mt-1 text-sm text-[#737B73]">
        পুরো ডাটাবেসের একটি সম্পূর্ণ ব্যাকআপ (সব টেবিল ও সব রো) gzip-compressed JSON ফাইল হিসেবে ডাউনলোড করুন। লগইন সেশন টোকেন ব্যাকআপে থাকে না। শুধুমাত্র সুপার অ্যাডমিন এই ডাউনলোড করতে পারবেন।
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl"
      >
        {Icon.download("w-4 h-4")}
        {busy ? "ব্যাকআপ তৈরি হচ্ছে…" : "Full backup download"}
      </button>
      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      {done && <p className="mt-3 rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-2.5">{done}</p>}
    </div>
  );
}

function AdminOverview({ token }: { token: string }) {
  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.getAdminOverview({ token }) });
  const recent = useQuery({ queryKey: ["admin-bookings", "pending"], queryFn: () => api.adminListBookings({ token, status: "pending" }) });
  if (ov.isPending) return <Spinner />;
  if (ov.isError) return <ErrorBox message={errMsg(ov.error)} />;
  const d = ov.data!;
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="মোট গ্রাহক" value={d.totalCustomers} icon={Icon.users("w-5 h-5")} />
        <StatCard label="মোট প্রফেশনাল" value={d.totalProfessionals} icon={Icon.briefcase("w-5 h-5")} />
        <StatCard label="যাচাইয়ের অপেক্ষায়" value={d.pendingVerifications} icon={Icon.badgeCheck("w-5 h-5")} />
        <StatCard label="মোট বুকিং" value={d.totalBookings} icon={Icon.calendar("w-5 h-5")} />
        <StatCard label="অপেক্ষমাণ বুকিং" value={d.pendingBookings} icon={Icon.clock("w-5 h-5")} />
        <StatCard label="সম্পন্ন বুকিং" value={d.completedBookings} icon={Icon.checkCircle("w-5 h-5")} />
        <StatCard label="বাতিল বুকিং" value={d.cancelledBookings} icon={Icon.x("w-5 h-5")} />
        <StatCard label="খোলা অভিযোগ" value={d.openComplaints} icon={Icon.message("w-5 h-5")} />
      </div>
      <div className="mt-4 rounded-2xl border border-[#E5EAE5] bg-[#F0FAF2] p-5 flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <p className="text-[22px] font-bold text-[#064B27]">৳{d.recordedRevenue.toLocaleString("bn-BD")}</p>
          <p className="text-[13px] text-[#737B73]">রেকর্ডকৃত আয় (সম্পন্ন ও ক্যাশে পরিশোধিত বুকিং থেকে)</p>
        </div>
        <div>
          <p className="text-[22px] font-bold text-[#064B27]">৳{d.estimatedCommission.toLocaleString("bn-BD")}</p>
          <p className="text-[13px] text-[#737B73]">আনুমানিক কমিশন ({d.commissionPercent}%)</p>
        </div>
      </div>
      <h2 className="font-bold text-[#064B27] mt-7 mb-3">নতুন অপেক্ষমাণ বুকিং</h2>
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

function AdminBookings({ token }: { token: string }) {
  const [status, setStatus] = useState("");
  const list = useQuery({
    queryKey: ["admin-bookings", status],
    queryFn: () => api.adminListBookings({ token, status: status || undefined }),
  });
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="স্ট্যাটাস ফিল্টার">
        {(
          [
            ["", "সব"],
            ["pending", "অপেক্ষমাণ"],
            ["confirmed", "নিশ্চিত"],
            ["assigned", "অ্যাসাইনড"],
            ["in_progress", "চলমান"],
            ["completed", "সম্পন্ন"],
            ["cancelled", "বাতিল"],
          ] as [string, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k)}
            aria-pressed={status === k}
            className={`px-3.5 py-2 rounded-full text-sm font-semibold ${status === k ? "bg-[#064B27] text-white" : "bg-white border border-[#E5EAE5] text-[#4c584c]"}`}
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
        <div className="space-y-3.5">
          {list.data?.bookings.map((b) => <AdminBookingCard key={b.id} b={b} token={token} />)}
        </div>
      )}
    </div>
  );
}

function AdminBookingCard({ b, token }: { b: Booking; token: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(b.status);
  const [proId, setProId] = useState<string>(b.professionalId ? String(b.professionalId) : "");
  const [price, setPrice] = useState(b.finalPrice != null ? String(b.finalPrice) : "");
  const [payment, setPayment] = useState(b.paymentStatus);
  const [note, setNote] = useState("");
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
        status: status as "pending" | "confirmed" | "assigned" | "in_progress" | "completed" | "cancelled",
        professionalId: proId === "" ? null : Number(proId),
        finalPrice: price === "" ? null : Number(price),
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
    <div className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">
            {b.serviceName} — {b.customerName}
          </p>
          <p className="text-[13px] text-[#737B73]">
            <span className="font-en">{b.code}</span> • {b.upazila} • {fmtDate(b.preferredDate)} • {b.preferredTime}
          </p>
          <p className="text-[13px] text-[#737B73] font-en">{b.phone}</p>
        </div>
        <BookingStatusChip status={b.status} />
      </div>
      <p className="mt-2 text-sm text-[#4c584c] line-clamp-2">{b.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            // Re-sync the form from the latest booking data every time it is
            // opened, so a refetch never leaves stale values in the fields.
            if (!open) {
              setStatus(b.status);
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
          className="bg-[#F0FAF2] text-[#064B27] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#E2F4E7]"
        >
          {open ? "বন্ধ করুন" : "পরিচালনা করুন"}
        </button>
        <a href={`#/booking/${b.code}`} className="border border-[#E5EAE5] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F8FAF8]">
          বিস্তারিত দেখুন
        </a>
      </div>
      {open && (
        <form
          className="mt-4 border-t border-[#F0F3F0] pt-4 grid sm:grid-cols-2 gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setSaved(false);
            save.mutate();
          }}
        >
          <div>
            <label className={labelCls} htmlFor={`ab-status-${b.id}`}>স্ট্যাটাস</label>
            <select id={`ab-status-${b.id}`} className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">অপেক্ষমাণ</option>
              <option value="confirmed">নিশ্চিত</option>
              <option value="assigned">প্রফেশনাল দেওয়া হয়েছে</option>
              <option value="in_progress">কাজ চলছে</option>
              <option value="completed">সম্পন্ন</option>
              <option value="cancelled">বাতিল</option>
            </select>
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
                if (v !== "" && (status === "pending" || status === "confirmed")) setStatus("assigned");
              }}
            >
              <option value="">— কেউ না —</option>
              {(pros.data?.professionals ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.completedJobs}টি কাজ) — {p.areas.slice(0, 2).join(", ")}
                </option>
              ))}
            </select>
            {pros.isPending && <p className="text-xs text-[#737B73] mt-1">প্রফেশনাল লোড হচ্ছে…</p>}
            {pros.data && pros.data.professionals.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">এই ক্যাটাগরিতে কোনো যাচাইকৃত প্রফেশনাল নেই।</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor={`ab-price-${b.id}`}>চূড়ান্ত মূল্য (৳)</label>
            <input id={`ab-price-${b.id}`} type="number" min={0} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="কোটেশনের পর লিখুন" />
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
            <input id={`ab-note-${b.id}`} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="স্ট্যাটাস বদলের কারণ বা মন্তব্য (ঐচ্ছিক)" />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <ErrorBox message={error} />
            </div>
          )}
          {saved && <p className="sm:col-span-2 rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-2.5">সংরক্ষিত হয়েছে — গ্রাহক নোটিফিকেশন পেয়েছেন।</p>}
          <button type="submit" disabled={save.isPending} className="sm:col-span-2 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold py-2.5 rounded-xl">
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "পরিবর্তন সংরক্ষণ করুন"}
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
    mutationFn: (v: { id: number; status: "verified" | "rejected" | "suspended" | "pending" }) =>
      api.adminSetProStatus({ token, professionalId: v.id, status: v.status }),
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
            className={`px-3.5 py-2 rounded-full text-sm font-semibold ${filter === k ? "bg-[#064B27] text-white" : "bg-white border border-[#E5EAE5] text-[#4c584c]"}`}
          >
            {label} ({k ? all.filter((p) => p.status === k).length : all.length})
          </button>
        ))}
      </div>
      {list.isPending ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState title="কোনো প্রফেশনাল আবেদন নেই" body="নতুন আবেদন এলে এখানে দেখা যাবে এবং নোটিফিকেশন পাবেন।" />
      ) : (
        <div className="space-y-3.5">
          {shown.map((p) => (
            <AdminProCard
              key={p.id}
              p={p}
              token={token}
              onStatus={(s) => setStatus.mutate({ id: p.id, status: s })}
              onUserStatus={(s) => setUserStatus.mutate({ userId: p.userId, status: s })}
              busy={setStatus.isPending || setUserStatus.isPending}
            />
          ))}
        </div>
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
  onStatus: (s: "verified" | "rejected" | "suspended" | "pending") => void;
  onUserStatus: (s: "active" | "suspended") => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
      <div className="flex items-start gap-3.5">
        <Avatar name={p.name} photoUrl={p.photoUrl} size="w-14 h-14" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {p.name}{" "}
            <span className={`ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full align-middle ${p.status === "verified" ? "bg-[#087A35] text-white" : p.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
              {PRO_STATUS_BN[p.status]}
            </span>
          </p>
          <p className="text-[13.5px] text-[#737B73]">
            {p.categoryName} • {p.experienceYears} বছর অভিজ্ঞতা • <span className="font-en">{p.phone}</span>
            {p.email ? <span className="font-en"> • {p.email}</span> : ""}
          </p>
          <p className="text-[13.5px] text-[#737B73]">এলাকা: {p.areas.join(", ") || "—"}</p>
          {p.skills && <p className="text-[13.5px] text-[#4c584c]">দক্ষতা: {p.skills}</p>}
          {p.nidNumber && (
            <p className="text-[13.5px] text-[#4c584c]">
              NID (শুধু যাচাইয়ের জন্য): <span className="font-en font-semibold">{p.nidNumber}</span>
            </p>
          )}
          <IdentityDocViewer token={token} professionalId={p.id} documents={p.documents} />
          <p className="text-[13.5px] text-[#737B73]">
            সম্পন্ন কাজ: {p.completedJobs} • রেটিং: {p.avgRating != null ? `${p.avgRating} (${p.reviewCount}টি রিভিউ)` : "এখনো নেই"}
            {p.userStatus === "suspended" ? " • অ্যাকাউন্ট স্থগিত" : ""}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {p.status !== "verified" && (
          <button type="button" disabled={busy} onClick={() => onStatus("verified")} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl">
            যাচাই করে অনুমোদন দিন
          </button>
        )}
        {p.status === "pending" && (
          <button type="button" disabled={busy} onClick={() => onStatus("rejected")} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
            আবেদন বাতিল করুন
          </button>
        )}
        {p.status === "verified" && (
          <button type="button" disabled={busy} onClick={() => onStatus("suspended")} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
            প্রোফাইল স্থগিত করুন
          </button>
        )}
        {(p.status === "suspended" || p.status === "rejected") && (
          <button type="button" disabled={busy} onClick={() => onStatus("pending")} className="border-[1.5px] border-[#087A35] text-[#087A35] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F0FAF2] disabled:opacity-60">
            আবার যাচাইয়ের অপেক্ষায় রাখুন
          </button>
        )}
        {p.userStatus === "active" ? (
          <button type="button" disabled={busy} onClick={() => onUserStatus("suspended")} className="border border-[#E5EAE5] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 hover:text-red-700 disabled:opacity-60">
            অ্যাকাউন্ট স্থগিত
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => onUserStatus("active")} className="border border-[#E5EAE5] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F0FAF2] disabled:opacity-60">
            অ্যাকাউন্ট সক্রিয় করুন
          </button>
        )}
        <a href={`tel:${p.phone}`} className="border border-[#E5EAE5] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F0FAF2] inline-flex items-center gap-1.5">
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
  if (list.isPending) return <Spinner />;
  const rows = list.data?.customers ?? [];
  if (rows.length === 0) return <EmptyState title="এখনো কোনো গ্রাহক নিবন্ধন করেননি" />;
  return (
    <div className="grid md:grid-cols-2 gap-3.5">
      {rows.map((c) => (
        <div key={c.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4 flex items-start gap-3.5">
          <Avatar name={c.name} photoUrl={c.photoUrl} size="w-12 h-12" textSize="text-base" />
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">
              {c.name}
              {c.status === "suspended" && <span className="ml-2 text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full align-middle">স্থগিত</span>}
            </p>
            <p className="text-[13.5px] text-[#737B73]">
              <span className="font-en">{c.phone}</span> • {c.location ?? "টাঙ্গাইল"}
            </p>
            <p className="text-[13.5px] text-[#737B73]">বুকিং: {c.bookingCount} • অভিযোগ: {c.complaintCount} • যোগ দিয়েছেন {fmtDate(c.createdAt)}</p>
            <div className="mt-2.5 flex gap-2">
              {c.status === "active" ? (
                <button type="button" disabled={setUserStatus.isPending} onClick={() => setUserStatus.mutate({ userId: c.id, status: "suspended" })} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-[13px] px-3.5 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-60">
                  স্থগিত করুন
                </button>
              ) : (
                <button type="button" disabled={setUserStatus.isPending} onClick={() => setUserStatus.mutate({ userId: c.id, status: "active" })} className="border-[1.5px] border-[#087A35] text-[#087A35] font-semibold text-[13px] px-3.5 py-1.5 rounded-lg hover:bg-[#F0FAF2] disabled:opacity-60">
                  সক্রিয় করুন
                </button>
              )}
              <a href={`tel:${c.phone}`} className="border border-[#E5EAE5] font-semibold text-[13px] px-3.5 py-1.5 rounded-lg hover:bg-[#F0FAF2] inline-flex items-center gap-1">
                {Icon.phone("w-3.5 h-3.5")} কল
              </a>
            </div>
          </div>
        </div>
      ))}
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
        <button type="button" onClick={() => setAdding((v) => !v)} className="bg-[#087A35] hover:bg-[#064B27] text-white font-semibold text-sm px-4 py-2.5 rounded-xl">
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
          <div key={s.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">
                  {s.nameBn} <span className="text-[#737B73] font-en font-medium text-sm">{s.nameEn}</span>
                  {!s.active && <span className="ml-2 text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full align-middle">বন্ধ আছে</span>}
                </p>
                <p className="text-[13.5px] text-[#737B73] mt-0.5">
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
                className="shrink-0 bg-[#F0FAF2] text-[#064B27] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#E2F4E7]"
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
      className="rounded-2xl border border-[#cfe3d3] bg-[#FBFDFB] p-4 grid sm:grid-cols-3 gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        save.mutate();
      }}
    >
      <div>
        <label className={labelCls} htmlFor={`sf-bn-${service?.id ?? "new"}`}>নাম (বাংলা) *</label>
        <input id={`sf-bn-${service?.id ?? "new"}`} className={inputCls} value={nameBn} onChange={(e) => setNameBn(e.target.value)} required />
      </div>
      <div>
        <label className={labelCls} htmlFor={`sf-en-${service?.id ?? "new"}`}>নাম (English) *</label>
        <input id={`sf-en-${service?.id ?? "new"}`} className={inputCls} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
      </div>
      {!service && (
        <div>
          <label className={labelCls} htmlFor="sf-slug">Slug (URL) *</label>
          <input id="sf-slug" className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="e.g. solar-installer" />
        </div>
      )}
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`sf-tag-${service?.id ?? "new"}`}>ট্যাগলাইন</label>
        <input id={`sf-tag-${service?.id ?? "new"}`} className={inputCls} value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`sf-desc-${service?.id ?? "new"}`}>বিবরণ</label>
        <textarea id={`sf-desc-${service?.id ?? "new"}`} className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {(
        [
          ["শুরুর মূল্য (৳)", starting, setStarting],
          ["ঘণ্টা প্রতি (৳)", hourly, setHourly],
          ["দিন প্রতি (৳)", daily, setDaily],
          ["একক প্রতি (৳)", unit, setUnit],
          ["পরিদর্শন ফি (৳)", inspection, setInspection],
        ] as [string, string, (v: string) => void][]
      ).map(([label, v, set]) => (
        <div key={label}>
          <label className={labelCls}>{label}</label>
          <input type="number" min={0} className={inputCls} value={v} onChange={(e) => set(e.target.value)} placeholder="খালি = অনির্ধারিত" aria-label={label} />
        </div>
      ))}
      <div>
        <label className={labelCls} htmlFor={`sf-unit-${service?.id ?? "new"}`}>এককের নাম</label>
        <input id={`sf-unit-${service?.id ?? "new"}`} className={inputCls} value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="যেমন: বর্গফুট, রুম" />
      </div>
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`sf-note-${service?.id ?? "new"}`}>মূল্য নোট</label>
        <input id={`sf-note-${service?.id ?? "new"}`} className={inputCls} value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="মূল্য সংক্রান্ত বিশেষ শর্ত থাকলে" />
      </div>
      <label className="sm:col-span-3 flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" className="w-5 h-5 accent-[#087A35]" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="সার্ভিস সক্রিয়" />
        <span className="font-medium text-[15px]">সার্ভিস সক্রিয় (গ্রাহকদের কাছে দৃশ্যমান)</span>
      </label>
      {error && (
        <div className="sm:col-span-3">
          <ErrorBox message={error} />
        </div>
      )}
      <div className="sm:col-span-3 flex gap-2">
        <button type="submit" disabled={save.isPending} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
          {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
        </button>
        <button type="button" onClick={onDone} className="border border-[#E5EAE5] font-semibold px-4 py-2.5 rounded-xl">
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
      <ul className="divide-y divide-[#F0F3F0] border border-[#E5EAE5] rounded-2xl bg-white overflow-hidden">
        {(list.data?.locations ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-[#087A35]">{Icon.pin("w-5 h-5")}</span>
            <span className="font-semibold">{l.nameBn}</span>
            <span className="text-sm text-[#737B73] font-en">{l.nameEn}</span>
            <span className="text-sm text-[#737B73]">• {l.district}</span>
            <label className="ml-auto flex items-center gap-2 cursor-pointer">
              <span className={`text-xs font-bold ${l.active ? "text-[#087A35]" : "text-[#737B73]"}`}>{l.active ? "চালু" : "বন্ধ"}</span>
              <input
                type="checkbox"
                className="w-5 h-5 accent-[#087A35]"
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
        className="rounded-2xl border border-[#E5EAE5] bg-white p-5 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          add.mutate();
        }}
      >
        <h2 className="font-bold text-[#064B27]">নতুন এলাকা যোগ করুন</h2>
        <div>
          <label className={labelCls} htmlFor="loc-bn">নাম (বাংলা) *</label>
          <input id="loc-bn" className={inputCls} value={nameBn} onChange={(e) => setNameBn(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="loc-en">নাম (English) *</label>
          <input id="loc-en" className={inputCls} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="loc-dist">জেলা</label>
          <input id="loc-dist" className={inputCls} value={district} onChange={(e) => setDistrict(e.target.value)} />
        </div>
        {error && <ErrorBox message={error} />}
        <button type="submit" disabled={add.isPending} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl w-full">
          {add.isPending ? "যোগ হচ্ছে…" : "এলাকা যোগ করুন"}
        </button>
        <p className="text-[13px] text-[#737B73]">নতুন জেলার এলাকা যোগ করলেই সিস্টেম অন্য জেলাতেও সম্প্রসারণের জন্য প্রস্তুত থাকবে।</p>
      </form>
    </div>
  );
}

function AdminReviews({ token }: { token: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-reviews"], queryFn: () => api.adminListReviews({ token }) });
  const moderate = useMutation({
    mutationFn: (v: { id: number; status: "approved" | "rejected" | "pending" }) =>
      api.adminSetReviewStatus({ token, reviewId: v.id, status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["home-reviews"] });
    },
  });
  if (list.isPending) return <Spinner />;
  const rows = list.data?.reviews ?? [];
  if (rows.length === 0) return <EmptyState title="এখনো কোনো রিভিউ আসেনি" body="গ্রাহকরা সম্পন্ন কাজের রিভিউ দিলে এখানে মডারেশনের জন্য আসবে।" />;
  const order = (s: string) => (s === "pending" ? 0 : s === "approved" ? 1 : 2);
  const sorted = [...rows].sort((a, b) => order(a.status) - order(b.status) || b.id - a.id);
  return (
    <div className="space-y-3.5">
      {sorted.map((r) => (
        <div key={r.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Stars value={r.rating} />
              <p className="mt-1.5 text-[15px]">“{r.text}”</p>
              <p className="mt-1.5 text-[13px] text-[#737B73]">
                {r.customerName} • {r.serviceName}
                {r.professionalName ? ` • প্রফেশনাল: ${r.professionalName}` : ""} • {fmtDate(r.createdAt)}
              </p>
            </div>
            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${r.status === "approved" ? "bg-[#087A35] text-white" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
              {r.status === "approved" ? "প্রকাশিত" : r.status === "rejected" ? "বাতিল" : "মডারেশন বাকি"}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            {r.status !== "approved" && (
              <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: r.id, status: "approved" })} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl">
                প্রকাশ করুন
              </button>
            )}
            {r.status !== "rejected" && (
              <button type="button" disabled={moderate.isPending} onClick={() => moderate.mutate({ id: r.id, status: "rejected" })} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 disabled:opacity-60">
                বাতিল করুন
              </button>
            )}
          </div>
        </div>
      ))}
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
  if (list.isPending) return <Spinner />;
  const rows = list.data?.complaints ?? [];
  if (rows.length === 0) return <EmptyState title="কোনো অভিযোগ নেই" />;
  return (
    <div className="space-y-3.5">
      {rows.map((c) => (
        <div key={c.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold">{c.subject}</p>
              <p className="text-[13.5px] text-[#737B73]">
                {c.customerName} • <span className="font-en">{c.customerPhone}</span>
                {c.bookingCode ? <span> • বুকিং <span className="font-en">{c.bookingCode}</span></span> : ""} • {fmtDateTime(c.createdAt)}
              </p>
            </div>
            <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${c.status === "resolved" ? "bg-[#087A35] text-white" : "bg-amber-100 text-amber-800"}`}>
              {c.status === "resolved" ? "সমাধান হয়েছে" : "খোলা আছে"}
            </span>
          </div>
          <p className="mt-2 text-[15px] text-[#4c584c]">{c.message}</p>
          {c.status === "resolved" ? (
            c.adminNote && <p className="mt-2 text-sm bg-[#F0FAF2] rounded-lg px-3 py-2">সমাধান নোট: {c.adminNote}</p>
          ) : (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <label className="sr-only" htmlFor={`cmp-note-${c.id}`}>সমাধান নোট</label>
              <input
                id={`cmp-note-${c.id}`}
                className={inputCls}
                placeholder="গ্রাহককে জানানোর জন্য সমাধান নোট"
                value={notes[c.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: c.id, note: notes[c.id] || undefined })}
                className="shrink-0 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2.5 rounded-xl"
              >
                সমাধান হিসেবে চিহ্নিত করুন
              </button>
              <a href={`tel:${c.customerPhone}`} className="shrink-0 border border-[#E5EAE5] font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-[#F0FAF2] inline-flex items-center gap-1.5 justify-center">
                {Icon.phone("w-4 h-4")} কল
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminSettings({ token }: { token: string }) {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.adminGetSettings({ token }) });
  const [commission, setCommission] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  if (data.data && !loaded) {
    setLoaded(true);
    setCommission(String(data.data.commissionPercent));
    setPhone(data.data.supportPhone ?? "");
    setWhatsapp(data.data.supportWhatsapp ?? "");
    setEmail(data.data.supportEmail ?? "");
    setAnnouncement(data.data.announcement ?? "");
  }
  const save = useMutation({
    mutationFn: () =>
      api.adminSaveSettings({
        token,
        commissionPercent: Number(commission) || 0,
        supportPhone: phone || null,
        supportWhatsapp: whatsapp || null,
        supportEmail: email || null,
        announcement: announcement || null,
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
      className="max-w-xl rounded-3xl border border-[#E5EAE5] bg-white p-5 sm:p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setOk(false);
        save.mutate();
      }}
    >
      <div>
        <label className={labelCls} htmlFor="st-commission">কমিশন (%)</label>
        <input id="st-commission" type="number" min={0} max={100} className={inputCls} value={commission} onChange={(e) => setCommission(e.target.value)} required />
        <p className="mt-1 text-[13px] text-[#737B73]">সম্পন্ন ও পরিশোধিত বুকিংয়ের চূড়ান্ত মূল্য থেকে এই হারে কমিশন হিসাব করা হয়।</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="st-phone">সাপোর্ট ফোন নম্বর</label>
        <input id="st-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="খালি রাখলে সাইটে দেখানো হবে না" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-wa">WhatsApp নম্বর</label>
        <input id="st-wa" className={inputCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="দেশের কোডসহ, যেমন 8801XXXXXXXXX" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-email">সাপোর্ট ইমেইল</label>
        <input id="st-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="খালি রাখলে সাইটে দেখানো হবে না" />
      </div>
      <div>
        <label className={labelCls} htmlFor="st-ann">ঘোষণা (সাইটের উপরে দেখানো হবে)</label>
        <input id="st-ann" className={inputCls} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="বিশেষ ঘোষণা থাকলে লিখুন (ঐচ্ছিক)" />
      </div>
      {error && <ErrorBox message={error} />}
      {ok && <p className="rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-3">সেটিংস সংরক্ষিত হয়েছে।</p>}
      <button type="submit" disabled={save.isPending} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
        {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
      <p className="text-[13px] text-[#737B73]">দ্রষ্টব্য: অনলাইন পেমেন্ট (বিকাশ/নগদ/কার্ড) এখন বন্ধ আছে — পেমেন্ট গেটওয়ের আসল তথ্য পেলে তবেই চালু করা হবে। আপাতত ক্যাশ পেমেন্টই প্রযোজ্য।</p>
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
        <h2 className="text-lg font-bold text-[#064B27]">অ্যাডমিন টিম</h2>
        <p className="mt-1 text-sm text-[#737B73]">
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
              <div key={s.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {s.name}{" "}
                    <span className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full align-middle bg-[#064B27] text-white">
                      {ADMIN_LEVEL_BN[s.adminLevel] ?? s.adminLevel}
                    </span>
                    {s.status === "suspended" && <span className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full align-middle bg-red-100 text-red-700">স্থগিত</span>}
                  </p>
                  <p className="text-[13.5px] text-[#737B73] font-en">{s.phone}</p>
                </div>
                {levelSelect(s.id, s.adminLevel, `${s.name}-এর অ্যাডমিন স্তর`)}
                <button
                  type="button"
                  disabled={setLevel.isPending || (pick[s.id] ?? s.adminLevel) === s.adminLevel}
                  onClick={() => setLevel.mutate({ userId: s.id, level: (pick[s.id] ?? s.adminLevel) as "super" | "operations" | "finance" | "support" })}
                  className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl"
                >
                  স্তর সংরক্ষণ করুন
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#064B27]">গ্রাহককে অ্যাডমিন করুন</h2>
        <p className="mt-1 text-sm text-[#737B73]">নিবন্ধিত গ্রাহকদের মধ্য থেকে বেছে নিয়ে নির্দিষ্ট স্তরের অ্যাডমিন দায়িত্ব দিন।</p>
        {customers.isPending ? (
          <Spinner />
        ) : (customers.data?.customers ?? []).length === 0 ? (
          <EmptyState title="কোনো গ্রাহক নেই" body="গ্রাহক নিবন্ধন করলে এখানে দেখা যাবে।" />
        ) : (
          <div className="mt-4 space-y-3">
            {(customers.data?.customers ?? []).map((c) => (
              <div key={c.id} className="rounded-2xl border border-[#E5EAE5] bg-white p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-[13.5px] text-[#737B73] font-en">{c.phone}</p>
                </div>
                {levelSelect(c.id, "support", `${c.name}-এর নতুন অ্যাডমিন স্তর`)}
                <button
                  type="button"
                  disabled={setLevel.isPending}
                  onClick={() => setLevel.mutate({ userId: c.id, level: (pick[c.id] ?? "support") as "super" | "operations" | "finance" | "support" })}
                  className="border-[1.5px] border-[#087A35] text-[#087A35] font-semibold text-sm px-4 py-2 rounded-xl hover:bg-[#F0FAF2] disabled:opacity-60"
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
  const logs = useQuery({ queryKey: ["admin-logs"], queryFn: () => api.adminListLogs({ token, limit: 50 }) });
  if (logs.isPending) return <Spinner />;
  const rows = logs.data?.logs ?? [];
  if (rows.length === 0) return <EmptyState title="এখনো কোনো কার্যকলাপ লগ নেই" />;
  return (
    <ul className="divide-y divide-[#F0F3F0] border border-[#E5EAE5] rounded-2xl bg-white overflow-hidden">
      {rows.map((l) => (
        <li key={l.id} className="px-4 py-3 flex flex-wrap items-baseline gap-x-3">
          <span className="font-en text-[13px] font-semibold bg-[#F0FAF2] text-[#064B27] px-2 py-0.5 rounded">{l.action}</span>
          <span className="text-sm text-[#4c584c]">{l.detail}</span>
          <span className="ml-auto text-[12.5px] text-[#737B73]">{fmtDateTime(l.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
