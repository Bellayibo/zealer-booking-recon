import { NextResponse } from "next/server";
import { findListingByPropertyName } from "@/config/listings";
import { parseGuestyCsv } from "@/lib/guesty-csv-parser";
import { calculateGuestyPayable } from "@/lib/guesty-calculator";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("guestyCsv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Guesty CSV 文件必须提供" }, { status: 400 });
    }

    const csvContent = await file.text();
    const parsed = parseGuestyCsv(csvContent); // no period filter — load all bookings
    if (!parsed.success) {
      return NextResponse.json({ error: `CSV 解析失败: ${parsed.error}` }, { status: 400 });
    }

    const results = parsed.bookings.map((booking) => {
      const listing = findListingByPropertyName(booking.propertyName);

      // ── Core formula (see src/lib/guesty-calculator.ts) ─────────────────
      const gross = booking.totalGuestPayout;
      const cleaningFee = booking.totalFees;
      // Platform charge from CSV: (CHANNEL COMMISSION INCL TAX + PROCESSING FEES) × 1.1,
      // then derive effective rate against total guest payout.
      // For direct bookings (no channel commission), platform charge = 0.
      const bookingChargeFromCsv = (booking.channelCommission + booking.processingFees) * 1.1;
      const platformPct = gross > 0 ? bookingChargeFromCsv / gross : 0;

      const calc = calculateGuestyPayable({
        gross,
        cleaningFee,
        platformPct,
        managementFeeRate: listing?.managementFeeRate ?? 0,
        cleaningFeeTo: listing?.cleaningFeeTo ?? null,
        settlement: listing?.settlement ?? null,
      });

      if (!listing) {
        return {
          ...booking,
          listingCode: null as string | null,
          cleaningFeeTo: null as "host" | "owner" | null,
          settlement: null as "cleaning-only" | null,
          expectedRate: null as number | null,
          actualRate: null as number | null,
          rateMatch: false,
          status: "no_config" as const,
          // calculated (geometry only; payout left at 0 until the listing is mapped)
          platformPct,
          ...calc,
          managementFee: 0,
          payable: 0,
        };
      }

      const expectedRate = listing.managementFeeRate;
      // actualRate = what Guesty CSV's commission implies as a rate of nightFeeNet
      const actualRate = calc.nightFeeNet > 0 ? booking.commission / calc.nightFeeNet : null;
      const rateMatch = actualRate != null && Math.abs(actualRate - expectedRate) < 0.005;

      return {
        ...booking,
        listingCode: listing.code,
        cleaningFeeTo: listing.cleaningFeeTo,
        settlement: listing.settlement ?? null,
        expectedRate,
        actualRate,
        rateMatch,
        status: "ok" as const,
        // calculated
        platformPct,
        ...calc,
      };
    });

    const summary = {
      total: results.length,
      matched: results.filter((r) => r.status === "ok").length,
      unmatched: results.filter((r) => r.status === "no_config").length,
      rateMismatch: results.filter((r) => r.status === "ok" && !r.rateMatch).length,
      totalGross: results.reduce((s, r) => s + r.totalGuestPayout, 0),
      totalNetIncome: results.reduce((s, r) => s + r.netIncome, 0),
      totalCommission: results.reduce((s, r) => s + r.managementFee, 0),
      totalOwnerRevenue: results.reduce((s, r) => s + r.payable, 0),
    };

    return NextResponse.json({ success: true, data: { results, summary } });
  } catch (e) {
    console.error("[Guesty Calculate]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Calculate failed" }, { status: 500 });
  }
}
