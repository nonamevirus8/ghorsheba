// GhorSheba dual-payment money math — server-side only.
//
// Pure functions: no database, no I/O. Every taka figure the platform
// shows or stores for a dual-payment booking is computed here, on the
// server, from the confirmed service bill + the payment model. Client
// numbers are never trusted.
//
// Commission and the customer fee are calculated on the eligible
// service/labour charge only (`calcBase`). Separately itemized materials
// and approved transport are excluded from `calcBase` unless the customer
// and professional explicitly agreed otherwise; the split of the bill
// into online / cash parts is always computed on the full bill.
//
// Worked examples (verified by tests, bill ৳2,000, calcBase = bill):
//
// Full Online (fee 0%, commission 10%):
//   customer pays online ৳2,000 · customer fee ৳0 · commission ৳200
//   held ৳2,000 · payout from held ৳1,800 · GhorSheba revenue ৳200
//
// 50% Online + 50% Cash (fee 3%, commission 6%):
//   online base ৳1,000 · customer fee ৳60 · customer pays online ৳1,060
//   customer pays cash ৳1,000 · commission ৳120 · held ৳1,000
//   payout from held ৳880 · professional total ৳1,880 · revenue ৳180

export type PaymentModel = "full_online" | "split_50_50";

export interface ModelRates {
  customerFeePercent: number;
  proCommissionPercent: number;
}

export interface DualPaymentRates {
  fullOnline: ModelRates;
  split5050: ModelRates;
}

/** Fixed initial rates from the Dual Payment specification (§7). */
export const DEFAULT_DUAL_RATES: DualPaymentRates = {
  fullOnline: { customerFeePercent: 0, proCommissionPercent: 10 },
  split5050: { customerFeePercent: 3, proCommissionPercent: 6 },
};

export function ratesForModel(
  model: PaymentModel,
  rates: DualPaymentRates = DEFAULT_DUAL_RATES,
): ModelRates {
  return model === "full_online" ? rates.fullOnline : rates.split5050;
}

export interface PaymentBreakdown {
  /** Full confirmed service bill in BDT (integer taka). */
  bill: number;
  /** Eligible service/labour charge the fee + commission are based on. */
  calcBase: number;
  paymentModel: PaymentModel;
  customerFeePercent: number;
  proCommissionPercent: number;
  /** Portion of the bill payable online, before the customer fee. */
  onlineBase: number;
  /** Customer platform fee (on calcBase). */
  customerFee: number;
  /** What the customer actually pays online: onlineBase + customerFee. */
  customerPaysOnline: number;
  /** What the customer pays the professional directly in cash. */
  cashAmount: number;
  /** Professional commission (on calcBase). */
  proCommission: number;
  /** Amount GhorSheba holds from the online collection for settlement. */
  heldAmount: number;
  /** Professional payout released from the held amount (held − commission). */
  proPayoutFromHeld: number;
  /** Cash the professional receives directly from the customer. */
  proCashReceived: number;
  /** Everything the professional receives: payout from held + cash. */
  proTotal: number;
  /** GhorSheba revenue: customer fee + professional commission. */
  ghorshebaRevenue: number;
}

function assertTaka(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer amount of taka.`);
  }
}

/**
 * Computes the full dual-payment breakdown for a confirmed bill.
 * `calcBase` defaults to the full bill; pass a smaller base when part of
 * the bill is itemized materials / approved transport excluded from
 * commission by agreement.
 */
export function computeBreakdown(input: {
  bill: number;
  paymentModel: PaymentModel;
  calcBase?: number;
  rates?: DualPaymentRates;
}): PaymentBreakdown {
  const { bill, paymentModel } = input;
  assertTaka("bill", bill);
  if (bill === 0) throw new Error("bill must be greater than zero.");
  const calcBase = input.calcBase ?? bill;
  assertTaka("calcBase", calcBase);
  if (calcBase > bill) {
    throw new Error("calcBase cannot exceed the service bill.");
  }
  const rates = ratesForModel(paymentModel, input.rates ?? DEFAULT_DUAL_RATES);
  const { customerFeePercent, proCommissionPercent } = rates;

  const customerFee = Math.round((calcBase * customerFeePercent) / 100);
  const proCommission = Math.round((calcBase * proCommissionPercent) / 100);

  // The online/cash split is on the full bill. For 50/50 the online half
  // rounds up so onlineBase + cashAmount always equals the bill exactly.
  const onlineBase =
    paymentModel === "full_online" ? bill : Math.round(bill / 2);
  const cashAmount = bill - onlineBase;
  const customerPaysOnline = onlineBase + customerFee;

  // GhorSheba holds the online base (the customer fee is revenue, not
  // held). The professional's commission is deducted from the held
  // amount at settlement time.
  const heldAmount = onlineBase;
  const proPayoutFromHeld = heldAmount - proCommission;
  const proCashReceived = cashAmount;
  const proTotal = proPayoutFromHeld + proCashReceived;
  const ghorshebaRevenue = customerFee + proCommission;

  return {
    bill,
    calcBase,
    paymentModel,
    customerFeePercent,
    proCommissionPercent,
    onlineBase,
    customerFee,
    customerPaysOnline,
    cashAmount,
    proCommission,
    heldAmount,
    proPayoutFromHeld,
    proCashReceived,
    proTotal,
    ghorshebaRevenue,
  };
}

/** The exact amount a customer must pay online for a bill + model. */
export function expectedOnlineAmount(input: {
  bill: number;
  paymentModel: PaymentModel;
  calcBase?: number;
  rates?: DualPaymentRates;
}): number {
  return computeBreakdown(input).customerPaysOnline;
}
