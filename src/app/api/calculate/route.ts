import { NextResponse } from "next/server";
import { findListingByPropertyName } from "@/config/listings";
import { parseBookingComCsv } from "@/lib/csv-parser";
import { calculateBookingPayable } from "@/lib/calculator";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const bookingComFile = formData.get("bookingComCsv") as File | null;
    const period = (formData.get("period") as string) || "";

    if (!bookingComFile) {
      return NextResponse.json({ error: "Booking.com CSV 文件必须提供" }, { status: 400 });
    }

    const csvContent = await bookingComFile.text();
    const parsed = parseBookingComCsv(csvContent);
    if (!parsed.success) {
      return NextResponse.json({ error: `CSV 解析失败: ${parsed.error}` }, { status: 400 });
    }

    const results = parsed.bookings.map((booking) => {
      const listing = findListingByPropertyName(booking.propertyName);

      if (!listing) {
        return {
          ...booking,
          listingCode: null as string | null,
          status: "no_config" as const,
          error: `无匹配配置: ${booking.propertyName}`,
          calculation: null,
        };
      }

      const calculation = calculateBookingPayable({
        grossAmount: booking.grossAmount,
        commission: booking.commission,
        paymentFee: booking.paymentFee,
        vat: booking.vat,
        config: {
          cleaningFeeAud: listing.cleaningFee,
          cleaningFeeTo: listing.cleaningFeeTo,
          managementFeeRate: listing.managementFeeRate,
        },
      });

      return {
        ...booking,
        listingCode: listing.code,
        managementFeeRate: listing.managementFeeRate,
        status: "ok" as const,
        error: null,
        calculation,
      };
    });

    const summary = {
      total: results.length,
      matched: results.filter((r) => r.status === "ok").length,
      unmatched: results.filter((r) => r.status === "no_config").length,
      totalGrossAmount: results.reduce((s, r) => s + r.grossAmount, 0),
      totalPayable: results.filter((r) => r.calculation).reduce((s, r) => s + (r.calculation?.payable ?? 0), 0),
    };

    return NextResponse.json({ success: true, data: { period, results, summary } });
  } catch (e) {
    console.error("[OTA Recon Calculate]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Calculate failed" }, { status: 500 });
  }
}
