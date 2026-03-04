export interface BookingComRow {
  referenceNumber: string;
  checkIn: string;
  checkOut: string;
  propertyId: string;
  propertyName: string;
  grossAmount: number;
  commission: number;
  paymentFee: number;
  vat: number;
  payoutAmount: number;
  payoutDate: string;
}

type ParseResult =
  | { success: true; bookings: BookingComRow[] }
  | { success: false; error: string };

/** Parse Booking.com payout CSV. Returns only Reservation rows with status "Okay". */
export function parseBookingComCsv(csvContent: string): ParseResult {
  try {
    const rows = csvContent.trim().split("\n").map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2) return { success: false, error: "CSV 文件为空或缺少数据行" };

    const headers = splitCsvRow(rows[0]).map((h) => h.trim().toLowerCase());

    const required = ["type/transaction type", "gross amount", "commission", "property name", "check-in date"];
    for (const col of required) {
      if (!headers.includes(col)) return { success: false, error: `CSV 缺少必要列: "${col}"` };
    }

    const idx = (name: string) => headers.indexOf(name.toLowerCase());
    const iType       = idx("type/transaction type");
    const iRef        = idx("reference number");
    const iCheckIn    = idx("check-in date");
    const iCheckOut   = idx("check-out date");
    const iStatus     = idx("reservation status");
    const iPropId     = idx("property id");
    const iPropName   = idx("property name");
    const iGross      = idx("gross amount");
    const iCommission = idx("commission");
    const iPayFee     = idx("payments service fee");
    const iVat        = idx("vat");
    const iPayoutAmt  = idx("payable amount");
    const iPayoutDate = idx("payout date");

    const bookings: BookingComRow[] = [];
    for (const row of rows.slice(1)) {
      if (!row) continue;
      const cols = splitCsvRow(row);

      const type   = (cols[iType] ?? "").trim();
      const status = (cols[iStatus] ?? "").trim();

      if (type !== "Reservation" || status !== "Okay") continue;

      const gross = parseNum(cols[iGross]);
      if (gross <= 0) continue;

      bookings.push({
        referenceNumber: (cols[iRef] ?? "").trim(),
        checkIn:         (cols[iCheckIn] ?? "").trim(),
        checkOut:        (cols[iCheckOut] ?? "").trim(),
        propertyId:      (cols[iPropId] ?? "").trim(),
        propertyName:    (cols[iPropName] ?? "").trim(),
        grossAmount:     gross,
        commission:      parseNum(cols[iCommission]),
        paymentFee:      parseNum(cols[iPayFee]),
        vat:             parseNum(cols[iVat]),
        payoutAmount:    parseNum(cols[iPayoutAmt]),
        payoutDate:      (cols[iPayoutDate] ?? "").trim(),
      });
    }

    return { success: true, bookings };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "CSV 解析失败" };
  }
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.trim().replace(/[,$%]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  return parseFloat(cleaned);
}

function splitCsvRow(row: string): string[] {
  const result: string[] = [];
  let cur = "", inQ = false;
  for (const ch of row) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}
