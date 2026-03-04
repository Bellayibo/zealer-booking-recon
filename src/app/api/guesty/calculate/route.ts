import { NextResponse } from "next/server";
import { findListingByPropertyName } from "@/config/listings";
import { parseGuestyCsv } from "@/lib/guesty-csv-parser";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("guestyCsv") as File | null;
    const period = (formData.get("period") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Guesty CSV 文件必须提供" }, { status: 400 });
    }

    const csvContent = await file.text();
    const parsed = parseGuestyCsv(csvContent, period);
    if (!parsed.success) {
      return NextResponse.json({ error: `CSV 解析失败: ${parsed.error}` }, { status: 400 });
    }

    const results = parsed.bookings.map((booking) => {
      const listing = findListingByPropertyName(booking.propertyName);

      if (!listing) {
        return {
          ...booking,
          listingCode: null as string | null,
          expectedRate: null as number | null,
          actualRate: booking.netIncome > 0 ? booking.commission / booking.netIncome : null,
          rateMatch: false,
          status: "no_config" as const,
        };
      }

      const expectedRate = listing.managementFeeRate;
      const actualRate = booking.netIncome > 0 ? booking.commission / booking.netIncome : 0;
      const rateMatch = Math.abs(actualRate - expectedRate) < 0.001;

      return {
        ...booking,
        listingCode: listing.code,
        expectedRate,
        actualRate,
        rateMatch,
        status: "ok" as const,
      };
    });

    const summary = {
      total: results.length,
      matched: results.filter((r) => r.status === "ok").length,
      unmatched: results.filter((r) => r.status === "no_config").length,
      rateMismatch: results.filter((r) => r.status === "ok" && !r.rateMatch).length,
      totalNetIncome: results.reduce((s, r) => s + r.netIncome, 0),
      totalCommission: results.reduce((s, r) => s + r.commission, 0),
      totalOwnerRevenue: results.reduce((s, r) => s + r.ownerRevenue, 0),
    };

    return NextResponse.json({ success: true, data: { period, results, summary } });
  } catch (e) {
    console.error("[Guesty Calculate]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Calculate failed" }, { status: 500 });
  }
}
