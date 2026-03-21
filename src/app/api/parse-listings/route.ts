import { NextResponse } from "next/server";
import { findListingByPropertyName } from "@/config/listings";
import { parseBookingComCsv } from "@/lib/csv-parser";

export interface ParsedListing {
  code: string;
  propertyName: string;
  defaultCleaningFee: number;
  cleaningFeeTo: string;
  matched: boolean;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("bookingComCsv") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const csv = await file.text();
  const parsed = parseBookingComCsv(csv);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const seen = new Set<string>();
  const listings: ParsedListing[] = [];

  for (const booking of parsed.bookings) {
    const listing = findListingByPropertyName(booking.propertyName);
    const key = listing ? listing.code : booking.propertyName;
    if (!seen.has(key)) {
      seen.add(key);
      listings.push({
        code: listing?.code ?? "",
        propertyName: booking.propertyName,
        defaultCleaningFee: listing?.cleaningFee ?? 0,
        cleaningFeeTo: listing?.cleaningFeeTo ?? "owner",
        matched: !!listing,
      });
    }
  }

  return NextResponse.json({ success: true, listings });
}
