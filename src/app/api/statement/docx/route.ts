import { NextResponse } from "next/server";
import JSZip from "jszip";
import { LISTINGS } from "@/config/listings";
import fs from "fs";
import path from "path";

interface StatementBooking {
  checkIn: string;
  checkOut: string;
  grossAmount: number;
  bookingCharge: number;
  managementFee: number;
  payable: number;
}

interface StatementInput {
  listingCode: string;
  period: string;
  dateIssued: string;
  bookings: StatementBooking[];
  address?: string;
  ownerName?: string;
}

/* ── Helpers ── */
function nights(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fmtMonth(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }
  return period;
}

function money(n: number): string {
  if (n === 0) return "$0";
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ── Fill the cleaned template with real data ── */
async function fillTemplate(templateBuf: Buffer, input: StatementInput): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("document.xml missing from template");
  let xml = await docFile.async("string");

  const listing = LISTINGS.find((l) => l.code === input.listingCode);
  const address = input.address || listing?.address || input.listingCode;
  const owner = input.ownerName || listing?.ownerName || "";

  const grossTotal = input.bookings.reduce((s, b) => s + b.grossAmount, 0);
  const platformTotal = input.bookings.reduce((s, b) => s + b.bookingCharge, 0);
  const mgmtTotal = input.bookings.reduce((s, b) => s + b.managementFee, 0);
  const payableTotal = input.bookings.reduce((s, b) => s + b.payable, 0);

  /* ── Expand bookings rows ── */
  const rowStart = "<!--BOOKING_ROW_START-->";
  const rowEnd = "<!--BOOKING_ROW_END-->";
  const startIdx = xml.indexOf(rowStart);
  const endIdx = xml.indexOf(rowEnd);
  if (startIdx >= 0 && endIdx > startIdx) {
    const rowTemplate = xml.substring(startIdx + rowStart.length, endIdx);
    const expanded = input.bookings.map((b) =>
      rowTemplate
        .replace("{{CHECK_IN}}", escapeXml(fmtDate(b.checkIn)))
        .replace("{{CHECK_OUT}}", escapeXml(fmtDate(b.checkOut)))
        .replace("{{NIGHTS}}", escapeXml(String(nights(b.checkIn, b.checkOut))))
        .replace("{{BOOKING_TOTAL}}", escapeXml(money(b.grossAmount)))
    ).join("");
    xml = xml.substring(0, startIdx) + expanded + xml.substring(endIdx + rowEnd.length);
  }

  /* ── Simple placeholder replacement ── */
  const replacements: Record<string, string> = {
    "{{ADDRESS}}": escapeXml(address),
    "{{OWNER}}": escapeXml(owner),
    "{{MONTH}}": escapeXml(fmtMonth(input.period)),
    "{{DATE_ISSUED}}": escapeXml(input.dateIssued),
    "{{GROSS}}": escapeXml(money(grossTotal)),
    "{{OTHER_FEES}}": escapeXml(money(0)),
    "{{TOTAL_INCOME}}": escapeXml(money(grossTotal)),
    "{{PLATFORM}}": escapeXml(money(platformTotal)),
    "{{PAYMENT_FEES}}": escapeXml(money(0)),
    "{{CLEANING_FEES}}": escapeXml(money(0)),
    "{{MGMT}}": escapeXml(money(mgmtTotal)),
    "{{EXPENSES}}": escapeXml(money(0)),
    "{{NET_TO_OWNER}}": escapeXml(money(payableTotal)),
    "{{NET_PAYABLE}}": escapeXml(money(payableTotal)),
    "{{ADJUSTMENTS}}": "NA",
    "{{PAYOUT_THIS_MONTH}}": escapeXml(money(payableTotal)),
  };

  for (const [token, value] of Object.entries(replacements)) {
    xml = xml.split(token).join(value);
  }

  zip.file("word/document.xml", xml);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return buf;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { statements: StatementInput[] };

    // Load template once
    const templatePath = path.join(process.cwd(), "src/app/api/statement/docx/_template/template.docx");
    const templateBuf = fs.readFileSync(templatePath);

    const outZip = new JSZip();

    for (const input of body.statements) {
      const docBuf = await fillTemplate(templateBuf, input);
      let monthLabel: string;
      if (/^\d{4}-\d{2}$/.test(input.period)) {
        monthLabel = new Date(input.period + "-01").toLocaleDateString("en-AU", { month: "short", year: "numeric" });
      } else {
        monthLabel = input.period;
      }
      outZip.file(`MONTHLY_OWNER_STATEMENT_${input.listingCode}_${monthLabel.replace(/\s+/g, "_")}.docx`, docBuf);
    }

    const zipBuf = await outZip.generateAsync({ type: "arraybuffer" });
    return new NextResponse(zipBuf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Owner_Statements.zip"`,
      },
    });
  } catch (e) {
    console.error("[Statement DOCX]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
