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

  it("563A: host cleaning fee — cleaning not included in payable", () => {
    const result = calculateBookingPayable({
      grossAmount: 581.18,
      commission: -87.18,
      paymentFee: -11.04,
      vat: -9.82,
      config: { cleaningFeeAud: 160, cleaningFeeTo: "host", managementFeeRate: 0.13 },
    });
    expect(result.payable).toBeCloseTo(298.31, 1);
  });

  it("4-122: host cleaning fee, 18% mgmt fee", () => {
    const result = calculateBookingPayable({
      grossAmount: 377.36,
      commission: -56.60,
      paymentFee: -7.17,
      vat: -6.38,
      config: { cleaningFeeAud: 130, cleaningFeeTo: "host", managementFeeRate: 0.18 },
    });
    expect(result.payable).toBeCloseTo(165.13, 1);
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
