export interface GuestyBooking {
  confirmationCode: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  propertyName: string;
  netIncome: number;
  commission: number;
  ownerRevenue: number;
  channelCommission: number;
  commissionFormula: string;
  totalFees: number;
}

export type ParseGuestyCsvResult =
  | { success: true; bookings: GuestyBooking[] }
  | { success: false; error: string };

const REQUIRED_COLS = ["CHECK-IN", "CHECK-OUT", "LISTING", "NET INCOME", "COMMISSION", "OWNER REVENUE"];

function parseDate(raw: string): string {
  // "2026-02-06 03:00 PM" → "2026-02-06"
  return raw.trim().split(" ")[0];
}

function num(raw: string): number {
  const n = parseFloat(raw?.trim() || "0");
  return isNaN(n) ? 0 : n;
}

export function parseGuestyCsv(csv: string, period: string): ParseGuestyCsvResult {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { success: false, error: "CSV 文件为空" };

  // Parse header — strip surrounding quotes
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());

  const missing = REQUIRED_COLS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { success: false, error: `Guesty CSV 缺少必要列: ${missing.join(", ")}` };
  }

  const idx = (col: string) => header.indexOf(col);

  // Parse rows — handle quoted fields with commas inside
  const bookings: GuestyBooking[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells: string[] = [];
    let inQuote = false;
    let cell = "";
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cells.push(cell); cell = ""; }
      else { cell += ch; }
    }
    cells.push(cell);

    const get = (col: string) => (cells[idx(col)] ?? "").replace(/^"|"$/g, "").trim();

    const checkOut = parseDate(get("CHECK-OUT"));
    // Filter: checkout in specified period (YYYY-MM)
    if (!checkOut.startsWith(period)) continue;

    const ownerRevenue = num(get("OWNER REVENUE"));
    // Skip zero-revenue rows (cancellations / no-shows)
    if (ownerRevenue === 0) continue;

    bookings.push({
      confirmationCode: get("CONFIRMATION CODE"),
      checkIn: parseDate(get("CHECK-IN")),
      checkOut,
      propertyName: get("LISTING"),
      netIncome: num(get("NET INCOME")),
      commission: num(get("COMMISSION")),
      ownerRevenue,
      channelCommission: num(get("CHANNEL COMMISSION INCL TAX")),
      commissionFormula: get("COMMISSION FORMULA"),
      totalFees: num(get("TOTAL FEES")),
    });
  }

  return { success: true, bookings };
}
