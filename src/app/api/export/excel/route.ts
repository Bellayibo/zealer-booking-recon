import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface BookingResult {
  listingCode: string | null;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  grossAmount: number;
  payoutAmount: number;
  payoutDate: string;
  managementFeeRate?: number;
  status: "ok" | "no_config";
  calculation: {
    bookingCharge: number;
    percentage: number;
    nightFee: number;
    managementFee: number;
    payable: number;
    cleaningFeeNet: number;
  } | null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { results: BookingResult[]; period: string };
    const { results, period } = body;

    const rows = results
      .filter((r) => r.status === "ok" && r.calculation)
      .map((r) => ({
        Listing: r.listingCode,
        "Date of Stay": `${r.checkIn} - ${r.checkOut}`,
        Amount: r.grossAmount,
        "Booking Charge": r.calculation!.bookingCharge,
        "Platform Commission": r.calculation!.percentage,
        "Night Fee": r.calculation!.nightFee,
        "Platform Charge (Night)": r.calculation!.nightFee * r.calculation!.percentage,
        "Cleaning Fee": r.grossAmount - r.calculation!.nightFee,
        "Platform Charge (Cleaning)": (r.grossAmount - r.calculation!.nightFee) * r.calculation!.percentage,
        "Mgmt Fee Rate": r.managementFeeRate != null ? `${(r.managementFeeRate * 100).toFixed(0)}%` : "-",
        "Management Fee": r.calculation!.managementFee,
        Payable: r.calculation!.payable,
        "Date of Payout": r.payoutDate,
        Channel: "Booking.com",
        "Bank Receipt": r.payoutAmount,
      }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Summary");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const filename = `OTA_Summary_${period.replace("-", "_")}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[OTA Recon Excel Export]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
