import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface GuestyResult {
  listingCode: string | null;
  confirmationCode: string;
  creationDate: string;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  totalGuestPayout: number;
  totalPayout: number;
  netIncome: number;
  commission: number;
  ownerRevenue: number;
  channelCommission: number;
  processingFees: number;
  expectedRate: number | null;
  actualRate: number | null;
  rateMatch: boolean;
  status: "ok" | "no_config";
  platformPct: number;
  nightFee: number;
  platformChargeNight: number;
  platformChargeCleaning: number;
  nightFeeNet: number;
  cleaningFeeNet: number;
  managementFee: number;
  payable: number;
  totalFees: number;
  bankMatchDate?: string;
  cleaningFeeTo?: "host" | "owner" | null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { results: GuestyResult[] };
    const { results } = body;

    const rows = results.map((r) => {
      const bankReceipt = r.totalGuestPayout - (r.channelCommission + r.processingFees) * 1.1;
      const bookingCharge = (r.channelCommission + r.processingFees) * 1.1;
      return {
        Listing: r.listingCode ?? "⚠️ 未匹配",
        "Creation Date": r.creationDate || "-",
        "Check In": r.checkIn,
        "Check Out": r.checkOut,
        "Total Guest Payout": r.totalGuestPayout,
        "Total Payout": r.totalPayout,
        "Channel Commission": r.channelCommission,
        "Processing Fees": r.processingFees,
        "Booking Charge": Math.round(bookingCharge * 100) / 100,
        "Platform %": r.platformPct,
        "Clean Fee": r.totalFees,
        "Clean Fee Charge": Math.round(r.platformChargeCleaning * 100) / 100,
        "Net Income": r.netIncome,
        "Platform Charge": Math.round(r.platformChargeNight * 100) / 100,
        "Expected Mgmt Rate": r.expectedRate ?? 0,
        "Houst Charge": Math.round(r.managementFee * 100) / 100,
        "Cleaning fee(H&O)": r.cleaningFeeTo === "host" ? "H" : r.cleaningFeeTo === "owner" ? "O" : "-",
        Payable: Math.round(r.payable * 100) / 100,
        Channel: r.confirmationCode.startsWith("GY-") ? "Guesty/Direct" : r.confirmationCode.startsWith("BC-") ? "Booking.com" : "Other",
        "Bank Receipt (银行应收)": Math.round(bankReceipt * 100) / 100,
        "Bank Match Date (到账日期)": r.bankMatchDate || "—",
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Guesty Summary");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const filename = `Guesty_Summary_${new Date().toISOString().substring(0, 10)}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[Guesty Excel Export]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
