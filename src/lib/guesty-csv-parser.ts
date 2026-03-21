export interface GuestyBooking {
  confirmationCode: string;
  creationDate: string; // YYYY-MM-DD
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  propertyName: string;
  totalGuestPayout: number;  // TOTAL GUEST PAYOUT = gross amount paid by guest
  totalPayout: number;       // TOTAL PAYOUT — may differ from totalGuestPayout; flag for review
  totalFees: number;         // TOTAL FEES = cleaning fee
  netIncome: number;
  commission: number;
  ownerRevenue: number;
  channelCommission: number;
  processingFees: number;
  commissionFormula: string;
}

export type ParseGuestyCsvResult =
  | { success: true; bookings: GuestyBooking[] }
  | { success: false; error: string };

const REQUIRED_COLS = ["CHECK-IN DATE", "CHECK-OUT DATE", "LISTING", "NET INCOME", "COMMISSION", "OWNER REVENUE"];

function parseDate(raw: string): string {
  // "2026-02-06 03:00 PM" → "2026-02-06"
  // "2026/2/6" → "2026-02-06"
  const s = raw.trim().split(" ")[0];
  if (s.includes("/")) {
    const [y, m, d] = s.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

function num(raw: string): number {
  const n = parseFloat(raw?.trim() || "0");
  return isNaN(n) ? 0 : n;
}

export function parseGuestyCsv(csv: string, period = ""): ParseGuestyCsvResult {
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

    const checkOut = parseDate(get("CHECK-OUT DATE"));
    // Filter by checkout period only if period is specified
    if (period && !checkOut.startsWith(period)) continue;

    const ownerRevenue = num(get("OWNER REVENUE"));
    const totalGuestPayout = num(get("TOTAL GUEST PAYOUT")) || num(get("TOTAL PAID"));
    const cancellationFee = num(get("CANCELLATION FEE"));
    // Skip true no-shows: no payment received at all
    if (ownerRevenue === 0 && totalGuestPayout === 0 && cancellationFee === 0) continue;

    bookings.push({
      confirmationCode: get("CONFIRMATION CODE"),
      creationDate: parseDate(get("CREATION DATE")),
      checkIn: parseDate(get("CHECK-IN DATE")),
      checkOut,
      propertyName: get("LISTING"),
      // HomeAway (HA-) bookings have empty TOTAL GUEST PAYOUT — fall back to TOTAL PAID then TOTAL PAYOUT
      totalGuestPayout: totalGuestPayout || num(get("TOTAL PAYOUT")),
      totalPayout: num(get("TOTAL PAYOUT")),
      totalFees: num(get("TOTAL FEES")),
      netIncome: num(get("NET INCOME")),
      commission: num(get("COMMISSION")),
      ownerRevenue,
      channelCommission: num(get("CHANNEL COMMISSION INCL TAX")),
      processingFees: num(get("PROCESSING FEES")),
      commissionFormula: get("COMMISSION FORMULA"),
    });
  }

  return { success: true, bookings };
}
