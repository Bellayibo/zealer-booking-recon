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
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { results: GuestyResult[] };
    const { results } = body;

    const rows = results.map((r) => {
      const bankReceipt = r.totalGuestPayout - (r.channelCommission + r.processingFees) * 1.1;
      return {
        Listing: r.listingCode ?? "⚠️ 未匹配",
        "Confirmation Code": r.confirmationCode || "-",
        "Creation Date": r.creationDate || "-",
        "Check In": r.checkIn,
        "Check Out": r.checkOut,
        "Total Guest Payout": r.totalGuestPayout,
        "Total Payout": r.totalPayout,
        "Cleaning Fee": r.totalFees,
        "Channel Commission": r.channelCommission,
        "Processing Fees": r.processingFees,
        "Platform %": `${(r.platformPct * 100).toFixed(2)}%`,
        "Bank Receipt (银行应收)": Math.round(bankReceipt * 100) / 100,
        "Bank Match Date (到账日期)": r.bankMatchDate || "—",
        "Net Income": r.netIncome,
        "Expected Mgmt Rate": r.expectedRate != null ? `${(r.expectedRate * 100).toFixed(0)}%` : "-",
        "Actual Mgmt Rate": r.actualRate != null ? `${(r.actualRate * 100).toFixed(1)}%` : "-",
        "Management Fee": r.commission,
        "Owner Revenue": r.ownerRevenue,
        "Payable": r.payable,
        Channel: r.confirmationCode.startsWith("GY-") ? "Guesty/Direct" : r.confirmationCode.startsWith("BC-") ? "Booking.com" : "Other",
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
