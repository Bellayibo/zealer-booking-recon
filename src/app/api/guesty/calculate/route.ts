import { NextResponse } from "next/server";
import { findListingByPropertyName } from "@/config/listings";
import { parseGuestyCsv } from "@/lib/guesty-csv-parser";

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

      // ── Core formula (matches the spreadsheet) ──────────────────────────
      const gross = booking.totalGuestPayout;
      const cleaningFee = booking.totalFees;
      // Compute platform charge from CSV: (CHANNEL COMMISSION INCL TAX + PROCESSING FEES) × 1.1
      // Then derive effective rate against total guest payout.
      // For direct bookings (no channel commission), platform charge = 0.
      const bookingChargeFromCsv = (booking.channelCommission + booking.processingFees) * 1.1;
      const platformPct = gross > 0 ? bookingChargeFromCsv / gross : 0;

      const nightFee = gross - cleaningFee;
      const platformChargeNight    = nightFee * platformPct;
      const platformChargeCleaning = cleaningFee * platformPct;
      const nightFeeNet   = nightFee * (1 - platformPct);
      const cleaningFeeNet = cleaningFee * (1 - platformPct);

      if (!listing) {
        return {
          ...booking,
          listingCode: null as string | null,
          cleaningFeeTo: null as "host" | "owner" | null,
          expectedRate: null as number | null,
          actualRate: null as number | null,
          rateMatch: false,
          status: "no_config" as const,
          // calculated
          platformPct,
          nightFee,
          platformChargeNight,
          platformChargeCleaning,
          nightFeeNet,
          cleaningFeeNet,
          managementFee: 0,
          payable: 0,
        };
      }

      const expectedRate = listing.managementFeeRate;
      const managementFee = nightFeeNet * expectedRate;
      const payable = nightFeeNet - managementFee
        + (listing.cleaningFeeTo === "owner" ? cleaningFeeNet : 0);

      // actualRate = what Guesty CSV's commission implies as a rate of nightFeeNet
      const actualRate = nightFeeNet > 0 ? booking.commission / nightFeeNet : null;
      const rateMatch = actualRate != null && Math.abs(actualRate - expectedRate) < 0.005;

      return {
        ...booking,
        listingCode: listing.code,
        cleaningFeeTo: listing.cleaningFeeTo,
        expectedRate,
        actualRate,
        rateMatch,
        status: "ok" as const,
        // calculated
        platformPct,
        nightFee,
        platformChargeNight,
        platformChargeCleaning,
        nightFeeNet,
        cleaningFeeNet,
        managementFee,
        payable,
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
