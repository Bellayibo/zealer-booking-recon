export interface OtaConfigInput {
  cleaningFeeAud: number;
  cleaningFeeTo: "host" | "owner";
  managementFeeRate: number;
  settlement?: "cleaning-only"; // master lease: no mgmt fee, owner payable = cleaning fee
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
  platformChargeCleaning: number;
}

/**
 * Calculate the payable amount to the property owner for a single OTA booking.
 * Pure function — no side effects, no DB access.
 *
 * Mirrors the Guesty formula (see src/lib/guesty-calculator.ts); the only
 * difference is how `percentage` is derived from the source data.
 *
 *   bookingCharge         = |commission| + |paymentFee| + |vat|
 *   percentage            = bookingCharge / grossAmount
 *   nightFee              = grossAmount - cleaningFeeAud
 *   nightFeeNet           = nightFee    * (1 - percentage)
 *   platformChargeCleaning= cleaningFeeAud * percentage
 *   managementFee         = nightFeeNet * managementFeeRate
 *   payable               = nightFeeNet - managementFee - platformChargeCleaning
 *                           + (cleaningFeeTo === "owner" ? cleaningFeeAud : 0)
 *
 * Host-cleaning: the platform's cut of the cleaning fee is deducted from the owner.
 * Cleaning-only settlement (master lease): no mgmt fee, payable = cleaning fee.
 */
export function calculateBookingPayable(input: BookingPayableInput): BookingPayableResult {
  const { grossAmount, commission, paymentFee, vat, config } = input;

  const bookingCharge = Math.abs(commission) + Math.abs(paymentFee) + Math.abs(vat);
  const percentage = bookingCharge / grossAmount;

  const nightFee = grossAmount - config.cleaningFeeAud;
  const nightFeeNet = nightFee * (1 - percentage);
  const platformChargeCleaning = config.cleaningFeeAud * percentage;
  const cleaningFeeNet = config.cleaningFeeTo === "owner"
    ? config.cleaningFeeAud * (1 - percentage)
    : 0;

  const cleaningOnly = config.settlement === "cleaning-only";
  const managementFee = cleaningOnly ? 0 : nightFeeNet * config.managementFeeRate;
  const payable = cleaningOnly
    ? config.cleaningFeeAud
    : nightFeeNet - managementFee - platformChargeCleaning
      + (config.cleaningFeeTo === "owner" ? config.cleaningFeeAud : 0);

  return { bookingCharge, percentage, nightFee, nightFeeNet, managementFee, payable, cleaningFeeNet, platformChargeCleaning };
}
