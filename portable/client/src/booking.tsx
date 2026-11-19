// Booking form and booking detail (status tracking, actions, review).

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import { FIELDS } from "./fields";
import {
Avatar,
EmptyState,
ErrorBox,
Icon,
Spinner,
Stars,
STAGE_BN,
STAGE_ORDER,
STATUS_BN,
bdt,
errMsg,
fileToImage,
fmtDate,
fmtDateTime,
getToken,
go,
useCatalog,
useMe,
type Booking,
} from "./lib";
import { BookingStatusChip, inputCls, labelCls } from "./App";

const TIME_SLOTS = [
  "সকাল ৮টা – ১০টা",
  "সকাল ১০টা – দুপুর ১২টা",
  "দুপুর ১২টা – ২টা",
  "বিকেল ২টা – ৪টা",
  "বিকেল ৪টা – সন্ধ্যা ৬টা",
  "সন্ধ্যা ৬টা – রাত ৮টা",
];

export function BookingPage({ params }: { params: URLSearchParams }) {
  const catalog = useCatalog();
  const me = useMe();
  const token = getToken();
  const serviceSlug = params.get("service") ?? "";
  const proId = params.get("pro") ? Number(params.get("pro")) : undefined;
  const services = catalog.data?.services ?? [];
  const locations = catalog.data?.locations ?? [];
  const service = services.find((s) => s.slug === serviceSlug);

  const [slug, setSlug] = useState(serviceSlug);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [upazila, setUpazila] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[0]!);
  const [photos, setPhotos] = useState<{ dataBase64: string; mimeType: string }[]>([]);
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string } | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from profile once loaded
  if (me.data && !prefilled) {
    setPrefilled(true);
    setName(me.data.user.name);
    setPhone(me.data.user.phone);
    if (me.data.user.location) setUpazila(me.data.user.location);
    if (me.data.user.address) setAddress(me.data.user.address);
  }
  if (!upazila && locations.length > 0 && locations[0]) {
    // default to first active upazila once catalog arrives
    setUpazila(locations[0].nameBn);
  }

  const chosenSlug = slug || serviceSlug;
  const chosen = services.find((s) => s.slug === chosenSlug);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const create = useMutation({
    mutationFn: () =>
      api.createBooking({
        token: token ?? "",
        serviceSlug: chosenSlug,
        professionalId: proId,
        customerName: name,
        phone: phone.trim(),
        upazila,
        area: area || undefined,
        address,
        description,
        instructions: instructions || undefined,
        preferredDate: date,
        preferredTime: time,
        photos: photos.length ? photos : undefined,
      }),
    onSuccess: (r) => setDone({ code: r.code }),
    onError: (e) => setError(errMsg(e)),
  });

  if (!token || me.isError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="বুকিং করতে লগইন করুন"
          body="বুকিং পাঠাতে একটি ফ্রি অ্যাকাউন্ট দরকার — যাতে আপনি বুকিংয়ের অবস্থা দেখতে ও আপডেট পেতে পারেন।"
          action={
            <span className="inline-flex gap-2">
              <a href={`#/login?next=${encodeURIComponent(`/book?service=${serviceSlug}`)}`} className="bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">
                লগইন
              </a>
              <a href={`#/register?next=${encodeURIComponent(`/book?service=${serviceSlug}`)}`} className="border-[1.5px] border-[#087A35] text-[#087A35] font-semibold px-5 py-2.5 rounded-xl">
                নিবন্ধন
              </a>
            </span>
          }
        />
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <div className="rounded-3xl border border-[#cfe3d3] bg-[#F0FAF2] p-7 text-center gs-fade-up">
          <span className="mx-auto grid place-items-center w-14 h-14 rounded-full bg-[#087A35] text-white">
            {Icon.check("w-7 h-7")}
          </span>
          <h1 className="mt-4 text-[24px] font-bold text-[#064B27]">বুকিং রিকোয়েস্ট পাঠানো হয়েছে!</h1>
          <p className="mt-2 text-[15px] text-[#4c584c] leading-relaxed">
            আপনার বুকিং কোড: <b className="font-en text-[#064B27]">{done.code}</b>
            <br />
            বুকিংটি এখন <b>অপেক্ষমাণ</b> অবস্থায় আছে। অ্যাডমিন যাচাই করে উপযুক্ত প্রফেশনাল অ্যাসাইন করবেন এবং নিশ্চিত হলে আপনি নোটিফিকেশন পাবেন।
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
            <a href={`#/booking/${done.code}`} className="bg-[#087A35] hover:bg-[#064B27] text-white font-bold px-5 py-3 rounded-xl">
              বুকিংটি দেখুন
            </a>
            <a href="#/dashboard" className="border-[1.5px] border-[#087A35] text-[#087A35] font-semibold px-5 py-3 rounded-xl">
              আমার সব বুকিং
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FBFDFB] min-h-[70vh]">
      <div className="max-w-2xl mx-auto px-4 py-8 lg:py-12">
        <h1 className="text-[26px] sm:text-[30px] font-bold text-[#064B27]">বুকিং করুন</h1>
        <p className="mt-1.5 text-[15px] text-[#737B73]">
          কাজের বিবরণ দিন — অ্যাডমিন যাচাই করে প্রফেশনাল অ্যাসাইন করে বুকিং নিশ্চিত করবেন।
        </p>
        <form
          className="mt-6 bg-white rounded-3xl border border-[#E5EAE5] p-5 sm:p-7 grid sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (!chosenSlug) return setError("একটি সার্ভিস বেছে নিন।");
            if (!date) return setError("কাজের পছন্দের তারিখ দিন।");
            create.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bk-service">সার্ভিস *</label>
            <select
              id="bk-service"
              className={inputCls}
              value={chosenSlug}
              onChange={(e) => setSlug(e.target.value)}
              required
            >
              <option value="">— সার্ভিস বেছে নিন —</option>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>{s.nameBn}</option>
              ))}
            </select>
            {proId && chosen && (
              <p className="mt-1.5 text-[13.5px] text-[#087A35]">আপনি একজন নির্দিষ্ট প্রফেশনালকে বেছে নিয়েছেন — অ্যাডমিন তাকেই অ্যাসাইন করার চেষ্টা করবেন।</p>
            )}
            {chosen && !proId && (
              <p className="mt-1.5 text-[13.5px] text-[#737B73]">মূল্য: কাজের ধরন ও পরিমাণ অনুযায়ী নির্ধারণ করা হবে।</p>
            )}
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-name">আপনার নাম *</label>
            <input id="bk-name" className={inputCls} {...FIELDS.createBooking.customerName} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-phone">মোবাইল নম্বর *</label>
            <input id="bk-phone" className={inputCls} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-district">জেলা</label>
            <input id="bk-district" className={inputCls} value="টাঙ্গাইল" readOnly aria-readonly="true" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-upazila">উপজেলা *</label>
            <select id="bk-upazila" className={inputCls} value={upazila} onChange={(e) => setUpazila(e.target.value)} required>
              {locations.map((l) => (
                <option key={l.id} value={l.nameBn}>{l.nameBn}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-area">এলাকা / গ্রাম</label>
            <input id="bk-area" className={inputCls} {...FIELDS.createBooking.area} value={area} onChange={(e) => setArea(e.target.value)} placeholder="যেমন: নতুন বাসস্ট্যান্ড এলাকা" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-date">পছন্দের তারিখ *</label>
            <input id="bk-date" type="date" min={today} className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bk-address">বিস্তারিত ঠিকানা *</label>
            <input id="bk-address" className={inputCls} {...FIELDS.createBooking.address} value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="বাসা/হোল্ডিং, রোড, পরিচিত স্থানের পাশে…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="bk-time">পছন্দের সময় *</label>
            <select id="bk-time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)}>
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>কাজের ছবি (ঐচ্ছিক, সর্বোচ্চ ৩টি)</span>
            <label className="flex items-center gap-3 border border-dashed border-[#cfe3d3] rounded-xl px-3.5 py-3 cursor-pointer hover:bg-[#F0FAF2]">
              <span className="text-[#087A35]">{Icon.camera("w-5 h-5")}</span>
              <span className="text-sm text-[#4c584c] truncate">
                {photoNames.length ? photoNames.join(", ") : "সমস্যার ছবি যোগ করুন"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                aria-label="কাজের ছবি আপলোড"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 3);
                  const imgs: { dataBase64: string; mimeType: string }[] = [];
                  const names: string[] = [];
                  for (const f of files) {
                    imgs.push(await fileToImage(f));
                    names.push(f.name);
                  }
                  setPhotos(imgs);
                  setPhotoNames(names);
                }}
              />
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bk-desc">কাজের বিবরণ *</label>
            <textarea
              id="bk-desc"
              className={inputCls}
              rows={4}
              {...FIELDS.createBooking.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="কী কাজ করাতে চান, সমস্যাটা কী — বিস্তারিত লিখুন"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="bk-inst">অতিরিক্ত নির্দেশনা</label>
            <textarea
              id="bk-inst"
              className={inputCls}
              rows={2}
              {...FIELDS.createBooking.instructions}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="বিশেষ কোনো নির্দেশ থাকলে লিখুন (ঐচ্ছিক)"
            />
          </div>
          {service && <p className="hidden">{service.nameBn}</p>}
          {error && (
            <div className="sm:col-span-2">
              <ErrorBox message={error} />
            </div>
          )}
          <button
            type="submit"
            disabled={create.isPending}
            className="sm:col-span-2 w-full bg-[#FF8A00] hover:bg-[#E67A00] disabled:opacity-60 text-white font-bold text-[17px] py-3.5 rounded-xl"
          >
            {create.isPending ? "পাঠানো হচ্ছে…" : "বুকিং রিকোয়েস্ট পাঠান"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------- dual payment checkout
//
// The customer-facing half of the Dual Payment system (Master Phase 3).
// Every taka figure below comes from the server (`getPaymentQuote` /
// the submit response) — the client never computes a breakdown itself.
// Manual TrxID: the customer sends money to GhorSheba's MFS number
// (set by an admin in Platform Settings) and submits the TrxID; an admin
// verifies it before anything counts as paid.
// Master Phase 8 adds the SSLCOMMERZ sandbox gateway as an ADDITIONAL
// option, shown only when the server says it is configured
// (`sslcommerzEnabled`). The browser is redirected to the sandbox
// gateway page; "payment successful" appears here only after the
// server has settled the payment through its Order Validation check —
// never from the redirect alone.

export type PaymentBreakdownView = ApiResponse<typeof api, "getPaymentQuote">["options"][number];
export type PaymentView = ApiResponse<typeof api, "getMyPayments">["payments"][number];

export const PROVIDER_BN: Record<string, string> = {
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  pathao_pay: "Pathao Pay (শীঘ্রই আসছে)",
  sslcommerz: "SSLCOMMERZ গেটওয়ে",
};

export const PAYMENT_MODEL_BN: Record<string, string> = {
  full_online: "সম্পূর্ণ অনলাইন পেমেন্ট",
  split_50_50: "৫০% অনলাইন + ৫০% ক্যাশ",
};

export const PAYMENT_STATUS_BN: Record<string, string> = {
  initiated: "শুরু হয়েছে",
  pending: "যাচাইয়ের অপেক্ষায়",
  verified: "যাচাইকৃত",
  failed: "বাতিল হয়েছে",
  cancelled: "বাতিল",
  refunded: "রিফান্ড হয়েছে",
};

export function PaymentStatusChip({ status }: { status: string }) {
  const cls =
    status === "verified"
      ? "bg-[#087A35] text-white"
      : status === "pending" || status === "initiated"
        ? "bg-amber-100 text-amber-800"
        : status === "refunded"
          ? "bg-sky-100 text-sky-800"
          : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>
      {PAYMENT_STATUS_BN[status] ?? status}
    </span>
  );
}

/** Renders a server-computed breakdown as definition rows. */
export function BreakdownRows({ bd }: { bd: PaymentBreakdownView }) {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "মোট সার্ভিস বিল", value: bdt(bd.bill) },
  ];
  if (bd.paymentModel === "split_50_50") {
    rows.push({ label: "অনলাইন অংশ (৫০%)", value: bdt(bd.onlineBase) });
  }
  if (bd.customerFee > 0) {
    rows.push({
      label: `প্ল্যাটফর্ম ফি (${bd.customerFeePercent}%)`,
      value: bdt(bd.customerFee),
    });
  }
  rows.push({
    label: "অনলাইনে মোট দিতে হবে",
    value: bdt(bd.customerPaysOnline),
    strong: true,
  });
  if (bd.cashAmount > 0) {
    rows.push({ label: "ক্যাশে প্রফেশনালকে দিতে হবে", value: bdt(bd.cashAmount) });
  }
  rows.push({
    label: `প্রফেশনাল কমিশন (${bd.proCommissionPercent}%)`,
    value: bdt(bd.proCommission),
  });
  rows.push({ label: "প্রফেশনাল মোট পাবেন", value: bdt(bd.proTotal) });
  rows.push({ label: "ঘরসেবার আয় (ফি + কমিশন)", value: bdt(bd.ghorshebaRevenue) });
  return (
    <dl className="space-y-1.5 text-[14px]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-[#737B73]">{r.label}</dt>
          <dd className={`font-en whitespace-nowrap ${r.strong ? "font-bold text-[#064B27] text-[15px]" : "font-medium"}`}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function newIdempotencyKey(): string {
  return `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function CheckoutPanel({ token, code }: { token: string; code: string }) {
  const qc = useQueryClient();
  const quote = useQuery({
    queryKey: ["payment-quote", code],
    queryFn: () => api.getPaymentQuote({ token, bookingCode: code }),
    retry: false,
  });
  const [model, setModel] = useState<"full_online" | "split_50_50">("full_online");
  const [modelTouched, setModelTouched] = useState(false);
  const [provider, setProvider] = useState<"bkash" | "nagad" | "rocket">("bkash");
  const [trxId, setTrxId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // SSLCOMMERZ gateway (Phase 8): its own idempotency key + messages.
  const [gwIdemKey, setGwIdemKey] = useState(newIdempotencyKey);
  const [gwError, setGwError] = useState("");
  const gwReturnHandled = useRef(false);

  // When the deployment's gateway-return endpoint bounces the browser
  // back here, it stashes the gateway's POST fields in sessionStorage.
  // We hand them to the server ONCE; the server re-verifies everything
  // (signature + Order Validation API) before settling — this page
  // never treats the redirect itself as proof of payment.
  useEffect(() => {
    if (gwReturnHandled.current) return;
    const key = `sslcommerz-return-${code}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    gwReturnHandled.current = true;
    sessionStorage.removeItem(key);
    const payload: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "string") payload[k] = v;
        }
      }
    } catch {
      // A malformed stash is ignored; the quote re-read shows the truth.
    }
    if (Object.keys(payload).length === 0) return;
    api
      .sslcommerzReturn({ payload })
      .then((r) => {
        if (r.outcome === "settled" || r.outcome === "duplicate") {
          qc.invalidateQueries({ queryKey: ["payment-quote", code] });
          qc.invalidateQueries({ queryKey: ["booking", code] });
          qc.invalidateQueries({ queryKey: ["my-payments"] });
          qc.invalidateQueries({ queryKey: ["my-bookings"] });
        } else if (r.outcome === "failed" || r.outcome === "cancelled") {
          setGwError("গেটওয়ে পেমেন্ট সম্পন্ন হয়নি — আবার চেষ্টা করুন, অথবা TrxID পদ্ধতিতে পেমেন্ট করুন।");
          qc.invalidateQueries({ queryKey: ["payment-quote", code] });
        }
      })
      .catch(() => {
        // Settlement state is re-read from the server quote regardless.
      });
  }, [code, qc]);

  const submit = useMutation({
    mutationFn: (amount: number) =>
      api.submitManualPayment({
        token,
        bookingCode: code,
        paymentModel: model,
        provider,
        providerTrxId: trxId.trim(),
        senderNumber: senderNumber.trim() || undefined,
        amount,
        currency: "BDT",
        idempotencyKey: idemKey,
      }),
    onSuccess: () => {
      setDone(true);
      setIdemKey(newIdempotencyKey());
      qc.invalidateQueries({ queryKey: ["payment-quote", code] });
      qc.invalidateQueries({ queryKey: ["booking", code] });
      qc.invalidateQueries({ queryKey: ["my-payments"] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
    onError: (e) => setError(errMsg(e)),
  });

  const gateway = useMutation({
    mutationFn: (m: "full_online" | "split_50_50") =>
      api.initiateSslcommerzPayment({
        token,
        bookingCode: code,
        paymentModel: m,
        idempotencyKey: gwIdemKey,
        baseUrl: window.location.origin,
      }),
    onSuccess: (r) => {
      // Off to the sandbox gateway page. Whether the payment counts
      // is decided later, server-side — see the return effect above.
      window.location.assign(r.gatewayUrl);
    },
    onError: (e) => {
      setGwError(errMsg(e));
      setGwIdemKey(newIdempotencyKey());
    },
  });

  if (quote.isPending) return <Spinner label="পেমেন্টের হিসাব লোড হচ্ছে…" />;
  if (quote.isError) {
    return (
      <div className="mt-8 border-t border-[#F0F3F0] pt-6">
        <h2 className="font-bold text-[#064B27]">অনলাইন পেমেন্ট</h2>
        <div className="mt-3">
          <ErrorBox message={errMsg(quote.error)} />
        </div>
      </div>
    );
  }
  const q = quote.data!;
  const verified = q.payments.find((p) => p.status === "verified");
  const live = q.payments.find((p) => p.status === "pending" || p.status === "initiated");
  const chosenModel = (q.chosenModel as "full_online" | "split_50_50" | null) ?? null;
  const activeModel = modelTouched ? model : (chosenModel ?? "full_online");
  const selected = q.options.find((o) => o.paymentModel === activeModel) ?? q.options[0]!;

  return (
    <section className="mt-8 border-t border-[#F0F3F0] pt-6" aria-label="অনলাইন পেমেন্ট">
      <h2 className="font-bold text-[#064B27]">অনলাইন পেমেন্ট</h2>

      {verified ? (
        <div className="mt-3 rounded-2xl border border-[#cfe3d3] bg-[#F0FAF2] p-4">
          <p className="font-semibold text-[#064B27] flex items-center gap-2">
            {Icon.checkCircle("w-5 h-5")} আপনার অনলাইন পেমেন্ট যাচাই সম্পন্ন হয়েছে
          </p>
          <p className="mt-1.5 text-sm text-[#4c584c]">
            {bdt(verified.amount)} • {PROVIDER_BN[verified.provider] ?? verified.provider} •{" "}
            {verified.method === "sslcommerz" ? "Tran ID" : "TrxID"}:{" "}
            <span className="font-en">{verified.providerTrxId}</span> • {PAYMENT_MODEL_BN[verified.paymentModel]}
          </p>
          <a href="#/dashboard?tab=payments" className="mt-2 inline-block text-sm font-semibold text-[#087A35] hover:underline">
            পেমেন্ট হিস্ট্রিতে রসিদ দেখুন
          </a>
        </div>
      ) : live ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900 flex items-center gap-2">
            {Icon.clock("w-5 h-5")}{" "}
            {live.method === "sslcommerz"
              ? "গেটওয়ে পেমেন্ট প্রক্রিয়াধীন — সার্ভার যাচাইয়ের অপেক্ষায়"
              : "পেমেন্ট জমা হয়েছে — অ্যাডমিন যাচাইয়ের অপেক্ষায়"}
          </p>
          <p className="mt-1.5 text-sm text-amber-900/80">
            {bdt(live.amount)} • {PROVIDER_BN[live.provider] ?? live.provider} •{" "}
            {live.method === "sslcommerz" ? "Tran ID" : "TrxID"}:{" "}
            <span className="font-en">{live.providerTrxId}</span> • {PAYMENT_MODEL_BN[live.paymentModel]}।
            যাচাই সম্পন্ন হলে নোটিফিকেশন পাবেন — তখনই পেমেন্টটি চূড়ান্ত বলে গণ্য হবে।
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-[#737B73]">
            দুটি পদ্ধতির যেকোনো একটি বেছে নিন। সব হিসাব সার্ভার থেকে এসেছে — মূল্য নিশ্চিত হওয়ার সময়ের হারেই হিসাব হয়েছে।
          </p>
          <div className="mt-4 grid md:grid-cols-2 gap-3.5" role="radiogroup" aria-label="পেমেন্ট পদ্ধতি">
            {q.options.map((o) => {
              const isActive = o.paymentModel === activeModel;
              return (
                <button
                  key={o.paymentModel}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => {
                    setModel(o.paymentModel as "full_online" | "split_50_50");
                    setModelTouched(true);
                  }}
                  className={`text-left rounded-2xl border-2 p-4 transition-colors ${
                    isActive ? "border-[#087A35] bg-[#F0FAF2]" : "border-[#E5EAE5] bg-white hover:border-[#cfe3d3]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#064B27]">{PAYMENT_MODEL_BN[o.paymentModel]}</span>
                    {isActive && <span className="text-[#087A35]">{Icon.checkCircle("w-5 h-5")}</span>}
                  </span>
                  <span className="mt-3 block">
                    <BreakdownRows bd={o} />
                  </span>
                </button>
              );
            })}
          </div>

          {q.sslcommerzEnabled && (
            <div className="mt-4 rounded-2xl border border-[#cfe3d3] bg-white p-4">
              <p className="font-semibold text-[#064B27]">কার্ড / মোবাইল ব্যাংকিং — SSLCOMMERZ গেটওয়ে</p>
              <p className="mt-1 text-sm text-[#4c584c]">
                <span className="font-en font-semibold">Sandbox (পরীক্ষামূলক)</span> গেটওয়ে — এখানে কোনো আসল টাকা কাটা হবে না।
                গেটওয়ের পেজে পেমেন্ট শেষ করে ফিরে এলে সার্ভার যাচাই (Order Validation) সম্পন্ন হলেই পেমেন্ট সফল বলে গণ্য হবে —
                শুধু ফিরে আসা মানেই পেমেন্ট সফল নয়।
              </p>
              {gwError && (
                <div className="mt-3">
                  <ErrorBox message={gwError} />
                </div>
              )}
              <button
                type="button"
                disabled={gateway.isPending}
                onClick={() => {
                  setGwError("");
                  gateway.mutate(activeModel);
                }}
                className="mt-3 w-full sm:w-auto bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl"
              >
                {gateway.isPending
                  ? "গেটওয়েতে নেওয়া হচ্ছে…"
                  : `SSLCOMMERZ দিয়ে পেমেন্ট করুন — ${bdt(selected.customerPaysOnline)}`}
              </button>
              <p className="mt-2 text-[13px] text-[#737B73]">
                Pathao Pay: শীঘ্রই আসছে — এর কোনো পাবলিক মার্চেন্ট API নেই, তাই এখন এটি দিয়ে পেমেন্ট নেওয়া হয় না।
              </p>
            </div>
          )}

          <h3 className="mt-6 font-bold text-[#064B27]">অথবা ম্যানুয়াল TrxID দিয়ে পেমেন্ট করুন</h3>

          {q.paymentReceiveNumber ? (
            <div className="mt-4 rounded-2xl bg-[#F0FAF2] border border-[#cfe3d3] p-4 text-[15px]">
              <p className="font-semibold text-[#064B27]">টাকা পাঠানোর নম্বর</p>
              <p className="mt-1">
                {q.paymentReceiveProvider ? `${PROVIDER_BN[q.paymentReceiveProvider] ?? q.paymentReceiveProvider} — ` : ""}
                <b className="font-en text-[17px]">{q.paymentReceiveNumber}</b> (ঘরসেবার অফিসিয়াল নম্বর)
              </p>
              <p className="mt-1 text-sm text-[#4c584c]">
                এই নম্বরে <b className="font-en">{bdt(selected.customerPaysOnline)}</b> পাঠিয়ে নিচে TrxID জমা দিন।
                অ্যাডমিন যাচাই করার পরই পেমেন্ট সফল বলে গণ্য হবে।
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <ErrorBox message="অ্যাডমিন এখনো পেমেন্ট গ্রহণের নম্বর সেট করেননি — নম্বর সেট না হলে অনলাইনে টাকা পাঠাবেন না। সাপোর্টে যোগাযোগ করুন।" />
            </div>
          )}

          <form
            className="mt-4 grid sm:grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              setDone(false);
              submit.mutate(selected.customerPaysOnline);
            }}
          >
            <div>
              <label className={labelCls} htmlFor="co-provider">কোন মাধ্যমে পাঠিয়েছেন *</label>
              <select
                id="co-provider"
                className={inputCls}
                value={provider}
                onChange={(e) => setProvider(e.target.value as "bkash" | "nagad" | "rocket")}
              >
                <option value="bkash">বিকাশ</option>
                <option value="nagad">নগদ</option>
                <option value="rocket">রকেট</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="co-amount">পাঠানো টাকার পরিমাণ</label>
              <input id="co-amount" className={`${inputCls} font-en bg-[#F7FAF7]`} value={bdt(selected.customerPaysOnline)} readOnly aria-readonly="true" />
            </div>
            <div>
              <label className={labelCls} htmlFor="co-trx">TrxID / Transaction ID *</label>
              <input
                id="co-trx"
                className={`${inputCls} font-en`}
                {...FIELDS.submitManualPayment.providerTrxId}
                value={trxId}
                onChange={(e) => setTrxId(e.target.value)}
                required
                placeholder="যেমন: 9HX7K2LM1P"
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="co-sender">যে নম্বর থেকে পাঠিয়েছেন</label>
              <input
                id="co-sender"
                className={`${inputCls} font-en`}
                {...FIELDS.submitManualPayment.senderNumber}
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
                placeholder="01XXXXXXXXX"
                inputMode="numeric"
              />
            </div>
            {error && (
              <div className="sm:col-span-2">
                <ErrorBox message={error} />
              </div>
            )}
            {done && (
              <p className="sm:col-span-2 rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-3">
                পেমেন্ট জমা হয়েছে — অ্যাডমিন যাচাই করলে নোটিফিকেশন পাবেন।
              </p>
            )}
            <button
              type="submit"
              disabled={submit.isPending || !q.paymentReceiveNumber}
              className="sm:col-span-2 bg-[#FF8A00] hover:bg-[#E67A00] disabled:opacity-60 text-white font-bold py-3 rounded-xl"
            >
              {submit.isPending ? "জমা হচ্ছে…" : `TrxID জমা দিন — ${bdt(selected.customerPaysOnline)}`}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

// --------------------------------------------------------- quotations (Phase 7)

const QUOTATION_STATUS_BN: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: "অনুমোদনের অপেক্ষায়", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "অনুমোদিত", cls: "bg-[#087a35] text-white" },
  rejected: { label: "গৃহীত হয়নি", cls: "bg-red-100 text-red-700" },
  superseded: { label: "নতুন কোটেশন এসেছে", cls: "bg-[#F0F3F0] text-[#737B73]" },
};

/**
 * Itemized quotations for one booking (Master Phase 7). The customer
 * approves or rejects a pending quotation — approval is the only way
 * the price becomes final. Admins and the assigned professional can
 * create quotations (initial, or "additional" for extra work) with
 * labour / materials / transport / additional charges.
 */
export function QuotationPanel({
  token,
  booking,
  viewerRole,
  isOwnerCustomer,
  isAssignedPro,
}: {
  token: string;
  booking: Booking;
  viewerRole: string | undefined;
  isOwnerCustomer: boolean;
  isAssignedPro: boolean;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["quotations", booking.id],
    queryFn: () => api.getBookingQuotations({ token, bookingId: booking.id }),
    retry: false,
  });
  const [kind, setKind] = useState<"initial" | "additional">(booking.finalPrice == null ? "initial" : "additional");
  const [labour, setLabour] = useState("");
  const [materials, setMaterials] = useState("");
  const [transport, setTransport] = useState("");
  const [additional, setAdditional] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quotations", booking.id] });
    qc.invalidateQueries({ queryKey: ["booking", booking.code] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["pro-jobs"] });
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  };
  const create = useMutation({
    mutationFn: () =>
      api.createQuotation({
        token,
        bookingId: booking.id,
        kind,
        labourCharge: Number(labour || 0),
        materialsCharge: Number(materials || 0),
        transportCharge: Number(transport || 0),
        additionalCharge: Number(additional || 0),
        note: note || undefined,
      }),
    onSuccess: () => {
      setMsg("কোটেশন পাঠানো হয়েছে — গ্রাহকের অনুমোদনের অপেক্ষায়।");
      setError("");
      setLabour("");
      setMaterials("");
      setTransport("");
      setAdditional("");
      setNote("");
      refresh();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const respond = useMutation({
    mutationFn: (v: { id: number; approve: boolean; couponCode?: string }) =>
      api.respondToQuotation({ token, quotationId: v.id, approve: v.approve, couponCode: v.couponCode }),
    onSuccess: (_d, v) => {
      setMsg(v.approve ? "কোটেশন অনুমোদিত — মূল্য চূড়ান্ত হয়েছে।" : "কোটেশন গৃহীত হয়নি — মূল্য অপরিবর্তিত আছে।");
      setError("");
      refresh();
    },
    onError: (e) => setError(errMsg(e)),
  });
  // Coupon check (Phase 10): the customer can verify a code against
  // the pending initial quotation before approving; approval re-checks
  // server-side and records the discount, so the preview can never
  // promise a discount the approval would not honour.
  const [couponCode, setCouponCode] = useState("");
  const [couponInfo, setCouponInfo] = useState<{ code: string; discount: number; discountedTotal: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const checkCoupon = useMutation({
    mutationFn: (code: string) => api.checkCoupon({ token, bookingId: booking.id, code }),
    onSuccess: (res) => {
      setCouponInfo(res);
      setCouponError("");
    },
    onError: (e) => {
      setCouponInfo(null);
      setCouponError(errMsg(e));
    },
  });
  const canCreate =
    (viewerRole === "admin" || isAssignedPro) &&
    !["cancelled", "rejected", "disputed", "rescheduled", "customer_confirmed", "admin_reviewed"].includes(booking.stage);
  const total =
    Number(labour || 0) + Number(materials || 0) + Number(transport || 0) + Number(additional || 0);
  const quotations = list.data?.quotations ?? [];
  return (
    <section aria-label="কোটেশন" className="mt-8 border-t border-[#F0F3F0] pt-6">
      <h2 className="font-bold text-[#064B27]">কোটেশন ও মূল্য</h2>
      <p className="mt-1 text-sm text-[#737B73]">
        {booking.finalPrice != null
          ? booking.priceFinalizedVia === "quotation"
            ? "মূল্য গ্রাহক-অনুমোদিত কোটেশনে চূড়ান্ত হয়েছে। অতিরিক্ত কাজ লাগলে নতুন কোটেশন ও আবার অনুমোদন লাগবে।"
            : "মূল্য নির্ধারিত হয়েছে।"
          : "আইটেমভিত্তিক কোটেশন তৈরি হলে গ্রাহক অনুমোদন দিলেই মূল্য চূড়ান্ত হবে — তার আগে পেমেন্ট করা যাবে না।"}
      </p>
      {booking.couponCode && booking.couponDiscount != null && (
        <p className="mt-2 inline-block rounded-lg bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-[13px] font-semibold px-3 py-1.5">
          কুপন <span className="font-en">{booking.couponCode}</span> প্রয়োগ হয়েছে — যোগ্য চার্জে {bdt(booking.couponDiscount)} ছাড় পেয়েছেন।
        </p>
      )}
      {msg && <p className="mt-3 rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-2.5">{msg}</p>}
      {error && (
        <div className="mt-3">
          <ErrorBox message={error} />
        </div>
      )}
      {list.isPending ? (
        <Spinner label="কোটেশন লোড হচ্ছে…" />
      ) : quotations.length === 0 ? (
        <p className="mt-3 text-sm text-[#737B73]">এখনো কোনো কোটেশন তৈরি হয়নি।</p>
      ) : (
        <div className="mt-4 space-y-3">
          {quotations.map((q) => {
            const st = QUOTATION_STATUS_BN[q.status] ?? { label: q.status, cls: "bg-[#F0F3F0] text-[#4c584c]" };
            return (
              <div key={q.id} className="rounded-2xl border border-[#E5EAE5] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[15px]">
                    {q.kind === "additional" ? "অতিরিক্ত কাজের কোটেশন" : "কোটেশন"} — {bdt(q.totalAmount)}
                  </p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-[#737B73]">
                  {q.createdByRole === "admin" ? "অ্যাডমিন" : "প্রফেশনাল"}: {q.createdByName} • {fmtDateTime(q.createdAt)}
                  {q.decidedAt ? ` • সিদ্ধান্ত: ${fmtDateTime(q.decidedAt)}` : ""}
                </p>
                <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-[#737B73]">শ্রম / সার্ভিস চার্জ</dt><dd className="font-semibold">{bdt(q.labourCharge)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-[#737B73]">মালামাল</dt><dd className="font-semibold">{bdt(q.materialsCharge)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-[#737B73]">যাতায়াত</dt><dd className="font-semibold">{bdt(q.transportCharge)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-[#737B73]">অতিরিক্ত চার্জ</dt><dd className="font-semibold">{bdt(q.additionalCharge)}</dd></div>
                </dl>
                {q.note && <p className="mt-2 text-sm text-[#4c584c]">{q.note}</p>}
                {isOwnerCustomer && q.status === "pending_approval" && (
                  <div className="mt-3">
                    {q.kind === "initial" && (
                      <div className="mb-3 rounded-xl bg-[#F8FAF8] border border-[#E5EAE5] p-3">
                        <label className={labelCls} htmlFor={`cpn-${q.id}`}>কুপন কোড (যদি থাকে)</label>
                        <div className="flex gap-2">
                          <input
                            id={`cpn-${q.id}`}
                            className={`${inputCls} font-en uppercase`}
                            {...FIELDS.respondToQuotation.couponCode}
                            value={couponCode}
                            onChange={(e) => {
                              setCouponCode(e.target.value);
                              setCouponInfo(null);
                              setCouponError("");
                            }}
                            placeholder="যেমন: EID2026"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            disabled={checkCoupon.isPending || !couponCode.trim()}
                            onClick={() => {
                              if (!couponCode.trim()) {
                                setCouponError("আগে কুপন কোড লিখুন।");
                                return;
                              }
                              checkCoupon.mutate(couponCode.trim());
                            }}
                            className="shrink-0 bg-white border-[1.5px] border-[#cfe3d3] text-[#064B27] font-semibold text-sm px-4 rounded-xl hover:bg-[#F0FAF2] disabled:opacity-60"
                          >
                            যাচাই করুন
                          </button>
                        </div>
                        {couponInfo && (
                          <p className="mt-2 text-sm text-[#064B27] font-semibold">
                            কুপন <span className="font-en">{couponInfo.code}</span> প্রযোজ্য — ছাড় {bdt(couponInfo.discount)}, অনুমোদনের পর মূল্য হবে {bdt(couponInfo.discountedTotal)}।
                          </p>
                        )}
                        {couponError && <p className="mt-2 text-sm font-semibold text-red-700">{couponError}</p>}
                        <p className="mt-1.5 text-[12.5px] text-[#737B73]">ছাড় যোগ্য চার্জের (শ্রম + অতিরিক্ত) উপর প্রযোজ্য হয়; অনুমোদনের সময় সার্ভার আবার যাচাই করে।</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={respond.isPending}
                        onClick={() =>
                          respond.mutate({
                            id: q.id,
                            approve: true,
                            couponCode: q.kind === "initial" && couponCode.trim() ? couponCode.trim() : undefined,
                          })
                        }
                        className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold text-sm px-4 py-2.5 rounded-xl"
                      >
                        অনুমোদন করুন — মূল্য চূড়ান্ত হবে
                      </button>
                      <button
                        type="button"
                        disabled={respond.isPending}
                        onClick={() => respond.mutate({ id: q.id, approve: false })}
                        className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60"
                      >
                        গ্রহণ করছি না
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canCreate && (
        <form
          className="mt-5 rounded-2xl bg-[#F8FAF8] border border-[#E5EAE5] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setMsg("");
            create.mutate();
          }}
        >
          <p className="font-bold text-[15px] text-[#064B27]">নতুন কোটেশন তৈরি করুন</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls} htmlFor={`q-kind-${booking.id}`}>ধরন</label>
              <select
                id={`q-kind-${booking.id}`}
                className={inputCls}
                value={kind}
                onChange={(e) => setKind(e.target.value as "initial" | "additional")}
              >
                <option value="initial" disabled={booking.finalPrice != null}>প্রাথমিক কোটেশন</option>
                <option value="additional" disabled={booking.finalPrice == null}>অতিরিক্ত কাজের কোটেশন</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor={`q-labour-${booking.id}`}>শ্রম / সার্ভিস চার্জ (৳)</label>
              <input id={`q-labour-${booking.id}`} type="number" {...FIELDS.createQuotation.labourCharge} className={`${inputCls} font-en`} value={labour} onChange={(e) => setLabour(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`q-materials-${booking.id}`}>মালামাল (৳)</label>
              <input id={`q-materials-${booking.id}`} type="number" {...FIELDS.createQuotation.materialsCharge} className={`${inputCls} font-en`} value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`q-transport-${booking.id}`}>যাতায়াত (৳)</label>
              <input id={`q-transport-${booking.id}`} type="number" {...FIELDS.createQuotation.transportCharge} className={`${inputCls} font-en`} value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`q-additional-${booking.id}`}>অতিরিক্ত চার্জ (৳)</label>
              <input id={`q-additional-${booking.id}`} type="number" {...FIELDS.createQuotation.additionalCharge} className={`${inputCls} font-en`} value={additional} onChange={(e) => setAdditional(e.target.value)} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor={`q-note-${booking.id}`}>নোট (ঐচ্ছিক)</label>
              <input id={`q-note-${booking.id}`} className={inputCls} {...FIELDS.createQuotation.note} value={note} onChange={(e) => setNote(e.target.value)} placeholder="কাজের বিবরণ বা শর্ত" />
            </div>
          </div>
          <p className="mt-2.5 text-sm text-[#4c584c]">
            মোট: <b className="font-en">{bdt(total)}</b>
            <span className="text-[#737B73]"> • কমিশনের ভিত্তি হবে শ্রম + অতিরিক্ত চার্জ (মালামাল ও যাতায়াত বাদে)</span>
          </p>
          <button type="submit" disabled={create.isPending || total <= 0} className="mt-3 bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl">
            {create.isPending ? "পাঠানো হচ্ছে…" : "কোটেশন পাঠান — গ্রাহকের অনুমোদন লাগবে"}
          </button>
        </form>
      )}
    </section>
  );
}

// --------------------------------------------------------- booking detail

export function BookingDetailPage({ code }: { code: string }) {
  const token = getToken();
  const qc = useQueryClient();
  const me = useMe();
  const data = useQuery({
    queryKey: ["booking", code],
    queryFn: () => api.getBooking({ token: token ?? "", code }),
    enabled: !!token && !!code,
    retry: false,
  });
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [msg, setMsg] = useState("");
  const [actionError, setActionError] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["booking", code] });
    qc.invalidateQueries({ queryKey: ["my-bookings"] });
    qc.invalidateQueries({ queryKey: ["pro-jobs"] });
  };
  // Master Phase 9: a customer cancel is a REQUEST to the admin, not
  // an instant cancel — the booking keeps running until the admin
  // decides Waiting / Complete / Rejected.
  const [cancelReason, setCancelReason] = useState("");
  const cancelBookingId = data.data?.booking?.id;
  const cancelReqQ = useQuery({
    queryKey: ["my-cancel-request", cancelBookingId],
    queryFn: () => api.getMyCancelRequest({ token: token ?? "", bookingId: cancelBookingId ?? 0 }),
    enabled: !!token && cancelBookingId != null && data.data?.booking?.customerId === me.data?.user.id,
    retry: false,
  });
  const requestCancel = useMutation({
    mutationFn: (id: number) =>
      api.requestBookingCancel({ token: token ?? "", bookingId: id, reason: cancelReason.trim() || undefined }),
    onSuccess: () => {
      setMsg("বাতিলের অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে — যাচাই করে সিদ্ধান্ত জানানো হবে। বুকিং এখনো চলমান আছে।");
      setCancelReason("");
      cancelReqQ.refetch();
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });
  const confirmDone = useMutation({
    mutationFn: (id: number) => api.confirmCompletion({ token: token ?? "", bookingId: id }),
    onSuccess: () => {
      setMsg("কাজ সম্পন্ন নিশ্চিত হয়েছে — এখন রিভিউ দিতে পারবেন।");
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });
  const review = useMutation({
    mutationFn: (id: number) =>
      api.submitReview({ token: token ?? "", bookingId: id, rating, text: reviewText }),
    onSuccess: () => {
      setMsg("ধন্যবাদ! আপনার রিভিউ মডারেশনের পর প্রকাশিত হবে।");
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });
  const respond = useMutation({
    mutationFn: (v: { id: number; accept: boolean }) =>
      api.proRespond({ token: token ?? "", bookingId: v.id, accept: v.accept }),
    onSuccess: () => {
      setMsg("আপনার সাড়া পাঠানো হয়েছে।");
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });
  const advance = useMutation({
    mutationFn: (v: { id: number; action: "start" | "done" }) =>
      api.proAdvance({ token: token ?? "", bookingId: v.id, action: v.action }),
    onSuccess: () => {
      setMsg("আপডেট হয়েছে।");
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });
  const [reschedDate, setReschedDate] = useState("");
  const [reschedTime, setReschedTime] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const reschedule = useMutation({
    mutationFn: (id: number) =>
      api.requestReschedule({ token: token ?? "", bookingId: id, date: reschedDate, time: reschedTime }),
    onSuccess: () => {
      setMsg("সময় বদলের অনুরোধ পাঠানো হয়েছে — অ্যাডমিন নিশ্চিত করলে নতুন সময় কার্যকর হবে।");
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });
  const [proDisputeNote, setProDisputeNote] = useState("");
  const dispute = useMutation({
    mutationFn: (v: { id: number; note?: string }) =>
      api.setBookingDisputed({ token: token ?? "", bookingId: v.id, note: v.note }),
    onSuccess: () => {
      setMsg("বিরোধ জানানো হয়েছে — নিষ্পত্তি না হওয়া পর্যন্ত সেটেলমেন্ট স্থগিত থাকবে।");
      refresh();
    },
    onError: (e) => setActionError(errMsg(e)),
  });

  if (!token) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState
          title="লগইন প্রয়োজন"
          body="বুকিংয়ের বিবরণ দেখতে লগইন করুন।"
          action={<a href="#/login" className="inline-flex bg-[#087A35] text-white font-semibold px-5 py-2.5 rounded-xl">লগইন করুন</a>}
        />
      </div>
    );
  }
  if (data.isPending) return <Spinner label="বুকিং লোড হচ্ছে…" />;
  if (data.isError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <ErrorBox message={errMsg(data.error)} />
      </div>
    );
  }
  const b = data.data?.booking;
  if (!b) {
    return (
      <div className="max-w-xl mx-auto px-4 py-14">
        <EmptyState title="বুকিং পাওয়া যায়নি" body="এই কোডে কোনো বুকিং নেই।" />
      </div>
    );
  }
  const role = me.data?.user.role;
  const isOwner = role === "customer" || role === "admin" ? b.customerId === me.data?.user.id : false;
  const isAssignedPro = !!me.data?.professional && b.professionalId === me.data.professional.id;
  const myReview = data.data?.myReview;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
      <button type="button" onClick={() => go(role === "professional" ? "/pro-dashboard" : role === "admin" ? "/admin" : "/dashboard")} className="inline-flex items-center gap-1.5 text-[#087A35] font-medium text-[15px] hover:underline">
        {Icon.arrowLeft("w-4 h-4")} ড্যাশবোর্ডে ফিরুন
      </button>
      <div className="mt-4 rounded-3xl border border-[#E5EAE5] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold text-[#064B27]">{b.serviceName}</h1>
            <p className="text-sm text-[#737B73]">
              বুকিং কোড: <span className="font-en font-semibold text-[#202820]">{b.code}</span> • {fmtDateTime(b.createdAt)}
            </p>
          </div>
          <BookingStatusChip status={b.status} stage={b.stage} />
        </div>

        {/* progress — master-flow stages (Phase 7) */}
        {b.stage === "cancelled" || b.stage === "rejected" ? (
          <p className="mt-6 rounded-xl bg-red-600 text-white text-center font-bold text-sm px-4 py-2.5">
            {b.stage === "cancelled" ? "এই বুকিং বাতিল হয়েছে" : "এই বুকিং প্রত্যাখ্যাত হয়েছে"}
          </p>
        ) : (
          <ol className="mt-6 grid grid-cols-4 lg:grid-cols-8 gap-1.5" aria-label="বুকিংয়ের অগ্রগতি">
            {STAGE_ORDER.map((s) => {
              const idx = STAGE_ORDER.indexOf(b.stage as (typeof STAGE_ORDER)[number]);
              const active = idx >= 0 && STAGE_ORDER.indexOf(s) <= idx;
              return (
                <li key={s} className={`rounded-lg px-1 py-2 text-center text-[11px] sm:text-xs font-semibold ${active ? "bg-[#087A35] text-white" : "bg-[#F0F3F0] text-[#737B73]"}`}>
                  {STAGE_BN[s]}
                </li>
              );
            })}
          </ol>
        )}
        {b.stage === "disputed" && (
          <p className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
            এই বুকিংয়ে <b>বিরোধ চলমান</b> — নিষ্পত্তি না হওয়া পর্যন্ত পেমেন্ট ও সেটেলমেন্ট স্থগিত থাকবে।
          </p>
        )}
        {b.stage === "rescheduled" && (
          <p className="mt-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-sm px-4 py-3">
            বুকিংয়ের সময় <b>পুনঃনির্ধারিত</b> হয়েছে — নতুন সময়: {fmtDate(b.preferredDate)} • {b.preferredTime}। অ্যাডমিন নিশ্চিত করলেই আগের ধাপে ফিরবে।
          </p>
        )}

        <dl className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[15px]">
          <div><dt className="text-[#737B73] text-[13px]">গ্রাহক</dt><dd className="font-medium">{b.customerName} • <span className="font-en">{b.phone}</span></dd></div>
          <div><dt className="text-[#737B73] text-[13px]">প্রফেশনাল</dt><dd className="font-medium">{b.professionalName ?? "এখনো অ্যাসাইন হয়নি"}</dd></div>
          <div><dt className="text-[#737B73] text-[13px]">ঠিকানা</dt><dd className="font-medium">{b.address}{b.area ? `, ${b.area}` : ""}, {b.upazila}, {b.district}</dd></div>
          <div><dt className="text-[#737B73] text-[13px]">পছন্দের সময়</dt><dd className="font-medium">{fmtDate(b.preferredDate)} • {b.preferredTime}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[#737B73] text-[13px]">কাজের বিবরণ</dt><dd className="font-medium leading-relaxed">{b.description}</dd></div>
          {b.instructions && (
            <div className="sm:col-span-2"><dt className="text-[#737B73] text-[13px]">অতিরিক্ত নির্দেশনা</dt><dd className="font-medium">{b.instructions}</dd></div>
          )}
          <div>
            <dt className="text-[#737B73] text-[13px]">মূল্য</dt>
            <dd className="font-medium">
              {b.finalPrice != null ? (
                <>৳{b.finalPrice.toLocaleString("bn-BD")} ({b.paymentStatus === "cash_paid" ? "ক্যাশে পরিশোধিত" : "পরিশোধ বাকি"})</>
              ) : (
                "কাজের ধরন ও পরিমাণ অনুযায়ী নির্ধারণ করা হবে"
              )}
            </dd>
          </div>
        </dl>

        {b.photoUrls.length > 0 && (
          <div className="mt-5">
            <p className="text-[13px] text-[#737B73] mb-2">কাজের ছবি</p>
            <div className="flex flex-wrap gap-3">
              {b.photoUrls.map((u, i) => (
                <img key={i} src={u} alt={`কাজের ছবি ${i + 1}`} className="w-28 h-28 object-cover rounded-xl border border-[#E5EAE5]" loading="lazy" />
              ))}
            </div>
          </div>
        )}

        {msg && <p className="mt-5 rounded-xl bg-[#F0FAF2] border border-[#cfe3d3] text-[#064B27] text-sm px-4 py-3">{msg}</p>}
        {actionError && (
          <div className="mt-5">
            <ErrorBox message={actionError} />
          </div>
        )}

        {/* actions */}
        <div className="mt-6 flex flex-wrap gap-2.5">
          {isOwner && b.stage === "pro_completed" && (
            <button
              type="button"
              disabled={confirmDone.isPending}
              onClick={() => confirmDone.mutate(b.id)}
              className="bg-[#087A35] hover:bg-[#064B27] text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60"
            >
              কাজ সম্পন্ন নিশ্চিত করুন
            </button>
          )}
          {isOwner && b.stage === "in_progress" && (
            <p className="text-sm text-[#737B73]">প্রফেশনাল কাজ শেষ বলে জানালে আপনি সম্পন্ন নিশ্চিত করতে পারবেন।</p>
          )}
          {isAssignedPro && b.stage === "assigned" && (
            <>
              <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ id: b.id, accept: true })} className="bg-[#087A35] hover:bg-[#064B27] text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60">
                কাজটি গ্রহণ করুন
              </button>
              <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ id: b.id, accept: false })} className="border-[1.5px] border-red-300 text-red-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60">
                নিতে পারবো না
              </button>
            </>
          )}
          {isAssignedPro && b.stage === "accepted" && (
            <button type="button" disabled={advance.isPending} onClick={() => advance.mutate({ id: b.id, action: "start" })} className="bg-[#087A35] hover:bg-[#064B27] text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60">
              কাজ শুরু করুন
            </button>
          )}
          {isAssignedPro && b.stage === "in_progress" && (
            <button type="button" disabled={advance.isPending} onClick={() => advance.mutate({ id: b.id, action: "done" })} className="bg-[#FF8A00] hover:bg-[#E67A00] text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60">
              কাজ শেষ — গ্রাহককে জানান
            </button>
          )}
          {isAssignedPro && b.stage === "pro_completed" && (
            <p className="text-sm text-[#737B73]">আপনি কাজ শেষ বলে জানিয়েছেন — গ্রাহকের নিশ্চিতকরণের অপেক্ষায়।</p>
          )}
        </div>

        {/* quotations — approval finalizes the price (Phase 7) */}
        {token && (isOwner || isAssignedPro || role === "admin") && (
          <QuotationPanel
            token={token}
            booking={b}
            viewerRole={role}
            isOwnerCustomer={isOwner && role === "customer"}
            isAssignedPro={isAssignedPro}
          />
        )}

        {/* customer cancel request (Phase 9): one clear button — the
            admin decides Waiting / Complete / Rejected */}
        {isOwner && role === "customer" && ["pending", "price_confirmed", "assigned", "accepted", "rescheduled"].includes(b.stage) && (
          <section aria-label="বুকিং বাতিলের অনুরোধ" className="mt-8 border-t border-[#F0F3F0] pt-6">
            <h2 className="font-bold text-[#064B27]">বুকিং বাতিল করতে চান?</h2>
            {(() => {
              const cr = cancelReqQ.data?.request;
              if (cr && (cr.status === "requested" || cr.status === "under_review")) {
                return (
                  <p className="mt-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
                    {cr.status === "under_review"
                      ? "আপনার বাতিলের অনুরোধ অ্যাডমিন যাচাই করছেন (Waiting) — সিদ্ধান্ত হলে জানানো হবে। ততক্ষণ বুকিং চলমান আছে।"
                      : "আপনার বাতিলের অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে — যাচাই করে সিদ্ধান্ত জানানো হবে। ততক্ষণ বুকিং চলমান আছে।"}
                  </p>
                );
              }
              return (
                <>
                  {cr?.status === "rejected" && (
                    <p className="mt-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
                      আপনার আগের বাতিলের অনুরোধ গৃহীত হয়নি — বুকিং আগের মতোই চলছে।
                      {cr.adminNote ? ` অ্যাডমিনের নোট: ${cr.adminNote}` : ""}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-[#737B73]">
                    অনুরোধ পাঠালে অ্যাডমিন যাচাই করে সিদ্ধান্ত দেবেন — অনুমোদিত হলেই কেবল বুকিং বাতিল হবে। অনলাইন পেমেন্ট থাকলে রিফান্ডের সিদ্ধান্ত প্রকাশিত বাতিল নীতি অনুযায়ী কেসভেদে অ্যাডমিন জানাবেন।
                  </p>
                  <form
                    className="mt-3 flex flex-col sm:flex-row gap-2.5 max-w-xl"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setActionError("");
                      requestCancel.mutate(b.id);
                    }}
                  >
                    <input
                      aria-label="বাতিলের কারণ (ঐচ্ছিক)"
                      className={`${inputCls} flex-1`}
                      {...FIELDS.requestBookingCancel.reason}
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="কারণ (ঐচ্ছিক)"
                    />
                    <button type="submit" disabled={requestCancel.isPending} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60">
                      {requestCancel.isPending ? "পাঠানো হচ্ছে…" : "বাতিলের অনুরোধ পাঠান"}
                    </button>
                  </form>
                </>
              );
            })()}
          </section>
        )}

        {/* customer reschedule request + dispute (Phase 7) */}
        {isOwner && role === "customer" && ["pending", "price_confirmed", "assigned", "accepted"].includes(b.stage) && (
          <section aria-label="সময় বদলের অনুরোধ" className="mt-8 border-t border-[#F0F3F0] pt-6">
            <h2 className="font-bold text-[#064B27]">সময় বদল করতে চান?</h2>
            {b.rescheduleRequestedDate ? (
              <p className="mt-2 text-sm text-[#4c584c]">
                আপনার অনুরোধ পাঠানো হয়েছে: <b>{fmtDate(b.rescheduleRequestedDate)} • {b.rescheduleRequestedTime}</b> — অ্যাডমিন নিশ্চিত করলে সময় বদলাবে।
              </p>
            ) : (
              <form
                className="mt-3 grid grid-cols-2 gap-3 max-w-lg"
                onSubmit={(e) => {
                  e.preventDefault();
                  setActionError("");
                  reschedule.mutate(b.id);
                }}
              >
                <div>
                  <label className={labelCls} htmlFor="rs-date">নতুন তারিখ</label>
                  <input id="rs-date" type="date" required className={inputCls} value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="rs-time">নতুন সময়</label>
                  <select id="rs-time" required className={inputCls} value={reschedTime} onChange={(e) => setReschedTime(e.target.value)}>
                    <option value="">— সময় বেছে নিন —</option>
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={reschedule.isPending} className="col-span-2 sm:col-span-1 border-[1.5px] border-[#087A35] text-[#087A35] font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-[#F0FAF2] disabled:opacity-60">
                  {reschedule.isPending ? "পাঠানো হচ্ছে…" : "সময় বদলের অনুরোধ পাঠান"}
                </button>
              </form>
            )}
          </section>
        )}
        {isOwner && role === "customer" && ["assigned", "accepted", "in_progress", "pro_completed", "customer_confirmed", "admin_reviewed"].includes(b.stage) && (
          <section aria-label="বিরোধ" className="mt-8 border-t border-[#F0F3F0] pt-6">
            <h2 className="font-bold text-[#064B27]">কাজ নিয়ে সমস্যা হয়েছে?</h2>
            <p className="mt-1 text-sm text-[#737B73]">
              বিরোধ জানালে অ্যাডমিন বিষয়টি দেখবেন; নিষ্পত্তি না হওয়া পর্যন্ত এই বুকিংয়ের সেটেলমেন্ট স্থগিত থাকবে।
            </p>
            <form
              className="mt-3 flex flex-col sm:flex-row gap-2.5 max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                setActionError("");
                dispute.mutate({ id: b.id, note: disputeNote || undefined });
              }}
            >
              <input
                aria-label="বিরোধের কারণ"
                className={`${inputCls} flex-1`}
                {...FIELDS.setBookingDisputed.note}
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
                placeholder="সমস্যাটি সংক্ষেপে লিখুন"
              />
              <button type="submit" disabled={dispute.isPending} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60">
                {dispute.isPending ? "পাঠানো হচ্ছে…" : "বিরোধ জানান"}
              </button>
            </form>
          </section>
        )}
        {isAssignedPro && ["assigned", "accepted", "in_progress", "pro_completed", "customer_confirmed", "admin_reviewed"].includes(b.stage) && (
          <section aria-label="বিরোধ" className="mt-8 border-t border-[#F0F3F0] pt-6">
            <h2 className="font-bold text-[#064B27]">এই কাজ নিয়ে বিরোধ আছে?</h2>
            <p className="mt-1 text-sm text-[#737B73]">
              বিরোধ জানালে অ্যাডমিন বিষয়টি দেখবেন; সিদ্ধান্ত কারণসহ রেকর্ড না হওয়া পর্যন্ত এই বুকিংয়ের সেটেলমেন্ট (আপনার পেআউট) স্থগিত থাকবে।
            </p>
            <form
              className="mt-3 flex flex-col sm:flex-row gap-2.5 max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                setActionError("");
                dispute.mutate({ id: b.id, note: proDisputeNote || undefined });
              }}
            >
              <input
                aria-label="বিরোধের কারণ"
                className={`${inputCls} flex-1`}
                {...FIELDS.setBookingDisputed.note}
                value={proDisputeNote}
                onChange={(e) => setProDisputeNote(e.target.value)}
                placeholder="সমস্যাটি সংক্ষেপে লিখুন"
              />
              <button type="submit" disabled={dispute.isPending} className="border-[1.5px] border-red-300 text-red-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-red-50 disabled:opacity-60">
                {dispute.isPending ? "পাঠানো হচ্ছে…" : "বিরোধ জানান"}
              </button>
            </form>
          </section>
        )}

        {/* checkout — only for the booking's own customer, only once the
            price is confirmed, and never on a cancelled booking */}
        {isOwner && role === "customer" && b.finalPrice != null && !["cancelled", "rejected", "disputed"].includes(b.stage) && token && (
          <CheckoutPanel token={token} code={b.code} />
        )}

        {/* review */}
        {isOwner && (b.stage === "customer_confirmed" || b.stage === "admin_reviewed") && (
          <div className="mt-8 border-t border-[#F0F3F0] pt-6">
            <h2 className="font-bold text-[#064B27]">আপনার রিভিউ</h2>
            {myReview ? (
              <div className="mt-3">
                <Stars value={myReview.rating} />
                <p className="mt-1.5 text-[15px]">“{myReview.text}”</p>
                <p className="mt-1 text-[13px] text-[#737B73]">
                  অবস্থা: {myReview.status === "approved" ? "প্রকাশিত" : myReview.status === "rejected" ? "প্রকাশ করা হয়নি" : "মডারেশনের অপেক্ষায়"}
                </p>
              </div>
            ) : (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setActionError("");
                  review.mutate(b.id);
                }}
              >
                <div>
                  <span className={labelCls}>রেটিং দিন</span>
                  <div className="flex gap-1" role="radiogroup" aria-label="রেটিং">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} স্টার`}
                        onClick={() => setRating(n)}
                        className="p-1"
                      >
                        {Icon.star(n <= rating, "w-7 h-7")}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls} htmlFor="rv-text">আপনার অভিজ্ঞতা লিখুন</label>
                  <textarea id="rv-text" className={inputCls} rows={3} {...FIELDS.submitReview.text} value={reviewText} onChange={(e) => setReviewText(e.target.value)} required placeholder="কাজ কেমন হয়েছে, প্রফেশনালের আচরণ কেমন ছিল…" />
                </div>
                <button type="submit" disabled={review.isPending} className="bg-[#087A35] hover:bg-[#064B27] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl">
                  {review.isPending ? "পাঠানো হচ্ছে…" : "রিভিউ পাঠান"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* timeline */}
        <div className="mt-8 border-t border-[#F0F3F0] pt-6">
          <h2 className="font-bold text-[#064B27] mb-4">বুকিংয়ের ইতিহাস</h2>
          <ol className="relative border-l-2 border-[#E2F4E7] ml-2 space-y-4">
            {b.events.map((e, i) => (
              <li key={i} className="pl-5 relative">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-[#087A35]" />
                <p className="font-semibold text-[15px]">{STATUS_BN[e.status] ?? e.status}</p>
                {e.note && <p className="text-sm text-[#4c584c]">{e.note}</p>}
                <p className="text-[12.5px] text-[#737B73]">{fmtDateTime(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        </div>

        {isAssignedPro && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#F0FAF2] p-4">
            <Avatar name={b.customerName} photoUrl={null} size="w-10 h-10" textSize="text-sm" />
            <p className="text-sm text-[#4c584c]">
              গ্রাহকের সাথে যোগাযোগ: <a className="font-bold font-en text-[#087A35]" href={`tel:${b.phone}`}>{b.phone}</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export type { Booking };
