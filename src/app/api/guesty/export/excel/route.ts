import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface GuestyResult {
  listingCode: string | null;
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  netIncome: number;
  commission: number;
  ownerRevenue: number;
  channelCommission: number;
  expectedRate: number | null;
  actualRate: number | null;
  rateMatch: boolean;
  status: "ok" | "no_config";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { results: GuestyResult[]; period: string };
    const { results, period } = body;

    const rows = results.map((r) => ({
      Listing: r.listingCode ?? "⚠️ 未匹配",
      "Confirmation Code": r.confirmationCode || "-",
      "Date of Stay": `${r.checkIn} - ${r.checkOut}`,
      "Net Income": r.netIncome,
      "Channel Commission": r.channelCommission,
      "Expected Mgmt Rate": r.expectedRate != null ? `${(r.expectedRate * 100).toFixed(0)}%` : "-",
      "Actual Mgmt Rate": r.actualRate != null ? `${(r.actualRate * 100).toFixed(1)}%` : "-",
      "Management Fee": r.commission,
      "Owner Revenue": r.ownerRevenue,
      "Rate OK?": r.status === "no_config" ? "N/A" : r.rateMatch ? "✓" : "⚠️ 不符",
      Channel: r.confirmationCode.startsWith("GY-") ? "Guesty/Direct" : r.confirmationCode.startsWith("BC-") ? "Booking.com" : "Other",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Guesty Summary");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const filename = `Guesty_Summary_${period.replace("-", "_")}.xlsx`;

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
