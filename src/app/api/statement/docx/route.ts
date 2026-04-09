import { NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  AlignmentType, WidthType, BorderStyle, ImageRun, VerticalAlign,
  convertMillimetersToTwip,
} from "docx";
import JSZip from "jszip";
import { LISTINGS } from "@/config/listings";
import fs from "fs";
import path from "path";

const BLUE = "17375E";
const GRAY = "F1F1F1";
const WHITE = "FFFFFF";
const BORDER = { style: BorderStyle.SINGLE, color: "BEBEBE", size: 4 };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: WHITE },
  bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
  left: { style: BorderStyle.NONE, size: 0, color: WHITE },
  right: { style: BorderStyle.NONE, size: 0, color: WHITE },
};

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

/* ── Helper: text run ── */
function txt(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text, font: "Montserrat", color: opts.color ?? BLUE, bold: opts.bold, size: opts.size ?? 20 });
}

/* ── Helper: spacing paragraph between sections ── */
function spacer(mm = 3) {
  return new Paragraph({ spacing: { before: 0, after: convertMillimetersToTwip(mm) }, children: [] });
}

/* ── Helper: section title (e.g. "Summary", "Bookings") ── */
function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { before: convertMillimetersToTwip(2), after: convertMillimetersToTwip(1) },
    children: [txt(text, { bold: true, size: 22 })],
  });
}

/* ── Cell padding (in twips): ~2mm all around ── */
const CELL_MARGINS = {
  top: 40,
  bottom: 40,
  left: 120,
  right: 120,
};

/* ── Helper: dark-blue header cell (white text) ── */
function headerCell(text: string, align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT, widthPct?: number): TableCell {
  return new TableCell({
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: { fill: BLUE },
    borders: ALL_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 0 },
      children: [txt(text, { bold: true, color: WHITE })],
    })],
  });
}

/* ── Helper: regular data cell ── */
function dataCell(text: string, opts: { shade?: boolean; bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; widthPct?: number } = {}): TableCell {
  return new TableCell({
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: GRAY } : undefined,
    borders: ALL_BORDERS,
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: [txt(text, { bold: opts.bold })],
    })],
  });
}

/* ── Helper: amount data cell ── */
function amountCell(amount: number, shade?: boolean, bold?: boolean): TableCell {
  const formatted = amount.toFixed(2);
  return dataCell(formatted, { shade, bold, align: AlignmentType.RIGHT });
}

/* ── Helper: dollar amount cell (with $) ── */
function dollarCell(amount: number, shade?: boolean, bold?: boolean): TableCell {
  const formatted = `$${amount.toFixed(2)}`;
  return dataCell(formatted, { shade, bold, align: AlignmentType.RIGHT });
}

function nights(checkIn: string, checkOut: string): number {
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMonth(period: string): string {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }
  return period;
}

function generateStatement(input: StatementInput, logoBuffer: Buffer | null): Document {
  const listing = LISTINGS.find((l) => l.code === input.listingCode);
  const address = input.address || listing?.address || input.listingCode;
  const owner = input.ownerName || listing?.ownerName || "";

  const grossTotal = input.bookings.reduce((s, b) => s + b.grossAmount, 0);
  const platformTotal = input.bookings.reduce((s, b) => s + b.bookingCharge, 0);
  const mgmtTotal = input.bookings.reduce((s, b) => s + b.managementFee, 0);
  const payableTotal = input.bookings.reduce((s, b) => s + b.payable, 0);
  const totalIncome = grossTotal;

  /* ── Title + Logo row ── */
  const logoParaChildren: (TextRun | ImageRun)[] = logoBuffer
    ? [new ImageRun({ data: logoBuffer, transformation: { width: 160, height: 48 }, type: "jpg" })]
    : [];

  const titleTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDERS.top, bottom: NO_BORDERS.bottom, left: NO_BORDERS.left, right: NO_BORDERS.right, insideHorizontal: NO_BORDERS.top, insideVertical: NO_BORDERS.top },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [new TextRun({ text: "MONTHLY OWNER STATEMENT", font: "Alice", color: BLUE, size: 44, bold: true })],
            })],
          }),
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: logoParaChildren })],
          }),
        ],
      }),
    ],
  });

  /* ── Header info table ── */
  const headerInfoRows = [
    ["Property", address, false],
    ["Owner", owner, true],
    ["Month", fmtMonth(input.period), false],
    ["Date Issued", input.dateIssued, true],
  ] as [string, string, boolean][];

  const headerInfoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: headerInfoRows.map(([label, value, shade]) =>
      new TableRow({
        children: [
          dataCell(label, { shade, bold: true, widthPct: 35 }),
          dataCell(value, { shade, widthPct: 65 }),
        ],
      })
    ),
  });

  /* ── Summary table ── */
  const summaryData: [string, number, boolean, boolean][] = [
    ["Gross Revenue", grossTotal, false, false],
    ["Other Fees", 0, true, false],
    ["Total Income", totalIncome, false, false],
    ["Platform Fees", platformTotal, true, false],
    ["Payment Fees", 0, false, false],
    ["Cleaning Fees", 0, true, false],
    ["Management Fees", mgmtTotal, false, false],
    ["Expenses", 0, true, false],
    ["Net to Owner", payableTotal, false, false],
  ];

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell("Item", AlignmentType.LEFT), headerCell("Amount (AUD)", AlignmentType.RIGHT)] }),
      ...summaryData.map(([label, amount, shade]) =>
        new TableRow({
          children: [
            dataCell(label, { shade }),
            // Total Income and Net to Owner show with $ prefix
            label === "Total Income" || label === "Net to Owner"
              ? dollarCell(amount, shade)
              : amountCell(amount, shade),
          ],
        })
      ),
    ],
  });

  /* ── Bookings table ── */
  const bookingsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Check In", AlignmentType.LEFT),
          headerCell("Check Out", AlignmentType.LEFT),
          headerCell("Nights", AlignmentType.RIGHT),
          headerCell("Total", AlignmentType.RIGHT),
        ],
      }),
      ...input.bookings.map((b, i) => {
        const shade = i % 2 === 1;
        return new TableRow({
          children: [
            dataCell(fmtDate(b.checkIn), { shade }),
            dataCell(fmtDate(b.checkOut), { shade }),
            dataCell(String(nights(b.checkIn, b.checkOut)), { shade, align: AlignmentType.RIGHT }),
            dollarCell(b.grossAmount, shade),
          ],
        });
      }),
    ],
  });

  /* ── Expenses table ── */
  const expensesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Date", AlignmentType.LEFT),
          headerCell("Item", AlignmentType.LEFT),
          headerCell("Category", AlignmentType.LEFT),
          headerCell("Amount", AlignmentType.RIGHT),
        ],
      }),
      // Empty placeholder row
      new TableRow({
        children: [
          dataCell("—"),
          dataCell(""),
          dataCell(""),
          dataCell("", { align: AlignmentType.RIGHT }),
        ],
      }),
    ],
  });

  /* ── Payout table ── */
  const payoutTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell("Description", AlignmentType.LEFT), headerCell("Amount", AlignmentType.RIGHT)] }),
      new TableRow({ children: [dataCell("Net Payable"), dollarCell(payableTotal)] }),
      new TableRow({ children: [dataCell("Adjustments", { shade: true }), amountCell(0, true)] }),
      new TableRow({ children: [dataCell("Payout This Month", { bold: true }), dollarCell(payableTotal, false, true)] }),
    ],
  });

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(14),
            bottom: convertMillimetersToTwip(14),
            left: convertMillimetersToTwip(14),
            right: convertMillimetersToTwip(14),
          },
        },
      },
      children: [
        titleTable,
        spacer(4),
        headerInfoTable,
        spacer(3),
        sectionTitle("Summary"),
        summaryTable,
        spacer(3),
        sectionTitle("Bookings"),
        bookingsTable,
        spacer(3),
        sectionTitle("Expenses"),
        expensesTable,
        spacer(3),
        payoutTable,
      ],
    }],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { statements: StatementInput[] };
    const zip = new JSZip();

    // Load logo image
    let logoBuffer: Buffer | null = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "logo.jpg");
      logoBuffer = fs.readFileSync(logoPath);
    } catch { /* logo not found, skip */ }

    for (const input of body.statements) {
      const doc = generateStatement(input, logoBuffer);
      const buf = await Packer.toBuffer(doc);
      // Handle both "YYYY-MM" and display format for filename
      let monthLabel: string;
      if (/^\d{4}-\d{2}$/.test(input.period)) {
        monthLabel = new Date(input.period + "-01").toLocaleDateString("en-AU", { month: "short", year: "numeric" });
      } else {
        monthLabel = input.period;
      }
      zip.file(`OWNER_STATEMENT_${input.listingCode}_${monthLabel.replace(/\s+/g, "_")}.docx`, buf);
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
