import { describe, it, expect } from "vitest";
import { calculateBookingPayable } from "./calculator";

describe("calculateBookingPayable", () => {
  it("118A: owner cleaning fee — returns correct payable", () => {
    const result = calculateBookingPayable({
      grossAmount: 763.16,
      commission: -114.47,
      paymentFee: -14.50,
      vat: -12.90,
      config: { cleaningFeeAud: 180, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
    });
    expect(result.bookingCharge).toBeCloseTo(141.87, 1);
    expect(result.percentage).toBeCloseTo(0.1859, 3);
    expect(result.nightFee).toBeCloseTo(583.16, 1);
    expect(result.managementFee).toBeCloseTo(94.95, 1);
    expect(result.payable).toBeCloseTo(526.34, 1);
  });

  it("563A: host cleaning fee — cleaning-fee platform charge deducted from owner", () => {
    const result = calculateBookingPayable({
      grossAmount: 581.18,
      commission: -87.18,
      paymentFee: -11.04,
      vat: -9.82,
      config: { cleaningFeeAud: 160, cleaningFeeTo: "host", managementFeeRate: 0.13 },
    });
    // 298.31 (old) − 29.74 cleaning platform charge = 268.56
    expect(result.payable).toBeCloseTo(268.56, 1);
  });

  it("Ultimo: cleaning-only settlement — no mgmt fee, payable = cleaning fee", () => {
    const result = calculateBookingPayable({
      grossAmount: 2292.85,
      commission: -343.93,
      paymentFee: -43.56,
      vat: 0,
      config: { cleaningFeeAud: 285, cleaningFeeTo: "host", managementFeeRate: 0, settlement: "cleaning-only" },
    });
    expect(result.managementFee).toBe(0);
    expect(result.payable).toBe(285);
  });

  it("4-122: host cleaning fee, 18% mgmt fee", () => {
    const result = calculateBookingPayable({
      grossAmount: 377.36,
      commission: -56.60,
      paymentFee: -7.17,
      vat: -6.38,
      config: { cleaningFeeAud: 130, cleaningFeeTo: "host", managementFeeRate: 0.18 },
    });
    // 165.13 (old) − 24.17 cleaning platform charge = 140.96
    expect(result.payable).toBeCloseTo(140.96, 1);
  });

  it("1-24: owner cleaning fee — large booking", () => {
    const result = calculateBookingPayable({
      grossAmount: 2848.82,
      commission: -427.32,
      paymentFee: -54.13,
      vat: -48.15,
      config: { cleaningFeeAud: 230, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
    });
    expect(result.payable).toBeCloseTo(1892.83, 1);
  });
});
