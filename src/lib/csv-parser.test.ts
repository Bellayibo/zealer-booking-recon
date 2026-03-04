import { describe, it, expect } from "vitest";
import { parseBookingComCsv } from "./csv-parser";

const SAMPLE_CSV = `Type/Transaction type,Statement Descriptor,Reference number,Check-in date,Check-out date,Issue date,Reservation status,Rooms,Room nights,Property ID,Property name,Legal ID,Legal name,Country,Payout type,Gross amount,Commission,Commission %,Payments Service Fee,Payments Service Fee %,VAT,Tax,Transaction amount,Transaction currency,Exchange rate,Payable amount,Payout amount,Payout currency,Payout date,Payout frequency,Bank account
(Payout),PVVw53tNcpmk7ZKi,-,-,-,-,-,-,-,14933168,"Mosman Hideaway w Waterview Spacious",13476137,"Zealer Holiday Pty Ltd",Australia,Net,-,-,-,-,-,-,-,-,-,-,2319.22,2319.22,AUD,2026-01-08,Daily,*6551
Reservation,PVVw53tNcpmk7ZKi,6913808259,2026-01-02,2026-01-07,2026-01-07,Okay,1,5,14933168,"Mosman Hideaway w Waterview Spacious",13476137,"Zealer Holiday Pty Ltd",Australia,Net,2848.82,-427.32,15.00%,-54.13,1.90%,-48.15,0.00,2319.22,AUD,1.00,2319.22,-,AUD,2026-01-08,Daily,*6551
Reservation,abc123,111,2026-01-12,2026-01-14,2026-01-14,Cancelled,1,2,14937411,"Oasis Retreat by Cremorne Point Walk",13476137,"Zealer Holiday Pty Ltd",Australia,Net,377.36,-56.60,15.00%,-7.17,1.90%,-6.38,0.00,307.21,AUD,1.00,307.21,-,AUD,2026-01-15,Daily,*6551`;

describe("parseBookingComCsv", () => {
  it("parses only Okay Reservation rows", () => {
    const result = parseBookingComCsv(SAMPLE_CSV);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.bookings).toHaveLength(1);
  });

  it("extracts correct financial fields for 1-24 booking", () => {
    const result = parseBookingComCsv(SAMPLE_CSV);
    if (!result.success) return;
    const booking = result.bookings[0];
    expect(booking.propertyName).toBe("Mosman Hideaway w Waterview Spacious");
    expect(booking.checkIn).toBe("2026-01-02");
    expect(booking.checkOut).toBe("2026-01-07");
    expect(booking.grossAmount).toBeCloseTo(2848.82, 2);
    expect(booking.commission).toBeCloseTo(-427.32, 2);
    expect(booking.paymentFee).toBeCloseTo(-54.13, 2);
    expect(booking.vat).toBeCloseTo(-48.15, 2);
    expect(booking.payoutAmount).toBeCloseTo(2319.22, 2);
    expect(booking.payoutDate).toBe("2026-01-08");
  });

  it("returns error for empty CSV", () => {
    const result = parseBookingComCsv("");
    expect(result.success).toBe(false);
  });

  it("returns error if required columns are missing", () => {
    const result = parseBookingComCsv("Name,Date\nfoo,bar");
    expect(result.success).toBe(false);
  });
});
