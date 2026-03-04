export interface OtaConfigInput {
  cleaningFeeAud: number;
  cleaningFeeTo: "host" | "owner";
  managementFeeRate: number;
}

export interface BookingPayableInput {
  grossAmount: number;
  commission: number;    // negative
  paymentFee: number;   // negative
  vat: number;          // negative or 0
  config: OtaConfigInput;
}

export interface BookingPayableResult {
  bookingCharge: number;
  percentage: number;
  nightFee: number;
  nightFeeNet: number;
  managementFee: number;
  payable: number;
  cleaningFeeNet: number;
}

/**
 * Calculate the payable amount to the property owner for a single OTA booking.
 * Pure function — no side effects, no DB access.
 *
 * Formula:
 *   bookingCharge = |commission| + |paymentFee| + |vat|
 *   percentage    = bookingCharge / grossAmount
 *   nightFee      = grossAmount - cleaningFeeAud
 *   nightFeeNet   = nightFee * (1 - percentage)
 *   managementFee = nightFeeNet * managementFeeRate
 *   payable       = nightFeeNet - managementFee + (owner ? cleaningFeeAud*(1-%) : 0)
 */
export function calculateBookingPayable(input: BookingPayableInput): BookingPayableResult {
  const { grossAmount, commission, paymentFee, vat, config } = input;

  const bookingCharge = Math.abs(commission) + Math.abs(paymentFee) + Math.abs(vat);
  const percentage = bookingCharge / grossAmount;

  const nightFee = grossAmount - config.cleaningFeeAud;
  const nightFeeNet = nightFee * (1 - percentage);
  const managementFee = nightFeeNet * config.managementFeeRate;

  const cleaningFeeNet = config.cleaningFeeTo === "owner"
    ? config.cleaningFeeAud * (1 - percentage)
    : 0;

  const payable = nightFeeNet - managementFee + cleaningFeeNet;

  return { bookingCharge, percentage, nightFee, nightFeeNet, managementFee, payable, cleaningFeeNet };
}
