/**
 * Guesty owner-payable formula — single source of truth.
 *
 * Shared by the API route (`/api/guesty/calculate`) and the on-screen
 * recompute in the Guesty tab (`getGuestyEffective`), so both always agree.
 *
 * Rules (confirmed against the manual June reconciliation):
 *   nightFee              = gross - cleaningFee
 *   platformChargeNight   = nightFee     * platformPct
 *   platformChargeCleaning= cleaningFee  * platformPct
 *   nightFeeNet           = nightFee     * (1 - platformPct)
 *   managementFee         = nightFeeNet  * managementFeeRate
 *   payable               = nightFeeNet - managementFee - platformChargeCleaning
 *                           + (cleaningFeeTo === "owner" ? cleaningFee : 0)
 *
 * Host-cleaning: the platform's cut of the cleaning fee is borne by the owner
 * (deducted). Owner-cleaning: owner receives the full cleaning fee, so the two
 * cleaning terms net to cleaningFee * (1 - platformPct).
 *
 * Cleaning-only settlement (e.g. Ultimo master lease): no management fee and the
 * owner's payable is simply the cleaning fee.
 */
export interface GuestyPayableInput {
  gross: number;             // TOTAL GUEST PAYOUT
  cleaningFee: number;       // TOTAL FEES (from CSV)
  platformPct: number;       // (channelCommission + processingFees) * 1.1 / gross
  managementFeeRate: number; // e.g. 0.13
  cleaningFeeTo: "host" | "owner" | null;
  settlement?: "cleaning-only" | null;
}

export interface GuestyPayableResult {
  nightFee: number;
  platformChargeNight: number;
  platformChargeCleaning: number;
  nightFeeNet: number;
  cleaningFeeNet: number;
  managementFee: number;
  payable: number;
}

export function calculateGuestyPayable(input: GuestyPayableInput): GuestyPayableResult {
  const { gross, cleaningFee, platformPct, managementFeeRate, cleaningFeeTo } = input;

  const nightFee = gross - cleaningFee;
  const platformChargeNight = nightFee * platformPct;
  const platformChargeCleaning = cleaningFee * platformPct;
  const nightFeeNet = nightFee * (1 - platformPct);
  const cleaningFeeNet = cleaningFee * (1 - platformPct);

  const cleaningOnly = input.settlement === "cleaning-only";
  const managementFee = cleaningOnly ? 0 : nightFeeNet * managementFeeRate;
  const payable = cleaningOnly
    ? cleaningFee
    : nightFeeNet - managementFee - platformChargeCleaning
      + (cleaningFeeTo === "owner" ? cleaningFee : 0);

  return {
    nightFee,
    platformChargeNight,
    platformChargeCleaning,
    nightFeeNet,
    cleaningFeeNet,
    managementFee,
    payable,
  };
}
