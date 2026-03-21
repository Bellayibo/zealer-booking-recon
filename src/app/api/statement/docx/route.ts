import { NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  AlignmentType, WidthType, BorderStyle, HeadingLevel,
} from "docx";
import JSZip from "jszip";
import { LISTINGS } from "@/config/listings";

const BLUE = "17375E";
const GRAY = "F1F1F1";
const BORDER = { style: BorderStyle.SINGLE, color: "BEBEBE", size: 4 };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

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
  period: string;       // YYYY-MM
  dateIssued: string;   // e.g. "05 March 2026"
  bookings: StatementBooking[];
}

function txt(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text, font: "Montserrat", color: BLUE, bold: opts.bold, size: opts.size ?? 20 });
}

function cell(text: string, shade?: boolean, bold?: boolean): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: shade ? { fill: GRAY } : undefined,
    borders: ALL_BORDERS,
    children: [new Paragraph({ children: [txt(text, { bold })] })],
  });
}

function amountCell(amount: number, shade?: boolean): TableCell {
  const formatted = amount === 0 ? "$0" : `$ ${amount.toFixed(2)}`;
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: shade ? { fill: GRAY } : undefined,
    borders: ALL_BORDERS,
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(formatted)] })],
  });
}

function nights(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: undefined });
}

function fmtMonth(period: string): string {
  const [y, m] = period.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function generateStatement(input: StatementInput): Document {
  const listing = LISTINGS.find((l) => l.code === input.listingCode);
  const address = listing?.address ?? input.listingCode;
  const owner = listing?.ownerName ?? "";

  const grossTotal = input.bookings.reduce((s, b) => s + b.grossAmount, 0);
  const platformTotal = input.bookings.reduce((s, b) => s + b.bookingCharge, 0);
  const mgmtTotal = input.bookings.reduce((s, b) => s + b.managementFee, 0);
  const payableTotal = input.bookings.reduce((s, b) => s + b.payable, 0);

  const summaryRows = [
    ["Gross Revenue", grossTotal, false],
    ["Other Fees", 0, true],
    ["Total Income", grossTotal, false],
    ["Platform Fees", platformTotal, true],
    ["Payment Fees", 0, false],
    ["Cleaning Fees", 0, true],
    ["Management Fees", mgmtTotal, false],
    ["Expenses", 0, true],
    ["Net to Owner", payableTotal, false],
  ] as [string, number, boolean][];

  const bookingRows = input.bookings.map((b, i) =>
    new TableRow({
      children: [
        new TableCell({ borders: ALL_BORDERS, shading: i % 2 ? { fill: GRAY } : undefined, children: [new Paragraph({ children: [txt(fmtDate(b.checkIn))] })] }),
        new TableCell({ borders: ALL_BORDERS, shading: i % 2 ? { fill: GRAY } : undefined, children: [new Paragraph({ children: [txt(fmtDate(b.checkOut))] })] }),
        new TableCell({ borders: ALL_BORDERS, shading: i % 2 ? { fill: GRAY } : undefined, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(String(nights(b.checkIn, b.checkOut)))] })] }),
        new TableCell({ borders: ALL_BORDERS, shading: i % 2 ? { fill: GRAY } : undefined, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(`$ ${b.grossAmount.toFixed(2)}`)] })] }),
      ],
    })
  );

  return new Document({
    sections: [{
      children: [
        // Title
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "MONTHLY OWNER STATEMENT", font: "Alice", color: BLUE, size: 40, bold: true })] }),
        new Paragraph({ children: [] }),

        // Header info table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: ALL_BORDERS,
          rows: [
            new TableRow({ children: [cell("Property", false, true), cell(address)] }),
            new TableRow({ children: [cell("Owner", true, true), cell(owner, true)] }),
            new TableRow({ children: [cell("Month", false, true), cell(fmtMonth(input.period))] }),
            new TableRow({ children: [cell("Date Issued", true, true), cell(input.dateIssued, true)] }),
          ],
        }),
        new Paragraph({ children: [] }),

        // Summary header
        new Paragraph({ children: [txt("Summary", { bold: true, size: 24 })] }),

        // Summary table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: ALL_BORDERS,
          rows: [
            new TableRow({ children: [cell("Item", false, true), new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Amount (AUD)", { bold: true })] })] })] }),
            ...summaryRows.map(([label, amount, shade]) =>
              new TableRow({ children: [cell(label, shade), amountCell(amount, shade)] })
            ),
          ],
        }),
        new Paragraph({ children: [] }),

        // Bookings header
        new Paragraph({ children: [txt("Bookings", { bold: true, size: 24 })] }),

        // Bookings table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: ALL_BORDERS,
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ children: [txt("Check in", { bold: true })] })] }),
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ children: [txt("Check out", { bold: true })] })] }),
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Nights", { bold: true })] })] }),
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Total", { bold: true })] })] }),
              ],
            }),
            ...bookingRows,
          ],
        }),
        new Paragraph({ children: [] }),

        // Expenses placeholder
        new Paragraph({ children: [txt("Expenses", { bold: true, size: 24 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: ALL_BORDERS,
          rows: [
            new TableRow({
              children: [
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ children: [txt("Date", { bold: true })] })] }),
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ children: [txt("Item", { bold: true })] })] }),
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ children: [txt("Category", { bold: true })] })] }),
                new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Amount", { bold: true })] })] }),
              ],
            }),
          ],
        }),
        new Paragraph({ children: [] }),

        // Payout table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: ALL_BORDERS,
          rows: [
            new TableRow({ children: [new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ children: [txt("Description", { bold: true })] })] }), new TableCell({ borders: ALL_BORDERS, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("Amount", { bold: true })] })] })] }),
            new TableRow({ children: [cell("Net Payable"), amountCell(payableTotal)] }),
            new TableRow({ children: [cell("Adjustments", true), cell("NA", true)] }),
            new TableRow({ children: [cell("Payout This Month", false, true), amountCell(payableTotal)] }),
          ],
        }),
      ],
    }],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { statements: StatementInput[] };
    const zip = new JSZip();

    for (const input of body.statements) {
      const doc = generateStatement(input);
      const buf = await Packer.toBuffer(doc);
      const monthLabel = new Date(input.period + "-01").toLocaleDateString("en-AU", { month: "short", year: "numeric" });
      zip.file(`OWNER_STATEMENT_${input.listingCode}_${monthLabel.replace(" ", "_")}.docx`, buf);
    }

    const zipBuf = await zip.generateAsync({ type: "arraybuffer" });
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
