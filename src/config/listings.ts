export interface Listing {
  code: string;
  alias: string;            // Substring matched against Booking.com property name
  cleaningFee: number;      // AUD
  cleaningFeeTo: "host" | "owner";
  managementFeeRate: number; // e.g. 0.20 = 20%
}

export const LISTINGS: Listing[] = [
  { code: "1-24",  alias: "Mosman Hideaway w Waterview",  cleaningFee: 230, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
  { code: "2-1",   alias: "Harbour Grove Sanctuary",       cleaningFee: 140, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
  { code: "4-12",  alias: "Balmoral & Beyond",             cleaningFee: 140, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
  { code: "4-122", alias: "Oasis Retreat by Cremorne",     cleaningFee: 130, cleaningFeeTo: "host",  managementFeeRate: 0.18 },
  { code: "6-40",  alias: "Platform & Parklands",          cleaningFee: 130, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
  { code: "118A",  alias: "Harbour & Heritage",            cleaningFee: 180, cleaningFeeTo: "owner", managementFeeRate: 0.20 },
  { code: "563A",  alias: "Skyline & City Pulse",          cleaningFee: 160, cleaningFeeTo: "host",  managementFeeRate: 0.13 },
];

/** Case-insensitive substring match: booking.com property name must contain listing alias */
export function findListingByPropertyName(propertyName: string): Listing | undefined {
  const normalized = propertyName.toLowerCase();
  return LISTINGS.find((l) => normalized.includes(l.alias.toLowerCase()));
}
