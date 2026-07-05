import { describe, it, expect } from "vitest";
import { calculateGuestyPayable } from "./guesty-calculator";

// Oracle values come from the manually-reconciled June table (June_Booking_副本.xlsx),
// confirmed correct by the user. platformPct 0.1859 = Booking.com's (comm+fees)*1.1/gross.
describe("calculateGuestyPayable", () => {
  it("579 — host cleaning: deducts the cleaning-fee platform charge from the owner", () => {
    const r = calculateGuestyPayable({
      gross: 2432.41, cleaningFee: 225, platformPct: 0.1859,
      managementFeeRate: 0.17, cleaningFeeTo: "host",
    });
    expect(r.payable).toBeCloseTo(1449.73, 1); // NOT 1491.55 (old formula without the deduction)
  });

  it("7-108 — host cleaning at 13% mgmt rate", () => {
    const r = calculateGuestyPayable({
      gross: 1643.76, cleaningFee: 190, platformPct: 0.1859,
      managementFeeRate: 0.13, cleaningFeeTo: "host",
    });
    expect(r.payable).toBeCloseTo(994.33, 1);
  });

  it("1-24 — owner cleaning: owner receives the full cleaning fee (net of platform)", () => {
    const r = calculateGuestyPayable({
      gross: 903.94, cleaningFee: 230, platformPct: 0.1859,
      managementFeeRate: 0.20, cleaningFeeTo: "owner",
    });
    expect(r.payable).toBeCloseTo(626.17, 1);
  });

  it("Ultimo — cleaning-only settlement: no mgmt fee, payable = cleaning fee", () => {
    const r = calculateGuestyPayable({
      gross: 2292.85, cleaningFee: 285, platformPct: 0.1859,
      managementFeeRate: 0.20, cleaningFeeTo: "host", settlement: "cleaning-only",
    });
    expect(r.managementFee).toBe(0);
    expect(r.payable).toBe(285);
  });

  it("owner and host cleaning differ by exactly the gross cleaning fee", () => {
    const base = { gross: 1000, cleaningFee: 200, platformPct: 0.1859, managementFeeRate: 0.20 };
    const owner = calculateGuestyPayable({ ...base, cleaningFeeTo: "owner" });
    const host = calculateGuestyPayable({ ...base, cleaningFeeTo: "host" });
    expect(owner.payable - host.payable).toBeCloseTo(200, 6);
  });
});
